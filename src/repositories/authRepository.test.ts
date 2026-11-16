// アカウントのHTTPのテスト。`npm test` で実行する。偽の `fetch` で動かすので、実際のサーバーには
// 通信しない（応答の形は docs/singfolio-publishing-backend.md §8 と worker/src/auth.ts による）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthError } from './authError.ts';
import { createAuthRepository, type AuthFetchLike } from './authRepository.ts';

type Init = Parameters<AuthFetchLike>[1];

/** 呼ばれた url と init を記録して、決めた応答を返す。 */
function fakeFetch(respond: (url: string, init: Init) => ReturnType<AuthFetchLike> | Error) {
  const calls: { url: string; init: Init }[] = [];
  const fetchImpl: AuthFetchLike = async (url, init) => {
    calls.push({ url, init });
    const result = respond(url, init);
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetchImpl, calls };
}

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AuthError && error.code === code);
}

const SESSION = 'A'.repeat(43);

describe('requestNonce', () => {
  it('native の T を POST /auth/nonce で取る。本文は kind だけ、Cookie は送らない', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      reply(200, { nonce: 'v1.native.1.abc..sig', expiresAt: 1 }),
    );
    const nonce = await createAuthRepository(fetchImpl).requestNonce();
    assert.equal(nonce, 'v1.native.1.abc..sig');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://singfolio.app/auth/nonce');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(calls[0].init.body ?? ''), { kind: 'native' });
  });

  it('origin を差し替えられる（末尾のスラッシュは除く）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { nonce: 'T' }));
    await createAuthRepository(fetchImpl, { origin: 'https://example.test//' }).requestNonce();
    assert.equal(calls[0].url, 'https://example.test/auth/nonce');
  });

  it('nonce が無い・文字列でない・空・長すぎる・空白や制御文字を含む応答は invalid-response', async () => {
    const bodies = [
      {},
      null,
      'text',
      { nonce: 1 },
      { nonce: '' },
      { nonce: 'a'.repeat(513) },
      { nonce: 'has space' },
      { nonce: 'line\nbreak' },
    ];
    for (const body of bodies) {
      const { fetchImpl } = fakeFetch(() => reply(200, body));
      await rejectsWith(createAuthRepository(fetchImpl).requestNonce(), 'invalid-response');
    }
  });
});

describe('login', () => {
  const request = { provider: 'apple', idToken: 'ID.TOKEN.VALUE', nonce: 'T-value' } as const;

  it('provider・idToken・nonce だけを送り、session を返す', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { session: SESSION }));
    assert.equal(await createAuthRepository(fetchImpl).login(request), SESSION);
    assert.equal(calls[0].url, 'https://singfolio.app/auth/login');
    assert.deepEqual(JSON.parse(calls[0].init.body ?? ''), {
      provider: 'apple',
      idToken: 'ID.TOKEN.VALUE',
      nonce: 'T-value',
    });
    assert.equal(calls[0].init.headers.Authorization, undefined);
  });

  it('session が無い・不正な形の応答は invalid-response', async () => {
    for (const body of [{}, { session: '' }, { session: 5 }, { session: 'a b' }]) {
      const { fetchImpl } = fakeFetch(() => reply(200, body));
      await rejectsWith(createAuthRepository(fetchImpl).login(request), 'invalid-response');
    }
  });

  it('401 は unauthorized（理由は区別されない）', async () => {
    const { fetchImpl } = fakeFetch(() => reply(401, { error: 'unauthorized' }));
    await rejectsWith(createAuthRepository(fetchImpl).login(request), 'unauthorized');
  });

  it('400・413・403 は invalid-request（アプリの不具合）', async () => {
    for (const status of [400, 403, 405, 413]) {
      const { fetchImpl } = fakeFetch(() => reply(status, { error: 'invalid_request' }));
      await rejectsWith(createAuthRepository(fetchImpl).login(request), 'invalid-request');
    }
  });

  it('503 と、JSONでない 5xx（Cloudflareのエラーページ）は unavailable。本文は読まない', async () => {
    for (const status of [500, 502, 503, 530]) {
      let read = false;
      const { fetchImpl } = fakeFetch(() =>
        Promise.resolve({
          ok: false,
          status,
          json: async () => {
            read = true;
            throw new SyntaxError('Unexpected token < in JSON');
          },
        }),
      );
      await rejectsWith(createAuthRepository(fetchImpl).login(request), 'unavailable');
      assert.equal(read, false);
    }
  });

  it('429（WAFの回数の制限 1015・日次の上限 1027）は unavailable', async () => {
    const { fetchImpl } = fakeFetch(() => reply(429, 'error code: 1015'));
    await rejectsWith(createAuthRepository(fetchImpl).login(request), 'unavailable');
  });

  it('通信の失敗は network。例外の内容（URLなど）は載せない', async () => {
    const { fetchImpl } = fakeFetch(() => new TypeError('Network request failed: https://secret'));
    await assert.rejects(createAuthRepository(fetchImpl).login(request), (error) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.code, 'network');
      assert.ok(!error.message.includes('secret'));
      return true;
    });
  });

  it('200 でも本文がJSONでなければ invalid-response', async () => {
    const { fetchImpl } = fakeFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      }),
    );
    await rejectsWith(createAuthRepository(fetchImpl).login(request), 'invalid-response');
  });

  it('時間内に応答が無ければ中断して network', async () => {
    const { fetchImpl } = fakeFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await rejectsWith(createAuthRepository(fetchImpl, { timeoutMs: 10 }).login(request), 'network');
  });

  it('本文を読んでいる途中の時間切れも network', async () => {
    const { fetchImpl } = fakeFetch((_url, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      }),
    );
    await rejectsWith(createAuthRepository(fetchImpl, { timeoutMs: 10 }).login(request), 'network');
  });

  it('エラーの message に、IDトークンやセッションの値を載せない', async () => {
    const { fetchImpl } = fakeFetch(() => reply(401, { session: SESSION, idToken: 'ID.TOKEN.VALUE' }));
    await assert.rejects(createAuthRepository(fetchImpl).login(request), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('ID.TOKEN.VALUE'));
      assert.ok(!error.message.includes(SESSION));
      return true;
    });
  });
});

describe('logout', () => {
  it('Authorization: Bearer でセッションを送り、本文は送らない。204 で成功', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(204));
    await createAuthRepository(fetchImpl).logout(SESSION);
    assert.equal(calls[0].url, 'https://singfolio.app/auth/logout');
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${SESSION}`);
    assert.equal(calls[0].init.body, undefined);
    assert.equal(calls[0].init.headers['Content-Type'], undefined);
    assert.ok(!calls[0].url.includes(SESSION));
  });

  it('401・5xx・通信の失敗は、それぞれ unauthorized・unavailable・network', async () => {
    await rejectsWith(createAuthRepository(fakeFetch(() => reply(401)).fetchImpl).logout(SESSION), 'unauthorized');
    await rejectsWith(createAuthRepository(fakeFetch(() => reply(503)).fetchImpl).logout(SESSION), 'unavailable');
    await rejectsWith(
      createAuthRepository(fakeFetch(() => new TypeError('offline')).fetchImpl).logout(SESSION),
      'network',
    );
  });
});

describe('requestWebNonce（AndroidのAppleログイン）', () => {
  it('web の T を POST /auth/nonce で取る。本文は kind と challenge（C）だけ', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { nonce: 'v1.web.1.abc.CCC.sig', expiresAt: 1 }));
    const nonce = await createAuthRepository(fetchImpl).requestWebNonce('C'.repeat(43));
    assert.equal(nonce, 'v1.web.1.abc.CCC.sig');
    assert.equal(calls[0].url, 'https://singfolio.app/auth/nonce');
    assert.equal(calls[0].init.credentials, 'omit');
    assert.deepEqual(JSON.parse(calls[0].init.body ?? ''), { kind: 'web', challenge: 'C'.repeat(43) });
  });

  it('nonce が無い・不正な形の応答は invalid-response。400 は invalid-request', async () => {
    for (const body of [{}, null, { nonce: 1 }, { nonce: '' }, { nonce: 'a b' }]) {
      const { fetchImpl } = fakeFetch(() => reply(200, body));
      await rejectsWith(createAuthRepository(fetchImpl).requestWebNonce('C'.repeat(43)), 'invalid-response');
    }
    const { fetchImpl } = fakeFetch(() => reply(400, { error: 'invalid_request' }));
    await rejectsWith(createAuthRepository(fetchImpl).requestWebNonce('x'), 'invalid-request');
  });
});

describe('loginWithAppleCode（AndroidのAppleログイン）', () => {
  const request = { code: 'the-code', nonce: 'T-WEB', verifier: 'V'.repeat(43) };

  it('code・nonce・verifier だけを POST /auth/apple/login に送り、session を返す', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { session: SESSION }));
    assert.equal(await createAuthRepository(fetchImpl).loginWithAppleCode(request), SESSION);
    assert.equal(calls[0].url, 'https://singfolio.app/auth/apple/login');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'omit');
    assert.deepEqual(JSON.parse(calls[0].init.body ?? ''), request);
  });

  it('401 は unauthorized、503 と JSONでない 5xx・429 は unavailable、通信の失敗は network', async () => {
    for (const [respond, code] of [
      [() => reply(401, { error: 'unauthorized' }), 'unauthorized'],
      [() => reply(503, { error: 'service_unavailable' }), 'unavailable'],
      [() => reply(500, null), 'unavailable'],
      [() => reply(429), 'unavailable'],
      [() => new Error('offline https://singfolio.app/x'), 'network'],
      [() => reply(400, { error: 'invalid_request' }), 'invalid-request'],
    ] as const) {
      const { fetchImpl } = fakeFetch(respond);
      await rejectsWith(createAuthRepository(fetchImpl).loginWithAppleCode(request), code);
    }
  });

  it('session が無い・不正な形の応答は invalid-response。エラーに、コード・V・T・セッションを載せない', async () => {
    for (const body of [{}, null, { session: '' }, { session: 5 }]) {
      const { fetchImpl } = fakeFetch(() => reply(200, body));
      await rejectsWith(createAuthRepository(fetchImpl).loginWithAppleCode(request), 'invalid-response');
    }
    const { fetchImpl } = fakeFetch(() => new Error(`failed ${request.code} ${request.verifier} ${request.nonce}`));
    await assert.rejects(createAuthRepository(fetchImpl).loginWithAppleCode(request), (error) => {
      const message = error instanceof Error ? error.message : '';
      for (const secret of [request.code, request.verifier, request.nonce]) assert.equal(message.includes(secret), false);
      return true;
    });
  });
});
