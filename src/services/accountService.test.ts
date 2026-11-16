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
import { createTestServices } from '../testing/testDatabase.ts';
import { createAccountService, type IdTokenProvider } from './accountService.ts';

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
    sha256?: (text: string) => Promise<string>;
    providerTimeoutMs?: number;
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
  // ローカルDBの識別子。`state.id` を変えると、DBを新しく作った（再インストール）状態になる。
  const state = { id: 'data-1' };
  const account = createAccountService({
    auth,
    sessions,
    sha256Base64Url: options.sha256 ?? sha256Base64Url,
    localDataId: async () => state.id,
    idTokenProviders: options.providers ?? { apple },
    providerTimeoutMs: options.providerTimeoutMs,
  });
  return { account, sessions, items, calls, hashed, state };
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
    // ローカルDBの識別子と一緒に保存する
    assert.deepEqual(await sessions.read(), {
      kind: 'found',
      value: { session: 'SESSION-1', provider: 'apple', localDataId: 'data-1' },
    });
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
    assert.equal(await account.getSignedInProvider(), null); // やり直せる
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
      localDataId: async () => 'data-1',
      idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
    });
    await rejectsWith(account.signIn('apple'), 'storage-failed');
    assert.deepEqual(calls, ['logout:SESSION-1']);
  });

  it('別のローカルDBのセッション（再インストール前の残り）は、サインイン中として扱わず、上書きして入れる', async () => {
    let issued = 0;
    const { account, sessions, state } = setup({
      auth: { login: async () => `SESSION-${++issued}` },
    });
    await account.signIn('apple');
    state.id = 'data-2'; // DBを新しく作った。DBの外のセッションは残っている
    assert.equal(await account.getSignedInProvider(), null);
    await account.signIn('apple'); // already-signed-in にならない
    assert.deepEqual(await sessions.read(), {
      kind: 'found',
      value: { session: 'SESSION-2', provider: 'apple', localDataId: 'data-2' },
    });
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('上書きした別のDBのセッションは、新しいセッションの保存のあとに、サーバーで失効させる', async () => {
    const { account, sessions, calls } = setup({
      auth: { login: async () => 'SESSION-NEW' },
    });
    await sessions.set({ session: 'SESSION-OLD', provider: 'google', localDataId: 'data-0' });
    await account.signIn('apple');
    // 各社の画面を開く前には、通信しない。ログインと保存が済んでから失効させる
    assert.deepEqual(calls, ['nonce', 'apple-sheet', 'logout:SESSION-OLD']);
    assert.deepEqual(await sessions.read(), {
      kind: 'found',
      value: { session: 'SESSION-NEW', provider: 'apple', localDataId: 'data-1' },
    });
  });

  it('別のDBのセッションの失効に失敗しても、サインインは成功する', async () => {
    const { account, sessions, calls } = setup({
      auth: {
        login: async () => 'SESSION-NEW',
        logout: async (session) => {
          calls.push(`logout:${session}`);
          throw new AuthError('network');
        },
      },
    });
    await sessions.set({ session: 'SESSION-OLD', provider: 'google', localDataId: 'data-0' });
    await account.signIn('apple');
    assert.ok(calls.includes('logout:SESSION-OLD'));
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('サインインが取りやめ・失敗に終わったら、別のDBのセッションは失効させず、端末に残す（次のサインインで失効させる）', async () => {
    const { account, sessions, calls } = setup({
      providers: {
        apple: {
          getIdToken: async () => {
            throw new AuthError('cancelled');
          },
        },
      },
    });
    await sessions.set({ session: 'SESSION-OLD', provider: 'google', localDataId: 'data-0' });
    await rejectsWith(account.signIn('apple'), 'cancelled');
    assert.deepEqual(calls, ['nonce']);
    assert.deepEqual(await sessions.read(), {
      kind: 'found',
      value: { session: 'SESSION-OLD', provider: 'google', localDataId: 'data-0' },
    });
  });

  it('新しいセッションを保存できなかったときは、新しいほうだけを失効させる（別のDBのセッションは端末に残る）', async () => {
    const { storage, items } = memoryStorage();
    const failing: SecureStorage = {
      ...storage,
      setItemAsync: async () => {
        throw new Error('disk full');
      },
    };
    const sessions = createSessionRepository(failing);
    items.set(
      'singfolio.session',
      JSON.stringify({ v: 1, session: 'SESSION-OLD', provider: 'google', localDataId: 'data-0' }),
    );
    const { auth, calls } = fakeAuth({ login: async () => 'SESSION-NEW' });
    const account = createAccountService({
      auth,
      sessions,
      sha256Base64Url,
      localDataId: async () => 'data-1',
      idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
    });
    await rejectsWith(account.signIn('apple'), 'storage-failed');
    assert.deepEqual(calls, ['nonce', 'logout:SESSION-NEW']);
  });

  it('読めない値が残っていても、サインインは進めて上書きする（読めないだけで止めると、二度と入れない）。失効はできない', async () => {
    const { account, items, calls } = setup();
    items.set('singfolio.session', 'garbage');
    await account.signIn('apple');
    assert.equal(await account.getSignedInProvider(), 'apple');
    // 失効させるものを特定できない
    assert.deepEqual(calls, ['nonce', 'apple-sheet', 'login:apple:ID-TOKEN:T-1']);
  });
});

describe('失敗は AuthError に包む（画面が code で分類できる）', () => {
  it('ハッシュの計算の失敗は unexpected。保存も login もしない', async () => {
    const { account, calls, items } = setup({
      sha256: async () => {
        throw new Error('digest unavailable');
      },
    });
    await rejectsWith(account.signIn('apple'), 'unexpected');
    assert.deepEqual(calls, ['nonce']);
    assert.equal(items.size, 0);
  });

  it('各社のサインインが契約に反して投げた例外は unexpected。元の例外の内容（トークンなど）は載せない', async () => {
    const { account } = setup({
      providers: {
        apple: {
          getIdToken: async () => {
            throw new Error('SDK failed for token SECRET-TOKEN');
          },
        },
      },
    });
    await assert.rejects(account.signIn('apple'), (error) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.code, 'unexpected');
      assert.ok(!error.message.includes('SECRET-TOKEN'));
      return true;
    });
  });

  it('識別子を取れない（DBの失敗）のも unexpected', async () => {
    const { storage } = memoryStorage();
    const account = createAccountService({
      auth: fakeAuth().auth,
      sessions: createSessionRepository(storage),
      sha256Base64Url,
      localDataId: async () => {
        throw new Error('db closed');
      },
      idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
    });
    await rejectsWith(account.signIn('apple'), 'unexpected');
  });

  it('getSignedInProvider も、DBの失敗は unexpected（null にはしない。「分からない」を「ログアウト中」に見せない）', async () => {
    const { storage } = memoryStorage();
    const sessions = createSessionRepository(storage);
    await sessions.set({ session: 'SESSION-1', provider: 'apple', localDataId: 'data-1' });
    const account = createAccountService({
      auth: fakeAuth().auth,
      sessions,
      sha256Base64Url,
      localDataId: async () => {
        throw new Error('db closed');
      },
      idTokenProviders: {},
    });
    await assert.rejects(account.getSignedInProvider(), (error) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.code, 'unexpected');
      assert.ok(!error.message.includes('db closed')); // 元の例外の内容は載せない
      return true;
    });
  });

  it('getSignedInProvider は、保存が空・読めない値なら、DBを見ずに null（識別子を取れなくても投げない）', async () => {
    const { storage, items } = memoryStorage();
    const account = createAccountService({
      auth: fakeAuth().auth,
      sessions: createSessionRepository(storage),
      sha256Base64Url,
      localDataId: async () => {
        throw new Error('db closed');
      },
      idTokenProviders: {},
    });
    assert.equal(await account.getSignedInProvider(), null);
    items.set('singfolio.session', 'garbage');
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('ログアウトで端末の値を消せなければ storage-failed。サーバーへは送らない。状態は変わらない', async () => {
    const calls: string[] = [];
    const { storage } = memoryStorage();
    const sessions = createSessionRepository({
      ...storage,
      deleteItemAsync: async () => {
        throw new Error('delete failed');
      },
    });
    await sessions.set({ session: 'SESSION-1', provider: 'apple', localDataId: 'data-1' });
    const account = createAccountService({
      auth: fakeAuth({ logout: async (s) => void calls.push(s) }).auth,
      sessions,
      sha256Base64Url,
      localDataId: async () => 'data-1',
      idTokenProviders: {},
    });
    await rejectsWith(account.signOut(), 'storage-failed');
    assert.deepEqual(calls, []);
    assert.equal(await account.getSignedInProvider(), 'apple'); // 端末の状態と見た目が食い違わない
  });

  it('削除が黙って失敗して値が残る（iOS）ときも storage-failed（ログアウトできたことにしない）', async () => {
    const { storage } = memoryStorage();
    const sessions = createSessionRepository({ ...storage, deleteItemAsync: async () => {} });
    await sessions.set({ session: 'SESSION-1', provider: 'apple', localDataId: 'data-1' });
    const account = createAccountService({
      auth: fakeAuth().auth,
      sessions,
      sha256Base64Url,
      localDataId: async () => 'data-1',
      idTokenProviders: {},
    });
    await rejectsWith(account.signOut(), 'storage-failed');
    assert.equal(await account.getSignedInProvider(), 'apple');
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
    await sessions.set({ session: 'SESSION-9', provider: 'google', localDataId: 'data-1' });
    const account = createAccountService({
      auth: fakeAuth({
        logout: async (session) => {
          order.push(`logout:${session}:${items.size}`);
        },
      }).auth,
      sessions,
      sha256Base64Url,
      localDataId: async () => 'data-1',
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

  it('読めない値が残っていたら、消すが、失効を確認できたとは言わない（serverRevoked: false）。サーバーへは送らない', async () => {
    const { account, items, calls } = setup();
    items.set('singfolio.session', 'garbage');
    assert.deepEqual(await account.signOut(), { serverRevoked: false });
    assert.equal(items.size, 0);
    assert.deepEqual(calls, []);
  });

  it('端末の読み取りが一時的に失敗していたときも、serverRevoked: false（値があるかもしれない）', async () => {
    const calls: string[] = [];
    const items = new Map<string, string>([['singfolio.session', 'x']]);
    let failReads = true;
    const account = createAccountService({
      auth: fakeAuth({ logout: async (s) => void calls.push(s) }).auth,
      sessions: createSessionRepository({
        getItemAsync: async (key) => {
          // 最初の読み取り（signOut の冒頭）だけ失敗し、消したあとの読み戻しは通る
          if (failReads) {
            failReads = false;
            throw new Error('keychain locked');
          }
          return items.get(key) ?? null;
        },
        setItemAsync: async () => {},
        deleteItemAsync: async (key) => void items.delete(key),
      }),
      sha256Base64Url,
      localDataId: async () => 'data-1',
      idTokenProviders: {},
    });
    assert.deepEqual(await account.signOut(), { serverRevoked: false });
    assert.equal(items.size, 0);
    assert.deepEqual(calls, []);
  });

  it('別のローカルDBのセッション（再インストール前の残り）も、サーバーのセッションは実在するので、失効させる', async () => {
    const { account, calls, state, items } = setup();
    await account.signIn('apple');
    state.id = 'data-2';
    calls.length = 0;
    assert.deepEqual(await account.signOut(), { serverRevoked: true });
    assert.deepEqual(calls, ['logout:SESSION-1']);
    assert.equal(items.size, 0);
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

  it('各社のサインインが返らなくても、上限で timeout になり、後ろのログアウトが進む（保存も login もしない）', async () => {
    const { account, calls, items } = setup({
      providerTimeoutMs: 20,
      providers: { apple: { getIdToken: () => new Promise<string>(() => {}) } },
    });
    const signingIn = account.signIn('apple');
    const signingOut = account.signOut();
    await rejectsWith(signingIn, 'timeout');
    assert.deepEqual(await signingOut, { serverRevoked: true });
    assert.deepEqual(calls, ['nonce']);
    assert.equal(items.size, 0);
    assert.equal(await account.getSignedInProvider(), null); // やり直せる
  });

  it('上限を過ぎてから返ったトークンは捨てる（login も保存もしない）。あとからの失敗も未処理の拒否にならない', async () => {
    let finish: (token: string) => void = () => {};
    let fail: (error: Error) => void = () => {};
    const late = setup({
      providerTimeoutMs: 10,
      providers: { apple: { getIdToken: () => new Promise<string>((resolve) => (finish = resolve)) } },
    });
    await rejectsWith(late.account.signIn('apple'), 'timeout');
    finish('LATE-ID-TOKEN');
    const lateFailure = setup({
      providerTimeoutMs: 10,
      providers: {
        apple: {
          getIdToken: () => new Promise<string>((_resolve, reject) => (fail = reject)),
        },
      },
    });
    await rejectsWith(lateFailure.account.signIn('apple'), 'timeout');
    fail(new Error('after the timeout'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(late.calls, ['nonce']);
    assert.equal(late.items.size, 0);
    assert.equal(await late.account.getSignedInProvider(), null);
  });

  it('上限の前に返れば、タイマーを残さない（残ると、テストの実行が上限の分だけ終わらない）', async () => {
    const { account } = setup(); // 上限は既定の5分
    await account.signIn('apple');
    assert.equal(await account.getSignedInProvider(), 'apple');
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

describe('createServices との結合', () => {
  it('auth を渡さなければ、ログアウト中のままで、signIn は provider-unavailable。signOut は何もしない', async () => {
    const { services } = await createTestServices();
    assert.equal(await services.account.getSignedInProvider(), null);
    await rejectsWith(services.account.signIn('apple'), 'provider-unavailable');
    assert.deepEqual(await services.account.signOut(), { serverRevoked: true });
  });

  function authOptions(storage: SecureStorage) {
    const requests: string[] = [];
    return {
      requests,
      auth: {
        storage,
        sha256Base64Url,
        fetch: async (url: string) => {
          requests.push(url);
          return url.endsWith('/auth/nonce')
            ? { ok: true, status: 200, json: async () => ({ nonce: 'T-1' }) }
            : { ok: true, status: 200, json: async () => ({ session: 'SESSION-1' }) };
        },
        idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
      },
    };
  }

  it('auth を渡すと、アカウントが組み立てられ、DBの識別子と一緒にセッションを保存する', async () => {
    const { storage, items } = memoryStorage();
    const { requests, auth } = authOptions(storage);
    const { services, sqlite } = await createTestServices({ auth });
    await services.account.signIn('apple');
    assert.equal(await services.account.getSignedInProvider(), 'apple');
    assert.deepEqual(requests, ['https://singfolio.app/auth/nonce', 'https://singfolio.app/auth/login']);
    const dataId = (sqlite.prepare("SELECT value FROM settings WHERE key = 'local_data_id'").get() as { value: string })
      .value;
    assert.equal(JSON.parse([...items.values()][0]).localDataId, dataId);
  });

  it('DBを新しく作ったあと（再インストール）は、DBの外に残ったセッションを、サインイン中として扱わない', async () => {
    const { storage } = memoryStorage();
    const first = await createTestServices({ auth: authOptions(storage).auth });
    await first.services.account.signIn('apple');
    assert.equal(await first.services.account.getSignedInProvider(), 'apple');

    // 同じSecureStore（残ったKeychain）と、新しいDB。テストの環境は連番のIDを作るので、最初のIDが
    // 古いDBと同じにならないよう、1つ進めておく（本物は、毎回ちがうUUID）
    const second = await createTestServices({ auth: authOptions(storage).auth });
    second.env.newId();
    assert.equal(await second.services.account.getSignedInProvider(), null);
    await second.services.account.signIn('apple'); // already-signed-in にならない
    assert.equal(await second.services.account.getSignedInProvider(), 'apple');
  });
});
