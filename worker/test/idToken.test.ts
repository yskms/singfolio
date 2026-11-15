/// <reference types="node" />
// IDトークンの検証を、模擬の発行元（テスト用のRSA鍵で署名し、JWKSを返す fetch）で確かめる。
// ネットワークには出ない。本物のJWKSの形は、別に確かめてある（docs §8）。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import {
  audienceFor,
  createIdTokenVerifier,
  JWKS_COOLDOWN_MS,
  JWKS_FRESH_MS,
  JWKS_STALE_MS,
  PROVIDERS,
  type FetchFunction,
  type IdTokenFailure,
  type IdTokenProvider,
} from '../src/idToken.ts';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 43字（SHA-256(T) の形）
const APPLE_AUD = 'com.example.app';
const GOOGLE_AUD = '1234-web.apps.googleusercontent.com';

interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: JWK;
}

async function createKey(kid: string): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' } };
}

const keyA = await createKey('key-a');
const keyB = await createKey('key-b');
const otherKeyWithSameKid = await createKey('key-a'); // 発行元の鍵ではない（kid だけ同じ）

// 発行元の模擬。fetch の呼び出しを数え、JWKS・失敗を差し替えられる。
function createIssuer(initialKeys: TestKey[]) {
  const state = {
    keys: initialKeys,
    calls: [] as { url: string; init: RequestInit }[],
    respond: null as null | (() => Response | Promise<Response>),
  };
  const fetchFunction: FetchFunction = async (url, init) => {
    state.calls.push({ url, init });
    if (state.respond) return state.respond();
    return Response.json({ keys: state.keys.map((key) => key.jwk) });
  };
  return { state, fetch: fetchFunction };
}

interface Claims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  nonce?: unknown;
  exp?: number | null;
  nbf?: number;
  iat?: number;
  [name: string]: unknown;
}

async function sign(
  claims: Claims = {},
  { key = keyA, kid = key.kid, alg = 'RS256' }: { key?: TestKey; kid?: string | null; alg?: string } = {},
): Promise<string> {
  const { exp, ...rest } = claims;
  const payload: Record<string, unknown> = {
    iss: 'https://appleid.apple.com',
    aud: APPLE_AUD,
    sub: '001234.abcdef.5678',
    nonce: NONCE,
    iat: NOW_S - 10,
    ...rest,
  };
  if (exp !== null) payload.exp = exp ?? NOW_S + 600;
  for (const [name, value] of Object.entries(payload)) if (value === undefined) delete payload[name];
  const header: Record<string, string> = { alg };
  if (kid !== null) header.kid = kid;
  return new SignJWT(payload).setProtectedHeader(header as { alg: string }).sign(key.privateKey);
}

function setup(keys: TestKey[] = [keyA]) {
  const issuer = createIssuer(keys);
  const verifier = createIdTokenVerifier({ fetch: issuer.fetch });
  const verify = (
    idToken: string,
    { provider = 'apple', audience = APPLE_AUD, nonce = NONCE, now = NOW } = {},
  ) => verifier.verify({ provider: provider as IdTokenProvider, idToken, audience, nonce, now });
  return { issuer, verify };
}

const failure = (reason: IdTokenFailure) => ({ ok: false, reason });

describe('verifyIdToken: 通る場合', () => {
  it('Apple: 署名・iss・aud・exp・nonce が正しければ、sub だけを返す', async () => {
    const { verify } = setup();
    // 結果に、sub 以外（email・クレーム・トークン）を載せない。
    assert.deepEqual(await verify(await sign({ email: 'a@example.com', name: 'Someone' })), {
      ok: true,
      sub: '001234.abcdef.5678',
    });
  });

  it('Google: iss は2通りの表記のどちらでもよい', async () => {
    for (const iss of ['https://accounts.google.com', 'accounts.google.com']) {
      const { verify } = setup();
      const token = await sign({ iss, aud: GOOGLE_AUD, sub: '110169484474386276334' });
      assert.deepEqual(await verify(token, { provider: 'google', audience: GOOGLE_AUD }), {
        ok: true,
        sub: '110169484474386276334',
      });
    }
  });

  it('exp が、時計のずれの許容（30秒）の内なら通る。それを過ぎたら expired', async () => {
    const { verify } = setup();
    assert.equal((await verify(await sign({ exp: NOW_S - 29 }))).ok, true);
    assert.deepEqual(await verify(await sign({ exp: NOW_S - 30 })), failure('expired'));
  });

  it('nbf が、許容の内なら通る。先なら claims', async () => {
    const { verify } = setup();
    assert.equal((await verify(await sign({ nbf: NOW_S + 29 }))).ok, true);
    assert.deepEqual(await verify(await sign({ nbf: NOW_S + 31 })), failure('claims'));
  });
});

describe('verifyIdToken: 拒否する条件', () => {
  it('iss が違う（別の発行元・Appleの発行者をGoogleとして）', async () => {
    const { verify } = setup();
    assert.deepEqual(await verify(await sign({ iss: 'https://evil.example.com' })), failure('issuer'));
    assert.deepEqual(
      await verify(await sign({ iss: 'https://appleid.apple.com', aud: GOOGLE_AUD }), {
        provider: 'google',
        audience: GOOGLE_AUD,
      }),
      failure('issuer'),
    );
    assert.deepEqual(await verify(await sign({ iss: undefined })), failure('issuer'));
  });

  it('aud が違う・無い（別のアプリ向けのトークン、バンドルIDとServices IDの取り違え）', async () => {
    const { verify } = setup();
    assert.deepEqual(await verify(await sign({ aud: 'com.example.other' })), failure('audience'));
    assert.deepEqual(await verify(await sign({ aud: APPLE_AUD }), { audience: 'com.example.app.web' }), failure('audience'));
    assert.deepEqual(await verify(await sign({ aud: undefined })), failure('audience'));
  });

  it('期限切れ', async () => {
    const { verify } = setup();
    assert.deepEqual(await verify(await sign({ exp: NOW_S - 3600 })), failure('expired'));
  });

  it('exp が無いトークンは、期限なしとして通さない', async () => {
    const { verify } = setup();
    assert.deepEqual(await verify(await sign({ exp: null })), failure('claims'));
  });

  it('sub が無い・空・長すぎる・文字列でない', async () => {
    const { verify } = setup();
    for (const sub of [undefined, '', 'x'.repeat(256), 123 as unknown as string]) {
      assert.deepEqual(await verify(await sign({ sub })), failure('claims'), String(sub).slice(0, 10));
    }
    assert.equal((await verify(await sign({ sub: 'x'.repeat(255) }))).ok, true);
  });

  it('nonce が無い・一致しない・文字列でない', async () => {
    const { verify } = setup();
    assert.deepEqual(await verify(await sign({ nonce: undefined })), failure('nonce'));
    assert.deepEqual(await verify(await sign({ nonce: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' })), failure('nonce'));
    assert.deepEqual(await verify(await sign({ nonce: 123 })), failure('nonce'));
    assert.deepEqual(await verify(await sign({ nonce: [NONCE] })), failure('nonce'));
    // 渡した値をさらにハッシュしたものが返ってくる場合は、一致しない（Appleの実機で確かめる。7.3.7）。
    assert.deepEqual(await verify(await sign(), { nonce: 'different' }), failure('nonce'));
  });

  it('署名が違う（別の鍵・同じ kid の別の鍵・本文の改ざん）', async () => {
    const { verify } = setup();
    // 発行元の鍵ではない鍵で、kid だけを合わせた
    assert.deepEqual(await verify(await sign({}, { key: otherKeyWithSameKid })), failure('signature'));
    // 本文を書き換えた（署名はそのまま）
    const [header, , signature] = (await sign({ sub: 'victim' })).split('.');
    const forged = Buffer.from(JSON.stringify({ iss: 'https://appleid.apple.com', aud: APPLE_AUD, sub: 'attacker', nonce: NONCE, exp: NOW_S + 600 })).toString('base64url');
    assert.deepEqual(await verify(`${header}.${forged}.${signature}`), failure('signature'));
  });

  it('alg が RS256 以外（none・HS256・ES256）は拒否する', async () => {
    const { verify } = setup();
    // alg: none（署名なし）
    const none = (header: object) =>
      [header, { iss: 'https://appleid.apple.com', aud: APPLE_AUD, sub: 'x', nonce: NONCE, exp: NOW_S + 600 }]
        .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
        .join('.') + '.';
    assert.deepEqual(await verify(none({ alg: 'none', kid: 'key-a' })), failure('malformed'));
    // HS256（公開鍵を共通鍵として使う、よくある攻撃）
    const hs256 = await new SignJWT({ iss: 'https://appleid.apple.com', aud: APPLE_AUD, sub: 'x', nonce: NONCE, exp: NOW_S + 600 })
      .setProtectedHeader({ alg: 'HS256', kid: 'key-a' })
      .sign(new TextEncoder().encode(JSON.stringify(keyA.jwk)));
    assert.deepEqual(await verify(hs256), failure('malformed'));
  });

  it('形が不正なトークン', async () => {
    const { verify, issuer } = setup();
    const valid = await sign();
    for (const token of ['', 'a', 'a.b', 'a.b.c', '..', `${valid}.extra`, 'x'.repeat(9000), valid.replace(/^[^.]+/, '!!!!')]) {
      assert.deepEqual(await verify(token), failure('malformed'), token.slice(0, 20));
    }
    // 署名が途中で切れている（形は3つに分かれるが、署名として合わない）
    assert.deepEqual(await verify(valid.slice(0, -4)), failure('signature'));
    assert.deepEqual(await verify(null as unknown as string), failure('malformed'));
    assert.deepEqual(await verify(undefined as unknown as string), failure('malformed'));
    // kid が無い（鍵が1本だけでも通さない。鍵の取得もしない）
    const callsBefore = issuer.state.calls.length;
    assert.deepEqual(await verify(await sign({}, { kid: null })), failure('malformed'));
    assert.deepEqual(await verify(await sign({}, { kid: '' })), failure('malformed'));
    assert.equal(issuer.state.calls.length, callsBefore);
  });
});

describe('公開鍵(JWKS)の取得とキャッシュ', () => {
  it('設定した URL を GET する。リダイレクトには従わず、タイムアウトを付ける', async () => {
    const { issuer, verify } = setup();
    await verify(await sign());
    await verify(await sign({ iss: 'accounts.google.com', aud: GOOGLE_AUD }), { provider: 'google', audience: GOOGLE_AUD });
    assert.deepEqual(
      issuer.state.calls.map((call) => call.url),
      [PROVIDERS.apple.jwksUrl, PROVIDERS.google.jwksUrl],
    );
    for (const { init } of issuer.state.calls) {
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'manual');
      assert.ok(init.signal);
      // 認証情報を付けない
      assert.deepEqual(Object.keys(init.headers as object), ['accept']);
    }
  });

  it('Apple と Google の鍵は別。片方の鍵で、もう片方のトークンは通らない', async () => {
    const { issuer, verify } = setup([keyA]);
    // 同じ鍵を返す模擬でも、キャッシュはログイン手段ごと（取得は2回）
    await verify(await sign());
    await verify(await sign({ iss: 'accounts.google.com', aud: GOOGLE_AUD }), { provider: 'google', audience: GOOGLE_AUD });
    assert.equal(issuer.state.calls.length, 2);
  });

  it('FRESH の間は取り直さない。過ぎたら取り直す（冷却は済んでいる）', async () => {
    const { issuer, verify } = setup();
    const token = await sign();
    await verify(token);
    await verify(token, { now: NOW + JWKS_FRESH_MS - 1 });
    assert.equal(issuer.state.calls.length, 1);
    const result = await verify(await sign({ exp: NOW_S + 7200 }), { now: NOW + JWKS_FRESH_MS });
    assert.equal(result.ok, true);
    assert.equal(issuer.state.calls.length, 2);
  });

  it('知らない kid: 1回だけ取り直す。それでも無ければ unknown_key。冷却の間は、取り直さない', async () => {
    const { issuer, verify } = setup([keyA]);
    await verify(await sign()); // 取得1回目
    const unknown = await sign({}, { key: keyB });
    assert.deepEqual(await verify(unknown, { now: NOW + JWKS_COOLDOWN_MS }), failure('unknown_key'));
    assert.equal(issuer.state.calls.length, 2); // 冷却が済んでいたので、1回取り直した
    // 直後（冷却の間）に何度送られても、取り直さない
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(await verify(unknown, { now: NOW + JWKS_COOLDOWN_MS + 1000 }), failure('unknown_key'));
    }
    assert.equal(issuer.state.calls.length, 2);
    // 冷却が過ぎたら、また1回だけ
    await verify(unknown, { now: NOW + 2 * JWKS_COOLDOWN_MS });
    assert.equal(issuer.state.calls.length, 3);
  });

  it('鍵の入れ替え: 新しい kid のトークンは、冷却が済んでいれば、取り直して通る', async () => {
    const { issuer, verify } = setup([keyA]);
    await verify(await sign());
    issuer.state.keys = [keyA, keyB]; // 発行元が鍵を足した
    const result = await verify(await sign({}, { key: keyB }), { now: NOW + JWKS_COOLDOWN_MS });
    assert.equal(result.ok, true);
    assert.equal(issuer.state.calls.length, 2);
  });

  it('取得が失敗し、前の鍵が無い: unavailable。冷却の間は取りに行かず、すぐ返す。済んだら、また取りに行く', async () => {
    const { issuer, verify } = setup();
    issuer.state.respond = () => new Response('oops', { status: 500 });
    const token = await sign();
    assert.deepEqual(await verify(token), failure('unavailable'));
    assert.equal(issuer.state.calls.length, 1);
    // 冷却の間は、何度来ても取りに行かない（落ちている発行元を、毎回最大5秒待たない）
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(await verify(token, { now: NOW + JWKS_COOLDOWN_MS - 1 }), failure('unavailable'));
    }
    assert.equal(issuer.state.calls.length, 1);
    // 冷却が済んだら、また試す（失敗は続く）
    assert.deepEqual(await verify(token, { now: NOW + JWKS_COOLDOWN_MS }), failure('unavailable'));
    assert.equal(issuer.state.calls.length, 2);
    // 復旧したあと、次の冷却が済んだ最初の呼び出しで通る
    issuer.state.respond = null;
    assert.deepEqual(await verify(token, { now: NOW + 2 * JWKS_COOLDOWN_MS - 1 }), failure('unavailable'));
    assert.equal((await verify(token, { now: NOW + 2 * JWKS_COOLDOWN_MS })).ok, true);
    assert.equal(issuer.state.calls.length, 3);
  });

  it('鍵が無いとき、取得の最中に来た別のリクエストは、unavailable にならず、自分で取得する', async () => {
    // 試みた時刻は、取得の完了のあとに書く。始めに書くと、同時に来たリクエストが、取得の途中なのに
    // 冷却の中として弾かれる（起動直後の同時のログインが、片方 503 になる）。取得中の Promise は共有しない。
    const { issuer, verify } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    issuer.state.respond = async () => {
      await gate;
      return Response.json({ keys: [keyA.jwk] });
    };
    const token = await sign();
    const pending = [verify(token), verify(token)];
    // 2つとも、取得に入っている
    while (issuer.state.calls.length < 2) await new Promise((resolve) => setImmediate(resolve));
    release();
    assert.deepEqual(
      (await Promise.all(pending)).map((result) => result.ok),
      [true, true],
    );
  });

  it('取得の失敗の種類: 200以外・リダイレクト・不正なJSON・形が違う・通信エラー・タイムアウト', async () => {
    const responses: (() => Response | Promise<Response>)[] = [
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 302, headers: { location: 'https://evil.example.com/keys' } }),
      () => new Response('not json', { status: 200 }),
      () => Response.json({ notKeys: [] }),
      () => Response.json({ keys: 'x' }),
      () => Response.json(null),
      () => Promise.reject(new TypeError('network')),
      () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
    ];
    const token = await sign();
    for (const respond of responses) {
      const { issuer, verify } = setup();
      issuer.state.respond = respond;
      assert.deepEqual(await verify(token), failure('unavailable'));
    }
  });

  it('取得が失敗しても、STALE の間は、前の鍵で検証を続ける。過ぎたら unavailable', async () => {
    const { issuer, verify } = setup();
    await verify(await sign());
    issuer.state.respond = () => new Response('', { status: 500 });
    const later = NOW + JWKS_FRESH_MS + 1000;
    const token = await sign({ exp: NOW_S + 24 * 3600 });
    assert.equal((await verify(token, { now: later })).ok, true);
    assert.equal(issuer.state.calls.length, 2); // 取り直そうとして失敗した
    // 失敗の直後（冷却の間）は、取りに行かない
    assert.equal((await verify(token, { now: later + 1000 })).ok, true);
    assert.equal(issuer.state.calls.length, 2);
    // 冷却が済むと、また試す（失敗は続く）
    assert.equal((await verify(token, { now: later + JWKS_COOLDOWN_MS })).ok, true);
    assert.equal(issuer.state.calls.length, 3);
    // 古すぎる鍵は使わない
    const tooOld = NOW + JWKS_FRESH_MS + JWKS_STALE_MS;
    assert.deepEqual(await verify(await sign({ exp: NOW_S + 48 * 3600 }), { now: tooOld }), failure('unavailable'));
  });

  it('取得が失敗している間に、知らない kid が来ても、冷却の間は取りに行かない', async () => {
    const { issuer, verify } = setup();
    await verify(await sign());
    issuer.state.respond = () => new Response('', { status: 500 });
    const unknown = await sign({}, { key: keyB });
    const now = NOW + JWKS_COOLDOWN_MS;
    assert.deepEqual(await verify(unknown, { now }), failure('unknown_key'));
    const calls = issuer.state.calls.length;
    assert.deepEqual(await verify(unknown, { now: now + 1000 }), failure('unknown_key'));
    assert.equal(issuer.state.calls.length, calls);
  });

  it('同時の取得が前後して終わっても、あとから始めた取得の鍵を、遅れて終わった取得で上書きしない', async () => {
    // A（先に始めて遅く終わる。鍵は keyA だけ）と B（あとに始めて先に終わる。keyA と keyB）。
    // 最後に A が終わっても、B の鍵が残る。時刻でなく、取得を始めた順番で決める。
    const { issuer, verify } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let responses = 0;
    issuer.state.respond = async () => {
      if (++responses === 1) {
        await gate;
        return Response.json({ keys: [keyA.jwk] });
      }
      return Response.json({ keys: [keyA.jwk, keyB.jwk] });
    };
    const pendingA = verify(await sign(), { now: NOW });
    while (issuer.state.calls.length < 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await verify(await sign({}, { key: keyB }), { now: NOW + 1000 })).ok, true);
    release();
    assert.equal((await pendingA).ok, true); // A のリクエスト自身は、自分の鍵で通る
    // A が終わったあとも、B の鍵（keyB を含む）が残っている。取り直しは起きない。
    assert.equal((await verify(await sign({}, { key: keyB }), { now: NOW + 2000 })).ok, true);
    assert.equal(issuer.state.calls.length, 2);
  });

  it('先に始めた取得の成功は、あとに始めた取得が失敗しても、捨てない', async () => {
    const { issuer, verify } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let responses = 0;
    issuer.state.respond = async () => {
      if (++responses === 1) {
        await gate;
        return Response.json({ keys: [keyA.jwk] });
      }
      return new Response('', { status: 500 });
    };
    const pendingA = verify(await sign(), { now: NOW });
    while (issuer.state.calls.length < 1) await new Promise((resolve) => setImmediate(resolve));
    // B は失敗する（鍵がまだ無いので unavailable）
    assert.deepEqual(await verify(await sign(), { now: NOW + 1000 }), failure('unavailable'));
    release();
    assert.equal((await pendingA).ok, true);
    // A の鍵が保存されている（B の失敗で捨てられていない）
    assert.equal((await verify(await sign(), { now: NOW + 2000 })).ok, true);
    assert.equal(issuer.state.calls.length, 2);
  });

  it('取り直した鍵が壊れていたら、前の鍵を捨てない', async () => {
    const { issuer, verify } = setup();
    await verify(await sign());
    issuer.state.respond = () => Response.json({ keys: [{ kty: 'RSA' }, 'x'] });
    const now = NOW + JWKS_FRESH_MS + 1;
    assert.equal((await verify(await sign({ exp: NOW_S + 7200 }), { now })).ok, true);
  });
});

describe('audienceFor', () => {
  const env = { APPLE_BUNDLE_ID: 'bundle', APPLE_SERVICES_ID: 'services', GOOGLE_WEB_CLIENT_ID: 'google-web' };

  it('種別とログイン手段の組み合わせから、受け付ける aud を1つに決める', () => {
    assert.equal(audienceFor(env, 'apple', 'native'), 'bundle');
    assert.equal(audienceFor(env, 'apple', 'web'), 'services');
    assert.equal(audienceFor(env, 'google', 'native'), 'google-web');
  });

  it('Google の Web 経由のフローは無い（null）', () => {
    assert.equal(audienceFor(env, 'google', 'web'), null);
  });
});
