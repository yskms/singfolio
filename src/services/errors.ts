// `getServices()` の起動の失敗（アプリより新しいDB）の型。UI側（src/i18n）は、DBの層ではなく
// Service層からこの型を受け取る。DBに依存しないこのファイルから出すのは、Nodeのテストが
// `index.ts`（expo-sqlite を読み込む）を経由せずに使えるようにするため。
export { DatabaseTooNewError } from '../db/errors.ts';

// UIが利用者向けの文言（多言語化の仕組みを通す）に変換できるよう、
// 失敗の種類は `message` ではなく `code` で区別する。`message` はログ用の英語。
export type ServiceErrorCode =
  | 'title-required'
  | 'artist-required'
  | 'invalid-status'
  | 'invalid-key-offset'
  | 'song-not-found'
  | 'tag-not-found'
  | 'tag-name-required'
  | 'tag-name-duplicate'
  | 'invalid-appearance'
  | 'invalid-language';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ServiceError';
    this.code = code;
  }
}
