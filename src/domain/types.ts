// アプリ内で扱う曲・タグのモデル。UI・Service・Repositoryが共有する。
// DBのカラム（snake_case）との対応は docs/singfolio-data-model.md を参照。

export const SONG_STATUSES = ['ready', 'practice', 'want'] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

export function isSongStatus(value: unknown): value is SongStatus {
  return SONG_STATUSES.some((status) => status === value);
}

/** 外観の設定。`system` は端末の設定に従う（既定）。 */
export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export function isAppearance(value: unknown): value is Appearance {
  return APPEARANCES.some((appearance) => appearance === value);
}

/**
 * 表示言語。端末の言語は、これのどれかに当てはめて使う（src/i18n）。
 * 足すときは、src/i18n の文言と、app.json の expo-localization の
 * `supportedLocales`（ios）にも足す（後者は `npm test` が食い違いを検出する）。
 */
export const LANGUAGES = ['en', 'ja'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

/** 言語の設定。`system` は端末の言語に従う（既定）。`Appearance` と同じ形。 */
export const LANGUAGE_SETTINGS = ['system', ...LANGUAGES] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return LANGUAGE_SETTINGS.some((setting) => setting === value);
}

export interface Tag {
  id: string;
  name: string;
  /** 作成日時（Unixエポックのミリ秒） */
  createdAt: number;
}

/** 端末内の曲（Local Song）。公開用のモデルとは別（My Key・Private Noteを持つ）。 */
export interface Song {
  /** UUID */
  id: string;
  title: string;
  artist: string;
  status: SongStatus;
  /** My Key。原曲からの半音差。`0` = Original */
  keyOffset: number;
  /** 非公開メモ。空文字 = メモなし */
  privateNote: string;
  /** タグ名の昇順（ASCIIの大文字小文字は区別しない） */
  tags: Tag[];
  /** 登録日時（Unixエポックのミリ秒） */
  createdAt: number;
  /** 最終更新日時（同上）。ユーザーが曲に対して行った編集で更新する */
  updatedAt: number;
}

export type SongSortKey = 'title' | 'artist' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

/** 曲一覧の絞り込み・並び順。指定した条件はすべて満たす曲だけを返す（AND）。 */
export interface SongListQuery {
  status?: SongStatus;
  /** このタグが付いた曲だけ（1つのみ。複数タグの絞り込みは未対応） */
  tagId?: string;
  /** 曲名またはアーティストに含まれる文字列 */
  search?: string;
  /** 既定は `updatedAt` の降順 */
  sortBy?: SongSortKey;
  direction?: SortDirection;
}
