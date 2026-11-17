// Appleのサインイン（iOS。`expo-apple-authentication`）。IDトークンを得るところまで。`account` Service に
// `IdTokenProvider` として注入する（`services/index.ts`）。画面・Serviceは、SDKの呼び出しを知らない。
//
// SDK（`expo-apple-authentication`）は注入する。`src/` はNodeのテストから直接実行するので、ここでは
// importしない（Nodeのテストは偽のSDKで動かす）。
//
// 守ること:
// - 名前・メールは要求しない（`requestedScopes: []`）。ログインに要るのは `sub` だけ（docs §8）。
// - `nonce` には、渡された値（`SHA-256(T)` の base64url）をそのまま入れる。ここで変換しない。IDトークンの
//   `nonce` が、渡した値そのままかは、実際のトークンで確かめる（docs §8「認証の方式」）。
// - IDトークン・`authorizationCode`・SDKの例外の内容を、エラーの `message` にもログにも出さない。
//   失敗は `code`（`AuthError`）だけで伝える。
// - `authorizationCode`（アカウントの削除でAppleのトークンを失効させるために要る）は、サインイン（`getIdToken`）では
//   受け取っても使わず、返さない。削除のときの再認証（`getIdTokenWithCode`）でだけ返す（同じSDKの呼び出しで、同時に
//   得られる。Workerは、IDトークンで本人確認して、コードで失効させる）。

import { AuthError } from './authError.ts';

/** `expo-apple-authentication` のうち、ここで使う部分。 */
export interface AppleAuthenticationLike {
  isAvailableAsync(): Promise<boolean>;
  signInAsync(options: {
    requestedScopes: never[];
    nonce: string;
  }): Promise<{ identityToken: string | null; authorizationCode?: string | null }>;
}

/** `account` Service の `IdTokenProvider` と同じ形（Repositoryから Service の型には依存しない）。 */
export interface AppleIdTokenProvider {
  getIdToken(hashedNonce: string): Promise<string>;
  /**
   * アカウントの削除の再認証用。`getIdToken` と同じサインインで、IDトークンと、Appleのトークンを失効させるための
   * 認可コードも返す。コードが無ければ（SDKが返さない）、`authorizationCode` を付けずに返す（失効できないだけで、
   * 本人確認はできる）。
   */
  getIdTokenWithCode(hashedNonce: string): Promise<{ idToken: string; authorizationCode?: string }>;
}

// SDK（iOS）が、取りやめ以外で返す失敗。`ASAuthorizationError` の種類に対応する（`unknown` は、端末に
// Appleアカウントでサインインしていないときに出る）。コードは、Expo Modules の例外のクラス名から決まる
// （`RequestFailedException` → `ERR_REQUEST_FAILED`。`InvalidResponseException` だけは `Request` が付かない）。
// ソース（expo-apple-authentication の AppleAuthenticationExceptions.swift）で確認したもの。
const FAILED_CODES = new Set([
  'ERR_REQUEST_UNKNOWN',
  'ERR_REQUEST_FAILED',
  'ERR_REQUEST_NOT_HANDLED',
  'ERR_REQUEST_NOT_INTERACTIVE',
  'ERR_INVALID_RESPONSE',
  'ERR_REQUEST_MATCHED_EXCLUDED_CREDENTIAL',
]);

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

export function createAppleSignInRepository(apple: AppleAuthenticationLike): AppleIdTokenProvider {
  /** サインインの画面を開き、IDトークンと認可コードを得る。失敗は `AuthError`。 */
  async function signIn(hashedNonce: string): Promise<{ idToken: string; authorizationCode?: string }> {
    let identityToken: string | null;
    let authorizationCode: string | null | undefined;
    try {
      if (!(await apple.isAvailableAsync())) throw new AuthError('provider-unavailable');
      ({ identityToken, authorizationCode } = await apple.signInAsync({ requestedScopes: [], nonce: hashedNonce }));
    } catch (error) {
      if (error instanceof AuthError) throw error;
      const code = codeOf(error);
      if (code === 'ERR_REQUEST_CANCELED') throw new AuthError('cancelled');
      if (code !== null && FAILED_CODES.has(code)) throw new AuthError('provider-failed');
      // 想定していない失敗（SDKが使えない、引数の不備など）。元の例外は載せない。
      throw new AuthError('unexpected');
    }
    // 防御のための分岐。SDK（57.0.2）の `signInAsync` は、`identityToken`・`authorizationCode`・`user` の
    // どれかが欠けると、自分で `ERR_REQUEST_FAILED`（上の `provider-failed`）を投げるので、実際にはここへ
    // 届かない（SDKが変われば届きうる）。
    if (typeof identityToken !== 'string' || identityToken === '') {
      throw new AuthError('invalid-response');
    }
    return {
      idToken: identityToken,
      ...(typeof authorizationCode === 'string' && authorizationCode !== '' ? { authorizationCode } : {}),
    };
  }

  return {
    async getIdToken(hashedNonce) {
      return (await signIn(hashedNonce)).idToken;
    },
    getIdTokenWithCode: signIn,
  };
}
