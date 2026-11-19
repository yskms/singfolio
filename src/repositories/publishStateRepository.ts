import type { ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';

/**
 * この端末が最後に合意した、公開の状態（`publish_state`。migration 4）。サーバーの今の状態の写しではない:
 * `baseVersion` は、この端末が最後に Publish した（または置き換えを確認した）版。
 */
export interface PublishState {
  username: string;
  baseVersion: number;
  /** この端末が最後に Publish した Display Name・Bio */
  displayName: string;
  bio: string;
}

interface StateRow {
  username: string;
  base_version: number;
  display_name: string;
  bio: string;
}

/** 公開の端末側の状態の保存先。意味と、いつ捨てるかは Service 層（publishService）。書き込みは `Database.transaction` の中で行う。 */
export function createPublishStateRepository() {
  return {
    /** 保存されていなければ `null`。 */
    async get(db: ReadExecutor): Promise<PublishState | null> {
      const row = await db.getFirstAsync<StateRow>(
        'SELECT username, base_version, display_name, bio FROM publish_state WHERE id = 1',
      );
      return row
        ? { username: row.username, baseVersion: row.base_version, displayName: row.display_name, bio: row.bio }
        : null;
    },

    async set(tx: WriteExecutor, state: PublishState): Promise<void> {
      await tx.runAsync(
        `INSERT INTO publish_state (id, username, base_version, display_name, bio) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           username = excluded.username,
           base_version = excluded.base_version,
           display_name = excluded.display_name,
           bio = excluded.bio`,
        [state.username, state.baseVersion, state.displayName, state.bio],
      );
    },

    /** 最後に Publish した曲ごとの内容のハッシュ（曲のID → ハッシュ）。 */
    async listHashes(db: ReadExecutor): Promise<Map<string, string>> {
      const rows = await db.getAllAsync<{ song_id: string; content_hash: string }>(
        'SELECT song_id, content_hash FROM published_songs',
      );
      return new Map(rows.map((row) => [row.song_id, row.content_hash]));
    },

    /** 最後に Publish した曲の記録を、まるごと差し替える（Publish は、公開内容を丸ごと差し替える）。 */
    async replaceHashes(tx: WriteExecutor, hashes: ReadonlyMap<string, string>): Promise<void> {
      await tx.runAsync('DELETE FROM published_songs');
      for (const [songId, hash] of hashes) {
        await tx.runAsync('INSERT INTO published_songs (song_id, content_hash) VALUES (?, ?)', [songId, hash]);
      }
    },

    /** 状態も曲の記録も捨てる（別のアカウントになった、アカウントが無くなった）。 */
    async clear(tx: WriteExecutor): Promise<void> {
      await tx.runAsync('DELETE FROM published_songs');
      await tx.runAsync('DELETE FROM publish_state');
    },
  };
}

export type PublishStateRepository = ReturnType<typeof createPublishStateRepository>;
