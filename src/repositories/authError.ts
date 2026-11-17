// アカウント（ログイン・ログアウト・ほかの端末のログアウト・削除）の失敗。HTTPのRepository（authRepository）と、各社のサインインの
// Repository（7.3.7 以降）が投げ、UIは Service 層（`services/index.ts`）経由で受け取る。
// 失敗の種類は `message` ではなく `code` で区別する（`message` はログ用の英語。トークン・応答の本文は
// 載せない）。
export type AuthErrorCode =
  /** 利用者が、各社のサインインの画面を取りやめた（エラーではない。何も出さない） */
  | 'cancelled'
  /** 通信できない・時間内に応答が無い。やり直せる */
  | 'network'
  /**
   * サーバーが一時的に使えない（5xx。JSONでない応答を含む。Cloudflareの 1101 や、日次の上限を超えたときの
   * 1027 など）、または回数の制限に当たった（429）。やり直せる。トークンの問題ではない
   */
  | 'unavailable'
  /** サーバーが認めなかった（401）。IDトークン・nonceの不備、nonceの期限切れ、使用済みなど。理由は区別されない */
  | 'unauthorized'
  /** サーバーが受け付けない形のリクエスト（400 など）。アプリの不具合 */
  | 'invalid-request'
  /** サーバーの応答が想定の形でない（200 なのに値が無いなど） */
  | 'invalid-response'
  /** この端末・この手段のサインインが、まだ組み込まれていない */
  | 'provider-unavailable'
  /**
   * 各社のサインインが、取りやめ以外で終わらなかった（Appleは、端末にAppleアカウントでサインインして
   * いないときなどに起きる）。アプリの不具合とは限らず、端末の設定・状態が原因のことがある。やり直せる
   */
  | 'provider-failed'
  /**
   * 各社のサインインが、時間内（`T` の期限と同じ5分）に終わらなかった。待つのをやめた（OSの画面は閉じられない
   * ので、出たままのことがある）。やり直せる
   */
  | 'timeout'
  /** すでにサインインしている。先にログアウトする */
  | 'already-signed-in'
  /** サインインしていない（ほかの端末のログアウト・アカウントの削除は、サインイン中にだけできる） */
  | 'not-signed-in'
  /**
   * アカウントの削除の再認証が通らなかった（403。IDトークン・`T` の不備、期限切れ、使用済み、認可コードの無効）。
   * サインインは保たれている（端末のセッションは捨てない）。やり直せる
   */
  | 'reauth-failed'
  /**
   * アカウントの削除の再認証は通ったが、ログイン中のアカウントとは別のアカウントだった（Apple・Googleのアカウントを
   * 取り違えている）。何も消えていない。サインインは保たれている
   */
  | 'account-mismatch'
  /**
   * 端末のセッションの保存先（SecureStore）に書けなかった、または消せなかった。サインインでは、サーバー側の
   * セッションは失効させてある。ログアウトでは、端末の値が消えていない（やり直せる）
   */
  | 'storage-failed'
  /** 想定外の失敗（各社のサインインが契約に反して投げた、ハッシュの計算に失敗した、など）。アプリの不具合 */
  | 'unexpected';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** 一時的な失敗か（同じ操作をやり直せば通りうる）。 */
export function isTemporaryAuthError(error: unknown): boolean {
  return (
    error instanceof AuthError &&
    (error.code === 'network' || error.code === 'unavailable' || error.code === 'timeout')
  );
}
