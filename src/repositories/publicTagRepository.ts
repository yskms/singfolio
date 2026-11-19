import type { ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';

/**
 * 公開ページに出すタグの選択（`public_tags`。migration 5）の保存先。行があるタグのIDだけが公開される。`tags` には公開の
 * 属性を持たせず、別の表にする（docs/singfolio-data-model.md）。タグを消すと、行も消える（`ON DELETE CASCADE`）。
 * 意味はService層（publishService）。書き込みは `Database.transaction` の中で行う。
 */
export function createPublicTagRepository() {
  return {
    /** 公開に選んだタグのID。 */
    async listIds(db: ReadExecutor): Promise<Set<string>> {
      const rows = await db.getAllAsync<{ tag_id: string }>('SELECT tag_id FROM public_tags');
      return new Set(rows.map((row) => row.tag_id));
    },

    /** 公開に選ぶ。すでに選んでいれば何もしない。存在しないタグのIDは外部キーが断る（呼ぶ側が先に確かめる）。 */
    async add(tx: WriteExecutor, tagId: string): Promise<void> {
      await tx.runAsync('INSERT OR IGNORE INTO public_tags (tag_id) VALUES (?)', [tagId]);
    },

    /** 公開から外す。選んでいなければ何もしない。 */
    async remove(tx: WriteExecutor, tagId: string): Promise<void> {
      await tx.runAsync('DELETE FROM public_tags WHERE tag_id = ?', [tagId]);
    },
  };
}

export type PublicTagRepository = ReturnType<typeof createPublicTagRepository>;
