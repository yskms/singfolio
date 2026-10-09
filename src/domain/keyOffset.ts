/**
 * My Keyの入力（Add / Edit Songの − / + ボタン）で選べる範囲。原曲から上下それぞれ
 * 1オクターブ（12半音）。これは入力画面の範囲で、保存する値の制限ではない
 * （Serviceは整数であれば範囲を問わない。docs/singfolio-data-model.md「曲の入力」）。
 */
export const MAX_KEY_OFFSET = 12;

/**
 * My Keyを半音1つ上げる（`delta` が 1）・下げる（-1）。範囲（±`MAX_KEY_OFFSET`）の端では、
 * 動かさずに同じ値を返す（ボタンを無効にする判定は、返り値が元と同じかで行える）。
 * 範囲の外の値（範囲を決める前に保存された値など）は、外へ向かっては動かさず、
 * 範囲へ向かっては1つずつ動かす。
 */
export function stepKeyOffset(value: number, delta: 1 | -1): number {
  if (delta > 0 ? value >= MAX_KEY_OFFSET : value <= -MAX_KEY_OFFSET) return value;
  return value + delta;
}

/**
 * 半音差の表記（`+2` / `-2`）。`0`（Original）は、言語ごとの文言になるので、呼び出し側で
 * 分ける。負の記号は、どの書体にもある半角のハイフンにする。
 */
export function formatSemitones(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
