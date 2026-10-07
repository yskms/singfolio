import type { ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';
import type { Tag } from '../domain/types.ts';
import type { RepositoryEnv } from './env.ts';

interface TagRow {
  id: string;
  name: string;
  created_at: number;
}

function rowToTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

// 読み取りは `ReadExecutor`（`Database` でよい）、書き込みは `WriteExecutor`
// （`Database.transaction` の中でだけ得られる）を、メソッドの先頭の引数で受ける。
// 名前の正規化・重複の判定はService層（tagService）。ここはSQLだけを持つ。
export function createTagRepository(env: RepositoryEnv) {
  return {
    /** タグ名の昇順（ASCIIの大文字小文字は区別しない） */
    async list(db: ReadExecutor): Promise<Tag[]> {
      const rows = await db.getAllAsync<TagRow>(
        'SELECT id, name, created_at FROM tags ORDER BY name, id',
      );
      return rows.map(rowToTag);
    },

    async get(db: ReadExecutor, id: string): Promise<Tag | null> {
      const row = await db.getFirstAsync<TagRow>(
        'SELECT id, name, created_at FROM tags WHERE id = ?',
        [id],
      );
      return row ? rowToTag(row) : null;
    },

    /** 存在するものだけを返す（順序は不定）。 */
    async findByIds(db: ReadExecutor, ids: readonly string[]): Promise<Tag[]> {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const rows = await db.getAllAsync<TagRow>(
        `SELECT id, name, created_at FROM tags WHERE id IN (${placeholders})`,
        [...ids],
      );
      return rows.map(rowToTag);
    },

    async insert(tx: WriteExecutor, name: string): Promise<Tag> {
      const tag: Tag = { id: env.newId(), name, createdAt: env.now() };
      await tx.runAsync(
        'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
        [tag.id, tag.name, tag.createdAt],
      );
      return tag;
    },

    /** タグ名の変更は曲を直接編集していないため、曲の `updated_at` は更新しない。 */
    async rename(tx: WriteExecutor, id: string, name: string): Promise<boolean> {
      const result = await tx.runAsync('UPDATE tags SET name = ? WHERE id = ?', [
        name,
        id,
      ]);
      return result.changes > 0;
    },

    /**
     * 付いている曲との関連も消える（song_tags の ON DELETE CASCADE。接続の
     * `PRAGMA foreign_keys = ON` が前提）。曲は残り、その `updated_at` も変えない。
     */
    async delete(tx: WriteExecutor, id: string): Promise<boolean> {
      const result = await tx.runAsync('DELETE FROM tags WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
