// Googleのサインイン（iOS・Android）。IDトークンを得るところまで。`account` Service に `IdTokenProvider` として
// 注入する（`services/index.ts`）。画面・Serviceは、SDKの呼び出しを知らない。
//
// 自作のExpoモジュール（`modules/singfolio-google-signin`。Googleの公式SDKだけを使う）は注入する。
// `src/` はNodeのテストから直接実行するので、ここではimportしない（Nodeのテストは偽物で動かす）。
//
// 守ること:
// - `nonce` には、渡された値（`SHA-256(T)` の base64url）をそのまま入れる。ここで変換しない。
//   IDトークンの `nonce` が、それそのままになることは確かめてある（docs §8「Googleのサインイン」）。
// - スコープは指定しない。Googleは `email`・`profile` を外せず、IDトークンに `email`・`name` なども入るが、
//   使うのは `sub` だけ（docs §8）。ここでは、トークンの中身を読まない。
// - IDトークン・SDKの例外の内容を、エラーの `message` にもログにも出さない。失敗は `code`（`AuthError`）
//   だけで伝える。

import { AuthError } from './authError.ts';

/** `modules/singfolio-google-signin` のうち、ここで使う部分。 */
export interface GoogleSignInLike {
  signInWithGoogle(nonce: string): Promise<string>;
}

/** `account` Service の `IdTokenProvider` と同じ形（Repositoryから Service の型には依存しない）。 */
export interface GoogleIdTokenProvider {
  getIdToken(hashedNonce: string): Promise<string>;
}

// ネイティブ側（`SingfolioGoogleSignInModule.swift`・`.kt`）が投げる失敗のコード。
// - ERR_NO_ACCOUNT: Androidで、端末にGoogleアカウントが無い（`NoCredentialException`）。
// - ERR_FAILED: 取りやめ以外の、SDKの失敗すべて（iOSは GIDSignIn のエラー、Androidは Credential Manager の
//   例外。Play services が使えない、通信できない、なども含む）。
// - ERR_NO_PRESENTER: 画面を出す先（Activity・ViewController）が無い。アプリが前面でないときなど。
// いずれも、端末の状態が原因とは限らない（アプリ側の設定の不備でも起きうる）ので、`provider-failed`
// （原因を言い切らない。やり直せる）にする。
const FAILED_CODES = new Set(['ERR_NO_ACCOUNT', 'ERR_FAILED', 'ERR_NO_PRESENTER']);

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

export function createGoogleSignInRepository(google: GoogleSignInLike): GoogleIdTokenProvider {
  return {
    async getIdToken(hashedNonce) {
      let idToken: unknown;
      try {
        idToken = await google.signInWithGoogle(hashedNonce);
      } catch (error) {
        const code = codeOf(error);
        if (code === 'ERR_CANCELED') throw new AuthError('cancelled');
        if (code !== null && FAILED_CODES.has(code)) throw new AuthError('provider-failed');
        // モジュールが組み込まれていない（古いビルドなど）。この端末では、Googleのサインインは使えない。
        if (code === 'ERR_UNAVAILABLE') throw new AuthError('provider-unavailable');
        // SDKは成功したのにIDトークンを取り出せなかった。アプリかSDKの不具合。
        if (code === 'ERR_NO_ID_TOKEN') throw new AuthError('invalid-response');
        // ERR_NOT_CONFIGURED（クライアントIDがビルドに入っていない。アプリの不具合）、知らないコード、
        // コードの無い例外など。元の例外は載せない。
        throw new AuthError('unexpected');
      }
      if (typeof idToken !== 'string' || idToken === '') {
        throw new AuthError('invalid-response');
      }
      return idToken;
    },
  };
}
