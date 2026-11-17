/// <reference types="node" />
// Apple のサーバー間通知（POST /auth/apple/notifications）を、模擬の発行元（テスト用のRSA鍵で署名し、JWKSを返す fetch）と
// ローカルD1で確かめる。ネットワークには出ない。検証の条件（署名・iss・aud・events の形）、`consent-revoked` と
// `account-deleted` の処理、再送・遅れて届く通知、通知とログインの競合（migrations/0002）を見る。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { handleAppleNotification } from '../src/appleNotification.ts';
import { handleLogin } from '../src/auth.ts';
import worker from '../src/index.ts';
import { createIdTokenVerifier, type FetchFunction, type IdTokenVerifier } from '../src/idToken.ts';
import { resolveIdentity } from '../src/identity.ts';
import { issueNonce, nonceHash } from '../src/nonce.ts';
import { authenticateSession, createSession } from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const SECRET = 'test-secret-value-0123456789abcdef';
const SUB = 'apple-sub-1';

interface TestKey {
  privateKey: CryptoKey;
  jwk: JWK;
}

async function createKey(kid: string): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' } };
}

const issuerKey = await createKey('key-a');
const impostorKey = await createKey('key-a'); // 発行元の鍵ではない（kid だけ同じ）

describe('POST /auth/apple/notifications', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let env: Env;
  let verifier: IdTokenVerifier;
  let jwksRespond: null | (() => Response);
  let logs: string[];

  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
    env = {
      NONCE_HMAC_KEY: SECRET,
      APPLE_BUNDLE_ID: 'com.example.app',
      APPLE_SERVICES_ID: 'com.example.web',
      GOOGLE_WEB_CLIENT_ID: '1234-web.apps.googleusercontent.com',
      DB: db,
    } as unknown as Env;
  });
  after(async () => {
    await local.dispose();
  });

  beforeEach(async () => {
    await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
    jwksRespond = null;
    logs = [];
    const fetchFunction: FetchFunction = async () => (jwksRespond ? jwksRespond() : Response.json({ keys: [issuerKey.jwk] }));
    verifier = createIdTokenVerifier({ fetch: fetchFunction });
  });

  interface EventOptions {
    type?: string;
    sub?: string;
    /** `event_time`。既定は NOW（ミリ秒）。 */
    eventTime?: number | string | null;
    /** `events` を JSON の文字列で送るか。 */
    asString?: boolean;
    extra?: Record<string, unknown>;
  }

  interface TokenOptions extends EventOptions {
    aud?: string;
    iss?: string;
    key?: TestKey;
    kid?: string | null;
    alg?: string;
    /** `events` そのものを差し替える（形の不備を試す）。 */
    events?: unknown;
    exp?: number;
  }

  async function signNotification({
    aud = env.APPLE_BUNDLE_ID,
    iss = 'https://appleid.apple.com',
    key = issuerKey,
    kid = 'key-a',
    alg = 'RS256',
    events,
    exp,
    type = 'consent-revoked',
    sub = SUB,
    eventTime = NOW,
    asString = false,
    extra = {},
  }: TokenOptions = {}): Promise<string> {
    const inner: Record<string, unknown> = { type, sub, ...extra };
    if (eventTime !== null) inner.event_time = eventTime;
    const claims: Record<string, unknown> = {
      iss,
      aud,
      iat: NOW_S - 5,
      jti: 'jti-1',
      events: events !== undefined ? events : asString ? JSON.stringify(inner) : inner,
    };
    if (exp !== undefined) claims.exp = exp;
    const header: { alg: string; kid?: string } = { alg };
    if (kid !== null) header.kid = kid;
    return new SignJWT(claims).setProtectedHeader(header).sign(key.privateKey);
  }

  const send = (body: unknown, { now = NOW, method = 'POST' } = {}) =>
    handleAppleNotification(
      new Request('https://singfolio.app/auth/apple/notifications', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
      now,
      { verifier, log: (message) => logs.push(message) },
    );
  const notify = async (options: TokenOptions = {}, now = NOW) => send({ payload: await signNotification(options) }, { now });

  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of ['users', 'identities', 'sessions']) {
      result[table] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    }
    return result;
  };
  const identityRow = () =>
    db
      .prepare('SELECT last_sign_in_at, consent_revoked_at FROM identities WHERE provider = ? AND sub = ?')
      .bind('apple', SUB)
      .first<{ last_sign_in_at: number; consent_revoked_at: number | null }>();

  /** Apple のログイン手段を作り（`signedInAt` に最後のサインイン）、セッションを1つ発行する。 */
  async function newSignedIn(signedInAt = NOW - 1000, sub = SUB) {
    const { identityId, userId } = await resolveIdentity(db, 'apple', sub, signedInAt);
    const session = (await createSession(db, identityId, signedInAt))!;
    return { identityId, userId, session };
  }

  describe('consent-revoked', () => {
    it('その Apple の行のセッションをすべて消し、取り消しの時刻を記録する。行・ユーザーは残す', async () => {
      const { identityId, session } = await newSignedIn();
      const second = (await createSession(db, identityId, NOW - 500))!;
      const response = await notify({ eventTime: NOW });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {});
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await authenticateSession(db, session, NOW), null);
      assert.equal(await authenticateSession(db, second, NOW), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 0 });
      assert.deepEqual(await identityRow(), { last_sign_in_at: NOW - 1000, consent_revoked_at: NOW });
    });

    it('ほかの人・ほかのログイン手段（Google。sub が同じでも）のセッションは消さない', async () => {
      await newSignedIn();
      const other = await newSignedIn(NOW - 1000, 'apple-sub-other');
      const google = await resolveIdentity(db, 'google', SUB, NOW - 1000);
      const googleSession = (await createSession(db, google.identityId, NOW - 1000))!;
      assert.equal((await notify()).status, 200);
      assert.notEqual(await authenticateSession(db, other.session, NOW), null);
      assert.notEqual(await authenticateSession(db, googleSession, NOW), null);
      assert.equal(
        (await db.prepare('SELECT consent_revoked_at AS c FROM identities WHERE sub = ?').bind('apple-sub-other').first<{ c: number | null }>())!.c,
        null,
      );
    });

    it('events が JSON の文字列でも読む', async () => {
      const { session } = await newSignedIn();
      assert.equal((await notify({ asString: true })).status, 200);
      assert.equal(await authenticateSession(db, session, NOW), null);
    });

    it('event_time は、秒でもミリ秒でも読む。未来の値は、受け取った時刻に丸める。数字の文字列も読む', async () => {
      await newSignedIn(NOW - 100_000);
      assert.equal((await notify({ eventTime: NOW_S - 50 })).status, 200); // 秒
      assert.equal((await identityRow())!.consent_revoked_at, (NOW_S - 50) * 1000);
      assert.equal((await notify({ eventTime: NOW - 20_000 })).status, 200); // ミリ秒
      assert.equal((await identityRow())!.consent_revoked_at, NOW - 20_000);
      assert.equal((await notify({ eventTime: NOW * 100 })).status, 200); // 未来（巨大）
      assert.equal((await identityRow())!.consent_revoked_at, NOW);
      assert.equal((await notify({ eventTime: String(NOW + 5) }, NOW + 10)).status, 200); // 文字列
      assert.equal((await identityRow())!.consent_revoked_at, NOW + 5);
    });

    it('最後のサインインより前の通知は、無視する（サインインし直した利用者を、古い通知でログアウトさせない）', async () => {
      const { session } = await newSignedIn(NOW);
      assert.equal((await notify({ eventTime: NOW - 1 })).status, 200);
      assert.notEqual(await authenticateSession(db, session, NOW), null);
      assert.deepEqual(await identityRow(), { last_sign_in_at: NOW, consent_revoked_at: null });
      // 同じ時刻なら処理する（サインインと同時の通知は、取り消しが後と見る。安全側）。
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal(await authenticateSession(db, session, NOW), null);
    });

    it('同じ通知の再送は、何もしない。再送の前にサインインし直していても、そのセッションを消さない', async () => {
      await newSignedIn();
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      // 取り消しのあと、あらためてサインインした（`resolveIdentity` が最後のサインインを進め、セッションを作る）。
      const { identityId } = await resolveIdentity(db, 'apple', SUB, NOW + 1000);
      const again = (await createSession(db, identityId, NOW + 1000))!;
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.notEqual(await authenticateSession(db, again, NOW + 1000), null);
    });

    it('通知が届く前にサインインし直していても、取り消しの前から生きていた別の端末のセッションは消す。サインインし直したセッションは残す', async () => {
      const { identityId, session: before } = await newSignedIn(NOW - 100_000); // 端末A（取り消しの前から）
      // 取り消し（NOW）のあと、通知が届く前に、端末Bでサインインし直した（連携が戻った）。
      await resolveIdentity(db, 'apple', SUB, NOW + 1000);
      const again = (await createSession(db, identityId, NOW + 1000))!;
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal(await authenticateSession(db, before, NOW + 1000), null);
      assert.notEqual(await authenticateSession(db, again, NOW + 1000), null);
      // サインインし直した行は、取り消しとして記録しない（サインインし直した利用者を、再送で動かさない）。
      assert.deepEqual(await identityRow(), { last_sign_in_at: NOW + 1000, consent_revoked_at: null });
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.notEqual(await authenticateSession(db, again, NOW + 1000), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1 });
    });

    it('取り消しと同じ時刻に作られたセッションも消す（安全側）。1ミリ秒あとのものは残す', async () => {
      const { identityId, session: atEvent } = await newSignedIn(NOW);
      const after = (await createSession(db, identityId, NOW + 1))!;
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal(await authenticateSession(db, atEvent, NOW + 1), null);
      assert.notEqual(await authenticateSession(db, after, NOW + 1), null);
    });

    it('より古い取り消しの通知で、記録した時刻を戻さない', async () => {
      await newSignedIn(NOW - 100_000);
      await notify({ eventTime: NOW });
      await notify({ eventTime: NOW - 50_000 });
      assert.equal((await identityRow())!.consent_revoked_at, NOW);
    });

    it('行が無い（まだサインインしていない・すでに消えた）sub でも 200。何も作らない', async () => {
      assert.equal((await notify({ sub: 'nobody' })).status, 200);
      assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0 });
    });
  });

  describe('通知とログインの競合（取り消しのあとにセッションが残らない）', () => {
    const t = async () => (await issueNonce(SECRET, { kind: 'native' }, NOW - 5_000)).nonce;
    async function loginBody(sub = SUB) {
      const nonce = await t();
      const idToken = await new SignJWT({
        iss: 'https://appleid.apple.com',
        aud: env.APPLE_BUNDLE_ID,
        sub,
        iat: NOW_S - 10,
        exp: NOW_S + 600,
        nonce: await nonceHash(nonce),
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'key-a' })
        .sign(issuerKey.privateKey);
      return { provider: 'apple', idToken, nonce };
    }
    const login = async (now: number) =>
      handleLogin(
        new Request('https://singfolio.app/auth/login', { method: 'POST', body: JSON.stringify(await loginBody()) }),
        env,
        now,
        verifier,
      );

    it('通知を先に処理したとき: 通知より前に始まったログインは、検証を通っても、セッションを作らない（401）', async () => {
      await newSignedIn(NOW - 100_000);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      // 取り消し（NOW）より前（NOW - 1）に始まったログインが、いまセッションを作ろうとする。
      const response = await login(NOW - 1);
      assert.equal(response.status, 401);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 0 });
    });

    it('通知を後に処理したとき: 先に作られたセッションは、通知が消す', async () => {
      assert.equal((await login(NOW - 1)).status, 200);
      assert.equal((await counts()).sessions, 1);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await counts()).sessions, 0);
    });

    it('通知のあとに始めたログイン（あらためてサインインした場合）は、セッションを作る', async () => {
      await newSignedIn(NOW - 100_000);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await login(NOW + 1)).status, 200);
      assert.equal((await counts()).sessions, 1);
      // 取り消しの通知が再送されても、あとのサインインは消えない。
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await counts()).sessions, 1);
    });

    it('サインインし直す前に通知を処理して、そのあと古い取り消しが再送されても、ログアウトしない（実際の順序）', async () => {
      assert.equal((await login(NOW - 100_000)).status, 200);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await counts()).sessions, 0);
      assert.equal((await login(NOW + 1000)).status, 200);
      assert.equal((await notify({ eventTime: NOW })).status, 200);
      assert.equal((await counts()).sessions, 1);
    });
  });

  describe('account-deleted', () => {
    it('唯一のログイン手段なら、アカウントごと消す（identities・sessions も）', async () => {
      const { session } = await newSignedIn();
      const response = await notify({ type: 'account-deleted' });
      assert.equal(response.status, 200);
      assert.equal(await authenticateSession(db, session, NOW), null);
      assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0 });
    });

    it('ほかのログイン手段（Google）が残るなら、Apple の行（とそのセッション）だけを消す', async () => {
      const { userId, session } = await newSignedIn();
      const googleIdentity = crypto.randomUUID();
      await db
        .prepare(`INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?1, ?2, 'google', 'g-1', ?3, ?3)`)
        .bind(googleIdentity, userId, NOW)
        .run();
      const googleSession = (await createSession(db, googleIdentity, NOW))!;
      assert.equal((await notify({ type: 'account-deleted' })).status, 200);
      assert.equal(await authenticateSession(db, session, NOW), null);
      assert.notEqual(await authenticateSession(db, googleSession, NOW), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1 });
    });

    it('綴りが違う版（account-delete）も読む', async () => {
      await newSignedIn();
      assert.equal((await notify({ type: 'account-delete' })).status, 200);
      assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0 });
    });

    it('最後のサインインより前の通知でも処理する（消えた Apple Account は戻らない）', async () => {
      await newSignedIn(NOW);
      assert.equal((await notify({ type: 'account-deleted', eventTime: NOW - 100_000 })).status, 200);
      assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0 });
    });

    it('ほかの人は消さない。同じ通知の再送、行が無い sub でも 200', async () => {
      await newSignedIn(NOW - 1000, 'apple-sub-bystander');
      await newSignedIn();
      assert.equal((await notify({ type: 'account-deleted' })).status, 200);
      assert.equal((await notify({ type: 'account-deleted' })).status, 200);
      assert.equal((await notify({ type: 'account-deleted', sub: 'nobody' })).status, 200);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1 });
    });

    it('消したあとに、その sub で来たログインは、新しい（空の）アカウントを作る。以前の行は戻らない', async () => {
      await newSignedIn();
      await notify({ type: 'account-deleted' });
      const { userId } = await resolveIdentity(db, 'apple', SUB, NOW + 1);
      assert.equal((await counts()).users, 1);
      assert.ok(userId);
    });
  });

  describe('知らない種類', () => {
    it('email-enabled・email-disabled・未知の種類は、200 で何もしない', async () => {
      const { session } = await newSignedIn();
      for (const type of ['email-enabled', 'email-disabled', 'something-new']) {
        const response = await notify({ type, extra: { email: 'ep9ks2tnph@privaterelay.appleid.com', is_private_email: 'true' } });
        assert.equal(response.status, 200, type);
      }
      assert.notEqual(await authenticateSession(db, session, NOW), null);
      assert.deepEqual(await identityRow(), { last_sign_in_at: NOW - 1000, consent_revoked_at: null });
    });
  });

  describe('検証（通らなければ、D1に何も書かない）', () => {
    const untouched = async () => {
      const { session } = await newSignedIn();
      return async () => {
        assert.notEqual(await authenticateSession(db, session, NOW), null);
        assert.deepEqual(await identityRow(), { last_sign_in_at: NOW - 1000, consent_revoked_at: null });
      };
    };

    it('aud は、バンドルIDとServices IDのどちらでもよい。それ以外は 401', async () => {
      const check = await untouched();
      assert.equal((await notify({ aud: 'com.attacker.app' })).status, 401);
      assert.equal((await notify({ aud: '' })).status, 401);
      await check();
      assert.equal((await notify({ aud: env.APPLE_SERVICES_ID, type: 'email-enabled' })).status, 200);
      assert.equal((await notify({ aud: env.APPLE_BUNDLE_ID, type: 'email-enabled' })).status, 200);
    });

    it('iss が違う・署名が違う・kid が無い・alg が RS256 でない、は 401', async () => {
      const check = await untouched();
      for (const options of [
        { iss: 'https://accounts.google.com' },
        { iss: 'https://evil.example.com' },
        { key: impostorKey },
        { kid: null },
        { kid: 'unknown-key' },
      ] satisfies TokenOptions[]) {
        const response = await notify(options);
        assert.equal(response.status, 401, JSON.stringify(options));
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
      }
      await check();
    });

    it('署名の無いトークン（alg: none）・公開鍵を共通鍵にした HS256 は 401', async () => {
      const check = await untouched();
      const claims = {
        iss: 'https://appleid.apple.com',
        aud: env.APPLE_BUNDLE_ID,
        iat: NOW_S - 5,
        events: { type: 'account-deleted', sub: SUB, event_time: NOW },
      };
      const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const none = `${b64({ alg: 'none', kid: 'key-a' })}.${b64(claims)}.`;
      assert.equal((await send({ payload: none })).status, 401);
      const hs = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256', kid: 'key-a' })
        .sign(new TextEncoder().encode(JSON.stringify(issuerKey.jwk)));
      assert.equal((await send({ payload: hs })).status, 401);
      await check();
    });

    it('exp が付いていて過ぎていれば 401。付いていなければ（資料の例）通す', async () => {
      const check = await untouched();
      assert.equal((await notify({ exp: NOW_S - 3600 })).status, 401);
      await check();
      assert.equal((await notify({ exp: NOW_S + 3600, type: 'email-enabled' })).status, 200);
    });

    it('events の形の不備（無い・オブジェクトでない・type・sub・event_time の欠落や不正）は 401', async () => {
      const check = await untouched();
      for (const options of [
        { events: 'not json' },
        { events: '[1,2]' },
        { events: ['consent-revoked'] },
        { events: 42 },
        { events: null },
        { type: '' },
        { sub: '' },
        { sub: 'x'.repeat(256) },
        { eventTime: null },
        { eventTime: 0 },
        { eventTime: -1 },
        { eventTime: 'soon' },
        { eventTime: '1.5e12' },
      ] satisfies TokenOptions[]) {
        const response = await notify(options);
        assert.equal(response.status, 401, JSON.stringify(options));
      }
      await check();
    });

    it('type が 65 字以上なら 401（長さの上限）', async () => {
      assert.equal((await notify({ type: 'a'.repeat(65) })).status, 401);
    });

    it('公開鍵を取得できず、使える古い鍵も無いときは 503（トークンの問題ではない）', async () => {
      const check = await untouched();
      jwksRespond = () => new Response('down', { status: 500 });
      const response = await notify();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
      await check();
    });

    it('本文の不備は 400（payload が無い・文字列でない・空）。JSON でない・オブジェクトでないも 400', async () => {
      const check = await untouched();
      for (const body of [{}, { payload: 1 }, { payload: '' }, { payload: null }, '[]', 'null', 'not json', '"x"']) {
        const response = await send(body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { error: 'invalid_request' });
      }
      assert.equal((await send({ payload: 'not.a.jwt' })).status, 401);
      assert.equal((await send({ payload: 'x'.repeat(9000) })).status, 401);
      await check();
    });

    it('本文が大きすぎると 413', async () => {
      assert.equal((await send(JSON.stringify({ payload: 'x'.repeat(17_000) }))).status, 413);
    });

    it('POST 以外は 405 で、Allow を返す', async () => {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const response = await send({}, { method });
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('allow'), 'POST');
      }
    });

    it('検証に通らなかった理由を、固定の語彙だけで1行ログに出す。トークン・sub は出さない', async () => {
      const payload = await signNotification({ aud: 'com.attacker.app', sub: 'secret-sub-value' });
      await send({ payload });
      await notify({ key: impostorKey });
      assert.deepEqual(logs, ['apple notification rejected: reason=audience', 'apple notification rejected: reason=signature']);
      const all = logs.join('\n');
      assert.equal(all.includes(payload), false);
      assert.equal(all.includes('secret-sub-value'), false);
    });
  });

  it('入口（worker.fetch）から届く。HTTPSでなければ 403', async () => {
    const post = (url: string) => worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env);
    assert.equal((await post('https://singfolio.app/auth/apple/notifications')).status, 400);
    assert.equal((await post('http://singfolio.app/auth/apple/notifications')).status, 403);
  });
});
