import type { AuthProvider } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import type { AuthRepository, DeleteAccountRequest } from '../repositories/authRepository.ts';
import type { SessionRepository, StoredSession } from '../repositories/sessionRepository.ts';

/**
 * 各社のサインイン（Apple・Google）。SDKの呼び出しとレスポンスの形はここに閉じ込める（7.3.7 以降の
 * Repository が実装する）。画面・Service は触れない。
 */
export interface IdTokenProvider {
  /**
   * 各社のサインインを開き、IDトークンの全文を返す。`hashedNonce` は、IDトークンの `nonce` に入れる値
   * （`SHA-256(T)` の base64url）。利用者が取りやめたら `AuthError('cancelled')`、それ以外の失敗も
   * `AuthError`（トークン・応答の内容は載せない）。
   */
  getIdToken(hashedNonce: string): Promise<string>;
  /**
   * アカウントの削除の再認証用。`getIdToken` と同じサインインで、IDトークンと、Appleのトークンを失効させるための認可コードも
   * 返す。Apple（iOS）だけが持つ（無ければ、`getIdToken` で代える。認可コードが無いので、Appleのトークンは失効できない）。
   * 失敗・取りやめは `getIdToken` と同じ。
   */
  getIdTokenWithCode?(hashedNonce: string): Promise<{ idToken: string; authorizationCode?: string }>;
}

/**
 * 各社のサインインのうち、IDトークンではなく**認可コード**を返すもの（AndroidのAppleログイン。Web経由）。
 * IDトークンへの交換は、Workerがする（`client_secret` を持つため）。画面・Service は、ブラウザ・URLの扱いに触れない。
 */
export interface AuthCodeProvider {
  /**
   * 各社の認可の画面を開き、認可コードを返す。`hashedNonce` は、認可リクエストの `state` と `nonce` に入れる値
   * （`SHA-256(T)` の base64url）。利用者が取りやめたら `AuthError('cancelled')`、それ以外の失敗も `AuthError`
   * （コード・`state` の値は載せない）。
   */
  getAuthorizationCode(hashedNonce: string): Promise<string>;
}

export interface AccountServiceDeps {
  auth: AuthRepository;
  sessions: SessionRepository;
  /** 文字列（UTF-8）の SHA-256 を base64url（パディングなし。43字）にする。 */
  sha256Base64Url(text: string): Promise<string>;
  /**
   * このローカルDBの識別子（`settings.ensureLocalDataId`）。セッションは、保存したときの識別子と一緒に置き、
   * 今のDBの識別子と合わなければ、サインインしていない扱いにする（DBを新しく作ったのに、DBの外に前の
   * セッションが残っていても、生かさない）。
   */
  localDataId(): Promise<string>;
  /** 組み込み済みのサインイン。無いものは `signIn` が `provider-unavailable` にする。 */
  idTokenProviders: Partial<Record<AuthProvider, IdTokenProvider>>;
  /**
   * 組み込み済みの、認可コードを返すサインイン（AndroidのApple）。同じ手段が `idTokenProviders` にもあれば、
   * そちらを使う（OSごとに、どちらか1つだけを組み込む）。
   */
  authCodeProviders?: Partial<Record<AuthProvider, AuthCodeProvider>>;
  /**
   * 検証用の値 `V`（乱数の base64url。43字）を作る。認可コードの経路で、`T` に結びつける。`V` は、その `SHA-256` を
   * `T` に入れてWorkerへ渡し、コードと一緒にWorkerへ送るまで、アプリの外に出さない。
   */
  randomVerifier?: () => string;
  /** 各社のサインインを待つ上限（ミリ秒）。既定は `PROVIDER_TIMEOUT_MS`。テスト用 */
  providerTimeoutMs?: number;
}

/**
 * 各社のサインイン（OSの画面）を待つ上限。Workerが発行する `T` の期限（発行から5分。docs §8「認証の方式」）と
 * 同じにしてある: これを過ぎて返ったIDトークンは、`T` が切れていて、どのみち 401 になる。
 *
 * 待つのをやめるだけで、OSの画面は閉じられない（Apple・Googleのどちらの SDK にも、画面を取り消す手段が無い）。
 * 上限が要るのは、結果が返らないと、直列化（下）のせいで後ろのログアウトも待ち続けるため。
 */
export const PROVIDER_TIMEOUT_MS = 5 * 60_000;

export interface SignOutResult {
  /**
   * サーバー側のセッションの失効まで確認できたか。`false` は、通信できなかった・サーバーが使えなかった、
   * または端末の値を読めず、失効させるものを特定できなかった（端末の値は、どの場合も消してある）。サーバーに
   * 残ったセッションは、最後の利用から90日で切れる。値を持つ端末が無いので使われないが、気になるときは、
   * 別の端末から「ほかの端末をすべてログアウト」（7.3.10）で消せる。端末に値が無かったときは、失効させる
   * ものが無いので `true`。
   */
  serverRevoked: boolean;
}

export interface DeleteAccountResult {
  /**
   * 端末のセッションを捨てられたか。`false` は、削除は成功したが、端末の値を消せなかった（残った値は、次に認証が要る
   * 呼び出しをしたとき 401 になり、そこで捨てる）。画面は、「削除したが、この端末はまだサインイン中」と伝え、
   * ログアウトを案内する（ログアウトは端末の値を捨てる）。
   */
  sessionCleared: boolean;
  /**
   * Appleのトークンを失効できたか。Googleは `null`（失効するものが無い）。`false` でも、アカウントは消えている
   * （失効に失敗しても、削除は止めない）。利用者には、Appleの設定（Apple Account の「Appleでサインイン」）から、
   * Singfolio との連携を解除できると案内できる。
   */
  appleRevoked: boolean | null;
}

export interface AccountService {
  /**
   * アカウントが使えるビルドか。`false` なら（`auth` を注入していない）、画面は入口ごと出さない
   * （候補検索の `suggestions.available` と同じ「注入しなければ無効」）。
   */
  readonly available: boolean;
  /**
   * サインイン中のログイン手段。していなければ `null`。セッションの値は渡さない。ローカルDBが読めないなど、
   * 判断できなかったときは `AuthError('unexpected')`（`null` にはしない: 「ログアウト中」と「分からない」を
   * 画面が取り違えないため）。**画面は、これを捕まえて**「分からない」として扱い、アカウントの欄を隠すなどに
   * とどめる（ErrorBoundaryまで伝えない。ログインを要求しないので、v1.0の機能はこの失敗に巻き込まない）。
   */
  getSignedInProvider(): Promise<AuthProvider | null>;
  /**
   * サインインする。失敗・取りやめは、すべて `AuthError`（想定外の失敗は `unexpected`）。サインイン済みなら
   * `already-signed-in`。
   */
  signIn(provider: AuthProvider): Promise<void>;
  /**
   * ログアウトする。端末の値は必ず捨てる（捨てられなければ `storage-failed`）。失敗は `AuthError`。
   */
  signOut(): Promise<SignOutResult>;
  /**
   * 「ほかの端末をすべてログアウト」。このセッション以外の、同じアカウントのセッションを、サーバーが失効させる。サインイン中に
   * だけできる（していなければ `not-signed-in`）。サーバーがこのセッションを認めなければ（`unauthorized`）、端末の
   * セッションを捨てる（ほかの失敗では捨てない）。失敗は `AuthError`。
   */
  signOutOthers(): Promise<void>;
  /**
   * アカウントを削除する。サインイン中にだけできる（していなければ `not-signed-in`）。**再認証を挟む**: ログインと同じ
   * 手段のサインインの画面が出る（取りやめは `cancelled`。何も消えない）。再認証のアカウントが、ログイン中のものと違えば
   * `account-mismatch`、通らなければ `reauth-failed`（どちらも、何も消えず、サインインは保たれる）。成功したら、端末の
   * セッションを捨てる。端末内のレパートリーは消えない。サーバーがこのセッションを認めなければ（`unauthorized`）、
   * 端末のセッションを捨てる。失敗は `AuthError`。削除の要求（`/auth/delete`）を送ったあとの通信の失敗は
   * `delete-unconfirmed`（サーバーで削除が済んでいるかもしれない）。それより前（`T` の取得）の通信の失敗は、何も
   * 消えていないので、ふつうの `network`。
   */
  deleteAccount(): Promise<DeleteAccountResult>;
}

/**
 * アカウント（ログイン・ログアウト）。**ログインを要求しない**ので、ここが使えなくても（`deps` が
 * `null`、SecureStoreが読めない、サインインしていない）、v1.0の機能は何も変わらない。
 *
 * `deps` が `null` のとき（注入しないとき）は、サインインしていない状態のままで、`signIn` は
 * `provider-unavailable`（候補検索の `suggestions.available` と同じ「注入しなければ無効」）。
 */
export function createAccountService(deps: AccountServiceDeps | null): AccountService {
  if (deps === null) {
    return {
      available: false,
      getSignedInProvider: async () => null,
      signIn: async () => {
        throw new AuthError('provider-unavailable');
      },
      signOut: async () => ({ serverRevoked: true }),
      signOutOthers: async () => {
        throw new AuthError('not-signed-in');
      },
      deleteAccount: async () => {
        throw new AuthError('not-signed-in');
      },
    };
  }
  const { auth, sessions, sha256Base64Url, localDataId, idTokenProviders } = deps;
  const authCodeProviders = deps.authCodeProviders ?? {};
  const providerTimeoutMs = deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS;

  // サインインとログアウトは1本ずつ順に実行する。サインインの途中（各社の画面を開いている間）に
  // ログアウトが走ると、ログアウトの後にセッションが保存されて、ログアウトできていないことになる。
  // 各社のサインインが終わらないと後ろのログアウトも待つので、その待ちには上限を置く
  // （`PROVIDER_TIMEOUT_MS`）。画面を取り消す手段は無く、サインイン中に呼べるログアウトの入口も無い
  // （OSの画面が、アプリの操作を止めている）ので、取り消しの口は作らない。
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }

  /**
   * `task` の結果を、`ms` 待つ。過ぎたら `timeout` で返す。`task` は止められないので動いたままで、あとで
   * 返った結果・失敗は捨てる（どちらも受け取る側を付けてあるので、未処理の拒否にはならない）。
   */
  function withTimeout<T>(task: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new AuthError('timeout')), ms);
      new Promise<T>((run) => run(task())).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  // 呼び出し側（画面）が `code` で分類できるよう、`AuthError` 以外の失敗は `unexpected` に包む。元の例外は
  // 載せない（各社のSDKの例外に、トークンなどが入りうる）。
  async function asAuthError<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      throw error instanceof AuthError ? error : new AuthError('unexpected');
    }
  }

  /**
   * 保存済みのセッションを、今のローカルDBとの関係で分ける。`current` は今のDBに属するサインイン中のもの。
   * `stale` は読めたが別のDBのもの（再インストール前の残り）。無い・読めない値は、どちらも `null`。
   */
  async function readSession(): Promise<{
    current: StoredSession | null;
    stale: StoredSession | null;
  }> {
    const read = await sessions.read();
    if (read.kind !== 'found') return { current: null, stale: null };
    return read.value.localDataId === (await localDataId())
      ? { current: read.value, stale: null }
      : { current: null, stale: read.value };
  }

  /** サインイン中のセッション。していなければ `not-signed-in`（別のローカルDBのもの・読めないものは、していない扱い）。 */
  async function requireSession(): Promise<StoredSession> {
    const { current } = await readSession();
    if (!current) throw new AuthError('not-signed-in');
    return current;
  }

  /**
   * 認証が要るサーバーの呼び出し。サーバーが認めなかったとき（401）だけ、端末のセッションを捨てる（認めない値は二度と
   * 通らない）。503・5xx・通信の失敗では捨てない（一時的な失敗。セッションは生きている）。捨てられなくても、失敗は
   * `unauthorized` のまま（次の呼び出しも 401 になり、また捨てようとする）。
   */
  async function authorized<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (error instanceof AuthError && error.code === 'unauthorized') {
        try {
          await sessions.clear();
        } catch {
          // 捨てられなかった。呼び出し側へは、元の失敗を返す
        }
      }
      throw error;
    }
  }

  /** サーバー側のセッションを失効させる。失敗は無視する（呼び出し側は、結果に依らず進める）。 */
  async function revokeQuietly(session: string): Promise<void> {
    try {
      await auth.logout(session);
    } catch {
      // 失効できなくても、サーバーのセッションは最後の利用から90日で切れる
    }
  }

  return {
    available: true,
    getSignedInProvider() {
      return asAuthError(async () => (await readSession()).current?.provider ?? null);
    },

    signIn(provider) {
      return serialize(() =>
        asAuthError(async () => {
          const idTokenProvider = idTokenProviders[provider];
          const authCodeProvider = idTokenProvider ? undefined : authCodeProviders[provider];
          if (!idTokenProvider && !authCodeProvider) throw new AuthError('provider-unavailable');
          const { current, stale } = await readSession();
          if (current) throw new AuthError('already-signed-in');
          // 読めない・別のDBのセッションが残っていても、サインインは進める（上書きする）。読めないだけで
          // 止めると、壊れた値が残る端末は、二度とサインインできない。読めない値は、失効させるものを特定
          // できず、サーバーに残る（最後の利用から90日で切れる。ログアウトで失効を確認できない場合と同じ）。
          // 読めた別のDBのもの（`stale`）は、下で上書きしたあとに失効させる。
          const dataId = await localDataId();

          let session: string;
          if (idTokenProvider) {
            // nonce の元 `T` を得て、そのハッシュを各社のサインインに渡す（リプレイ対策。§8）。
            // `T` は5分で切れるので、各社の画面を開いたまま放置すると、ログインは 401 になる（やり直す）。
            const nonce = await auth.requestNonce();
            const hashedNonce = await sha256Base64Url(nonce);
            const idToken = await withTimeout(
              () => idTokenProvider.getIdToken(hashedNonce),
              providerTimeoutMs,
            );
            if (typeof idToken !== 'string' || idToken === '') throw new AuthError('invalid-response');
            session = await auth.login({ provider, idToken, nonce });
          } else {
            // 認可コードの経路（AndroidのApple）。検証用の値 `V` を作り、そのハッシュ `C` を入れた `web` の `T` を得る。
            // 横取りされた `code` と `state`（`state` は `T` のハッシュ）だけでは、`T` も `V` も無いので、Workerは受け付けない。
            if (!authCodeProvider || provider !== 'apple') throw new AuthError('provider-unavailable');
            const verifier = deps.randomVerifier?.();
            if (typeof verifier !== 'string' || verifier === '') throw new AuthError('unexpected');
            const nonce = await auth.requestWebNonce(await sha256Base64Url(verifier));
            const hashedNonce = await sha256Base64Url(nonce);
            const code = await withTimeout(
              () => authCodeProvider.getAuthorizationCode(hashedNonce),
              providerTimeoutMs,
            );
            if (typeof code !== 'string' || code === '') throw new AuthError('invalid-response');
            session = await auth.loginWithAppleCode({ code, nonce, verifier });
          }

          try {
            await sessions.set({ session, provider, localDataId: dataId });
          } catch {
            // 保存できないと、端末はこのセッションを二度と使えない。サーバーに残さない（失敗は無視）。
            await revokeQuietly(session);
            throw new AuthError('storage-failed');
          }
          // 上書きした別のDBのセッションは、端末のどこにも値が残らず、ログアウトの入口（サインイン中にしか
          // 出ない）からも失効させられない。失効の機会は、ここだけ。保存のあとにするのは、各社の画面を開く前に
          // 通信を待たせず（応答が無いと最大10秒）、直前のログインで通信できると分かっているため。取りやめや失敗
          // で保存まで進まなければ、値は端末に残り、次のサインインで失効させる。
          if (stale) await revokeQuietly(stale.session);
        }),
      );
    },

    signOut() {
      return serialize(() =>
        asAuthError(async () => {
          // 読めたセッションは、別のローカルDBのもの（再インストール前の残り）でも、サーバー側に実在する
          // ので、失効させる。
          const read = await sessions.read();
          // 端末の値を先に捨てる。サーバーへの要求の途中でアプリが終わっても、端末はログアウトした状態に
          // なる。捨てられなければ（読み戻しで残っていた場合を含む）、ここで止める（ログアウトできて
          // いないことを、成功に見せない。サーバーへも送らない）。読めなかったときも消す。
          try {
            await sessions.clear();
          } catch {
            throw new AuthError('storage-failed');
          }
          if (read.kind === 'none') return { serverRevoked: true };
          // 値が残っているかもしれないが、読めず、失効させるものを特定できない。
          if (read.kind === 'unreadable') return { serverRevoked: false };
          try {
            await auth.logout(read.value.session);
          } catch (error) {
            // 401 はヘッダーの形が違うときだけ（失効するものが無い）。それ以外は、確認できなかった。
            if (!(error instanceof AuthError && error.code === 'unauthorized')) {
              return { serverRevoked: false };
            }
          }
          return { serverRevoked: true };
        }),
      );
    },

    signOutOthers() {
      return serialize(() =>
        asAuthError(async () => {
          const current = await requireSession();
          await authorized(() => auth.logoutOthers(current.session));
        }),
      );
    },

    deleteAccount() {
      return serialize(() =>
        asAuthError(async () => {
          const current = await requireSession();
          const { provider } = current;
          const idTokenProvider = idTokenProviders[provider];
          const authCodeProvider = idTokenProvider ? undefined : authCodeProviders[provider];
          if (!idTokenProvider && !authCodeProvider) throw new AuthError('provider-unavailable');

          // 再認証。ログインと同じ手順で、`T` を得て、各社のサインインを開く（`signIn` と同じ時間の上限）。
          let request: DeleteAccountRequest;
          if (idTokenProvider) {
            const nonce = await auth.requestNonce();
            const hashedNonce = await sha256Base64Url(nonce);
            if (provider === 'apple') {
              const credential = await withTimeout(
                async (): Promise<{ idToken: string; authorizationCode?: string }> =>
                  idTokenProvider.getIdTokenWithCode
                    ? idTokenProvider.getIdTokenWithCode(hashedNonce)
                    : { idToken: await idTokenProvider.getIdToken(hashedNonce) },
                providerTimeoutMs,
              );
              if (typeof credential.idToken !== 'string' || credential.idToken === '') throw new AuthError('invalid-response');
              request = {
                provider: 'apple',
                nonce,
                idToken: credential.idToken,
                ...(typeof credential.authorizationCode === 'string' && credential.authorizationCode !== ''
                  ? { authorizationCode: credential.authorizationCode }
                  : {}),
              };
            } else {
              const idToken = await withTimeout(() => idTokenProvider.getIdToken(hashedNonce), providerTimeoutMs);
              if (typeof idToken !== 'string' || idToken === '') throw new AuthError('invalid-response');
              request = { provider: 'google', nonce, idToken };
            }
          } else {
            if (!authCodeProvider || provider !== 'apple') throw new AuthError('provider-unavailable');
            const verifier = deps.randomVerifier?.();
            if (typeof verifier !== 'string' || verifier === '') throw new AuthError('unexpected');
            const nonce = await auth.requestWebNonce(await sha256Base64Url(verifier));
            const hashedNonce = await sha256Base64Url(nonce);
            const code = await withTimeout(() => authCodeProvider.getAuthorizationCode(hashedNonce), providerTimeoutMs);
            if (typeof code !== 'string' || code === '') throw new AuthError('invalid-response');
            request = { provider: 'apple', nonce, code, verifier };
          }

          // 要求を送ったあとの通信の失敗は、結果が分からない（サーバーで済んでいるかもしれない）。送る前の失敗
          // （上の `T` の取得）と区別して、画面が、それぞれの文言を出せるようにする。
          const result = await authorized(async () => {
            try {
              return await auth.deleteAccount(current.session, request);
            } catch (error) {
              if (error instanceof AuthError && error.code === 'network') throw new AuthError('delete-unconfirmed');
              throw error;
            }
          });
          // アカウントは消えた。端末のセッションは、もう使えないので捨てる。捨てられなくても、削除は成功のまま
          // （残った値は、次に認証が要る呼び出しをしたとき 401 になり、そこで捨てる）。画面には `sessionCleared` で伝える。
          let sessionCleared = true;
          try {
            await sessions.clear();
          } catch {
            sessionCleared = false;
          }
          return { appleRevoked: result.appleRevoked, sessionCleared };
        }),
      );
    },
  };
}
