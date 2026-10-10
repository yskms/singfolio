import type { CatalogSong } from '../repositories/songCatalogRepository.ts';
import { normalizeText, searchKey } from './text.ts';

// 候補の並べ方・結合の、DBにも通信にも触れない規則。画面からも直接importしてよい
// （アーティストの候補の結合を、Serviceと同じ判定にそろえるため。CLAUDE.md）。

/** 外部の検索に出す曲の候補・アーティストの候補の最大数（キーボードの上に収めるため）。 */
export const MAX_SONG_SUGGESTIONS = 5;
export const MAX_ARTIST_SUGGESTIONS = 4;

/** 外部の検索に出す最小の検索語の長さ（`searchKey` で比べた後）。 */
export const MIN_CATALOG_TERM_LENGTH = 2;

/** 曲名・アーティストを比べるためのキー（重複の判定）。 */
export function pairKey(title: string, artist: string): string {
  return `${searchKey(title)}\u0000${searchKey(artist)}`;
}

// 版の表記。原曲より後ろに並べる目印（削らない。選びたい人もいる）。英単語は、`Alive` の
// `live` などに反応しないよう、単語の境目で見る。日本語は境目が無いので、含むかで見る。
const VARIANT_WORDS =
  /\b(live|cover|karaoke|instrumental|off[ -]?vocal|acoustic|remix|medley|tribute|demo|music box|first take|version|remaster(?:ed)?)\b|\bver\./i;
const VARIANT_JAPANESE = /(ライブ|カバー|カラオケ|インスト|オフボーカル|アコースティック|リミックス|メドレー|トリビュート|オルゴール|ガイド)/;
const VARIANT_GENRE = /(instrumental|karaoke|インストゥルメンタル|カラオケ)/i;

/** Live・Cover・Karaoke・オルゴールなど、原曲ではない版の表記を含むか。 */
export function isVariant(title: string, genre: string | null): boolean {
  return (
    VARIANT_WORDS.test(title) ||
    VARIANT_JAPANESE.test(title) ||
    (genre !== null && VARIANT_GENRE.test(genre))
  );
}

/**
 * 外部の検索の結果から、曲の候補を作る。
 * - 曲名・アーティストを正規化し（保存する形）、空のものを除く。
 * - （曲名, アーティスト）の `searchKey` の組が同じものは、最初の1つだけにする。
 * - 版の表記を含むものを、削らずに後ろへ回す。それ以外の並び（提供元の関連順）は保つ。
 * - 既に曲にある組（`registeredKeys`。`pairKey`）には `registered` を付ける。
 * 整形（`(Live)` などを削る）はしない。選んだ後に編集できる。
 */
export function rankSongSuggestions(
  found: readonly CatalogSong[],
  registeredKeys: ReadonlySet<string>,
  limit: number = MAX_SONG_SUGGESTIONS,
): { title: string; artist: string; registered: boolean }[] {
  const seen = new Set<string>();
  const originals: { title: string; artist: string; registered: boolean }[] = [];
  const variants: { title: string; artist: string; registered: boolean }[] = [];
  for (const song of found) {
    const title = normalizeText(song.title);
    const artist = normalizeText(song.artist);
    if (title === '' || artist === '') continue;
    const key = pairKey(title, artist);
    if (seen.has(key)) continue;
    seen.add(key);
    const suggestion = { title, artist, registered: registeredKeys.has(key) };
    (isVariant(title, song.genre) ? variants : originals).push(suggestion);
  }
  return [...originals, ...variants].slice(0, limit);
}

// 共演の表記（`A & B`、`A feat. B`、`A × B`、`A, B`）。分割はしない（選んだ後に編集できる）。
const COLLABORATION = /( & | feat\.? | ft\.? | with | x |×|、|, )/i;

/** 共演の表記を含むアーティスト名か（単独の名前より後ろに並べる目印）。 */
export function isCollaboration(artist: string): boolean {
  return COLLABORATION.test(artist);
}

/**
 * 外部の検索の結果から、アーティストの候補を作る（正規化し、`searchKey` で重複を除く。
 * 共演の表記は削らずに後ろへ回す。元の並びは保つ）。
 */
export function rankArtistNames(found: readonly string[]): string[] {
  const seen = new Set<string>();
  const solo: string[] = [];
  const collaborations: string[] = [];
  for (const name of found) {
    const artist = normalizeText(name);
    if (artist === '') continue;
    const key = searchKey(artist);
    if (seen.has(key)) continue;
    seen.add(key);
    (isCollaboration(artist) ? collaborations : solo).push(artist);
  }
  return [...solo, ...collaborations];
}

/**
 * アーティストの候補を結合する。登録済み（`local`）を先に、外部（`catalog`）を後に並べ、
 * `searchKey` が同じものは先の1つだけにする（登録済みの表記を優先する）。入力欄と同じ文字列
 * （`typed`）は出さない（既に入力されているため）。
 */
export function mergeArtistSuggestions(
  local: readonly string[],
  catalog: readonly string[],
  typed: string,
  limit: number = MAX_ARTIST_SUGGESTIONS,
): string[] {
  const typedText = normalizeText(typed);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...local, ...catalog]) {
    const key = searchKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (name === typedText) continue;
    merged.push(name);
  }
  return merged.slice(0, limit);
}
