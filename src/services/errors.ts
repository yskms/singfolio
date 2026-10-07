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
