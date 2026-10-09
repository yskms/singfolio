import type { Tag } from '../domain/types.ts';
import { normalizeTagName, tagNameKey } from './text.ts';

/** 曲の編集画面の「新規タグ」欄に入力した名前の扱い。 */
export type TagInputResult =
  /** 空（空白だけを含む）。何もしない */
  | { type: 'none' }
  /** 同じ名前のタグが既にある。新しく作らず、それを選ぶ */
  | { type: 'existing'; tag: Tag }
  /** 新しい名前。保存するときに作る（`name` は正規化した形） */
  | { type: 'new'; name: string };

/**
 * 「新規タグ」欄の入力を、既存のタグに当てはめる。重複の判定は、Service（`findOrCreateTag`。
 * 曲の保存で新しいタグを作るときに使う）と同じ（正規化して、大文字小文字を同一視する。
 * `Ｒock` は既存の `rock` と同じ）。
 *
 * 保存前に追加した名前（`pendingNames`。まだタグとして作っていない）と同じ名前は、
 * 追加済みなので `none`（二重に足さない）。
 */
export function resolveTagInput(
  input: string,
  existingTags: readonly Tag[],
  pendingNames: readonly string[],
): TagInputResult {
  const name = normalizeTagName(input);
  if (name === '') return { type: 'none' };
  const key = tagNameKey(name);
  const existing = existingTags.find((tag) => tagNameKey(tag.name) === key);
  if (existing) return { type: 'existing', tag: existing };
  if (pendingNames.some((pending) => tagNameKey(pending) === key)) return { type: 'none' };
  return { type: 'new', name };
}
