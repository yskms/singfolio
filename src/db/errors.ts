/**
 * アプリが知っているバージョンより新しいスキーマのDB（新しいアプリで作られたDBを、
 * ストアで古い版へ戻したアプリで開いた場合など）。スキーマには触れずに起動を止める。
 * 起動時のエラー画面が、再試行ではなくアプリの更新を促せるよう、他の失敗と区別する。
 */
export class DatabaseTooNewError extends Error {
  /** DBのスキーマのバージョン（`PRAGMA user_version`） */
  readonly found: number;
  /** このアプリが扱える最新のバージョン */
  readonly supported: number;

  constructor(found: number, supported: number) {
    super(`Database schema version ${found} is newer than this app supports (${supported})`);
    this.name = 'DatabaseTooNewError';
    this.found = found;
    this.supported = supported;
  }
}
