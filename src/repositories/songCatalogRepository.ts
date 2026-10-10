// 曲名・アーティストの候補を探す、外部の楽曲検索（Appleの iTunes Search API。キー不要）の
// HTTP。Serviceからだけ使う。画面・Serviceは、提供元のURLやレスポンスの形を知らない。
//
// 送るのは検索語（とストア）だけ。IDも端末の情報も付けない。`fetch` は注入する
// （`createServices`）。Nodeのテストは偽の `fetch` で動かす。
//
// 実測で分かった、変えてはいけない点（2026-10）:
// - `country`（ストア）は `JP` と `US` に限る。表記と先頭の曲がストアで決まる（JP: `千本桜`
//   と原曲、US: `Senbonzakura`）。他の国は不安定（KRは0件、存在しない国はHTTP 400）。
// - `lang` は結果に影響しない。送らない。
// - アーティスト名は、アーティスト検索（`entity=musicArtist`）ではなく、曲の検索の
//   `attribute=artistTerm` から取る。前者は日本のアーティストを英字の表記
//   （`Kenshi Yonezu`）で返す。後者はタグ付けされた表記（`米津玄師`）で返る。
// - 回数の制限は、公式で約20回/分。実測で約33回/20秒でHTTP 429（数秒で回復）。制限を
//   超えたときは、403のこともあるとみて、429と同じ扱いにする。
import type { Language } from '../domain/types.ts';

/** 外部の楽曲検索のストア（`country`）。この2つに限る。 */
export type CatalogStore = 'JP' | 'US';

/** 外部の検索の結果の曲（提供元の形から変換したもの）。 */
export interface CatalogSong {
  title: string;
  artist: string;
  /** 提供元のジャンル名。無ければ `null` */
  genre: string | null;
}

export type CatalogErrorCode = 'rate-limited' | 'network' | 'invalid-response';

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CatalogError';
    this.code = code;
  }
}

/** `fetch` のうち、ここで使う部分（グローバルの `fetch` をそのまま渡せる形）。 */
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ENDPOINT = 'https://itunes.apple.com/search';
/** 1回の検索で取る件数。重複や版違いを除いた後でも、候補の数が足りるように多めに取る。 */
const RESULT_LIMIT = 25;
/** 応答を待つ上限。超えたら諦めて、候補を出さない。 */
const DEFAULT_TIMEOUT_MS = 8_000;

type SearchKind = 'song' | 'artist';

/** 検索のURL。クエリはURLSearchParamsに頼らず組み立てる（RNの実装が不完全なため）。 */
export function buildSearchUrl(term: string, store: CatalogStore, kind: SearchKind): string {
  const query = [
    `term=${encodeURIComponent(term)}`,
    'media=music',
    'entity=song',
    `country=${store}`,
    `limit=${RESULT_LIMIT}`,
  ];
  if (kind === 'artist') query.push('attribute=artistTerm');
  return `${ENDPOINT}?${query.join('&')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 提供元の応答から、曲の一覧を取り出す。形が違うものは `invalid-response`。 */
function parseSongs(data: unknown): CatalogSong[] {
  if (!isRecord(data) || !Array.isArray(data.results)) {
    throw new CatalogError('invalid-response');
  }
  const songs: CatalogSong[] = [];
  for (const item of data.results as unknown[]) {
    if (!isRecord(item)) continue;
    const { trackName, artistName, primaryGenreName } = item;
    if (typeof trackName !== 'string' || typeof artistName !== 'string') continue;
    songs.push({
      title: trackName,
      artist: artistName,
      genre: typeof primaryGenreName === 'string' ? primaryGenreName : null,
    });
  }
  return songs;
}

export function createSongCatalogRepository(
  fetchImpl: FetchLike,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(url, { signal: controller.signal });
      } catch (error) {
        throw new CatalogError('network', error instanceof Error ? error.message : undefined);
      }
      if (response.status === 429 || response.status === 403) throw new CatalogError('rate-limited');
      if (!response.ok) throw new CatalogError('invalid-response', `HTTP ${response.status}`);
      try {
        return await response.json();
      } catch {
        throw new CatalogError('invalid-response');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** 検索語に合う曲（関連の高い順）。失敗は `CatalogError`。 */
    async searchSongs(term: string, store: CatalogStore): Promise<CatalogSong[]> {
      return parseSongs(await request(buildSearchUrl(term, store, 'song')));
    },

    /** 検索語に合う曲のアーティスト名（重複なし。出てきた順）。失敗は `CatalogError`。 */
    async searchArtists(term: string, store: CatalogStore): Promise<string[]> {
      const songs = parseSongs(await request(buildSearchUrl(term, store, 'artist')));
      return [...new Set(songs.map((song) => song.artist))];
    },
  };
}

export type SongCatalogRepository = ReturnType<typeof createSongCatalogRepository>;

/** 候補を探すストア。表示言語から決める（理由は上のコメント）。 */
export function storeForLanguage(language: Language): CatalogStore {
  return language === 'ja' ? 'JP' : 'US';
}
