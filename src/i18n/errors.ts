import { ServiceError, type ServiceErrorCode } from '../services/errors.ts';
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
