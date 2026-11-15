import type { AuthProvider } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import type { AuthRepository } from '../repositories/authRepository.ts';
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
}

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

export interface AccountService {
  /** サインイン中のログイン手段。していなければ `null`。セッションの値は渡さない。 */
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
      getSignedInProvider: async () => null,
      signIn: async () => {
        throw new AuthError('provider-unavailable');
      },
      signOut: async () => ({ serverRevoked: true }),
    };
  }
  const { auth, sessions, sha256Base64Url, localDataId, idTokenProviders } = deps;

  // サインインとログアウトは1本ずつ順に実行する。サインインの途中（各社の画面を開いている間）に
  // ログアウトが走ると、ログアウトの後にセッションが保存されて、ログアウトできていないことになる。
  // 各社のサインインが終わらないと、後ろのログアウトも待ち続ける（上限は、7.3.7 で `IdTokenProvider` を
  // 実装するときに決める。WBS）。
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
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

  /** 今のローカルDBに属するサインイン中のセッション。無い・読めない・別のDBのものは `null`。 */
  async function currentSession(): Promise<StoredSession | null> {
    const read = await sessions.read();
    if (read.kind !== 'found') return null;
    return read.value.localDataId === (await localDataId()) ? read.value : null;
  }

  return {
    async getSignedInProvider() {
      return (await currentSession())?.provider ?? null;
    },

    signIn(provider) {
      return serialize(() =>
        asAuthError(async () => {
          const idTokenProvider = idTokenProviders[provider];
          if (!idTokenProvider) throw new AuthError('provider-unavailable');
          if (await currentSession()) throw new AuthError('already-signed-in');
          // 読めない・別のDBのセッションが残っていても、サインインは進める（上書きする）。読めないだけで
          // 止めると、壊れた値が残る端末は、二度とサインインできない。上書きされたセッションは、サーバーに
          // 残る（最後の利用から90日で切れる。ログアウトで失効を確認できない場合と同じ）。
          const dataId = await localDataId();

          // nonce の元 `T` を得て、そのハッシュを各社のサインインに渡す（リプレイ対策。§8）。
          // `T` は5分で切れるので、各社の画面を開いたまま放置すると、ログインは 401 になる（やり直す）。
          const nonce = await auth.requestNonce();
          const idToken = await idTokenProvider.getIdToken(await sha256Base64Url(nonce));
          if (typeof idToken !== 'string' || idToken === '') throw new AuthError('invalid-response');

          const session = await auth.login({ provider, idToken, nonce });
          try {
            await sessions.set({ session, provider, localDataId: dataId });
          } catch {
            // 保存できないと、端末はこのセッションを二度と使えない。サーバーに残さない（失敗は無視）。
            await auth.logout(session).catch(() => {});
            throw new AuthError('storage-failed');
          }
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
  };
}
