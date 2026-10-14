import type { ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';
import type { Artist, ArtistSummary } from '../domain/types.ts';
import type { RepositoryEnv } from './env.ts';

interface ArtistRow {
  id: string;
  name: string;
  reading: string;
  created_at: number;
}

interface ArtistSummaryRow extends ArtistRow {
  song_count: number;
}

function rowToArtist(row: ArtistRow): Artist {
  return { id: row.id, name: row.name, reading: row.reading, createdAt: row.created_at };
}

// 読み取りは `ReadExecutor`（`Database` でよい）、書き込みは `WriteExecutor`
// （`Database.transaction` の中でだけ得られる）を、メソッドの先頭の引数で受ける。
// 名前の正規化・同じアーティストの判定・読みの検証・並びはService層（artistService）。
// ここはSQLだけを持つ。
export function createArtistRepository(env: RepositoryEnv) {
  return {
    /** 曲数つきの全アーティスト。並びは決まっていない（読み順にするのはService）。 */
    async list(db: ReadExecutor): Promise<ArtistSummary[]> {
      const rows = await db.getAllAsync<ArtistSummaryRow>(
        `SELECT a.id, a.name, a.reading, a.created_at,
                (SELECT count(*) FROM songs s WHERE s.artist_id = a.id) AS song_count
         FROM artists a
         ORDER BY a.name COLLATE NOCASE, a.id`,
      );
      return rows.map((row) => ({ ...rowToArtist(row), songCount: row.song_count }));
    },

    async get(db: ReadExecutor, id: string): Promise<Artist | null> {
      const row = await db.getFirstAsync<ArtistRow>(
        'SELECT id, name, reading, created_at FROM artists WHERE id = ?',
        [id],
      );
      return row ? rowToArtist(row) : null;
    },

    async insert(tx: WriteExecutor, fields: { name: string; reading: string }): Promise<Artist> {
      const artist: Artist = {
        id: env.newId(),
        name: fields.name,
        reading: fields.reading,
        createdAt: env.now(),
      };
      await tx.runAsync(
        'INSERT INTO artists (id, name, reading, created_at) VALUES (?, ?, ?, ?)',
        [artist.id, artist.name, artist.reading, artist.createdAt],
      );
      return artist;
    },

    /**
     * 名前と読みを変える。アーティストの変更は、曲を直接編集していないため、曲の `updated_at`
     * は更新しない（タグ名の変更と同じ）。
     */
    async update(
      tx: WriteExecutor,
      id: string,
      fields: { name: string; reading: string },
    ): Promise<boolean> {
      const result = await tx.runAsync('UPDATE artists SET name = ?, reading = ? WHERE id = ?', [
        fields.name,
        fields.reading,
        id,
      ]);
      return result.changes > 0;
    },

    /** 曲が1つも無いアーティストを消す。曲の保存・削除と同じトランザクションで呼ぶ。 */
    async deleteWithoutSongs(tx: WriteExecutor): Promise<void> {
      await tx.runAsync(
        'DELETE FROM artists WHERE NOT EXISTS (SELECT 1 FROM songs s WHERE s.artist_id = artists.id)',
      );
    },
  };
}

export type ArtistRepository = ReturnType<typeof createArtistRepository>;
