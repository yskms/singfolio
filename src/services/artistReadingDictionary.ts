import { artistNameKey, normalizeReading } from './text.ts';

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

// --- 辞書を作るとき（`scripts/build-artist-readings.mjs`）の、読みの整形と検査。アプリは使わない。

// 辞書の読みに含められる字: ひらがな・カタカナ（ゝゞヽヾを含む）・長音（ー）・中点（・）・数字・イコール。
// 英字・漢字・括弧・区切りの記号・空白・ゼロ幅の文字は含めない。
const DICTIONARY_READING = /^[\u3041-\u3096\u309d\u309e\u30a1-\u30fa\u30fc-\u30fe\u30fb0-9=]+$/;
const KANA = /[\u3041-\u3096\u30a1-\u30fa]/;
// ゼロ幅の文字（`\s` に当たらないので、別に除く）。
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;
// 読みを持たない区切り・記号（姓と名のカンマ、句読点、感嘆符・疑問符、&）。除いて、つなぐ。
const SEPARATORS = /[,、，。.．!！?？&＆]/g;

/** 辞書の読みとして、含められる字だけか（かなを1字以上含む）。 */
export function isDictionaryReading(reading: string): boolean {
  return DICTIONARY_READING.test(reading) && KANA.test(reading);
}

/**
 * MusicBrainz の名前・並び替え用の名前（`sort_name`）を、辞書の読みに整える。整えられないもの
 * （英字・漢字・閉じていない括弧など、許す字の外が残る）は `null`。
 * - `normalizeReading`（全角の英数字を半角に、半角カナを全角カナに）、空白・ゼロ幅の文字を詰める。
 * - 末尾の注記の括弧を除く（`ビートルズ(ザ)`・`アヴィシャイ・コーエン(ベーシスト)`・`…(100%)`）。
 * - 波ダッシュ（〜 ~）は長音にし、姓と名のカンマ・句読点・感嘆符などは除いて、つなぐ
 *   （`くぼた,あきゆき` は `くぼたあきゆき`）。
 */
export function cleanDictionaryReading(text: string): string | null {
  let reading = normalizeReading(text).replace(ZERO_WIDTH, '').replace(/\s+/g, '');
  reading = reading.replace(/(\([^()]*\)|（[^（）]*）)+$/, '');
  reading = reading.replace(/[〜~]/g, 'ー').replace(SEPARATORS, '');
  return isDictionaryReading(reading) ? reading : null;
}

const HAN_CHARS = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005-\u3007]/g;
const KANA_CHARS = /[\u3041-\u3096\u309d\u309e\u30a1-\u30fa\u30fc-\u30fe]/g;

/**
 * 辞書に入れるキー（名前・別名の `artistNameKey`）と読みの、長さが釣り合うか。釣り合わないものは、
 * 読みが別の名前（愛称・名前の一部・本名と芸名の食い違い）のもので、そのキーには当てはまらない
 * （`aya ohnishi` に `あや`、`mitsuo terada` に `つんく`、`beat of angel` に `ボア`）。
 * 英字は、3字につき、かな1字以上（`ellegarden` 10字 → 4字以上）、漢字は、1字につき、かな1字以上
 * （`米津玄師` → 4字以上）を求める。長音（ー）は、かなの数に入れ、中点（・）・数字・`=` は入れない。
 * 英字・漢字以外のキー（ハングルなど）は、確かめない。
 */
export function isPlausibleReading(key: string, reading: string): boolean {
  const letters = key.match(/[a-z]/g)?.length ?? 0;
  const han = key.match(HAN_CHARS)?.length ?? 0;
  const kana = reading.match(KANA_CHARS)?.length ?? 0;
  return kana >= Math.ceil(letters / 3) + han;
}
