#!/usr/bin/env node
// アーティストの読みの辞書を、MusicBrainz のコアデータ（CC0）のダンプから作る。
//
// 使い方:
//   1. ダンプ（https://data.metabrainz.org/pub/musicbrainz/data/fullexport/<日時>/mbdump.tar.bz2）から、
//      必要な表だけを取り出す（全部を保存しない。7GB を超える）:
//        mkdir out && curl -sSL <URL> | bsdtar -xqf - -C out mbdump/artist mbdump/artist_alias mbdump/artist_alias_type
//   2. node scripts/build-artist-readings.mjs <out のパス> <ダンプの名前（例: 20261014-150514）> [出力のパス（既定: assets/artist-readings.json）]
//
// 出力は JSON（`{ source, entries, data }`）。`data` は、1行に `キー<TAB>読み`（キーでソート済み）を、
// 改行でつないだ1つの文字列。キーは、アーティストの名前・別名（英字・漢字など）を `artistNameKey` に
// したもの。読みは `normalizeReading` にした、かなだけの文字列。アプリは、キーを引いて、読みの
// 初期値にする（`src/services/artistReadingDictionary.ts`）。
//
// 読みの選び方（アーティストごと）:
//   - 別名の `sort_name`（かなのもの）、無ければ別名の `name`（かなのもの）を読みの候補にする。
//     アーティスト自身の `sort_name` が、かなのときも候補にする（+120。別名の無いアーティストにも読みがある）。
//   - 点数: 言語が ja（+100）、種類が Artist name（+50）・種類なし（+10）、その言語の主たる別名（+5）。
//     点数が同じなら長いほう。同点・同じ長さで読みが割れるアーティストは、読みなしにする（誤った読みより、
//     入力してもらうほうがよい。例: 笠置シヅ子 は、種類なしの別名に、本名・芸名の読みが並ぶ）。Search hint（愛称。ミスチルなど）は、読みにもキーにも使わない。Legal name（本名）は、
//     キーにはするが、読みには使わない（本名の読みは、芸名の読みではない。例: 笠置シヅ子 の本名 かめい しずこ）。
//   - 読みの空白は詰める（MusicBrainz の並び替え用の名前は、姓と名の間を空白で区切る。そのままだと、五十音順がずれる）。
//     愛称が Artist name として登録されていて、ほかに読みが無いときは、愛称を読みにしてしまう（例: 緑黄色社会 → リョクシャカ）。
//     読みの初期値で、利用者が書き換えられるので、許容している。
//   - キーが複数のアーティストに当たり、読みが違うものは、辞書に入れない（間違えるより、入力してもらう）。
//   - 名前が、かなだけ（`defaultReading` が名前を返す）のキーは入れない（辞書が無くても、名前が読みになる）。
//
// ライセンス: コアデータは CC0（パブリックドメイン。https://musicbrainz.org/doc/About/Data_License）。
// 帰属表示は求められない。補助データ（タグ・評価など）は使わない。
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { readingProblem } from '../src/services/readingRules.ts';
import { artistNameKey, normalizeReading } from '../src/services/text.ts';

const [dir, dumpName, outPath = 'assets/artist-readings.json'] = process.argv.slice(2);
if (!dir || !dumpName) {
  console.error(
    '使い方: node scripts/build-artist-readings.mjs <取り出したダンプのフォルダ> <ダンプの名前（例: 20261014-150514）> [出力のパス]',
  );
  process.exit(1);
}

// 列の位置（ダンプの `artist` / `artist_alias` / `artist_alias_type` 表。列の並びが変わったら、検査で止まる）。
const ARTIST = { id: 0, name: 2, sortName: 3, comment: 13 };
const ALIAS = { artist: 1, name: 2, locale: 3, type: 6, sortName: 7, primary: 14 };
const ALIAS_TYPE = { id: 0, name: 1 };

// COPY のテキスト形式: 列はタブ区切り、NULL は `\N`、`\t` `\n` `\r` `\\` はバックスラッシュで書く。
function field(value) {
  if (value === undefined || value === '\\N') return null;
  if (!value.includes('\\')) return value;
  return value.replace(/\\([tnr\\])/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[c]);
}

async function* rows(file) {
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) yield line.split('\t');
}

// かなだけ（読みとして使える）で、かなを1字以上含む。
const KANA = /[ぁ-ゖァ-ヺ]/;
function asReading(text) {
  if (text === null) return null;
  const reading = normalizeReading(text).replace(/\s+/g, '');
  return reading !== '' && KANA.test(reading) && readingProblem(reading, 'ja') === undefined ? reading : null;
}

// --- 別名の種類
const types = new Map();
for await (const row of rows(join(dir, 'mbdump/artist_alias_type'))) {
  types.set(row[ALIAS_TYPE.id], field(row[ALIAS_TYPE.name]));
}
for (const expected of ['Artist name', 'Legal name', 'Search hint']) {
  if (![...types.values()].includes(expected)) throw new Error(`別名の種類 "${expected}" が見つからない（列の並びが変わったか）`);
}

// --- 別名: アーティストごとに、読みの候補と、キーにする名前を集める
/** @type {Map<string, { readings: { reading: string, score: number }[], names: Set<string> }>} */
const byArtist = new Map();
let aliasRows = 0;
let jaAliasRows = 0;
for await (const row of rows(join(dir, 'mbdump/artist_alias'))) {
  aliasRows++;
  const artist = row[ALIAS.artist];
  const name = field(row[ALIAS.name]);
  const locale = field(row[ALIAS.locale]);
  const type = types.get(row[ALIAS.type]) ?? null;
  if (name === null || artist === undefined) continue;
  if (type === 'Search hint') continue;
  if (locale === 'ja') jaAliasRows++;

  let entry = byArtist.get(artist);
  if (!entry) byArtist.set(artist, (entry = { readings: [], names: new Set() }));
  entry.names.add(name);

  const reading = type === 'Legal name' ? null : (asReading(field(row[ALIAS.sortName])) ?? asReading(name));
  if (reading !== null) {
    const score =
      (locale === 'ja' ? 100 : 0) +
      (type === 'Artist name' ? 50 : type === null ? 10 : 0) +
      (field(row[ALIAS.primary]) === 't' ? 5 : 0);
    entry.readings.push({ reading, score });
  }
}
// 列の並びの検査: ja の別名があり、種類の名前が引けていること。
if (aliasRows === 0 || jaAliasRows === 0) throw new Error('別名の列の位置が合っていない（ja の別名が見つからない）');

// --- アーティスト: 読みを持つものだけ、名前（と並び替え用の名前）をキーにする
/** @type {Map<string, Set<string>>} key → 読みの集合 */
const dictionary = new Map();
let artistsWithReading = 0;
let tiedArtists = 0;
let artistRows = 0;
for await (const row of rows(join(dir, 'mbdump/artist'))) {
  artistRows++;
  const id = row[ARTIST.id];
  const entry = byArtist.get(id) ?? { readings: [], names: new Set() };
  const name = field(row[ARTIST.name]);
  if (name === null) continue;
  // 特別な用途のアーティスト（[theatre]・[anonymous]・Various Artists（id 1）・Deleted Artist（id 2）など。
  // 別名が数百あり、無関係な名前を引き寄せる）は、実在のアーティストではないので除く。
  if (
    name.startsWith('[') ||
    id === '1' ||
    id === '2' ||
    /special purpose|add compilations/i.test(field(row[ARTIST.comment]) ?? '')
  ) {
    continue;
  }
  const own = asReading(field(row[ARTIST.sortName]));
  if (own !== null) entry.readings.push({ reading: own, score: 120 });
  if (entry.readings.length === 0) continue;

  entry.readings.sort((a, b) => b.score - a.score || b.reading.length - a.reading.length);
  const best = entry.readings[0];
  const tied = entry.readings.some(
    (candidate) =>
      candidate.score === best.score &&
      candidate.reading.length === best.reading.length &&
      candidate.reading !== best.reading,
  );
  if (tied) {
    tiedArtists++;
    continue;
  }
  const reading = best.reading;
  artistsWithReading++;

  for (const text of new Set([name, ...entry.names])) {
    // かなだけの名前は、辞書が無くても名前が読みになるので、入れない。
    if (readingProblem(text, 'ja') === undefined) continue;
    const key = artistNameKey(text);
    if (key === '' || key.includes('\t') || key.includes('\n')) continue;
    let readings = dictionary.get(key);
    if (!readings) dictionary.set(key, (readings = new Set()));
    readings.add(reading);
  }
}
if (artistRows === 0) throw new Error('artist 表が空（列の位置が合っていない）');

// --- 出力: 読みが1つに決まるキーだけ。キーでソート。
const lines = [];
let ambiguous = 0;
for (const [key, readings] of dictionary) {
  if (readings.size !== 1) {
    ambiguous++;
    continue;
  }
  lines.push(`${key}\t${[...readings][0]}`);
}
lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
writeFileSync(
  outPath,
  JSON.stringify({
    source: `MusicBrainz core data (CC0), mbdump.tar.bz2 ${dumpName}`,
    entries: lines.length,
    data: lines.join('\n') + '\n',
  }) + '\n',
);

const bytes = readFileSync(outPath).length;
console.log(
  [
    `artist 表: ${artistRows} 件、別名: ${aliasRows} 件（ja: ${jaAliasRows}）`,
    `読みを持つアーティスト: ${artistsWithReading} 件（読みが割れて除いたアーティスト: ${tiedArtists} 件）`,
    `キー: ${lines.length} 件（読みが割れて除いたもの: ${ambiguous} 件）`,
    `${outPath}: ${(bytes / 1024 / 1024).toFixed(2)} MB`,
  ].join('\n'),
);
