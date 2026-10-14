import type { Language } from '../domain/types.ts';
import { normalizeReading } from './text.ts';

/** 読みの入力の問題。 */
export type ReadingProblem =
  /** 空（読みは、空にできない） */
  | 'required'
  /** 日本語の設定で、漢字か英字を含む（かなだけにする） */
  | 'kana-only';

// 漢字（CJK統合漢字・拡張A・互換漢字・拡張B以降のサロゲートペア）と、々〆〇。Hermesで使えるかが
// 分からないので、Unicodeのプロパティ（`\p{Script=Han}`）は使わず、範囲で書く。
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005-\u3007]|[\ud840-\ud87f][\udc00-\udfff]/;
// 英字。全角は、正規化（`normalizeReading`）で半角になっているので、半角だけ見る。
const LATIN = /[A-Za-z\u00c0-\u024f]/;

/**
 * 読みの入力が、保存してよいか。問題が無ければ `undefined`。
 * - 空は、どの言語でも不可（`required`）。
 * - 日本語の設定では、漢字と英字を含められない（`kana-only`）。かな・長音・中点・空白・数字・
 *   記号は含められる。英語の設定は、自由（`Beatles` など）。
 *
 * 規則が言語で変わるのは、日本語の読みを、かなに限るため（並び替えが、五十音順になる）。
 * 画面（Add / Edit Song、Artists）が、保存の前の確認に使う。Serviceは、データの不変条件
 * （空にしない）だけを守り、言語の規則は持たない。
 */
export function readingProblem(reading: string, language: Language): ReadingProblem | undefined {
  const normalized = normalizeReading(reading);
  if (normalized === '') return 'required';
  if (language === 'ja' && (HAN.test(normalized) || LATIN.test(normalized))) return 'kana-only';
  return undefined;
}

/**
 * アーティスト名から、読みの初期値。名前そのものが、その言語の規則を満たすなら名前（英語は
 * いつも名前。日本語は、かなだけの名前）、満たさなければ空（日本語で、漢字・英字を含む名前は、
 * 入力してもらう）。
 */
export function defaultReading(name: string, language: Language): string {
  const normalized = normalizeReading(name);
  return readingProblem(normalized, language) === undefined ? normalized : '';
}
