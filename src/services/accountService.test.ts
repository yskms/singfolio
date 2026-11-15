// アカウント（ログイン・ログアウト）のテスト。`npm test` で実行する。HTTP・SecureStore・各社の
// サインインは偽物（実機のサインインでの確認は 7.3.7 以降）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import type { AuthProvider } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import type { AuthRepository } from '../repositories/authRepository.ts';
import { createSessionRepository, type SecureStorage } from '../repositories/sessionRepository.ts';
import { createAccountService, type IdTokenProvider } from './accountService.ts';
import { createTestServices } from '../testing/testDatabase.ts';

const sha256Base64Url = async (text: string) =>
  createHash('sha256').update(text).digest('base64url');

function memoryStorage() {
  const items = new Map<string, string>();
  const storage: SecureStorage = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => void items.set(key, value),
    deleteItemAsync: async (key) => void items.delete(key),
  };
  return { storage, items };
}

/** 呼ばれた順の記録つきの、偽のHTTP。 */
function fakeAuth(overrides: Partial<AuthRepository> = {}) {
  const calls: string[] = [];
  const auth: AuthRepository = {
    requestNonce: async () => {
      calls.push('nonce');
      return 'T-1';
    },
    login: async ({ provider, idToken, nonce }) => {
      calls.push(`login:${provider}:${idToken}:${nonce}`);
      return 'SESSION-1';
    },
    logout: async (session) => {
      calls.push(`logout:${session}`);
    },
    ...overrides,
  };
  return { auth, calls };
}

function setup(
  options: {
    auth?: Partial<AuthRepository>;
    providers?: Partial<Record<AuthProvider, IdTokenProvider>>;
  } = {},
) {
  const { storage, items } = memoryStorage();
  const sessions = createSessionRepository(storage);
  const { auth, calls } = fakeAuth(options.auth);
  const hashed: string[] = [];
  const apple: IdTokenProvider = {
    getIdToken: async (hashedNonce) => {
      hashed.push(hashedNonce);
      calls.push('apple-sheet');
      return 'ID-TOKEN';
    },
  };
  const account = createAccountService({
    auth,
    sessions,
    sha256Base64Url,
    idTokenProviders: options.providers ?? { apple },
  });
  return { account, sessions, items, calls, hashed };
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AuthError && error.code === code);
}

describe('signIn', () => {
  it('T を得て、そのハッシュを各社に渡し、IDトークンと T でログインして、セッションを保存する', async () => {
    const { account, sessions, calls, hashed } = setup();
    assert.equal(await account.getSignedInProvider(), null);
    await account.signIn('apple');
    assert.deepEqual(calls, ['nonce', 'apple-sheet', 'login:apple:ID-TOKEN:T-1']);
    // 各社に渡すのは T そのものではなく SHA-256(T) の base64url（43字）
    assert.deepEqual(hashed, [createHash('sha256').update('T-1').digest('base64url')]);
    assert.equal(hashed[0].length, 43);
    assert.deepEqual(await sessions.get(), { session: 'SESSION-1', provider: 'apple' });
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('組み込まれていない手段は provider-unavailable。通信も保存もしない', async () => {
    const { account, calls, items } = setup();
    await rejectsWith(account.signIn('google'), 'provider-unavailable');
    assert.deepEqual(calls, []);
    assert.equal(items.size, 0);
  });

  it('サインイン済みなら already-signed-in。通信しない', async () => {
    const { account, calls } = setup();
    await account.signIn('apple');
    calls.length = 0;
    await rejectsWith(account.signIn('apple'), 'already-signed-in');
    assert.deepEqual(calls, []);
  });

  it('各社の画面を取りやめたら cancelled で、何も保存せず、login を呼ばない。T は使い切りにならない', async () => {
    const { account, calls, items } = setup({
      providers: {
        apple: {
          getIdToken: async () => {
            throw new AuthError('cancelled');
          },
        },
      },
    });
    await rejectsWith(account.signIn('apple'), 'cancelled');
    assert.deepEqual(calls, ['nonce']);
    assert.equal(items.size, 0);
    // やり直せる
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('IDトークンが空・文字列でなければ invalid-response（login を呼ばない）', async () => {
    for (const token of ['', undefined, 5]) {
      const { account, calls } = setup({
        providers: { apple: { getIdToken: async () => token as unknown as string } },
      });
      await rejectsWith(account.signIn('apple'), 'invalid-response');
      assert.deepEqual(calls, ['nonce']);
    }
  });

  it('nonce の取得・ログインの失敗は、そのまま投げて、何も保存しない', async () => {
    for (const code of ['network', 'unavailable', 'unauthorized'] as const) {
      const { account, items } = setup({
        auth: {
          login: async () => {
            throw new AuthError(code);
          },
        },
      });
      await rejectsWith(account.signIn('apple'), code);
      assert.equal(items.size, 0);
    }
    const { account, calls } = setup({
      auth: {
        requestNonce: async () => {
          throw new AuthError('network');
        },
      },
    });
    await rejectsWith(account.signIn('apple'), 'network');
    assert.deepEqual(calls, []); // 各社の画面を開かない
  });

  it('保存に失敗したら、サーバーのセッションを失効させて storage-failed', async () => {
    const calls: string[] = [];
    const account = createAccountService({
      auth: fakeAuth({
        logout: async (session) => {
          calls.push(`logout:${session}`);
          throw new AuthError('network'); // 失効の失敗は握りつぶす
        },
      }).auth,
      sessions: createSessionRepository({
        getItemAsync: async () => null,
        setItemAsync: async () => {
          throw new Error('disk full');
        },
        deleteItemAsync: async () => {},
      }),
      sha256Base64Url,
      idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
    });
    await rejectsWith(account.signIn('apple'), 'storage-failed');
    assert.deepEqual(calls, ['logout:SESSION-1']);
  });
});

describe('signOut', () => {
  it('端末の値を捨ててから、サーバーのセッションを失効させる', async () => {
    const order: string[] = [];
    const { storage, items } = memoryStorage();
    const sessions = createSessionRepository({
      ...storage,
      deleteItemAsync: async (key) => {
        order.push('clear');
        await storage.deleteItemAsync(key);
      },
    });
    await sessions.set({ session: 'SESSION-9', provider: 'google' });
    const account = createAccountService({
      auth: fakeAuth({
        logout: async (session) => {
          order.push(`logout:${session}:${items.size}`);
        },
      }).auth,
      sessions,
      sha256Base64Url,
      idTokenProviders: {},
    });
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
    assert.deepEqual(order, ['clear', 'logout:SESSION-9:0']); // 要求の時点で、端末の値はもう無い
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('通信できない・サーバーが使えなくても、端末はログアウトする（serverRevoked: false）', async () => {
    for (const code of ['network', 'unavailable'] as const) {
      const { account, items } = setup({
        auth: {
          logout: async () => {
            throw new AuthError(code);
          },
        },
      });
      await account.signIn('apple');
      assert.deepEqual(await account.signOut(), { serverRevoked: false });
      assert.equal(items.size, 0);
      assert.equal(await account.getSignedInProvider(), null);
    }
  });

  it('401（失効するものが無い）は、失効できた扱い', async () => {
    const { account } = setup({
      auth: {
        logout: async () => {
          throw new AuthError('unauthorized');
        },
      },
    });
    await account.signIn('apple');
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
  });

  it('サインインしていなければ、何も送らずに成功する', async () => {
    const { account, calls } = setup();
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
    assert.deepEqual(calls, []);
  });

  it('読めない値が残っていても、消す（サーバーへは送れない）', async () => {
    const { account, items, calls } = setup();
    items.set('singfolio.session', 'garbage');
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
    assert.equal(items.size, 0);
    assert.deepEqual(calls, []);
  });

  it('端末の値を消せなければ投げる（ログアウトできていないことを成功に見せない）。サーバーへは送らない', async () => {
    const calls: string[] = [];
    const { storage } = memoryStorage();
    const sessions = createSessionRepository({
      ...storage,
      deleteItemAsync: async () => {
        throw new Error('delete failed');
      },
    });
    await sessions.set({ session: 'SESSION-1', provider: 'apple' });
    const account = createAccountService({
      auth: fakeAuth({ logout: async (s) => void calls.push(s) }).auth,
      sessions,
      sha256Base64Url,
      idTokenProviders: {},
    });
    await assert.rejects(account.signOut(), /delete failed/);
    assert.deepEqual(calls, []);
    assert.equal(await account.getSignedInProvider(), 'apple'); // 端末の状態と見た目が食い違わない
  });
});

describe('直列化', () => {
  it('サインインの途中（各社の画面を開いている間）のログアウトは、サインインの後に実行される', async () => {
    let finishSheet: (token: string) => void = () => {};
    const { account, items } = setup({
      providers: {
        apple: { getIdToken: () => new Promise<string>((resolve) => (finishSheet = resolve)) },
      },
    });
    const signingIn = account.signIn('apple');
    const signingOut = account.signOut();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(items.size, 0); // サインインはまだ終わっていない。ログアウトも待っている
    finishSheet('ID-TOKEN');
    await signingIn;
    assert.deepEqual(await signingOut, { serverRevoked: true });
    // ログアウトの後にセッションが残らない
    assert.equal(items.size, 0);
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('前の操作が失敗しても、次の操作は実行される', async () => {
    const { account } = setup({
      auth: {
        requestNonce: async () => {
          throw new AuthError('network');
        },
      },
    });
    await rejectsWith(account.signIn('apple'), 'network');
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
  });
});

describe('注入しないとき（createServices に auth を渡さない）', () => {
  it('ログアウト中のままで、signIn は provider-unavailable。signOut は何もしない', async () => {
    const { services } = await createTestServices();
    assert.equal(await services.account.getSignedInProvider(), null);
    await rejectsWith(services.account.signIn('apple'), 'provider-unavailable');
    assert.deepEqual(await services.account.signOut(), { serverRevoked: true });
  });

  it('createServices に auth を渡すと、アカウントが組み立てられる', async () => {
    const { storage } = memoryStorage();
    const requests: string[] = [];
    const { services } = await createTestServices({
      auth: {
        storage,
        sha256Base64Url,
        fetch: async (url) => {
          requests.push(url);
          return url.endsWith('/auth/nonce')
            ? { ok: true, status: 200, json: async () => ({ nonce: 'T-1' }) }
            : { ok: true, status: 200, json: async () => ({ session: 'SESSION-1' }) };
        },
        idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
      },
    });
    await services.account.signIn('apple');
    assert.equal(await services.account.getSignedInProvider(), 'apple');
    assert.deepEqual(requests, ['https://singfolio.app/auth/nonce', 'https://singfolio.app/auth/login']);
  });
});
