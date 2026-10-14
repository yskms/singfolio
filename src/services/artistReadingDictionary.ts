import { artistNameKey } from './text.ts';

/**
 * アーティストの読みの辞書（`assets/artist-readings.json` の `data`）から、名前の読みを引く。
 * 辞書は、1行に `キー<TAB>読み`（キーでソート済み。`scripts/build-artist-readings.mjs` が作る。
 * MusicBrainz のコアデータ（CC0））を、改行でつないだ1つの文字列。キーは `artistNameKey`
 * （大文字小文字・全角半角を区別しない）。読みは、かなだけ（日本語の設定の規則を満たす）。
 *
 * 数十万行を、オブジェクトの索引にはしない（メモリを食う）。文字列の中を探す（`indexOf`。数MBでも
 * 数ミリ秒）。外部へは何も送らない（端末内だけ）。
 *
 * 見つからなければ `undefined`（辞書は補助。入力してもらう）。
 */
export function lookupReading(data: string, name: string): string | undefined {
  const key = artistNameKey(name);
  if (key === '' || key.includes('\t') || key.includes('\n')) return undefined;
  const prefix = `${key}\t`;
  let start: number;
  if (data.startsWith(prefix)) start = 0;
  else {
    const found = data.indexOf(`\n${prefix}`);
    if (found < 0) return undefined;
    start = found + 1;
  }
  const from = start + prefix.length;
  const end = data.indexOf('\n', from);
  const reading = data.slice(from, end < 0 ? undefined : end);
  return reading === '' ? undefined : reading;
}
