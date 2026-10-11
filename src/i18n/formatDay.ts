import type { Language } from '../domain/types.ts';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 日付の書き方。`Intl.DateTimeFormat` や `toLocaleDateString` は使わない（Hermesでの出力が
// 端末・OSの版によって変わりうるのを避け、Nodeのテストと実機で同じ結果にするため）。
// 言語を足すときは、ここにも足す（`Record<Language, ...>` なので、足し忘れは型エラーになる）。
// `month` は 0 始まり。`withYear` は、年も書くか。
const dayFormats: Record<Language, (year: number, month: number, day: number, withYear: boolean) => string> = {
  en: (year, month, day, withYear) =>
    withYear ? `${EN_MONTHS[month]} ${day}, ${year}` : `${EN_MONTHS[month]} ${day}`,
  ja: (year, month, day, withYear) =>
    withYear ? `${year}年${month + 1}月${day}日` : `${month + 1}月${day}日`,
};

/**
 * 日時（Unixエポックのミリ秒）を、日付として書く（`Sep 28` / `9月28日`。`now` と年が違うときだけ
 * 年も書く: `Sep 28, 2025` / `2025年9月28日`）。日の区切りは端末のタイムゾーン（保存は
 * タイムゾーンに依存しないエポックミリ秒で、表示で端末の日付に直す。`singfolio-data-model.md`）。
 *
 * `now` と同じ日なら `null`。「今日」は、言語ごとの文言（Practiceの `practice.updatedToday`）
 * で出すので、呼び出し側が選ぶ。`now` を引数にするのは、テストで現在時刻に頼らないため。
 */
export function formatDay(timestamp: number, now: number, language: Language): string | null {
  const date = new Date(timestamp);
  const today = new Date(now);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
    return null;
  }
  return dayFormats[language](year, month, day, year !== today.getFullYear());
}
