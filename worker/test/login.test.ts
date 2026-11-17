/// <reference types="node" />
// ログインとログアウトを、模擬の発行元（テスト用のRSA鍵で署名し、JWKSを返す fetch）とローカルD1で確かめる。
// ネットワークには出ない。IDトークンの検証そのものの条件は、idToken.test.ts。ここでは、処理の順序
// （D1に書くのは検証が通ってから）、リプレイ、失敗の応答、セッションの発行を見る。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { handleLogin, handleLogoutOthers } from '../src/auth.ts';
import worker from '../src/index.ts';
import { createIdTokenVerifier, JWKS_COOLDOWN_MS, type FetchFunction, type IdTokenVerifier } from '../src/idToken.ts';
import { issueNonce, NONCE_TTL_MS, nonceHash } from '../src/nonce.ts';
import { authenticateSession, createSession, isSessionToken } from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const SECRET = 'test-secret-value-0123456789abcdef';
const CHALLENGE = 'B'.repeat(43);

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

describe('ログインとログアウト', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let env: Env;
  let verifier: IdTokenVerifier;
  let jwksCalls: string[];
  let jwksRespond: null | (() => Response);

  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
    // vars の型は、wrangler.jsonc の値のリテラル型。テスト用の別の値を入れるので、unknown を経由する。
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

  // テストごとに、DBと公開鍵のキャッシュを空にする（users の削除で identities・sessions も消える）。
  beforeEach(async () => {
    await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
    jwksCalls = [];
    jwksRespond = null;
    const fetchFunction: FetchFunction = async (url) => {
      jwksCalls.push(url);
      return jwksRespond ? jwksRespond() : Response.json({ keys: [issuerKey.jwk] });
    };
    verifier = createIdTokenVerifier({ fetch: fetchFunction });
  });

  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of ['users', 'identities', 'sessions', 'used_nonces']) {
      result[table] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    }
    return result;
  };
  const NOTHING_WRITTEN = { users: 0, identities: 0, sessions: 0, used_nonces: 0 };

  const issueT = async (kind: 'native' | 'web' = 'native', now = NOW, secret = SECRET) =>
    (await issueNonce(secret, kind === 'native' ? { kind } : { kind, challenge: CHALLENGE }, now)).nonce;

  interface TokenOptions {
    provider?: 'apple' | 'google';
    sub?: string;
    /** IDトークンの `nonce` に入れる値。既定は SHA-256(T)。null なら入れない。 */
    nonceClaim?: string | null;
    aud?: string;
    exp?: number;
    key?: TestKey;
    extra?: Record<string, unknown>;
  }

  async function signToken(
    t: string,
    { provider = 'apple', sub = 'apple-sub-1', nonceClaim, aud, exp = NOW_S + 600, key = issuerKey, extra = {} }: TokenOptions = {},
  ): Promise<string> {
    const claims: Record<string, unknown> = {
      iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: aud ?? (provider === 'apple' ? env.APPLE_BUNDLE_ID : env.GOOGLE_WEB_CLIENT_ID),
      sub,
      iat: NOW_S - 10,
      exp,
      ...extra,
    };
    if (nonceClaim !== null) claims.nonce = nonceClaim ?? (await nonceHash(t));
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'key-a' }).sign(key.privateKey);
  }

  const login = (body: unknown, { now = NOW, method = 'POST' } = {}) =>
    handleLogin(
      new Request('https://singfolio.app/auth/login', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
      now,
      verifier,
    );

  // 正しいログインを1回して、セッションの値を返す。
  async function loginOk(options: TokenOptions = {}, provider: 'apple' | 'google' = options.provider ?? 'apple') {
    const t = await issueT();
    const response = await login({ provider, idToken: await signToken(t, { ...options, provider }), nonce: t });
    assert.equal(response.status, 200);
    return ((await response.json()) as { session: string }).session;
  }

  const logout = (authorization?: string, method = 'POST') =>
    worker.fetch(
      new Request('https://singfolio.app/auth/logout', {
        method,
        headers: authorization === undefined ? {} : { authorization },
      }),
      env,
    );

  const logoutOthers = (authorization?: string, method = 'POST') =>
    handleLogoutOthers(
      new Request('https://singfolio.app/auth/logout-others', {
        method,
        headers: authorization === undefined ? {} : { authorization },
      }),
      env,
      NOW,
    );

  describe('POST /auth/login: 成功', () => {
    it('Apple: セッションの値だけを返し、ユーザー・ログイン手段・使用済みの記録・セッションを作る', async () => {
      const t = await issueT();
      const idToken = await signToken(t, {
        sub: 'apple-sub-1',
        extra: { email: 'someone@example.com', name: 'Someone' },
      });
      const response = await login({ provider: 'apple', idToken, nonce: t });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
      const body = (await response.json()) as { session: string };
      assert.deepEqual(Object.keys(body), ['session']);
      assert.equal(isSessionToken(body.session), true);

      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 1 });
      const identity = await db.prepare('SELECT provider, sub FROM identities').first();
      assert.deepEqual(identity, { provider: 'apple', sub: 'apple-sub-1' });
      const used = await db.prepare('SELECT nonce_hash, expires_at FROM used_nonces').first();
      assert.deepEqual(used, { nonce_hash: await nonceHash(t), expires_at: NOW + NONCE_TTL_MS });
      assert.deepEqual(await authenticateSession(db, body.session, NOW), {
        userId: (await db.prepare('SELECT id FROM users').first<{ id: string }>())!.id,
        identityId: (await db.prepare('SELECT id FROM identities').first<{ id: string }>())!.id,
        sub: 'apple-sub-1',
        provider: 'apple',
      });

      // email・名前などのクレームは、どこにも保存しない。トークンの全文・セッションの値も、DBに置かない。
      const everything = JSON.stringify(
        await Promise.all(
          ['users', 'identities', 'sessions', 'used_nonces'].map(async (table) =>
            (await db.prepare(`SELECT * FROM ${table}`).all()).results,
          ),
        ),
      );
      for (const secret of ['someone@example.com', 'Someone', idToken, body.session, t]) {
        assert.equal(everything.includes(secret), false);
      }
    });

    it('Google: Webクライアントの aud で通る', async () => {
      const t = await issueT();
      const response = await login({
        provider: 'google',
        idToken: await signToken(t, { provider: 'google', sub: '110169484474386276334' }),
        nonce: t,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await db.prepare('SELECT provider, sub FROM identities').first(), {
        provider: 'google',
        sub: '110169484474386276334',
      });
    });

    it('同じ人の2回目のログイン(新しい T)は、同じログイン手段に、セッションを足す', async () => {
      const first = await loginOk();
      const second = await loginOk();
      assert.notEqual(first, second);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 2, used_nonces: 2 });
      assert.notEqual(await authenticateSession(db, first, NOW), null);
      assert.notEqual(await authenticateSession(db, second, NOW), null);
    });

    it('同じ sub でも、AppleとGoogleは別のユーザー', async () => {
      await loginOk({ sub: 'same-sub' }, 'apple');
      await loginOk({ sub: 'same-sub' }, 'google');
      assert.deepEqual(await counts(), { users: 2, identities: 2, sessions: 2, used_nonces: 2 });
    });
  });

  describe('POST /auth/login: 失敗', () => {
    it('同じ T の再利用（リプレイ）は 401。セッションは増えない', async () => {
      const t = await issueT();
      const body = { provider: 'apple', idToken: await signToken(t), nonce: t };
      assert.equal((await login(body)).status, 200);
      const replay = await login(body);
      assert.equal(replay.status, 401);
      assert.deepEqual(await replay.json(), { error: 'unauthorized' });
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 1 });
    });

    // どの検査で落ちても、同じ401で、D1には何も書かない。
    const rejections: [string, () => Promise<{ provider?: string; idToken: string; nonce: string; now?: number }>][] = [
      [
        '期限切れの T',
        async () => {
          const t = await issueT('native', NOW - NONCE_TTL_MS - 1000);
          return { idToken: await signToken(t), nonce: t };
        },
      ],
      [
        '署名が違う T（別の鍵）',
        async () => {
          const t = await issueT('native', NOW, 'another-secret-value-0123456789abcdef');
          return { idToken: await signToken(t), nonce: t };
        },
      ],
      [
        'web の T',
        async () => {
          const t = await issueT('web');
          return { idToken: await signToken(t), nonce: t };
        },
      ],
      [
        'T の形が不正',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t), nonce: 'not-a-nonce' };
        },
      ],
      [
        'IDトークンの nonce が、別の T のもの',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(await issueT()), nonce: t };
        },
      ],
      [
        'IDトークンに nonce が無い',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t, { nonceClaim: null }), nonce: t };
        },
      ],
      [
        'IDトークンの nonce が、T そのもの（ハッシュではない）',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t, { nonceClaim: t }), nonce: t };
        },
      ],
      [
        'aud が違う（Services ID。iOSのネイティブでは受け付けない）',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t, { aud: env.APPLE_SERVICES_ID }), nonce: t };
        },
      ],
      [
        'Google のトークンを apple として送る',
        async () => {
          const t = await issueT();
          return { provider: 'apple', idToken: await signToken(t, { provider: 'google' }), nonce: t };
        },
      ],
      [
        'IDトークンが期限切れ',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t, { exp: NOW_S - 60 }), nonce: t };
        },
      ],
      [
        'IDトークンの署名が、発行元の鍵ではない',
        async () => {
          const t = await issueT();
          return { idToken: await signToken(t, { key: impostorKey }), nonce: t };
        },
      ],
      [
        'IDトークンが壊れている',
        async () => ({ idToken: 'garbage', nonce: await issueT() }),
      ],
    ];
    for (const [name, build] of rejections) {
      it(`${name}: 401（理由は教えない）で、D1に何も書かない`, async () => {
        const { provider = 'apple', ...rest } = await build();
        const response = await login({ provider, ...rest });
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
        assert.deepEqual(await counts(), NOTHING_WRITTEN);
      });
    }

    it('検証に通らなかった T は、使い切りにならない（同じ T で、正しいトークンなら通る）', async () => {
      const t = await issueT();
      const bad = await login({ provider: 'apple', idToken: await signToken(t, { aud: 'other' }), nonce: t });
      assert.equal(bad.status, 401);
      const good = await login({ provider: 'apple', idToken: await signToken(t), nonce: t });
      assert.equal(good.status, 200);
    });

    it('web の T は、/auth/login（native 専用）では、公開鍵を取りに行く前に拒否する（Appleでも、Googleでも）', async () => {
      const t = await issueT('web');
      for (const provider of ['apple', 'google'] as const) {
        const response = await login({ provider, idToken: await signToken(t, { provider }), nonce: t });
        assert.equal(response.status, 401);
      }
      assert.deepEqual(jwksCalls, []);
      assert.deepEqual(await counts(), NOTHING_WRITTEN);
    });

    it('T の検査で落ちるときも、公開鍵を取りに行かない（認証の要らない経路に、外部の呼び出しを使わせない）', async () => {
      await login({ provider: 'apple', idToken: 'garbage', nonce: 'not-a-nonce' });
      await login({ provider: 'apple', idToken: await signToken(await issueT()), nonce: await issueT('web') });
      assert.deepEqual(jwksCalls, []);
    });

    it('公開鍵を取得できない: 503 で、D1に何も書かない。T は使い切りにならず、復旧したら通る', async () => {
      jwksRespond = () => new Response('oops', { status: 500 });
      const t = await issueT();
      const body = { provider: 'apple', idToken: await signToken(t), nonce: t };
      const response = await login(body);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
      assert.deepEqual(await counts(), NOTHING_WRITTEN);

      jwksRespond = null;
      // 冷却の間は、まだ取りに行かない（同じ 503）。済んだら通る。
      assert.equal((await login(body, { now: NOW + JWKS_COOLDOWN_MS - 1 })).status, 503);
      assert.equal(jwksCalls.length, 1);
      assert.equal((await login(body, { now: NOW + JWKS_COOLDOWN_MS })).status, 200);
    });

    it('形が不正なら 400（provider・idToken・nonce の欠落と型、JSONでない本文）', async () => {
      const t = await issueT();
      const idToken = await signToken(t);
      for (const body of [
        {},
        { idToken, nonce: t },
        { provider: 'apple', nonce: t },
        { provider: 'apple', idToken },
        { provider: 'microsoft', idToken, nonce: t },
        { provider: 1, idToken, nonce: t },
        { provider: 'apple', idToken: 1, nonce: t },
        { provider: 'apple', idToken, nonce: null },
        'not json',
        '',
        '[]',
        'null',
      ]) {
        const response = await login(body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { error: 'invalid_request' });
      }
      assert.deepEqual(await counts(), NOTHING_WRITTEN);
      assert.deepEqual(jwksCalls, []);
    });

    it('POST 以外は 405 で、Allow を返す', async () => {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const response = await login({}, { method });
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('allow'), 'POST');
      }
    });

    it('本文が大きすぎると 413（読み込みを途中でやめる）', async () => {
      const big = JSON.stringify({ provider: 'apple', idToken: 'x'.repeat(11_000), nonce: 'y' });
      assert.equal((await login(big)).status, 413);
    });

    it('入口（worker.fetch）から /auth/login に届く。HTTPSでなければ 403', async () => {
      const post = (url: string) => worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env);
      assert.equal((await post('https://singfolio.app/auth/login')).status, 400);
      assert.equal((await post('http://singfolio.app/auth/login')).status, 403);
    });
  });

  describe('POST /auth/logout', () => {
    it('そのセッションの行を消して 204。他のセッションは残る', async () => {
      const first = await loginOk();
      const second = await loginOk();
      const response = await logout(`Bearer ${first}`);
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '');
      assert.equal(await authenticateSession(db, first, NOW), null);
      assert.notEqual(await authenticateSession(db, second, NOW), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 2 });
    });

    it('何度呼んでも 204。知らない値（形は正しい）でも 204', async () => {
      const session = await loginOk();
      assert.equal((await logout(`Bearer ${session}`)).status, 204);
      assert.equal((await logout(`Bearer ${session}`)).status, 204);
      assert.equal((await logout(`Bearer ${'A'.repeat(43)}`)).status, 204);
    });

    it('ヘッダーが無い・形が違うと 401（何も消さない）', async () => {
      const session = await loginOk();
      for (const header of [undefined, '', session, `Basic ${session}`, `Bearer ${session.slice(1)}`, 'Bearer']) {
        const response = await logout(header);
        assert.equal(response.status, 401, String(header));
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
      }
      assert.notEqual(await authenticateSession(db, session, NOW), null);
    });

    it('POST 以外は 405 で、Allow を返す。消さない', async () => {
      const session = await loginOk();
      for (const method of ['GET', 'DELETE']) {
        const response = await logout(`Bearer ${session}`, method);
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('allow'), 'POST');
      }
      assert.notEqual(await authenticateSession(db, session, NOW), null);
    });
  });

  describe('POST /auth/logout-others（ほかの端末をすべてログアウト）', () => {
    it('認証済みのセッション以外を消して 204。認証済みのものは残る', async () => {
      const current = await loginOk();
      const second = await loginOk();
      const third = await loginOk();
      const response = await logoutOthers(`Bearer ${current}`);
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '');
      assert.notEqual(await authenticateSession(db, current, NOW), null);
      assert.equal(await authenticateSession(db, second, NOW), null);
      assert.equal(await authenticateSession(db, third, NOW), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 3 });
    });

    it('ほかのユーザーのセッションは消さない', async () => {
      const mine = await loginOk({ sub: 'apple-sub-mine' });
      const mineOther = await loginOk({ sub: 'apple-sub-mine' });
      const theirs = await loginOk({ sub: 'apple-sub-theirs' });
      assert.equal((await logoutOthers(`Bearer ${mine}`)).status, 204);
      assert.equal(await authenticateSession(db, mineOther, NOW), null);
      assert.notEqual(await authenticateSession(db, theirs, NOW), null);
    });

    it('同じユーザーにつながった別のログイン手段（Google）のセッションも消す', async () => {
      const apple = await loginOk({ sub: 'apple-sub-1' });
      const userId = (await db.prepare('SELECT id FROM users').first<{ id: string }>())!.id;
      const googleIdentity = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?1, ?2, 'google', 'g-1', ?3, ?3)`,
        )
        .bind(googleIdentity, userId, NOW)
        .run();
      const google = await createSession(db, googleIdentity, NOW);
      assert.notEqual(google, null);
      assert.equal((await logoutOthers(`Bearer ${apple}`)).status, 204);
      assert.equal(await authenticateSession(db, google!, NOW), null);
      assert.notEqual(await authenticateSession(db, apple, NOW), null);
    });

    it('消すものが無くても、何度呼んでも 204', async () => {
      const session = await loginOk();
      assert.equal((await logoutOthers(`Bearer ${session}`)).status, 204);
      assert.equal((await logoutOthers(`Bearer ${session}`)).status, 204);
      assert.notEqual(await authenticateSession(db, session, NOW), null);
    });

    it('ヘッダーが無い・形が違う・無効なセッションは 401（何も消さない）', async () => {
      const current = await loginOk();
      const other = await loginOk();
      const revoked = await loginOk();
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(createHash('sha256').update(revoked).digest('base64url')).run();
      for (const header of [undefined, '', current, `Basic ${current}`, `Bearer ${current.slice(1)}`, `Bearer ${'A'.repeat(43)}`, `Bearer ${revoked}`]) {
        const response = await logoutOthers(header);
        assert.equal(response.status, 401, String(header));
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
      }
      assert.notEqual(await authenticateSession(db, current, NOW), null);
      assert.notEqual(await authenticateSession(db, other, NOW), null);
    });

    it('期限切れのセッションでは消せない（401）', async () => {
      const stale = await loginOk();
      const other = await loginOk();
      const response = await handleLogoutOthers(
        new Request('https://singfolio.app/auth/logout-others', {
          method: 'POST',
          headers: { authorization: `Bearer ${stale}` },
        }),
        env,
        NOW + 90 * 24 * 60 * 60 * 1000,
      );
      assert.equal(response.status, 401);
      assert.notEqual(await authenticateSession(db, other, NOW), null);
    });

    it('POST 以外は 405 で、Allow を返す。消さない', async () => {
      const current = await loginOk();
      const other = await loginOk();
      for (const method of ['GET', 'DELETE']) {
        const response = await logoutOthers(`Bearer ${current}`, method);
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('allow'), 'POST');
      }
      assert.notEqual(await authenticateSession(db, other, NOW), null);
    });

    it('入口（worker.fetch）から届く。HTTPSでなければ 403', async () => {
      const post = (url: string) => worker.fetch(new Request(url, { method: 'POST' }), env);
      assert.equal((await post('https://singfolio.app/auth/logout-others')).status, 401);
      assert.equal((await post('http://singfolio.app/auth/logout-others')).status, 403);
    });
  });

  describe('通知との競合（consent_revoked_at。migrations/0002）', () => {
    it('取り消しの時刻が、ログインの開始と同じか後なら、検証を通っても、セッションを作らず 401', async () => {
      await loginOk({ sub: 'apple-sub-race' });
      await db.prepare('UPDATE identities SET consent_revoked_at = ?').bind(NOW + 1).run();
      const t = await issueT();
      const response = await login({ provider: 'apple', idToken: await signToken(t, { sub: 'apple-sub-race' }), nonce: t });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 2 });
    });

    it('取り消しのあとにあらためてログインすれば（開始が取り消しの時刻より後）、セッションを作る', async () => {
      await loginOk({ sub: 'apple-sub-race' });
      await db.prepare('UPDATE identities SET consent_revoked_at = ?').bind(NOW - 1).run();
      const t = await issueT();
      const response = await login({ provider: 'apple', idToken: await signToken(t, { sub: 'apple-sub-race' }), nonce: t });
      assert.equal(response.status, 200);
    });
  });
});
