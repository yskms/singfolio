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
 * 表示言語（言語の設定そのもの。`Appearance` と違い、`system` は無い）。端末の言語は、初回起動で
 * これのどれかに当てはめて保存する（src/i18n の `deviceLanguage`）。
 * 足すときは、src/i18n の文言と、app.json の expo-localization の
 * `supportedLocales`（ios）にも足す（後者は `npm test` が食い違いを検出する）。
 */
export const LANGUAGES = ['en', 'ja'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export interface Tag {
  id: string;
  name: string;
  /** 作成日時（Unixエポックのミリ秒） */
  createdAt: number;
}

/** 端末内の曲（Local Song）。公開用のモデルとは別（My Key・Private Noteを持つ）。 */
/**
 * アーティスト。曲は、アーティストを1つ持つ（`Song.artistId`）。同じアーティストの曲は、
 * 名前と読みを共有する（読みは、アーティストごとに1か所）。曲が1つも無くなったアーティストは、
 * 自動で消える。
 */
export interface Artist {
  /** UUID */
  id: string;
  /** 表示する名前（正規化した形）。同じアーティストかは、`artistNameKey` で判定する */
  name: string;
  /**
   * 読み（並び替え用の名前）。空にならない。日本語は、かな（日本語の設定のときの入力の規則は
   * `readingProblem`）。英語は、`The` を除いた名前など、自由。並び替えは、これで行う。
   */
  reading: string;
  /** 登録日時（Unixエポックのミリ秒） */
  createdAt: number;
}

/** Artists 画面の一覧の行。 */
export interface ArtistSummary extends Artist {
  /** このアーティストの曲数（1以上） */
  songCount: number;
}

export interface Song {
  /** UUID */
  id: string;
  title: string;
  /** アーティストの名前（`Artist.name`） */
  artist: string;
  artistId: string;
  /** アーティストの読み（`Artist.reading`）。並び替え・検索に使う */
  artistReading: string;
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

/**
 * Show Mode に出すタグ。`Tag` に項目が増えても、人に見せる画面へ自動で届かないよう、必要な
 * 項目（`id` と `name`）だけを持つ（Serviceが、この2つだけを取り出して渡す）。
 */
export type ShowTag = Pick<Tag, 'id' | 'name'>;

/**
 * Show Mode に出す曲。人に見せる画面なので、管理用の情報（My Key・Private Note・ステータス）を
 * 型の上でも持たない（画面に出せないようにする。`Song` をそのまま渡さない）。アーティストは、
 * 曲の上の見出し（`ArtistGroup`）に出す。
 */
export interface ShowSong {
  id: string;
  title: string;
  tags: ShowTag[];
}

/** Show Mode の、同じアーティストの曲のまとまり（見出しは `artist`）。 */
export interface ArtistGroup {
  artist: string;
  songs: ShowSong[];
}

/** Show Mode の並び。`artist` はアーティスト別（既定）、`title` は曲名順の一覧。 */
export type ShowSort = 'artist' | 'title';

/**
 * Show Mode の曲名順の一覧の行。アーティストの見出し（`ArtistGroup`）が無いので、行にアーティスト
 * を持つ。`ShowSong` に `artist` を足さないのは、アーティスト別のときの行に要らないため。管理用の
 * 情報は、`ShowSong` と同じく持たない。
 */
export interface ShowListedSong extends ShowSong {
  artist: string;
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

/**
 * Add / Edit Song の曲の候補（曲名 / アーティスト）。保存する曲ではなく、選ぶと入力欄に
 * 入る文字列。由来（外部の候補か）も外部IDも持たない。
 */
export interface SongSuggestion {
  title: string;
  artist: string;
  /** 同じ（曲名, アーティスト）の曲が既にある（重複登録は止めない。印を付けるだけ） */
  registered: boolean;
}
