// 日時の表示。`Intl`（`toLocaleString` を含む）は使わない: Hermes の対応が機種で揃うか確かめていない
// （`Intl.PluralRules` は無い。`translate.ts`）。言語に依らない `2026-11-19 14:12` の形（端末の時刻）で出す。

/** Unixエポックのミリ秒を、端末のタイムゾーンの `YYYY-MM-DD HH:mm` にする。 */
export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  const two = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}`
  );
}
