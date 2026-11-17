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
// - アカウントの削除の `network` は、サーバーで削除が済んでいる可能性がある。やり直すと 401 になり、
//   端末のセッションは捨てられる。その 401（`unauthorized`）は、「ログアウトされた。削除が済んでいる
//   かもしれない」と伝える。
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
    network: 'account.error.deleteNetwork',
    unavailable: 'account.error.unavailable',
    unauthorized: 'account.error.deleteSignedOut',
    'not-signed-in': 'account.error.signedOut',
    'reauth-failed': 'account.error.reauthFailed',
    'account-mismatch': 'account.error.accountMismatch',
    'provider-failed': 'account.error.providerFailed',
    'provider-unavailable': 'account.error.providerUnavailable',
    timeout: 'account.error.timeout',
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
