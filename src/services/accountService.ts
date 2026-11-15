import type { AuthProvider } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import type { AuthRepository } from '../repositories/authRepository.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';

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
  /** 組み込み済みのサインイン。無いものは `signIn` が `provider-unavailable` にする。 */
  idTokenProviders: Partial<Record<AuthProvider, IdTokenProvider>>;
}

export interface SignOutResult {
  /**
   * サーバー側のセッションの失効まで確認できたか。`false` は、通信できなかった・サーバーが使えなかった
   * （端末の値は、どちらの場合も捨ててある）。サーバーに残ったセッションは、最後の利用から90日で切れる。
   * 値を持つ端末が無いので使われないが、気になるときは、別の端末から「ほかの端末をすべてログアウト」
   * （7.3.10）で消せる。
   */
  serverRevoked: boolean;
}

export interface AccountService {
  /** サインイン中のログイン手段。していなければ `null`。セッションの値は渡さない。 */
  getSignedInProvider(): Promise<AuthProvider | null>;
  /** サインインする。失敗・取りやめは `AuthError`。サインイン済みなら `already-signed-in`。 */
  signIn(provider: AuthProvider): Promise<void>;
  /** ログアウトする。端末の値は必ず捨てる（捨てられなければ投げる）。 */
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
  const { auth, sessions, sha256Base64Url, idTokenProviders } = deps;

  // サインインとログアウトは1本ずつ順に実行する。サインインの途中（各社の画面を開いている間）に
  // ログアウトが走ると、ログアウトの後にセッションが保存されて、ログアウトできていないことになる。
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }

  return {
    async getSignedInProvider() {
      return (await sessions.get())?.provider ?? null;
    },

    signIn(provider) {
      return serialize(async () => {
        const idTokenProvider = idTokenProviders[provider];
        if (!idTokenProvider) throw new AuthError('provider-unavailable');
        if (await sessions.get()) throw new AuthError('already-signed-in');

        // nonce の元 `T` を得て、そのハッシュを各社のサインインに渡す（リプレイ対策。§8）。
        // `T` は5分で切れるので、各社の画面を開いたまま放置すると、ログインは 401 になる（やり直す）。
        const nonce = await auth.requestNonce();
        const idToken = await idTokenProvider.getIdToken(await sha256Base64Url(nonce));
        if (typeof idToken !== 'string' || idToken === '') throw new AuthError('invalid-response');

        const session = await auth.login({ provider, idToken, nonce });
        try {
          await sessions.set({ session, provider });
        } catch {
          // 保存できないと、端末はこのセッションを二度と使えない。サーバーに残さない（失敗は無視）。
          await auth.logout(session).catch(() => {});
          throw new AuthError('storage-failed');
        }
      });
    },

    signOut() {
      return serialize(async () => {
        const stored = await sessions.get();
        // 端末の値を先に捨てる。サーバーへの要求の途中でアプリが終わっても、端末はログアウトした状態に
        // なる。捨てられなければここで投げる（ログアウトできていないことを、成功に見せない）。
        // 読めなかった（`get` が `null`）ときも消す。
        await sessions.clear();
        if (!stored) return { serverRevoked: true };
        try {
          await auth.logout(stored.session);
        } catch (error) {
          // 401 はヘッダーの形が違うときだけ（失効するものが無い）。それ以外は、確認できなかった。
          if (!(error instanceof AuthError && error.code === 'unauthorized')) {
            return { serverRevoked: false };
          }
        }
        return { serverRevoked: true };
      });
    },
  };
}
