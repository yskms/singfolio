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
import { createAccountService, type AuthCodeProvider, type IdTokenProvider } from './accountService.ts';

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
    requestWebNonce: async (challenge) => {
      calls.push(`web-nonce:${challenge}`);
      return 'T-WEB-1';
    },
    login: async ({ provider, idToken, nonce }) => {
      calls.push(`login:${provider}:${idToken}:${nonce}`);
      return 'SESSION-1';
    },
    loginWithAppleCode: async ({ code, nonce, verifier }) => {
      calls.push(`apple-code-login:${code}:${nonce}:${verifier}`);
      return 'SESSION-WEB-1';
    },
    logout: async (session) => {
      calls.push(`logout:${session}`);
    },
    logoutOthers: async (session) => {
      calls.push(`logout-others:${session}`);
    },
    deleteAccount: async (session, request) => {
      calls.push(`delete:${session}:${JSON.stringify(request)}`);
      return { appleRevoked: true };
    },
    ...overrides,
  };
  return { auth, calls };
}

function setup(
  options: {
    auth?: Partial<AuthRepository>;
    providers?: Partial<Record<AuthProvider, IdTokenProvider>>;
    codeProviders?: Partial<Record<AuthProvider, AuthCodeProvider>>;
    randomVerifier?: () => string;
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
    authCodeProviders: options.codeProviders,
    randomVerifier: options.randomVerifier ?? (() => 'V'.repeat(43)),
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

describe('signIn（認可コードの経路。AndroidのApple）', () => {
  const VERIFIER = 'V'.repeat(43);

  function setupWeb(codeProvider?: Partial<AuthCodeProvider>, options: Parameters<typeof setup>[0] = {}) {
    const codes: string[] = [];
    const provider: AuthCodeProvider = {
      getAuthorizationCode: async (hashedNonce) => {
        codes.push(hashedNonce);
        return 'AUTH-CODE';
      },
      ...codeProvider,
    };
    // Androidでは、AppleのIDトークンの経路は組み込まない（iOSのネイティブだけ）。
    return { ...setup({ providers: {}, codeProviders: { apple: provider }, ...options }), codes };
  }

  it('V を作り、C=SHA-256(V) を入れた web の T を得て、SHA-256(T) で認可の画面を開き、コード・T・V でログインする', async () => {
    const { account, sessions, calls, codes } = setupWeb();
    await account.signIn('apple');
    const challenge = createHash('sha256').update(VERIFIER).digest('base64url');
    assert.deepEqual(calls, [
      `web-nonce:${challenge}`,
      `apple-code-login:AUTH-CODE:T-WEB-1:${VERIFIER}`,
    ]);
    // 画面に渡すのは T そのものではなく SHA-256(T)（state・nonce に入る）
    assert.deepEqual(codes, [createHash('sha256').update('T-WEB-1').digest('base64url')]);
    assert.equal(codes[0].length, 43);
    assert.deepEqual(await sessions.read(), {
      kind: 'found',
      value: { session: 'SESSION-WEB-1', provider: 'apple', localDataId: 'data-1' },
    });
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('native の T（requestNonce）は取らない。V は、画面にも、ログインの前の通信にも出さない（ログインのときだけ送る）', async () => {
    const { account, calls, codes } = setupWeb();
    await account.signIn('apple');
    assert.equal(calls.includes('nonce'), false);
    assert.equal(codes.some((value) => value.includes(VERIFIER)), false);
    // V そのものを送るのは、`loginWithAppleCode` だけ。C（ハッシュ）は、T を得るときに送る
    assert.equal(calls.filter((call) => call.includes(VERIFIER)).length, 1);
    assert.ok(calls.find((call) => call.includes(VERIFIER))?.startsWith('apple-code-login:'));
  });

  it('画面を取りやめたら cancelled。何も保存せず、ログインを呼ばない。やり直せる', async () => {
    const { account, calls, items } = setupWeb({
      getAuthorizationCode: async () => {
        throw new AuthError('cancelled');
      },
    });
    await rejectsWith(account.signIn('apple'), 'cancelled');
    assert.equal(calls.some((call) => call.startsWith('apple-code-login')), false);
    assert.equal(items.size, 0);
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('コードが空・文字列でなければ invalid-response（ログインを呼ばない）', async () => {
    for (const code of ['', undefined, 5]) {
      const { account, calls } = setupWeb({ getAuthorizationCode: async () => code as unknown as string });
      await rejectsWith(account.signIn('apple'), 'invalid-response');
      assert.equal(calls.some((call) => call.startsWith('apple-code-login')), false);
    }
  });

  it('各社の画面が終わらなければ、上限で timeout（あとから返ったコードは使わない）', async () => {
    const { account, calls } = setupWeb(
      { getAuthorizationCode: () => new Promise((resolve) => setTimeout(() => resolve('LATE-CODE'), 40)) },
      { providerTimeoutMs: 10 },
    );
    await rejectsWith(account.signIn('apple'), 'timeout');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(calls.some((call) => call.startsWith('apple-code-login')), false);
  });

  it('Worker の失敗（401・503）は、そのまま AuthError で返る。何も保存しない', async () => {
    for (const code of ['unauthorized', 'unavailable', 'network'] as const) {
      const { account, items } = setupWeb(undefined, {
        auth: {
          loginWithAppleCode: async () => {
            throw new AuthError(code);
          },
        },
      });
      await rejectsWith(account.signIn('apple'), code);
      assert.equal(items.size, 0);
    }
  });

  it('保存できなければ storage-failed で、サーバー側のセッションを失効させる', async () => {
    const { account, calls, sessions } = setupWeb();
    sessions.set = async () => {
      throw new Error('keystore failed');
    };
    await rejectsWith(account.signIn('apple'), 'storage-failed');
    assert.ok(calls.includes('logout:SESSION-WEB-1'));
  });

  it('V が作れなければ unexpected（Appleの画面を開く前）。Google は IDトークンの経路のまま', async () => {
    const { account, calls, codes } = setupWeb(undefined, { randomVerifier: () => '' });
    await rejectsWith(account.signIn('apple'), 'unexpected');
    assert.deepEqual(codes, []);
    assert.deepEqual(calls, []);

    const google: IdTokenProvider = { getIdToken: async () => 'GOOGLE-ID-TOKEN' };
    const both = setup({ providers: { google }, codeProviders: { apple: { getAuthorizationCode: async () => 'c' } } });
    await both.account.signIn('google');
    assert.ok(both.calls.includes('login:google:GOOGLE-ID-TOKEN:T-1'));
  });

  it('同じ手段が IDトークンの経路にもあれば、そちらを使う（OSごとに、どちらか1つ）。どちらにも無ければ provider-unavailable', async () => {
    const both = setup({ codeProviders: { apple: { getAuthorizationCode: async () => 'c' } } });
    await both.account.signIn('apple');
    assert.ok(both.calls.includes('apple-sheet'));
    assert.equal(both.calls.some((call) => call.startsWith('web-nonce')), false);

    const none = setup({ providers: {}, codeProviders: {} });
    await rejectsWith(none.account.signIn('apple'), 'provider-unavailable');
    assert.deepEqual(none.calls, []);
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
    assert.equal(services.account.available, false); // 画面は入口ごと出さない
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
    assert.equal(services.account.available, true);
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

describe('signOutOthers（ほかの端末をすべてログアウト）', () => {
  it('サインイン中のセッションで、サーバーに失効を頼む。端末のセッションは残す', async () => {
    const { account, calls, sessions } = setup();
    await account.signIn('apple');
    calls.length = 0;
    await account.signOutOthers();
    assert.deepEqual(calls, ['logout-others:SESSION-1']);
    assert.equal(await account.getSignedInProvider(), 'apple');
    assert.equal((await sessions.read()).kind, 'found');
  });

  it('サインインしていなければ not-signed-in。通信しない（別のローカルDBのセッションも、していない扱い）', async () => {
    const { account, calls, state } = setup();
    await rejectsWith(account.signOutOthers(), 'not-signed-in');
    await account.signIn('apple');
    calls.length = 0;
    state.id = 'data-2'; // DBを作り直した（再インストール）
    await rejectsWith(account.signOutOthers(), 'not-signed-in');
    assert.deepEqual(calls, []);
  });

  it('401（サーバーがセッションを認めない）は unauthorized で、端末のセッションを捨てる', async () => {
    const { account, sessions } = setup({
      auth: {
        logoutOthers: async () => {
          throw new AuthError('unauthorized');
        },
      },
    });
    await account.signIn('apple');
    await rejectsWith(account.signOutOthers(), 'unauthorized');
    assert.equal((await sessions.read()).kind, 'none');
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('通信の失敗・サーバーの不調では、端末のセッションを捨てない（一時的な失敗）', async () => {
    for (const code of ['network', 'unavailable'] as const) {
      const { account, sessions } = setup({
        auth: {
          logoutOthers: async () => {
            throw new AuthError(code);
          },
        },
      });
      await account.signIn('apple');
      await rejectsWith(account.signOutOthers(), code);
      assert.equal((await sessions.read()).kind, 'found');
      assert.equal(await account.getSignedInProvider(), 'apple');
    }
  });

  it('401 のとき、端末のセッションを捨てられなくても、失敗は unauthorized のまま', async () => {
    const { account, sessions } = setup({
      auth: {
        logoutOthers: async () => {
          throw new AuthError('unauthorized');
        },
      },
    });
    await account.signIn('apple');
    sessions.clear = async () => {
      throw new Error('keystore failed');
    };
    await rejectsWith(account.signOutOthers(), 'unauthorized');
  });

  it('AuthError 以外の失敗は unexpected に包む（元の例外は載せない）', async () => {
    const { account } = setup({
      auth: {
        logoutOthers: async () => {
          throw new Error('boom SECRET');
        },
      },
    });
    await account.signIn('apple');
    await assert.rejects(account.signOutOthers(), (error) => {
      return error instanceof AuthError && error.code === 'unexpected' && !error.message.includes('SECRET');
    });
  });

  it('注入しないとき（deps が null）は not-signed-in', async () => {
    await rejectsWith(createAccountService(null).signOutOthers(), 'not-signed-in');
  });
});

describe('deleteAccount（アカウントの削除）', () => {
  const googleProvider: IdTokenProvider = { getIdToken: async () => 'GOOGLE-ID-TOKEN' };
  const appleWithCode: IdTokenProvider = {
    getIdToken: async () => 'ID-TOKEN',
    getIdTokenWithCode: async () => ({ idToken: 'ID-TOKEN', authorizationCode: 'AUTH-CODE' }),
  };
  const requestOf = (calls: string[]) => {
    const call = calls.find((value) => value.startsWith('delete:'));
    return call === undefined ? undefined : JSON.parse(call.slice(call.indexOf(':', 'delete:'.length) + 1));
  };

  it('Apple（iOS）: T を得て、そのハッシュで再認証し、IDトークンと認可コードを T と一緒に送る。成功したら端末のセッションを捨てる', async () => {
    const hashed: string[] = [];
    const provider: IdTokenProvider = {
      getIdToken: async () => 'unused',
      getIdTokenWithCode: async (hashedNonce) => {
        hashed.push(hashedNonce);
        return { idToken: 'ID-TOKEN', authorizationCode: 'AUTH-CODE' };
      },
    };
    const { account, calls, sessions } = setup({ providers: { apple: provider } });
    await account.signIn('apple');
    calls.length = 0;
    assert.deepEqual(await account.deleteAccount(), { appleRevoked: true, sessionCleared: true });
    assert.deepEqual(calls, [
      'nonce',
      `delete:SESSION-1:${JSON.stringify({ provider: 'apple', nonce: 'T-1', idToken: 'ID-TOKEN', authorizationCode: 'AUTH-CODE' })}`,
    ]);
    assert.deepEqual(hashed, [createHash('sha256').update('T-1').digest('base64url')]);
    assert.equal((await sessions.read()).kind, 'none');
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('Apple: getIdTokenWithCode が無ければ getIdToken で再認証する（認可コードは付かない）。コードが空なら付けない', async () => {
    const plain = setup();
    await plain.account.signIn('apple');
    plain.calls.length = 0;
    await plain.account.deleteAccount();
    assert.deepEqual(requestOf(plain.calls), { provider: 'apple', nonce: 'T-1', idToken: 'ID-TOKEN' });

    const empty = setup({
      providers: { apple: { getIdToken: async () => 'x', getIdTokenWithCode: async () => ({ idToken: 'ID-TOKEN', authorizationCode: '' }) } },
    });
    await empty.account.signIn('apple');
    empty.calls.length = 0;
    await empty.account.deleteAccount();
    assert.deepEqual(requestOf(empty.calls), { provider: 'apple', nonce: 'T-1', idToken: 'ID-TOKEN' });
  });

  it('Google: IDトークンで再認証する。appleRevoked は、サーバーの応答のまま（null）', async () => {
    const { account, calls } = setup({
      providers: { google: googleProvider },
      auth: {
        deleteAccount: async (session, request) => {
          calls.push(`delete:${session}:${JSON.stringify(request)}`);
          return { appleRevoked: null };
        },
      },
    });
    await account.signIn('google');
    calls.length = 0;
    assert.deepEqual(await account.deleteAccount(), { appleRevoked: null, sessionCleared: true });
    assert.deepEqual(requestOf(calls), { provider: 'google', nonce: 'T-1', idToken: 'GOOGLE-ID-TOKEN' });
  });

  it('Android の Apple（認可コードの経路）: V・web の T・認可コードで再認証する', async () => {
    const codes: string[] = [];
    const { account, calls, sessions } = setup({
      providers: {},
      codeProviders: {
        apple: {
          getAuthorizationCode: async (hashedNonce) => {
            codes.push(hashedNonce);
            return 'AUTH-CODE';
          },
        },
      },
    });
    await account.signIn('apple');
    calls.length = 0;
    await account.deleteAccount();
    const challenge = createHash('sha256').update('V'.repeat(43)).digest('base64url');
    assert.equal(calls[0], `web-nonce:${challenge}`);
    assert.deepEqual(requestOf(calls), { provider: 'apple', nonce: 'T-WEB-1', code: 'AUTH-CODE', verifier: 'V'.repeat(43) });
    // 認可の画面を開いた回数は、サインインと削除の2回。どちらも `SHA-256(T)` を渡す。
    assert.deepEqual(codes, Array(2).fill(createHash('sha256').update('T-WEB-1').digest('base64url')));
    assert.equal((await sessions.read()).kind, 'none');
  });

  it('appleRevoked が false でも成功（アカウントは消えている）。値はそのまま返す', async () => {
    const { account } = setup({ auth: { deleteAccount: async () => ({ appleRevoked: false }) } });
    await account.signIn('apple');
    assert.deepEqual(await account.deleteAccount(), { appleRevoked: false, sessionCleared: true });
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('サインインしていなければ not-signed-in。各社の画面を開かず、通信しない（別のローカルDBのセッションも、していない扱い）', async () => {
    const { account, calls, hashed, state } = setup();
    await rejectsWith(account.deleteAccount(), 'not-signed-in');
    await account.signIn('apple');
    calls.length = 0;
    hashed.length = 0;
    state.id = 'data-2';
    await rejectsWith(account.deleteAccount(), 'not-signed-in');
    assert.deepEqual(calls, []);
    assert.deepEqual(hashed, []);
  });

  it('再認証の画面を取りやめたら cancelled。何も消さず、サインインも保つ', async () => {
    const { account, calls, sessions } = setup({
      providers: {
        apple: {
          getIdToken: async () => {
            throw new AuthError('cancelled');
          },
        },
      },
    });
    // 取りやめる版では、サインインできないので、保存済みのセッションを直接置く。
    await sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
    await rejectsWith(account.deleteAccount(), 'cancelled');
    assert.equal(calls.some((call) => call.startsWith('delete:')), false);
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('再認証の画面が終わらなければ、上限で timeout。サインインは保つ。あとから返った結果は使わない', async () => {
    const provider: IdTokenProvider = {
      getIdToken: () => new Promise((resolve) => setTimeout(() => resolve('LATE'), 40)),
    };
    const { account, calls, sessions } = setup({ providers: { apple: provider }, providerTimeoutMs: 10 });
    await sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
    await rejectsWith(account.deleteAccount(), 'timeout');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(calls.some((call) => call.startsWith('delete:')), false);
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('IDトークン・コードが空なら invalid-response（削除を呼ばない）', async () => {
    for (const idToken of ['', undefined, 5]) {
      const { account, calls, sessions } = setup({
        providers: { apple: { getIdToken: async () => idToken as unknown as string } },
      });
      await sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
      await rejectsWith(account.deleteAccount(), 'invalid-response');
      assert.equal(calls.some((call) => call.startsWith('delete:')), false);
    }
    const web = setup({ providers: {}, codeProviders: { apple: { getAuthorizationCode: async () => '' } } });
    await web.sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
    await rejectsWith(web.account.deleteAccount(), 'invalid-response');
  });

  it('再認証が通らない（reauth-failed）・別のアカウント（account-mismatch）は、そのまま返す。サインインは保つ', async () => {
    for (const code of ['reauth-failed', 'account-mismatch'] as const) {
      const { account, sessions } = setup({
        auth: {
          deleteAccount: async () => {
            throw new AuthError(code);
          },
        },
      });
      await account.signIn('apple');
      await rejectsWith(account.deleteAccount(), code);
      assert.equal((await sessions.read()).kind, 'found');
      assert.equal(await account.getSignedInProvider(), 'apple');
    }
  });

  it('401（サーバーがセッションを認めない）は unauthorized で、端末のセッションを捨てる', async () => {
    const { account, sessions } = setup({
      auth: {
        deleteAccount: async () => {
          throw new AuthError('unauthorized');
        },
      },
    });
    await account.signIn('apple');
    await rejectsWith(account.deleteAccount(), 'unauthorized');
    assert.equal((await sessions.read()).kind, 'none');
  });

  it('サーバーの不調（unavailable）では、セッションを捨てない。やり直せる', async () => {
    const { account, sessions } = setup({
      auth: {
        deleteAccount: async () => {
          throw new AuthError('unavailable');
        },
      },
    });
    await account.signIn('apple');
    await rejectsWith(account.deleteAccount(), 'unavailable');
    assert.equal((await sessions.read()).kind, 'found');
  });

  it('削除の要求を送ったあとの通信の失敗（network）は delete-unconfirmed（済んでいるかもしれない）。セッションは捨てない', async () => {
    const { account, sessions } = setup({
      auth: {
        deleteAccount: async () => {
          throw new AuthError('network');
        },
      },
    });
    await account.signIn('apple');
    await rejectsWith(account.deleteAccount(), 'delete-unconfirmed');
    assert.equal((await sessions.read()).kind, 'found');
    assert.equal(await account.getSignedInProvider(), 'apple');
  });

  it('削除の要求を送ったあとの応答が読めない（invalid-response。Workerが 200 を返すのは消したあと）も delete-unconfirmed。セッションは捨てない', async () => {
    const { account, sessions } = setup({
      auth: {
        deleteAccount: async () => {
          throw new AuthError('invalid-response');
        },
      },
    });
    await account.signIn('apple');
    await rejectsWith(account.deleteAccount(), 'delete-unconfirmed');
    assert.equal((await sessions.read()).kind, 'found');
  });

  it('T を得られなければ（通信の失敗）、各社の画面を開かない', async () => {
    const { account, hashed, sessions } = setup({
      auth: {
        requestNonce: async () => {
          throw new AuthError('network');
        },
      },
    });
    await sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
    // 要求は、まだ送っていない（何も消えていない）ので、delete-unconfirmed ではなく、ふつうの network。
    await rejectsWith(account.deleteAccount(), 'network');
    assert.deepEqual(hashed, []);
  });

  it('AndroidのApple（認可コードの経路）も、T（web）の取得の通信の失敗は、ふつうの network', async () => {
    const { account, sessions } = setup({
      providers: {},
      codeProviders: { apple: { getAuthorizationCode: async () => 'CODE' } },
      auth: {
        requestWebNonce: async () => {
          throw new AuthError('network');
        },
      },
    });
    await sessions.set({ session: 'SESSION-X', provider: 'apple', localDataId: 'data-1' });
    await rejectsWith(account.deleteAccount(), 'network');
  });

  it('削除は成功したが、端末のセッションを捨てられなくても、成功を返す（残った値は、次の呼び出しの 401 で捨てる）', async () => {
    const { account, sessions } = setup();
    await account.signIn('apple');
    sessions.clear = async () => {
      throw new Error('keystore failed');
    };
    // 成功は成功のまま。画面が「この端末はまだサインイン中」と伝えられるよう、`sessionCleared` で知らせる。
    assert.deepEqual(await account.deleteAccount(), { appleRevoked: true, sessionCleared: false });
  });

  it('組み込まれていない手段のセッション（手段のサインインが無い）は provider-unavailable。通信しない', async () => {
    const { account, calls, sessions } = setup({ providers: {}, codeProviders: {} });
    await sessions.set({ session: 'SESSION-X', provider: 'google', localDataId: 'data-1' });
    await rejectsWith(account.deleteAccount(), 'provider-unavailable');
    assert.deepEqual(calls, []);
  });

  it('AuthError 以外の失敗は unexpected に包む。元の例外は載せない。注入しないとき（null）は not-signed-in', async () => {
    const { account } = setup({
      auth: {
        deleteAccount: async () => {
          throw new Error('boom SECRET-TOKEN');
        },
      },
    });
    await account.signIn('apple');
    await assert.rejects(account.deleteAccount(), (error) => {
      return error instanceof AuthError && error.code === 'unexpected' && !error.message.includes('SECRET-TOKEN');
    });
    await rejectsWith(createAccountService(null).deleteAccount(), 'not-signed-in');
  });

  it('サインインやログアウトと同じ列で、1本ずつ実行する（サインインの途中の削除は、サインインのあとに走る）', async () => {
    let release: (value: string) => void = () => {};
    const slow: IdTokenProvider = { getIdToken: () => new Promise<string>((resolve) => (release = resolve)) };
    const { account, sessions } = setup({ providers: { apple: slow } });
    const signingIn = account.signIn('apple');
    const deleting = account.deleteAccount().catch((error: unknown) => error);
    // サインインの途中では、削除はまだサインインしていない扱いにならない（列の後ろで待つ）。
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await sessions.read()).kind, 'none');
    release('ID-TOKEN');
    await signingIn;
    // 削除は、サインインのあとに走る。もう一度、各社の画面を開く（slow の2回目は、止まったまま）。
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await sessions.read()).kind, 'found');
    release('ID-TOKEN-2');
    await deleting;
    assert.equal((await sessions.read()).kind, 'none');
  });
});

describe('access.withSession（公開の Service が使う、認証が要る呼び出しの入口）', () => {
  it('サインイン中のセッションを渡して task を実行し、結果を返す。端末のセッションは残す', async () => {
    const { account, sessions } = setup();
    await account.signIn('apple');
    assert.equal(await account.access.withSession(async (session) => `got:${session}`), 'got:SESSION-1');
    assert.equal((await sessions.read()).kind, 'found');
  });

  it('サインインしていなければ not-signed-in。task を実行しない（別のローカルDBのセッションも、していない扱い）', async () => {
    const { account, state } = setup();
    let ran = 0;
    const task = async () => void (ran += 1);
    await rejectsWith(account.access.withSession(task), 'not-signed-in');
    await account.signIn('apple');
    state.id = 'data-2';
    await rejectsWith(account.access.withSession(task), 'not-signed-in');
    assert.equal(ran, 0);
  });

  it('auth を注入していないビルド（account.available が偽）でも、not-signed-in', async () => {
    const { account } = { account: createAccountService(null) };
    await rejectsWith(account.access.withSession(async () => 1), 'not-signed-in');
  });

  it('task が unauthorized（401）を投げたときだけ、端末のセッションを捨てる', async () => {
    const { account, sessions } = setup();
    await account.signIn('apple');
    for (const code of ['network', 'unavailable', 'invalid-response', 'invalid-request'] as const) {
      await rejectsWith(
        account.access.withSession(async () => {
          throw new AuthError(code);
        }),
        code,
      );
      assert.equal((await sessions.read()).kind, 'found', code);
    }
    await rejectsWith(
      account.access.withSession(async () => {
        throw new AuthError('unauthorized');
      }),
      'unauthorized',
    );
    assert.equal((await sessions.read()).kind, 'none');
    assert.equal(await account.getSignedInProvider(), null);
  });

  it('task が AuthError 以外を投げたら、そのまま投げる（包まない）。端末のセッションは捨てない', async () => {
    const { account, sessions } = setup();
    await account.signIn('apple');
    const failure = new Error('domain failure');
    await assert.rejects(
      account.access.withSession(async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.equal((await sessions.read()).kind, 'found');
  });

  it('401 のとき、端末のセッションを捨てられなくても、失敗は unauthorized のまま', async () => {
    const { account, sessions } = setup();
    await account.signIn('apple');
    sessions.clear = async () => {
      throw new Error('keychain error');
    };
    await rejectsWith(
      account.access.withSession(async () => {
        throw new AuthError('unauthorized');
      }),
      'unauthorized',
    );
  });

  it('サインイン・ログアウトの待ち（各社の画面を開いている間）に、巻き込まれない', async () => {
    let release: (token: string) => void = () => {};
    const slow: IdTokenProvider = { getIdToken: () => new Promise<string>((resolve) => (release = resolve)) };
    const { account, sessions } = setup({ providers: { apple: slow } });
    // 先に別の手段で入っているわけではない: サインイン中（画面が開いたまま）でも、access は待たずに not-signed-in を返す。
    const signingIn = account.signIn('apple');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await rejectsWith(account.access.withSession(async () => 1), 'not-signed-in');
    release('ID-TOKEN');
    await signingIn;
    assert.equal((await sessions.read()).kind, 'found');
  });
});

describe('createServices: 公開の入口', () => {
  it('Services.account（画面が使う型）に、セッションを渡す入口 access を含めない', async () => {
    const { services } = await createTestServices();
    assert.equal('access' in services.account, false);
  });

  it('auth を渡さなければ、publish の操作は not-signed-in（通信の部品も無いので、何も送れない）', async () => {
    const { services } = await createTestServices();
    await rejectsWith(services.publish.refreshProfile(), 'not-signed-in');
    await rejectsWith(services.publish.publish({ displayName: 'x', bio: '' }), 'not-signed-in');
  });

  it('サインイン中なら、公開の通信にセッションを Bearer で付ける。401 なら端末のセッションを捨てる', async () => {
    const { storage } = memoryStorage();
    const sent: { url: string; authorization: string | undefined }[] = [];
    let profileStatus = 200;
    const { services } = await createTestServices({
      auth: {
        storage,
        sha256Base64Url,
        idTokenProviders: { apple: { getIdToken: async () => 'ID-TOKEN' } },
        fetch: async (url, init) => {
          sent.push({ url, authorization: init.headers.Authorization });
          if (url.endsWith('/auth/nonce')) return { ok: true, status: 200, json: async () => ({ nonce: 'T-1' }) };
          if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ session: 'SESSION-1' }) };
          return { ok: profileStatus === 200, status: profileStatus, json: async () => ({ profile: null }) };
        },
      },
    });
    await services.account.signIn('apple');
    assert.equal(await services.publish.refreshProfile(), null);
    const call = sent.find((request) => request.url.endsWith('/me/profile'));
    assert.equal(call?.authorization, 'Bearer SESSION-1');

    profileStatus = 401;
    await rejectsWith(services.publish.refreshProfile(), 'unauthorized');
    assert.equal(await services.account.getSignedInProvider(), null);
  });
});
