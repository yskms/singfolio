/// <reference types="node" />
// AndroidのAppleログイン（Web経由）: コールバック（アプリのURLスキームへの302）、`client_secret`、認可コードの交換、
// `POST /auth/apple/login`。Appleは、模擬（テスト用のECDSA鍵・RSA鍵と、programmable な fetch）。ネットワークには出ない。
// 方式は docs/singfolio-publishing-backend.md §8「AndroidのAppleログイン（Web経由）」。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import { AppleClientSecretConfigError, CLIENT_SECRET_TTL_SECONDS, createAppleClientSecret } from '../src/appleClientSecret.ts';
import { createAppleCodeExchanger, type AppleFetch } from '../src/appleToken.ts';
import { APP_RETURN_URL, APPLE_CALLBACK_URL, handleAppleCallback, handleAppleWebLogin } from '../src/appleWeb.ts';
import worker from '../src/index.ts';
import { createIdTokenVerifier, type FetchFunction, type IdTokenVerifier } from '../src/idToken.ts';
import { issueNonce, NONCE_TTL_MS, nonceHash, toBase64Url } from '../src/nonce.ts';
import { authenticateSession, isSessionToken } from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const SECRET = 'test-secret-value-0123456789abcdef';
const SERVICES_ID = 'com.example.web';
const BUNDLE_ID = 'com.example.app';
const TEAM_ID = 'TEAM123456';
const KEY_ID = 'KEY1234567';
const STATE = 'S'.repeat(43);

const issuerKey = await (async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid: 'key-a', alg: 'RS256', use: 'sig' } as JWK };
})();

// Sign in with Apple の鍵（.p8）の代わり。
const appleKey = await generateKeyPair('ES256', { extractable: true });
const APPLE_PRIVATE_KEY = await exportPKCS8(appleKey.privateKey);
const RSA_PRIVATE_KEY = await exportPKCS8((await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 })).privateKey);

// アプリが作る検証用の値 `V`（32バイトの乱数の base64url。43字）と、そのハッシュ `C`。
const newVerifier = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

describe('GET /auth/apple/callback', () => {
  const call = (query: string, init: RequestInit = {}) =>
    handleAppleCallback(new Request(`https://singfolio.app/auth/apple/callback${query}`, init));

  it('code と state を、アプリのURLスキームへの302で戻す（キャッシュさせず、Referer に出さない）', async () => {
    const response = call(`?code=abc.def-123&state=${STATE}`);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${APP_RETURN_URL}?code=abc.def-123&state=${STATE}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    // 戻れなかったとき用のリンク。URLの & は、HTMLでは &amp;
    const body = await response.text();
    assert.ok(body.includes(`href="${APP_RETURN_URL}?code=abc.def-123&amp;state=${STATE}"`));
  });

  it('取りやめ（error=user_cancelled_authorize）は、code なしで戻す。state は無くてもよい', () => {
    const withState = call(`?error=user_cancelled_authorize&state=${STATE}`);
    assert.equal(withState.status, 302);
    assert.equal(withState.headers.get('location'), `${APP_RETURN_URL}?error=user_cancelled_authorize&state=${STATE}`);
    const without = call('?error=user_cancelled_authorize');
    assert.equal(without.status, 302);
    assert.equal(without.headers.get('location'), `${APP_RETURN_URL}?error=user_cancelled_authorize`);
  });

  it('戻り先は固定。ほかのパラメータ（redirect・scheme など）は、渡さない', () => {
    const response = call(`?code=abc&state=${STATE}&redirect=https://evil.example&scheme=evil&redirect_uri=evil://x`);
    const location = new URL(response.headers.get('location') ?? '');
    assert.equal(location.protocol, 'singfolio:');
    assert.equal(location.host, 'auth');
    assert.equal(location.pathname, '/apple');
    assert.deepEqual([...location.searchParams.keys()].sort(), ['code', 'state']);
  });

  it('値はURLエンコードして渡す（アプリが元の値を読める。区切りを壊せない）', () => {
    const code = 'a+b/c=d&e%f#g';
    const response = call(`?code=${encodeURIComponent(code)}&state=${STATE}`);
    const location = new URL(response.headers.get('location') ?? '');
    assert.equal(location.searchParams.get('code'), code);
    assert.deepEqual([...location.searchParams.keys()].sort(), ['code', 'state']);
  });

  it('HEAD は本文なしの302。GET・HEAD 以外は 405', async () => {
    const head = call(`?code=abc&state=${STATE}`, { method: 'HEAD' });
    assert.equal(head.status, 302);
    assert.equal(await head.text(), '');
    const post = call(`?code=abc&state=${STATE}`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  });

  for (const [name, query] of [
    ['code も error も無い', `?state=${STATE}`],
    ['code と error の両方', `?code=abc&error=access_denied&state=${STATE}`],
    ['state の形が違う（短い）', '?code=abc&state=short'],
    ['state の形が違う（記号）', `?code=abc&state=${'!'.repeat(43)}`],
    ['code が空', `?code=&state=${STATE}`],
    ['code に空白', `?code=a%20b&state=${STATE}`],
    ['code に改行', `?code=a%0Ab&state=${STATE}`],
    ['code が長すぎる', `?code=${'a'.repeat(1025)}&state=${STATE}`],
    ['error の形が違う（大文字・記号）', `?error=Access-Denied&state=${STATE}`],
    ['error が長すぎる', `?error=${'a'.repeat(65)}`],
  ] as const) {
    it(`${name}: 400（アプリへ戻さない）`, async () => {
      const response = call(query);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('location'), null);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    });
  }

  it('worker のルートに載っている。HTTPS でなければ 403（中身を見ない）', async () => {
    const env = {} as Env;
    const ok = await worker.fetch(new Request(`https://singfolio.app/auth/apple/callback?code=abc&state=${STATE}`), env);
    assert.equal(ok.status, 302);
    const insecure = await worker.fetch(new Request(`http://singfolio.app/auth/apple/callback?code=abc&state=${STATE}`), env);
    assert.equal(insecure.status, 403);
  });
});

describe('client_secret', () => {
  const config = { teamId: TEAM_ID, keyId: KEY_ID, clientId: SERVICES_ID, privateKey: APPLE_PRIVATE_KEY };

  it('ES256 のJWT。kid・iss（Team ID）・sub（Services ID）・aud・exp（5分）が入り、鍵で検証できる', async () => {
    const jwt = await createAppleClientSecret(config, NOW);
    const header = decodeProtectedHeader(jwt);
    assert.equal(header.alg, 'ES256');
    assert.equal(header.kid, KEY_ID);
    const { payload } = await jwtVerify(jwt, appleKey.publicKey, {
      algorithms: ['ES256'],
      issuer: TEAM_ID,
      subject: SERVICES_ID,
      audience: 'https://appleid.apple.com',
      currentDate: new Date(NOW),
    });
    assert.equal(payload.iat, NOW_S);
    assert.equal(payload.exp, NOW_S + CLIENT_SECRET_TTL_SECONDS);
    assert.equal(CLIENT_SECRET_TTL_SECONDS, 300);
  });

  it('改行が \\n の2文字で渡された鍵（.dev.vars の1行表記）も読める', async () => {
    const oneLine = APPLE_PRIVATE_KEY.trim().replace(/\n/g, '\\n');
    assert.ok(!oneLine.includes('\n'));
    const jwt = await createAppleClientSecret({ ...config, privateKey: oneLine }, NOW);
    await jwtVerify(jwt, appleKey.publicKey, { algorithms: ['ES256'], currentDate: new Date(NOW) });
  });

  for (const [name, privateKey] of [
    ['鍵が無い', undefined],
    ['鍵が空', '  '],
    ['鍵の形が違う（見本の値）', 'replace-with-a-throwaway-pkcs8-ec-key'],
    ['RSAの鍵（ES256ではない）', RSA_PRIVATE_KEY],
  ] as const) {
    it(`${name}: 設定の不備として投げる。鍵の内容はエラーに載せない`, async () => {
      await assert.rejects(
        createAppleClientSecret({ ...config, privateKey: privateKey as string }, NOW),
        (error: unknown) => {
          assert.ok(error instanceof AppleClientSecretConfigError);
          const sample = privateKey?.trim().slice(0, 30) ?? '';
          assert.ok(sample === '' || !error.message.includes(sample));
          return true;
        },
      );
    });
  }
});

describe('認可コードの交換', () => {
  interface Recorded {
    url: string;
    init: RequestInit;
    form: URLSearchParams;
  }
  let recorded: Recorded[];
  let respond: () => Response | Promise<Response>;
  const appleFetch: AppleFetch = async (url, init) => {
    recorded.push({ url, init, form: new URLSearchParams(String(init.body)) });
    return respond();
  };
  const logs: string[] = [];
  const exchanger = createAppleCodeExchanger({ fetch: appleFetch, log: (message) => logs.push(message) });
  const config = {
    clientId: SERVICES_ID,
    redirectUri: APPLE_CALLBACK_URL,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: APPLE_PRIVATE_KEY,
  };

  beforeEach(() => {
    recorded = [];
    logs.length = 0;
    respond = () => Response.json({ id_token: 'ID-TOKEN', refresh_token: 'REFRESH-SECRET', access_token: 'ACCESS-SECRET' });
  });

  it('Apple の /auth/token へ、form で送る。client_secret は、鍵で署名したJWT', async () => {
    const result = await exchanger.exchange(config, 'the-code', NOW);
    assert.equal(recorded.length, 1);
    const { url, init, form } = recorded[0]!;
    assert.equal(url, 'https://appleid.apple.com/auth/token');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal((init.headers as Record<string, string>)['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(form.get('client_id'), SERVICES_ID);
    assert.equal(form.get('code'), 'the-code');
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('redirect_uri'), 'https://singfolio.app/auth/apple/callback');
    await jwtVerify(form.get('client_secret') ?? '', appleKey.publicKey, {
      algorithms: ['ES256'],
      issuer: TEAM_ID,
      subject: SERVICES_ID,
      currentDate: new Date(NOW),
    });
    assert.deepEqual(result, { ok: true, idToken: 'ID-TOKEN' });
  });

  it('結果は id_token だけ。refresh_token・access_token は、読まず、載せない', async () => {
    const result = await exchanger.exchange(config, 'c', NOW);
    assert.equal(JSON.stringify(result).includes('REFRESH-SECRET'), false);
    assert.equal(JSON.stringify(result).includes('ACCESS-SECRET'), false);
    assert.deepEqual(Object.keys(result).sort(), ['idToken', 'ok']);
  });

  it('400 invalid_grant は、コードが無効（invalid_grant）。それ以外は unavailable', async () => {
    respond = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    assert.deepEqual(await exchanger.exchange(config, 'c', NOW), { ok: false, reason: 'invalid_grant' });

    for (const response of [
      () => Response.json({ error: 'invalid_client' }, { status: 400 }), // こちらの設定の不備
      () => Response.json({ error: 'invalid_request' }, { status: 400 }),
      () => Response.json({ error: 'invalid_grant' }, { status: 401 }),
      () => Response.json({ error: 'invalid_client' }, { status: 401 }),
      () => new Response('oops', { status: 500 }),
      () => new Response('<html>not json</html>', { status: 200 }),
      () => Response.json({ not_id_token: 1 }),
      () => Response.json({ id_token: '' }),
      () => Response.json({ id_token: 5 }),
      () => Response.json(null),
      () => Response.json([1]),
      () => new Response('x'.repeat(70_000), { status: 200 }),
    ]) {
      respond = response;
      assert.deepEqual(await exchanger.exchange(config, 'c', NOW), { ok: false, reason: 'unavailable' });
    }
  });

  it('通信の失敗・タイムアウト（fetch が投げる）は unavailable。例外の内容は載せない', async () => {
    const failing = createAppleCodeExchanger({
      fetch: async () => {
        throw new Error('connect failed SECRET-DETAIL');
      },
      log: (message) => logs.push(message),
    });
    const result = await failing.exchange(config, 'c', NOW);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
    assert.deepEqual(logs, ['apple token exchange failed: network']);
  });

  it('失敗の分類を1行出す。出すのは、ステータスと、許可リストにある error の名前だけ', async () => {
    // Appleは、でたらめなコードには常に invalid_grant を返す（Team ID・Key ID・鍵・Services ID が違っても。測定）ので、
    // 設定の不備（invalid_client）は、本物のコードで試すまで分からない。503 から切り分けられるのは、この1行だけ。
    const cases: Array<[() => Response, string]> = [
      [() => Response.json({ error: 'invalid_client', error_description: 'SECRET-DESCRIPTION' }, { status: 400 }), 'status=400 error=invalid_client'],
      [() => Response.json({ error: 'invalid_client' }, { status: 401 }), 'status=401 error=invalid_client'],
      [() => Response.json({ error: 'invalid_request' }, { status: 400 }), 'status=400 error=invalid_request'],
      [() => Response.json({ error: 'invalid_grant' }, { status: 401 }), 'status=401 error=invalid_grant'],
      [() => Response.json({ error: 'surprise SECRET-ERROR\nline2' }, { status: 400 }), 'status=400 error=other'],
      [() => Response.json({}, { status: 503 }), 'status=503 error=other'],
      [() => new Response('<html>SECRET-BODY</html>', { status: 502 }), 'status=502 unreadable'],
      [() => Response.json(null, { status: 200 }), 'status=200 unreadable'],
      [() => new Response('x'.repeat(70_000), { status: 200 }), 'status=200 unreadable'],
      [() => Response.json({ not_id_token: 1 }), 'status=200 no id_token'],
      [() => Response.json({ id_token: '' }), 'status=200 no id_token'],
    ];
    for (const [response, expected] of cases) {
      logs.length = 0;
      respond = response;
      assert.deepEqual(await exchanger.exchange(config, 'THE-CODE', NOW), { ok: false, reason: 'unavailable' });
      assert.deepEqual(logs, [`apple token exchange failed: ${expected}`]);
    }
  });

  it('コードが無効（400 invalid_grant）と成功は、記録しない。記録に、コード・client_secret・id_token を含めない', async () => {
    respond = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    await exchanger.exchange(config, 'THE-CODE', NOW);
    respond = () => Response.json({ id_token: 'ID-TOKEN' });
    await exchanger.exchange(config, 'THE-CODE', NOW);
    assert.equal(logs.length, 0);

    respond = () => Response.json({ error: 'invalid_client', id_token: 'ID-TOKEN' }, { status: 400 });
    await exchanger.exchange(config, 'THE-CODE', NOW);
    const clientSecret = recorded.at(-1)!.form.get('client_secret') ?? '';
    assert.ok(clientSecret.length > 0);
    for (const line of logs) {
      for (const secret of ['THE-CODE', clientSecret, 'ID-TOKEN', APPLE_PRIVATE_KEY]) {
        assert.equal(line.includes(secret), false);
      }
    }
  });

  it('鍵の設定が不備なら、Appleを呼ぶ前に投げる（利用者の失敗に見せかけない）', async () => {
    await assert.rejects(exchanger.exchange({ ...config, privateKey: '' }, 'c', NOW), AppleClientSecretConfigError);
    assert.equal(recorded.length, 0);
  });
});

describe('POST /auth/apple/login', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let env: Env;
  let verifier: IdTokenVerifier;
  let jwksCalls: number;
  let appleCalls: Array<{ code: string }>;
  let appleResponse: ((form: URLSearchParams) => Response | Promise<Response>) | null;

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
      GOOGLE_WEB_CLIENT_ID: '1234-web.apps.googleusercontent.com',
      DB: db,
    } as unknown as Env;
  });
  after(async () => {
    await local.dispose();
  });

  // 現在の交換の成功の応答（`nonce` は、ふつうは SHA-256(T)）を作る。
  interface IdTokenOptions {
    sub?: string;
    aud?: string;
    nonceClaim?: string | null;
    exp?: number;
  }
  async function signIdToken(t: string, { sub = 'apple-web-sub', aud = SERVICES_ID, nonceClaim, exp = NOW_S + 600 }: IdTokenOptions = {}) {
    const claims: Record<string, unknown> = { iss: 'https://appleid.apple.com', aud, sub, iat: NOW_S - 10, exp };
    if (nonceClaim !== null) claims.nonce = nonceClaim ?? (await nonceHash(t));
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'key-a' }).sign(issuerKey.privateKey as CryptoKey);
  }

  // 1回のログインの入力。T は web、`V` の `C` を入れる。
  async function newFlow(now = NOW) {
    const v = newVerifier();
    const t = (await issueNonce(SECRET, { kind: 'web', challenge: await nonceHash(v) }, now)).nonce;
    return { v, t };
  }

  const exchanger = createAppleCodeExchanger({
    fetch: async (_url, init) => {
      const form = new URLSearchParams(String(init.body));
      appleCalls.push({ code: form.get('code') ?? '' });
      return appleResponse!(form);
    },
    log: () => {}, // 失敗の記録は、上の「認可コードの交換」で確かめる
  });

  beforeEach(async () => {
    await db.batch([db.prepare('DELETE FROM used_nonces'), db.prepare('DELETE FROM users')]);
    jwksCalls = 0;
    appleCalls = [];
    appleResponse = null;
    const fetchFunction: FetchFunction = async () => {
      jwksCalls += 1;
      return Response.json({ keys: [issuerKey.jwk] });
    };
    verifier = createIdTokenVerifier({ fetch: fetchFunction });
  });

  // Appleが、この T のための IDトークンを返す。
  const appleReturns = (t: string, options: IdTokenOptions = {}) => {
    appleResponse = async () =>
      Response.json({
        id_token: await signIdToken(t, options),
        refresh_token: 'REFRESH-TOKEN-VALUE',
        access_token: 'ACCESS-TOKEN-VALUE',
        token_type: 'Bearer',
        expires_in: 3600,
      });
  };

  const post = (body: unknown, { now = NOW, method = 'POST' } = {}) =>
    handleAppleWebLogin(
      new Request('https://singfolio.app/auth/apple/login', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
      now,
      { verifier, exchanger },
    );

  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of ['users', 'identities', 'sessions', 'used_nonces']) {
      result[table] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    }
    return result;
  };
  const NOTHING_WRITTEN = { users: 0, identities: 0, sessions: 0, used_nonces: 0 };

  it('成功: セッションの値だけを返し、Appleのコードを1回交換して、ユーザー・ログイン手段・使用済みの記録・セッションを作る', async () => {
    const { v, t } = await newFlow();
    appleReturns(t);
    const response = await post({ code: 'the-code', nonce: t, verifier: v });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = (await response.json()) as { session: string };
    assert.deepEqual(Object.keys(body), ['session']);
    assert.equal(isSessionToken(body.session), true);
    assert.deepEqual(appleCalls, [{ code: 'the-code' }]);

    assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 1 });
    assert.deepEqual(await db.prepare('SELECT provider, sub FROM identities').first(), { provider: 'apple', sub: 'apple-web-sub' });
    const used = await db.prepare('SELECT nonce_hash, expires_at FROM used_nonces').first();
    assert.deepEqual(used, { nonce_hash: await nonceHash(t), expires_at: NOW + NONCE_TTL_MS });
    assert.ok(await authenticateSession(db, body.session, NOW));

    // コード・refresh_token・access_token・V・T・IDトークンは、どこにも保存しない。
    const everything = JSON.stringify(
      await Promise.all(
        ['users', 'identities', 'sessions', 'used_nonces'].map(async (table) => (await db.prepare(`SELECT * FROM ${table}`).all()).results),
      ),
    );
    for (const secret of ['the-code', 'REFRESH-TOKEN-VALUE', 'ACCESS-TOKEN-VALUE', v, t, body.session]) {
      assert.equal(everything.includes(secret), false, secret);
    }
  });

  it('Apple の web の ID トークンの aud は、Services ID。アプリのバンドルIDのトークンは受け付けない', async () => {
    const { v, t } = await newFlow();
    appleReturns(t, { aud: BUNDLE_ID });
    const response = await post({ code: 'c', nonce: t, verifier: v });
    assert.equal(response.status, 401);
    assert.deepEqual(await counts(), NOTHING_WRITTEN);
  });

  it('IDトークンの nonce が SHA-256(T) と違う・無い: 401。T は使い切りにならない', async () => {
    for (const nonceClaim of ['x'.repeat(43), null]) {
      const { v, t } = await newFlow();
      appleReturns(t, { nonceClaim });
      const response = await post({ code: 'c', nonce: t, verifier: v });
      assert.equal(response.status, 401);
      assert.deepEqual(await counts(), NOTHING_WRITTEN);
    }
  });

  describe('Appleを呼ぶ前に拒否する（認証の要らない経路に、外部の呼び出しを使わせない）。D1に何も書かない', () => {
    const rejections: Array<[string, () => Promise<{ body: Record<string, unknown>; now?: number }>]> = [
      [
        '`V` が、T の中の C と合わない（横取りされた code と state だけでは、使えない）',
        async () => {
          const { t } = await newFlow();
          return { body: { code: 'c', nonce: t, verifier: newVerifier() } };
        },
      ],
      [
        'native の T（C を含まない）',
        async () => {
          const t = (await issueNonce(SECRET, { kind: 'native' }, NOW)).nonce;
          return { body: { code: 'c', nonce: t, verifier: newVerifier() } };
        },
      ],
      [
        '署名が違う T',
        async () => {
          const v = newVerifier();
          const t = (await issueNonce('another-secret-value-0123456789abcdef', { kind: 'web', challenge: await nonceHash(v) }, NOW)).nonce;
          return { body: { code: 'c', nonce: t, verifier: v } };
        },
      ],
      [
        '期限切れの T',
        async () => {
          const { v, t } = await newFlow(NOW - NONCE_TTL_MS - 1000);
          return { body: { code: 'c', nonce: t, verifier: v } };
        },
      ],
      [
        'T の形が不正',
        async () => ({ body: { code: 'c', nonce: 'not-a-nonce', verifier: newVerifier() } }),
      ],
    ];
    for (const [name, build] of rejections) {
      it(`${name}: 401`, async () => {
        const { body } = await build();
        const response = await post(body);
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: 'unauthorized' });
        assert.deepEqual(appleCalls, []);
        assert.equal(jwksCalls, 0);
        assert.deepEqual(await counts(), NOTHING_WRITTEN);
      });
    }
  });

  it('コードが無効（invalid_grant）: 401。D1に何も書かず、T は使い切りにならない（新しいコードで通る）', async () => {
    const { v, t } = await newFlow();
    appleResponse = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const bad = await post({ code: 'old-code', nonce: t, verifier: v });
    assert.equal(bad.status, 401);
    assert.deepEqual(await bad.json(), { error: 'unauthorized' });
    assert.deepEqual(await counts(), NOTHING_WRITTEN);

    appleReturns(t);
    const good = await post({ code: 'new-code', nonce: t, verifier: v });
    assert.equal(good.status, 200);
  });

  it('Appleが使えない（5xx・通信の失敗・invalid_client）: 503。D1に何も書かず、T は使い切りにならない', async () => {
    for (const respond of [
      () => new Response('oops', { status: 500 }),
      () => Response.json({ error: 'invalid_client' }, { status: 400 }),
    ]) {
      const { v, t } = await newFlow();
      appleResponse = respond;
      const response = await post({ code: 'c', nonce: t, verifier: v });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
      assert.deepEqual(await counts(), NOTHING_WRITTEN);
    }
  });

  it('同じ T は2回使えない（2回目は 401）。1回目の応答にも、2回目の応答にも、コード・トークンを載せない', async () => {
    const { v, t } = await newFlow();
    appleReturns(t);
    assert.equal((await post({ code: 'c1', nonce: t, verifier: v })).status, 200);
    const replay = await post({ code: 'c2', nonce: t, verifier: v });
    assert.equal(replay.status, 401);
    const text = JSON.stringify(await replay.json());
    for (const secret of ['c2', 'REFRESH-TOKEN-VALUE', t, v]) assert.equal(text.includes(secret), false);
    assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 1, used_nonces: 1 });
  });

  it('同じ Apple の sub は、同じユーザーにつながる（2回目のログイン）', async () => {
    for (let i = 0; i < 2; i++) {
      const { v, t } = await newFlow();
      appleReturns(t, { sub: 'same-apple-sub' });
      assert.equal((await post({ code: `c${i}`, nonce: t, verifier: v })).status, 200);
    }
    assert.deepEqual(await counts(), { users: 1, identities: 1, sessions: 2, used_nonces: 2 });
  });

  describe('形の不備は 400（何も書かず、Appleも呼ばない）', () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['JSONでない', async () => 'not json'],
      ['配列', async () => '[]'],
      ['code が無い', async () => ({ nonce: (await newFlow()).t, verifier: newVerifier() })],
      ['code が文字列でない', async () => ({ code: 5, nonce: (await newFlow()).t, verifier: newVerifier() })],
      ['code に空白', async () => ({ code: 'a b', nonce: (await newFlow()).t, verifier: newVerifier() })],
      ['code が長すぎる', async () => ({ code: 'a'.repeat(1025), nonce: (await newFlow()).t, verifier: newVerifier() })],
      ['nonce が無い', async () => ({ code: 'c', verifier: newVerifier() })],
      ['verifier が無い', async () => ({ code: 'c', nonce: (await newFlow()).t })],
      ['verifier の形が違う（短い）', async () => ({ code: 'c', nonce: (await newFlow()).t, verifier: 'short' })],
      ['verifier が文字列でない', async () => ({ code: 'c', nonce: (await newFlow()).t, verifier: 5 })],
    ];
    for (const [name, build] of cases) {
      it(`${name}`, async () => {
        const response = await post(await build());
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: 'invalid_request' });
        assert.deepEqual(appleCalls, []);
        assert.deepEqual(await counts(), NOTHING_WRITTEN);
      });
    }

    it('本文が大きすぎる: 413。POST 以外: 405', async () => {
      const { v, t } = await newFlow();
      assert.equal((await post({ code: 'c'.repeat(5000), nonce: t, verifier: v })).status, 413);
      const get = await post({}, { method: 'GET' });
      assert.equal(get.status, 405);
      assert.equal(get.headers.get('allow'), 'POST');
    });
  });

  it('秘密鍵（APPLE_PRIVATE_KEY）が無い・読めないときは、利用者の失敗にせず、投げる（設定の不備）', async () => {
    const { v, t } = await newFlow();
    appleReturns(t);
    const broken = { ...env, APPLE_PRIVATE_KEY: '' } as Env;
    await assert.rejects(
      handleAppleWebLogin(
        new Request('https://singfolio.app/auth/apple/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'c', nonce: t, verifier: v }),
        }),
        broken,
        NOW,
        { verifier, exchanger },
      ),
      AppleClientSecretConfigError,
    );
    assert.deepEqual(await counts(), NOTHING_WRITTEN);
  });

  it('worker のルートに載っている（HTTPSでなければ 403。/auth/login は web の T を受け付けない）', async () => {
    const { v, t } = await newFlow();
    const insecure = await worker.fetch(
      new Request('http://singfolio.app/auth/apple/login', { method: 'POST', body: JSON.stringify({ code: 'c', nonce: t, verifier: v }) }),
      env,
    );
    assert.equal(insecure.status, 403);
    const wrongMethod = await worker.fetch(new Request('https://singfolio.app/auth/apple/login'), env);
    assert.equal(wrongMethod.status, 405);
  });
});
