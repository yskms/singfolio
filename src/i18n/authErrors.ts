import { AuthError, type AuthErrorCode } from '../services/errors.ts';
import type { MessageKey } from './en.ts';

/** アカウントの失敗の文言のキー。値（`{name}`）の要らない文言だけなので、`t(key)` とそのまま呼べる。 */
export type AccountErrorMessageKey = Extract<MessageKey, `account.error.${string}` | 'error.unexpected'>;

/** アカウントの画面の操作。同じ失敗でも、操作によって、利用者に伝えることが違う。 */
export type AccountAction = 'signIn' | 'signOut' | 'signOutOthers' | 'deleteAccount';

// 操作ごとの、失敗の種類 → 文言。ここに無い種類は、アプリの不具合として `error.unexpected`。
// `null` は、何も出さない（取りやめは、エラーではない。`already-signed-in` は、画面が状態を読み直すので、
// 文言は要らない）。
//
// 文言の方針（docs §8「アプリ側の認証の土台」の「失敗の分類」）:
// - `provider-failed` は、端末の状態が原因とは限らない（アプリ側の設定の不備でも同じになる）ので、
//   原因を言い切らず、強く出さない（OSのシートを「閉じる」も、これになる）。
// - アカウントの削除は、要求（`/auth/delete`）を送ったあとの通信の失敗と読めない応答だけが `delete-unconfirmed`（サーバーで削除が
//   済んでいるかもしれない。やり直すと 401 になり、端末のセッションは捨てられる）。送る前（`T` の取得）の通信の失敗は、
//   何も消えていないので、ふつうの `network`。
// - 削除の 401（`unauthorized`）は、削除の再試行とは限らない（別の端末の「ほかの端末をすべてサインアウト」や、90日使わない
//   失効のあとでも、再認証を済ませてから返る）。「削除済みかもしれない」と「残っているなら、サインインし直して削除」を、
//   両方伝える。
// - 削除の再認証の画面が終わらなかった（`provider-failed`）・時間切れ（`timeout`）は、「本人確認ができず、削除していない」。
const messages: Record<AccountAction, Partial<Record<AuthErrorCode, AccountErrorMessageKey | null>>> = {
  signIn: {
    cancelled: null,
    'already-signed-in': null,
    network: 'account.error.network',
    unavailable: 'account.error.unavailable',
    unauthorized: 'account.error.signInFailed',
    'provider-failed': 'account.error.providerFailed',
    'provider-unavailable': 'account.error.providerUnavailable',
    timeout: 'account.error.timeout',
    'storage-failed': 'account.error.signInStorageFailed',
  },
  signOut: {
    'storage-failed': 'account.error.signOutFailed',
  },
  signOutOthers: {
    network: 'account.error.network',
    unavailable: 'account.error.unavailable',
    // 401: サーバーがこのセッションを認めない（端末のセッションは捨てられている）。
    unauthorized: 'account.error.signedOut',
    'not-signed-in': 'account.error.signedOut',
  },
  deleteAccount: {
    cancelled: null,
    network: 'account.error.network',
    'delete-unconfirmed': 'account.error.deleteUnconfirmed',
    unavailable: 'account.error.unavailable',
    unauthorized: 'account.error.deleteSignedOut',
    'not-signed-in': 'account.error.signedOut',
    'reauth-failed': 'account.error.reauthFailed',
    'account-mismatch': 'account.error.accountMismatch',
    'provider-failed': 'account.error.reauthFailed',
    'provider-unavailable': 'account.error.providerUnavailable',
    timeout: 'account.error.reauthFailed',
  },
};

/**
 * アカウントの操作の失敗に対応する文言のキー。何も出さないときは `null`（取りやめなど）。
 * `AuthError` 以外の失敗は、想定外として汎用の文言にする（Serviceは `AuthError` に包むので、普通は届かない）。
 */
export function accountErrorMessageKey(error: unknown, action: AccountAction): AccountErrorMessageKey | null {
  if (!(error instanceof AuthError)) return 'error.unexpected';
  const key = messages[action][error.code];
  return key === undefined ? 'error.unexpected' : key;
}
