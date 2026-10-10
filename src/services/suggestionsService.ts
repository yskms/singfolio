import type { Database } from '../db/appDatabase.ts';
import type { Language, SongSuggestion } from '../domain/types.ts';
import {
  CatalogError,
  storeForLanguage,
  type SongCatalogRepository,
} from '../repositories/songCatalogRepository.ts';
import type { SongRepository } from '../repositories/songRepository.ts';
import {
  MAX_ARTIST_SUGGESTIONS,
  MIN_CATALOG_TERM_LENGTH,
  pairKey,
  rankArtistNames,
  rankSongSuggestions,
} from './suggestionRules.ts';
import { normalizeText, searchKey } from './text.ts';

export interface SuggestionsServiceDeps {
  db: Database;
  songs: SongRepository;
  /** 外部の楽曲検索。`null` なら（注入しなければ）外部へは何も送らない。 */
  catalog: SongCatalogRepository | null;
  /** 設定で外部の検索がオンか（`settings.getSuggestionsEnabled`）。 */
  isEnabled(): Promise<boolean>;
  /** 現在時刻（Unixエポックのミリ秒）。テストで差し替える。 */
  now(): number;
}

// 外部の検索への送信の制御。値はここだけに置く（docsには、あることだけを書く）。
// 公式の制限は約20回/分（適用単位は明記なし）。それを下回る予算にする。入力が止まるたびに送る
// ため、debounceだけでは上限にならない。端末ごとの制御なので、同じ回線を多くの人が共有する
// 状況までは守れない。制限に当たっても、候補が出なくなるだけで、入力も保存もできる。
const MAX_REQUESTS_PER_MINUTE = 15;
const BUDGET_WINDOW_MS = 60_000;
/** 回数の制限（HTTP 429など）の後に、送らない時間。実測では数秒で回復したが、余裕を見る。 */
const PAUSE_AFTER_RATE_LIMIT_MS = 30_000;
/** それ以外の失敗（通信できない・遅い・想定外の応答）の後に、送らない時間。 */
const PAUSE_AFTER_FAILURE_MS = 5_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 50;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// 外部の検索は、いつでも失敗しうる。失敗は「候補が出ない」だけにして、reject しない。
// 書き込みは行わない（読み取りだけ）ので、`db.transaction` は使わない。
export function createSuggestionsService({ db, songs, catalog, isEnabled, now }: SuggestionsServiceDeps) {
  const cache = new Map<string, { at: number; value: unknown }>();
  const inFlight = new Map<string, Promise<unknown>>();
  let sentAt: number[] = [];
  let pausedUntil = 0;

  /**
   * 外部の検索を、キャッシュ・同時リクエストの共有・予算・一時停止を通して行う。送らなかった
   * （予算切れ・一時停止中）、または失敗したときは `null`。**失敗はキャッシュしない**
   * （0件の成功だけをキャッシュする。失敗を「見つからなかった」と覚えると、直った後も出ない）。
   */
  async function throttled<T>(key: string, send: () => Promise<T>): Promise<T | null> {
    const time = now();
    const hit = cache.get(key);
    if (hit && time - hit.at < CACHE_TTL_MS) {
      cache.delete(key);
      cache.set(key, hit); // 使った順に並べ直す（古いものから捨てる）
      return hit.value as T;
    }
    const pending = inFlight.get(key);
    if (pending) return (await pending) as T | null;
    if (time < pausedUntil) return null;
    sentAt = sentAt.filter((sent) => time - sent < BUDGET_WINDOW_MS);
    if (sentAt.length >= MAX_REQUESTS_PER_MINUTE) return null;
    sentAt.push(time);

    const request = send()
      .then(
        (value): T | null => {
          cache.set(key, { at: now(), value });
          while (cache.size > CACHE_MAX_ENTRIES) {
            const oldest = cache.keys().next();
            if (oldest.done) break;
            cache.delete(oldest.value);
          }
          return value;
        },
        (error: unknown): null => {
          const rateLimited = error instanceof CatalogError && error.code === 'rate-limited';
          pausedUntil = now() + (rateLimited ? PAUSE_AFTER_RATE_LIMIT_MS : PAUSE_AFTER_FAILURE_MS);
          return null;
        },
      )
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  /** 外部へ送ってよいか: 提供元がある・設定がオン・検索語が短すぎない。 */
  async function mayQuery(term: string): Promise<boolean> {
    if (catalog === null || searchKey(term).length < MIN_CATALOG_TERM_LENGTH) return false;
    return isEnabled();
  }

  return {
    /** 外部の検索が組み込まれているか（画面が、設定の切替・提供元の表記を出すかを決める）。 */
    available: catalog !== null,

    /**
     * 登録済みのアーティストのうち、`text` に合うもの（`searchKey` で、含むもの。前方一致を先に、
     * 曲数の多い順）。端末内だけで、何も送らない。入力と同じ文字列は出さない。
     */
    async localArtists(text: string): Promise<string[]> {
      const key = searchKey(text);
      if (key === '') return [];
      const typed = normalizeText(text);
      const counts = new Map<string, number>();
      for (const { artist } of await songs.listTitleArtistPairs(db)) {
        counts.set(artist, (counts.get(artist) ?? 0) + 1);
      }
      const found = [...counts]
        .filter(([artist]) => artist !== typed && searchKey(artist).includes(key))
        .map(([artist, count]) => ({ artist, count, prefix: searchKey(artist).startsWith(key) }));
      found.sort(
        (a, b) =>
          Number(b.prefix) - Number(a.prefix) || b.count - a.count || compareText(a.artist, b.artist),
      );
      return found.slice(0, MAX_ARTIST_SUGGESTIONS).map(({ artist }) => artist);
    },

    /**
     * 外部の検索で見つかったアーティスト名（共演の表記は後ろ）。送れない・失敗したときは空。
     * 登録済みのアーティストとの結合は、画面が `mergeArtistSuggestions` で行う。
     */
    async catalogArtists({ artist, language }: { artist: string; language: Language }): Promise<string[]> {
      const term = normalizeText(artist);
      if (catalog === null || !(await mayQuery(term))) return [];
      const store = storeForLanguage(language);
      const found = await throttled(`${store}|artist|${term}`, () => catalog.searchArtists(term, store));
      return found === null ? [] : rankArtistNames(found);
    },

    /**
     * 外部の検索で見つかった曲の候補。アーティストが入っていれば、検索語に加える（その
     * アーティストの曲が上に来る。絞り込みではない）。送れない・失敗したときは空。
     * 既に曲にある（曲名, アーティスト）には `registered` を付ける。
     */
    async catalogSongs({
      title,
      artist,
      language,
    }: {
      title: string;
      artist: string;
      language: Language;
    }): Promise<SongSuggestion[]> {
      const titleText = normalizeText(title);
      if (catalog === null || !(await mayQuery(titleText))) return [];
      const artistText = normalizeText(artist);
      const term = artistText === '' ? titleText : `${titleText} ${artistText}`;
      const store = storeForLanguage(language);
      const found = await throttled(`${store}|song|${term}`, () => catalog.searchSongs(term, store));
      if (found === null) return [];
      const registered = new Set(
        (await songs.listTitleArtistPairs(db)).map((song) => pairKey(song.title, song.artist)),
      );
      return rankSongSuggestions(found, registered);
    },
  };
}

export type SuggestionsService = ReturnType<typeof createSuggestionsService>;
