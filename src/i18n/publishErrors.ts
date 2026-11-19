import { AuthError, PublishError } from '../services/errors.ts';
import type { MessageKey } from './en.ts';

/** Public Profile の失敗の文言のキー。値（`{name}`）の要らない文言だけなので、`t(key)` とそのまま呼べる。 */
export type PublicProfileErrorMessageKey = Extract<
  MessageKey,
  `publicProfile.error.${string}` | 'account.error.network' | 'account.error.unavailable' | 'account.error.signedOut' | 'error.unexpected'
>;

/** Public Profile の画面の操作。同じ失敗でも、操作によって、利用者に伝えることが違う。 */
export type PublicProfileAction = 'load' | 'claimUsername' | 'publish' | 'unpublish';

/**
 * Public Profile の操作の失敗に対応する文言のキー。
 *
 * - 通信の失敗（`AuthError`）: 操作に依らず同じ。ただし **Publish の `network` だけは**、応答を受け取れなかっただけで、サーバーでは
 *   済んでいることがある（docs §8「Publish と Unpublish のエンドポイント」）ので、「公開されたか分からない」と伝える。
 * - 401（`unauthorized`）・サインインしていない（`not-signed-in`）: 端末のセッションは捨てられている。
 * - サーバーが理由を返して断ったもの（`PublishError`）: それぞれの文言。`version-conflict` は文言ではなく確認のダイアログで
 *   扱うので、ここに来たら想定外（`profile` が無いなど）。
 * - ここに無い失敗（`invalid-request`・`invalid-response`・`invalid-snapshot` など、アプリ側の不具合か、読めない応答）は、汎用の文言。
 */
export function publicProfileErrorMessageKey(error: unknown, action: PublicProfileAction): PublicProfileErrorMessageKey {
  if (error instanceof PublishError) {
    switch (error.code) {
      case 'username-invalid':
        return 'publicProfile.error.usernameInvalid';
      case 'username-unavailable':
        return 'publicProfile.error.usernameUnavailable';
      case 'username-already-set':
        return 'publicProfile.error.usernameAlreadySet';
      case 'username-required':
        return 'publicProfile.error.usernameRequired';
      case 'display-name-required':
        return 'publicProfile.error.displayNameRequired';
      case 'too-many-songs':
        return 'publicProfile.error.tooManySongs';
      case 'too-large':
        return 'publicProfile.error.tooLarge';
      default:
        return 'error.unexpected';
    }
  }
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'network':
        return action === 'publish' ? 'publicProfile.error.publishNetwork' : 'account.error.network';
      case 'unavailable':
        return 'account.error.unavailable';
      case 'unauthorized':
      case 'not-signed-in':
        return 'account.error.signedOut';
      default:
        return 'error.unexpected';
    }
  }
  return 'error.unexpected';
}

/**
 * 失敗のあとに、サーバーの状態を読み直して画面を作り直すべきか: サインインが外れた（401）、または画面の前提（`username` の有無）が
 * サーバーの状態と食い違っていた。
 */
export function needsProfileReload(error: unknown): boolean {
  if (error instanceof PublishError) return error.code === 'username-required' || error.code === 'username-already-set';
  if (error instanceof AuthError) return error.code === 'unauthorized' || error.code === 'not-signed-in';
  return false;
}
