import { DatabaseTooNewError, ServiceError, type ServiceErrorCode } from '../services/errors.ts';
import type { MessageKey } from './en.ts';

/** エラーの文言のキー。値（`{name}`）の要らない文言だけなので、`t(key)` とそのまま呼べる。 */
export type ErrorMessageKey = Extract<MessageKey, `error.${string}`>;

// ServiceErrorCode → 利用者向けの文言。全コードを持つ（足し忘れは型エラー）。
// 利用者の操作では起きない（UIが選ばせる値の検証など）ものは、汎用の文言にする。
const errorMessageKeys: Record<ServiceErrorCode, ErrorMessageKey> = {
  'title-required': 'error.titleRequired',
  'artist-required': 'error.artistRequired',
  'song-not-found': 'error.songNotFound',
  'tag-not-found': 'error.tagNotFound',
  'tag-name-required': 'error.tagNameRequired',
  'tag-name-duplicate': 'error.tagNameDuplicate',
  'invalid-status': 'error.unexpected',
  'invalid-key-offset': 'error.unexpected',
  'invalid-appearance': 'error.unexpected',
  'invalid-language': 'error.unexpected',
};

/** 失敗（`ServiceError` ならその `code`、それ以外は想定外）に対応する文言のキー。 */
export function errorMessageKey(error: unknown): ErrorMessageKey {
  return error instanceof ServiceError ? errorMessageKeys[error.code] : 'error.unexpected';
}

/** エラー画面（起動時の失敗など、画面全体に出す失敗）の文言のキー。 */
export type ErrorScreenMessageKey = Extract<MessageKey, `errorScreen.${string}`>;

export interface ErrorScreenContent {
  titleKey: ErrorScreenMessageKey;
  messageKey: ErrorScreenMessageKey;
  /** 「もう一度試す」を出すか。やり直しても直らない失敗では出さない。 */
  canRetry: boolean;
}

/**
 * エラー画面に出す内容。アプリより新しいDBは、やり直しても開けないため、再試行ではなく
 * アプリの更新を促す。それ以外（DBを開けない・画面の描画の失敗など）は、原因を利用者に
 * 説明できないので汎用の文言にし、やり直せるようにする。
 */
export function errorScreenContent(error: unknown): ErrorScreenContent {
  if (error instanceof DatabaseTooNewError) {
    return { titleKey: 'errorScreen.updateTitle', messageKey: 'errorScreen.updateMessage', canRetry: false };
  }
  return { titleKey: 'errorScreen.title', messageKey: 'errorScreen.message', canRetry: true };
}
