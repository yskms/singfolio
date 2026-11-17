/// <reference types="node" />
// アカウントの削除（POST /auth/delete）を、模擬の発行元（テスト用のRSA鍵で署名し、JWKSを返す fetch）・模擬のApple
// （/auth/token・/auth/revoke を返す fetch）・ローカルD1で確かめる。ネットワークには出ない。
// 順序（再認証が通ってから消す）、`sub` の一致、Appleのトークンの失効が削除を止めないこと、失敗の応答の分け方を見る。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { createAppleCodeExchanger } from '../src/appleToken.ts';
import { handleDeleteAccount } from '../src/deleteAccount.ts';
import worker from '../src/index.ts';
import { createIdTokenVerifier, type FetchFunction, type IdTokenProvider, type IdTokenVerifier } from '../src/idToken.ts';
import { resolveIdentity } from '../src/identity.ts';
import { consumeNonce, issueNonce, nonceHash, toBase64Url } from '../src/nonce.ts';
import { authenticateSession, createSession } from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const SECRET = 'test-secret-value-0123456789abcdef';
const BUNDLE_ID = 'com.example.app';
const SERVICES_ID = 'com.example.web';
const GOOGLE_CLIENT_ID = '1234-web.apps.googleusercontent.com';
const TEAM_ID = 'TEAM123456';
const KEY_ID = 'KEY1234567';
const SUB = 'apple-sub-1';
const REFRESH = 'REFRESH-TOKEN-SECRET';
const ACCESS = 'ACCESS-TOKEN-SECRET';

const issuerKey = await (async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  return { privateKey: privateKey as CryptoKey, jwk: { ...(await exportJWK(publicKey)), kid: 'key-a', alg: 'RS256', use: 'sig' } as JWK };
})();
const impostorKey = (await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })).privateKey as CryptoKey;
const APPLE_PRIVATE_KEY = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey);
const newVerifier = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

describe('POST /auth/delete', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let env: Env;
  let verifier: IdTokenVerifier;
  let jwksFails: boolean;
  let logs: string[];
  // 模擬のApple。/auth/token と /auth/revoke への呼び出しを記録する。
  // `present`: その呼び出しの時点で、D1に、再認証したアカウント（`SUB`）の行が残っているか（呼び出しと削除の前後を見る）。
  let appleCalls: Array<{ url: string; form: URLSearchParams; present: boolean }>;
  let tokenResponse: ((form: URLSearchParams) => Response | Promise<Response>) | null;
  let revokeResponse: (() => Response | Promise<Response>) | null;

  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
    env = {
      NONCE_HMAC_KEY: SECRET,
      APPLE_BUNDLE_ID: BUNDLE_ID,
      APPLE_SERVICES_ID: SERVICES_ID,
      APPLE_TEAM_ID: TEAM_ID,
      APPLE_KEY_ID: KEY_ID,
      APPLE_PRIVATE_KEY,
      GOOGLE_WEB_CLIENT_ID: GOOGLE_CLIENT_ID,
      DB: db,
    } as unknown as Env;
  });
  after(async () => {
    await local.dispose();
  });

  const exchanger = createAppleCodeExchanger({
    fetch: async (url, init) => {
      const form = new URLSearchParams(String(init.body));
      const row = await db.prepare('SELECT COUNT(*) AS n FROM identities WHERE sub = ?').bind(SUB).first<{ n: number }>();
      appleCalls.push({ url, form, present: row!.n > 0 });
      if (url.endsWith('/auth/revoke')) return revokeResponse ? revokeResponse() : new Response('', { status: 200 });
      return tokenResponse!(form);
    },
    log: (message) => logs.push(message),
  });

  beforeEach(async () => {
    await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
    jwksFails = false;
    logs = [];
    appleCalls = [];
    tokenResponse = null;
    revokeResponse = null;
    const fetchFunction: FetchFunction = async () =>
      jwksFails ? new Response('down', { status: 500 }) : Response.json({ keys: [issuerKey.jwk] });
    verifier = createIdTokenVerifier({ fetch: fetchFunction });
  });

  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of ['users', 'identities', 'sessions', 'used_nonces']) {
      result[table] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    }
    return result;
  };

  /** ログイン済みのユーザーを作る（セッションの値を返す）。 */
  async function signedIn(provider: IdTokenProvider = 'apple', sub = SUB) {
    const { identityId, userId } = await resolveIdentity(db, provider, sub, NOW - 1000);
    const session = (await createSession(db, identityId, NOW - 1000))!;
    return { identityId, userId, session };
  }

  const issueT = async (kind: 'native' | 'web' = 'native', v?: string, now = NOW) =>
    (
      await issueNonce(
        SECRET,
        kind === 'native' ? { kind } : { kind, challenge: await nonceHash(v ?? newVerifier()) },
        now,
      )
    ).nonce;

  interface TokenOptions {
    provider?: IdTokenProvider;
    sub?: string;
    aud?: string;
    nonceClaim?: string | null;
    exp?: number;
    key?: CryptoKey;
  }
  async function signToken(
    t: string,
    { provider = 'apple', sub = SUB, aud, nonceClaim, exp = NOW_S + 600, key = issuerKey.privateKey }: TokenOptions = {},
  ) {
    const claims: Record<string, unknown> = {
      iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: aud ?? (provider === 'apple' ? BUNDLE_ID : GOOGLE_CLIENT_ID),
      sub,
      iat: NOW_S - 10,
      exp,
    };
    if (nonceClaim !== null) claims.nonce = nonceClaim ?? (await nonceHash(t));
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'key-a' }).sign(key);
  }

  const call = (session: string | undefined, body: unknown, { now = NOW, method = 'POST' } = {}) =>
    handleDeleteAccount(
      new Request('https://singfolio.app/auth/delete', {
        method,
        headers: {
          'content-type': 'application/json',
          ...(session === undefined ? {} : { authorization: `Bearer ${session}` }),
        },
        body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
      now,
      { verifier, exchanger, log: (message) => logs.push(message) },
    );

  /** iOSのAppleの再認証の本文。 */
  async function appleNative(options: TokenOptions & { authorizationCode?: string | null } = {}) {
    const t = await issueT('native');
    const body: Record<string, unknown> = { provider: 'apple', nonce: t, idToken: await signToken(t, options) };
    if (options.authorizationCode !== null) body.authorizationCode = options.authorizationCode ?? 'native-code';
    return { t, body };
  }
  /** Androidの Apple（Web経由）の再認証。Appleが、この T のIDトークンと、トークンを返す。 */
  async function appleWeb(options: TokenOptions = {}) {
    const v = newVerifier();
    const t = await issueT('web', v);
    tokenResponse = async () =>
      Response.json({
        id_token: await signToken(t, { aud: SERVICES_ID, ...options }),
        refresh_token: REFRESH,
        access_token: ACCESS,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    return { t, v, body: { provider: 'apple', nonce: t, code: 'web-code', verifier: v } };
  }
  async function google(options: TokenOptions = {}) {
    const t = await issueT('native');
    return { t, body: { provider: 'google', nonce: t, idToken: await signToken(t, { provider: 'google', ...options }) } };
  }
  const deleted = async () => assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0, used_nonces: 1 });

  describe('成功', () => {
    it('Apple（iOS）: 再認証が通ったら、アカウントごと消し、認可コードを交換して、トークンを失効させる', async () => {
      const { session, userId } = await signedIn();
      const bystander = await signedIn('apple', 'apple-sub-bystander');
      tokenResponse = () => Response.json({ id_token: 'UNUSED', refresh_token: REFRESH, access_token: ACCESS });
      const { body } = await appleNative();
      const response = await call(session, body);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { appleRevoked: true });

      assert.equal(await authenticateSession(db, session, NOW), null);
      assert.equal(
        (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(userId).first<{ n: number }>())!.n,
        0,
      );
      // ほかの人は消さない。
      assert.notEqual(await authenticateSession(db, bystander.session, NOW), null);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 1 });

      // Appleへ: 認可コードの交換（バンドルIDの client_id。redirect_uri は付けない）、そのトークンの失効。
      assert.equal(appleCalls.length, 2);
      const [exchange, revoke] = appleCalls as [(typeof appleCalls)[number], (typeof appleCalls)[number]];
      assert.equal(exchange.url, 'https://appleid.apple.com/auth/token');
      assert.equal(exchange.form.get('client_id'), BUNDLE_ID);
      assert.equal(exchange.form.get('code'), 'native-code');
      assert.equal(exchange.form.get('grant_type'), 'authorization_code');
      assert.equal(exchange.form.has('redirect_uri'), false);
      assert.equal(revoke.url, 'https://appleid.apple.com/auth/revoke');
      assert.equal(revoke.form.get('client_id'), BUNDLE_ID);
      assert.equal(revoke.form.get('token'), REFRESH);
      assert.equal(revoke.form.get('token_type_hint'), 'refresh_token');
      assert.ok((revoke.form.get('client_secret') ?? '').length > 0);
      assert.deepEqual(logs, []);
    });

    it('Apple（iOS）: 認可コードの交換は、D1を消す前。失効だけが、消したあと（消したあとに待つのを、1回にする）', async () => {
      const { session } = await signedIn();
      tokenResponse = () => Response.json({ id_token: 'UNUSED', refresh_token: REFRESH });
      assert.equal((await call(session, (await appleNative()).body)).status, 200);
      assert.deepEqual(
        appleCalls.map((c) => [c.url.endsWith('/auth/token') ? 'exchange' : 'revoke', c.present]),
        [
          ['exchange', true],
          ['revoke', false],
        ],
      );
    });

    it('Apple（Android）: 交換（本人確認に要る）はD1を消す前、失効は消したあと', async () => {
      const { session } = await signedIn();
      const { body } = await appleWeb();
      assert.equal((await call(session, body)).status, 200);
      assert.deepEqual(
        appleCalls.map((c) => [c.url.endsWith('/auth/token') ? 'exchange' : 'revoke', c.present]),
        [
          ['exchange', true],
          ['revoke', false],
        ],
      );
    });

    it('Apple（Android）: 認可コードの交換（Services ID・redirect_uri）で本人確認し、同じ応答のトークンを失効させる（交換は1回）', async () => {
      const { session } = await signedIn();
      const { body } = await appleWeb();
      const response = await call(session, body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: true });
      await deleted();
      assert.equal(appleCalls.length, 2);
      assert.equal(appleCalls[0]!.url, 'https://appleid.apple.com/auth/token');
      assert.equal(appleCalls[0]!.form.get('client_id'), SERVICES_ID);
      assert.equal(appleCalls[0]!.form.get('redirect_uri'), 'https://singfolio.app/auth/apple/callback');
      assert.equal(appleCalls[1]!.url, 'https://appleid.apple.com/auth/revoke');
      assert.equal(appleCalls[1]!.form.get('client_id'), SERVICES_ID);
      assert.equal(appleCalls[1]!.form.get('token'), REFRESH);
    });

    it('Apple: refresh_token が無ければ、access_token を失効させる', async () => {
      const { session } = await signedIn();
      const { body } = await appleWeb();
      const makeIdToken = tokenResponse!;
      tokenResponse = async (form) => {
        const original = (await (await makeIdToken(form)).json()) as { id_token: string };
        return Response.json({ id_token: original.id_token, access_token: ACCESS });
      };
      assert.deepEqual(await (await call(session, body)).json(), { appleRevoked: true });
      assert.equal(appleCalls[1]!.form.get('token'), ACCESS);
      assert.equal(appleCalls[1]!.form.get('token_type_hint'), 'access_token');
    });

    it('Google: Appleには何も送らない。appleRevoked は null', async () => {
      const { session } = await signedIn('google', 'google-sub-1');
      const { body } = await google({ sub: 'google-sub-1' });
      const response = await call(session, body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: null });
      await deleted();
      assert.deepEqual(appleCalls, []);
    });

    it('複数のログイン手段・複数の端末のセッションも、すべて消える', async () => {
      const { session, userId, identityId } = await signedIn();
      const other = (await createSession(db, identityId, NOW))!;
      const googleIdentity = crypto.randomUUID();
      await db
        .prepare(`INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?1, ?2, 'google', 'g-1', ?3, ?3)`)
        .bind(googleIdentity, userId, NOW)
        .run();
      const googleSession = (await createSession(db, googleIdentity, NOW))!;
      const { body } = await appleNative({ authorizationCode: null });
      assert.equal((await call(session, body)).status, 200);
      for (const value of [session, other, googleSession]) assert.equal(await authenticateSession(db, value, NOW), null);
      assert.deepEqual(await counts(), { users: 0, identities: 0, sessions: 0, used_nonces: 1 });
    });
  });

  describe('Appleのトークンの失効は、削除を止めない', () => {
    it('iOSで認可コードが付いていない: 消して、appleRevoked は false（Appleは呼ばない）', async () => {
      const { session } = await signedIn();
      const { body } = await appleNative({ authorizationCode: null });
      const response = await call(session, body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: false });
      await deleted();
      assert.deepEqual(appleCalls, []);
    });

    it('認可コードの交換が失敗（無効・Appleの不調）: 消して、appleRevoked は false', async () => {
      for (const response of [
        () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
        () => new Response('oops', { status: 500 }),
        () => Response.json({ id_token: 'x' }), // トークンが無い
      ]) {
        await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
        const { session } = await signedIn();
        tokenResponse = response;
        const { body } = await appleNative();
        const result = await call(session, body);
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { appleRevoked: false });
        await deleted();
      }
    });

    it('失効の失敗（Appleの400・通信の失敗）: 消して、appleRevoked は false。分類を1行だけ記録する', async () => {
      const { session } = await signedIn();
      tokenResponse = () => Response.json({ id_token: 'x', refresh_token: REFRESH });
      revokeResponse = () => Response.json({ error: 'invalid_client', error_description: 'SECRET-DESCRIPTION' }, { status: 400 });
      const { body } = await appleNative();
      const response = await call(session, body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: false });
      await deleted();
      assert.deepEqual(logs, ['apple token revoke failed: status=400 error=invalid_client']);

      logs.length = 0;
      await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
      const second = await signedIn();
      revokeResponse = () => {
        throw new Error('connect failed SECRET-DETAIL');
      };
      assert.deepEqual(await (await call(second.session, (await appleNative()).body)).json(), { appleRevoked: false });
      assert.deepEqual(logs, ['apple token revoke failed: network']);
    });

    it('鍵の設定の不備（APPLE_PRIVATE_KEY）でも、消す。appleRevoked は false。鍵・例外の中身は記録しない', async () => {
      const { session } = await signedIn();
      tokenResponse = () => Response.json({ id_token: 'x', refresh_token: REFRESH });
      const broken = { ...env, APPLE_PRIVATE_KEY: 'replace-with-a-throwaway-pkcs8-ec-key' } as Env;
      const { body } = await appleNative();
      const response = await handleDeleteAccount(
        new Request('https://singfolio.app/auth/delete', {
          method: 'POST',
          headers: { authorization: `Bearer ${session}` },
          body: JSON.stringify(body),
        }),
        broken,
        NOW,
        { verifier, exchanger, log: (message) => logs.push(message) },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: false });
      await deleted();
      // iOS: 交換（D1を消す前）の段階で、鍵を読めない。失効の段階の分類（`revoke`）とは別の行にする（`wrangler tail` で切り分ける）。
      assert.deepEqual(logs, ['apple token exchange failed: unexpected']);
    });

    it('失効だけが例外で終わっても、消す。appleRevoked は false。失効の段階の分類を記録する', async () => {
      const { session } = await signedIn();
      tokenResponse = () => Response.json({ id_token: 'UNUSED', refresh_token: REFRESH });
      const throwingRevoke = {
        ...exchanger,
        revoke: async () => {
          throw new Error('SECRET-DETAIL');
        },
      };
      const { body } = await appleNative();
      const response = await handleDeleteAccount(
        new Request('https://singfolio.app/auth/delete', {
          method: 'POST',
          headers: { authorization: `Bearer ${session}` },
          body: JSON.stringify(body),
        }),
        env,
        NOW,
        { verifier, exchanger: throwingRevoke, log: (message) => logs.push(message) },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { appleRevoked: false });
      await deleted();
      assert.deepEqual(logs, ['apple token revoke failed: unexpected']);
    });

    it('記録・応答に、トークン・コード・IDトークンを出さない', async () => {
      const { session } = await signedIn();
      tokenResponse = () => Response.json({ id_token: 'x', refresh_token: REFRESH, access_token: ACCESS });
      revokeResponse = () => new Response('<html>REFRESH-TOKEN-SECRET</html>', { status: 502 });
      const { body } = await appleNative({ authorizationCode: 'THE-NATIVE-CODE' });
      const response = await call(session, body);
      const text = await response.text();
      for (const secret of [REFRESH, ACCESS, 'THE-NATIVE-CODE', body.idToken as string]) {
        assert.equal(text.includes(secret), false);
        assert.equal(logs.join('\n').includes(secret), false);
      }
      assert.deepEqual(logs, ['apple token revoke failed: status=502 unreadable']);
    });
  });

  describe('再認証が通らなければ、何も消さない（403。セッションは捨てさせない）', () => {
    const notDeleted = async (session: string, expected = { users: 1, identities: 1, sessions: 1, used_nonces: 0 }) => {
      assert.notEqual(await authenticateSession(db, session, NOW), null);
      assert.deepEqual(await counts(), expected);
    };
    const forbidden = async (response: Response, error: string) => {
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error });
    };

    it('別のアカウント（sub が違う）で再認証すると、account_mismatch。T は使い切りにしない', async () => {
      const { session } = await signedIn();
      const { body } = await appleNative({ sub: 'apple-sub-other' });
      await forbidden(await call(session, body), 'account_mismatch');
      await notDeleted(session);
      assert.deepEqual(appleCalls, []);
    });

    it('別のユーザーの sub で再認証しても、自分のアカウントは消えず、相手も消えない', async () => {
      const mine = await signedIn('apple', 'apple-sub-mine');
      const theirs = await signedIn('apple', 'apple-sub-theirs');
      const { body } = await appleNative({ sub: 'apple-sub-theirs' });
      await forbidden(await call(mine.session, body), 'account_mismatch');
      assert.notEqual(await authenticateSession(db, mine.session, NOW), null);
      assert.notEqual(await authenticateSession(db, theirs.session, NOW), null);
      assert.deepEqual(await counts(), { users: 2, identities: 2, sessions: 2, used_nonces: 0 });
    });

    it('同じ sub でも、手段が違う（Google の sub を Apple のセッションで使う）と通らない', async () => {
      const { session } = await signedIn('apple', SUB);
      const { body } = await google({ sub: SUB });
      assert.equal((await call(session, body)).status, 400); // 手段の取り違え
      await notDeleted(session);
    });

    it('IDトークンの不備は reauth_failed（署名・aud・期限・nonce の欠落と不一致）', async () => {
      const { session } = await signedIn();
      for (const options of [
        { key: impostorKey },
        { aud: 'com.attacker.app' },
        { aud: SERVICES_ID }, // 経路と違う aud（native に Services ID）
        { exp: NOW_S - 3600 },
        { nonceClaim: null },
        { nonceClaim: 'A'.repeat(43) },
      ] satisfies TokenOptions[]) {
        const { body } = await appleNative(options);
        await forbidden(await call(session, body), 'reauth_failed');
      }
      await notDeleted(session);
    });

    it('T の不備は reauth_failed（期限切れ・署名違い・種別違い）。使用済みの T も通らない', async () => {
      const { session } = await signedIn();
      const t = await issueT('native');
      const idToken = await signToken(t);
      await forbidden(await call(session, { provider: 'apple', nonce: t, idToken }, { now: NOW + 6 * 60 * 1000 }), 'reauth_failed');
      const forged = await issueNonce('another-secret-value-0123456789abcdef', { kind: 'native' }, NOW);
      await forbidden(
        await call(session, { provider: 'apple', nonce: forged.nonce, idToken: await signToken(forged.nonce) }),
        'reauth_failed',
      );
      const webT = await issueT('web');
      await forbidden(await call(session, { provider: 'apple', nonce: webT, idToken: await signToken(webT) }), 'reauth_failed');

      // 使用済み（リプレイ）。再認証が通っても、T が使い切りなら消さない。
      const used = await issueT('native');
      const usedToken = await signToken(used);
      assert.equal(await consumeNonce(db, await nonceHash(used), NOW + 300_000, NOW), true);
      await forbidden(await call(session, { provider: 'apple', nonce: used, idToken: usedToken }), 'reauth_failed');
      await notDeleted(session, { users: 1, identities: 1, sessions: 1, used_nonces: 1 });
    });

    it('Android: V が違う・コードが無効（invalid_grant）は reauth_failed。V の不一致では Apple を呼ばない', async () => {
      const { session } = await signedIn();
      const flow = await appleWeb();
      await forbidden(await call(session, { ...flow.body, verifier: newVerifier() }), 'reauth_failed');
      assert.deepEqual(appleCalls, []);
      tokenResponse = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
      await forbidden(await call(session, flow.body), 'reauth_failed');
      assert.equal(appleCalls.length, 1);
      await notDeleted(session);
    });

    it('Android: native の T を、web の経路に使えない（V の照合が飛ばされない）', async () => {
      const { session } = await signedIn();
      const nativeT = await issueT('native');
      await forbidden(await call(session, { provider: 'apple', nonce: nativeT, code: 'c', verifier: newVerifier() }), 'reauth_failed');
      assert.deepEqual(appleCalls, []);
      await notDeleted(session);
    });

    it('Android: 交換で得たIDトークンの sub が違えば account_mismatch。トークンは失効させない', async () => {
      const { session } = await signedIn();
      const { body } = await appleWeb({ sub: 'apple-sub-other' });
      await forbidden(await call(session, body), 'account_mismatch');
      assert.equal(appleCalls.length, 1);
      await notDeleted(session);
    });
  });

  describe('使えないとき（503。何も消さない）', () => {
    it('公開鍵を取得できず、使える古い鍵も無い', async () => {
      const { session } = await signedIn();
      jwksFails = true;
      const { body } = await appleNative();
      const response = await call(session, body);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 0 });
    });

    it('Android: Appleの交換が使えない（5xx・通信の失敗）', async () => {
      const { session } = await signedIn();
      const { body } = await appleWeb();
      tokenResponse = () => new Response('oops', { status: 500 });
      assert.equal((await call(session, body)).status, 503);
      tokenResponse = () => {
        throw new Error('down');
      };
      assert.equal((await call(session, body)).status, 503);
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 0 });
    });
  });

  describe('セッションの認証と、本文の形', () => {
    it('Authorization が無い・形が違う・無効（失効済み）なセッションは 401（何も消さない）', async () => {
      const { session } = await signedIn();
      const revoked = await signedIn('apple', 'apple-sub-revoked');
      await db.prepare('DELETE FROM sessions WHERE identity_id = ?').bind(revoked.identityId).run();
      const { body } = await appleNative();
      for (const value of [undefined, 'short', 'A'.repeat(43), revoked.session]) {
        const response = await call(value, body);
        assert.equal(response.status, 401, String(value));
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
      }
      assert.notEqual(await authenticateSession(db, session, NOW), null);
      assert.deepEqual(await counts(), { users: 2, identities: 2, sessions: 1, used_nonces: 0 });
      assert.deepEqual(appleCalls, []);
    });

    it('期限切れのセッションは 401', async () => {
      const { session } = await signedIn();
      const { body } = await appleNative();
      assert.equal((await call(session, body, { now: NOW + 91 * 24 * 60 * 60 * 1000 })).status, 401);
    });

    it('本文の不備は 400（形の組み合わせが違う・nonce が無い・コードや V の形が違う）', async () => {
      const { session } = await signedIn();
      const t = await issueT('native');
      const idToken = await signToken(t);
      const v = newVerifier();
      for (const body of [
        {},
        { provider: 'apple' },
        { provider: 'apple', nonce: t },
        { provider: 'facebook', nonce: t, idToken },
        { provider: 'apple', idToken }, // nonce が無い
        { provider: 'apple', nonce: t, idToken, code: 'c', verifier: v }, // 2つの経路の混在
        { provider: 'apple', nonce: t, idToken, authorizationCode: 5 },
        { provider: 'apple', nonce: t, idToken, authorizationCode: '' },
        { provider: 'apple', nonce: t, idToken, authorizationCode: 'has space' },
        { provider: 'apple', nonce: t, code: 'c' }, // verifier が無い
        { provider: 'apple', nonce: t, code: 'c', verifier: 'short' },
        { provider: 'apple', nonce: t, code: '', verifier: v },
        { provider: 'apple', nonce: t, code: 'c', verifier: v, authorizationCode: 'x' },
        { provider: 'google', nonce: t },
        { provider: 'google', nonce: t, idToken, code: 'c' },
        { provider: 'google', nonce: t, idToken, authorizationCode: 'x' },
        { provider: 'google', nonce: 5, idToken },
        '[]',
        'not json',
      ]) {
        const response = await call(session, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { error: 'invalid_request' });
      }
      assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 0 });
      assert.deepEqual(appleCalls, []);
    });

    it('本文が大きすぎると 413。POST 以外は 405', async () => {
      const { session } = await signedIn();
      assert.equal((await call(session, JSON.stringify({ provider: 'apple', nonce: 'x', idToken: 'y'.repeat(11_000) }))).status, 413);
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const response = await call(session, {}, { method });
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('allow'), 'POST');
      }
      assert.notEqual(await authenticateSession(db, session, NOW), null);
    });

    it('入口（worker.fetch）から届く。HTTPSでなければ 403', async () => {
      const post = (url: string) => worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env);
      assert.equal((await post('https://singfolio.app/auth/delete')).status, 401);
      assert.equal((await post('http://singfolio.app/auth/delete')).status, 403);
    });
  });
});
