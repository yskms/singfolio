import type { ReadExecutor, SqlValue, WriteExecutor } from '../db/appDatabase.ts';
import {
  SONG_STATUSES,
  type Song,
  type SongListQuery,
  type SongSortKey,
  type SongStatus,
} from '../domain/types.ts';
import type { RepositoryEnv } from './env.ts';

/** 曲の編集で書き換える項目（タグは `replaceTags` で別に扱う）。 */
export type SongFields = Pick<
  Song,
  'title' | 'artist' | 'status' | 'keyOffset' | 'privateNote'
>;

// 曲とタグを1回のクエリで取る（1曲につきタグの数だけ行が返る）。曲とタグを別々の
// クエリにすると、その間の書き込みで食い違う可能性があるため。
const SELECT_SONGS = `
  SELECT s.id, s.title, s.artist, s.status, s.key_offset, s.private_note,
         s.created_at, s.updated_at,
         t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
  FROM songs s
  LEFT JOIN song_tags st ON st.song_id = s.id
  LEFT JOIN tags t ON t.id = st.tag_id`;

interface SongRow {
  id: string;
  title: string;
  artist: string;
  status: SongStatus;
  key_offset: number;
  private_note: string;
  created_at: number;
  updated_at: number;
  tag_id: string | null;
  tag_name: string | null;
  tag_created_at: number | null;
}

function rowsToSongs(rows: SongRow[]): Song[] {
  const songs = new Map<string, Song>();
  for (const row of rows) {
    let song = songs.get(row.id);
    if (!song) {
      song = {
        id: row.id,
        title: row.title,
        artist: row.artist,
        status: row.status,
        keyOffset: row.key_offset,
        privateNote: row.private_note,
        tags: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      songs.set(row.id, song);
    }
    // LEFT JOIN なので、タグの無い曲は tag_* がすべて NULL になる。
    if (row.tag_id !== null) {
      song.tags.push({
        id: row.tag_id,
        name: row.tag_name as string,
        createdAt: row.tag_created_at as number,
      });
    }
  }
  return [...songs.values()];
}

// 並び替えの列。文字列で組み立てるため、必ずこの一覧（ホワイトリスト）から選ぶ。
// 曲名・アーティストは、英字の大文字小文字を区別せずに並べる。日本語は文字コード順で、
// 読み順にはならない（読み順の扱いは、曲一覧の実装＝WBS 2.1で決める）。
const SORT_COLUMNS: Record<SongSortKey, string> = {
  title: 's.title COLLATE NOCASE',
  artist: 's.artist COLLATE NOCASE',
  createdAt: 's.created_at',
  updatedAt: 's.updated_at',
};

// 型の外から来た値（端末に保存した並び順の設定の読み戻しなど）でも、SQLを壊さない
// よう、一覧にないキーは既定（更新日）にする。`SORT_COLUMNS['constructor']` のような
// プロトタイプ上の名前は、自身のプロパティだけを見て弾く。
function sortColumn(key: SongSortKey | undefined): string {
  return key !== undefined && Object.prototype.hasOwnProperty.call(SORT_COLUMNS, key)
    ? SORT_COLUMNS[key]
    : SORT_COLUMNS.updatedAt;
}

// LIKE のワイルドカード（% _）とエスケープ文字を、文字そのものとして扱う。
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

// 読み取りは `ReadExecutor`（`Database` でよい）、書き込みは `WriteExecutor`
// （`Database.transaction` の中でだけ得られる）を、メソッドの先頭の引数で受ける。
// 入力の検証・正規化はService層（songService）。ここはSQLだけを持つ。
export function createSongRepository(env: RepositoryEnv) {
  return {
    async get(db: ReadExecutor, id: string): Promise<Song | null> {
      const rows = await db.getAllAsync<SongRow>(
        `${SELECT_SONGS} WHERE s.id = ? ORDER BY t.name, t.id`,
        [id],
      );
      return rowsToSongs(rows)[0] ?? null;
    },

    async list(db: ReadExecutor, query: SongListQuery = {}): Promise<Song[]> {
      const conditions: string[] = [];
      const params: SqlValue[] = [];
      if (query.status) {
        conditions.push('s.status = ?');
        params.push(query.status);
      }
      if (query.tagId) {
        // JOIN ではなく EXISTS にして、他のタグも含めた曲のタグ一覧を返す。
        conditions.push(
          'EXISTS (SELECT 1 FROM song_tags f WHERE f.song_id = s.id AND f.tag_id = ?)',
        );
        params.push(query.tagId);
      }
      if (query.search) {
        // LIKE は、ASCIIの大文字小文字だけを区別しない。全角/半角やひらがな/
        // カタカナの違いは吸収しない（検索の一致の扱いは、WBS 2.1で決める）。
        conditions.push("(s.title LIKE ? ESCAPE '\\' OR s.artist LIKE ? ESCAPE '\\')");
        const pattern = `%${escapeLike(query.search)}%`;
        params.push(pattern, pattern);
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const primary = sortColumn(query.sortBy);
      // 'asc' 以外（不正な値を含む）は降順。
      const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
      // 主キー以外は常に昇順で、同順位の曲の並びが毎回同じになるようにする。
      const orderBy =
        ` ORDER BY ${primary} ${direction}, s.title COLLATE NOCASE, ` +
        's.artist COLLATE NOCASE, s.id, t.name, t.id';

      const rows = await db.getAllAsync<SongRow>(
        SELECT_SONGS + where + orderBy,
        params,
      );
      return rowsToSongs(rows);
    },

    async countByStatus(db: ReadExecutor): Promise<Record<SongStatus, number>> {
      const rows = await db.getAllAsync<{ status: SongStatus; count: number }>(
        'SELECT status, count(*) AS count FROM songs GROUP BY status',
      );
      const counts = { ready: 0, practice: 0, want: 0 };
      for (const status of SONG_STATUSES) {
        counts[status] = rows.find((row) => row.status === status)?.count ?? 0;
      }
      return counts;
    },

    /** 新しい曲のIDを返す。`created_at` と `updated_at` は同じ時刻になる。 */
    async insert(tx: WriteExecutor, fields: SongFields): Promise<string> {
      const id = env.newId();
      const now = env.now();
      await tx.runAsync(
        `INSERT INTO songs
           (id, title, artist, status, key_offset, private_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fields.title,
          fields.artist,
          fields.status,
          fields.keyOffset,
          fields.privateNote,
          now,
          now,
        ],
      );
      return id;
    },

    /** 常に `updated_at` を現在時刻にする。変更が無いときは呼ばないこと（Service層の役割）。 */
    async update(
      tx: WriteExecutor,
      id: string,
      fields: SongFields,
    ): Promise<boolean> {
      const result = await tx.runAsync(
        `UPDATE songs
         SET title = ?, artist = ?, status = ?, key_offset = ?, private_note = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.title,
          fields.artist,
          fields.status,
          fields.keyOffset,
          fields.privateNote,
          env.now(),
          id,
        ],
      );
      return result.changes > 0;
    },

    /** 曲に付けるタグを、渡した一覧に置き換える。`updated_at` は更新しない（`update` が行う）。 */
    async replaceTags(
      tx: WriteExecutor,
      songId: string,
      tagIds: readonly string[],
    ): Promise<void> {
      await tx.runAsync('DELETE FROM song_tags WHERE song_id = ?', [songId]);
      for (const tagId of tagIds) {
        await tx.runAsync(
          'INSERT INTO song_tags (song_id, tag_id) VALUES (?, ?)',
          [songId, tagId],
        );
      }
    },

    /**
     * 関連（song_tags）も消える。タグは残る（ON DELETE CASCADE。接続の
     * `PRAGMA foreign_keys = ON` が前提）。
     */
    async delete(tx: WriteExecutor, id: string): Promise<boolean> {
      const result = await tx.runAsync('DELETE FROM songs WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}

export type SongRepository = ReturnType<typeof createSongRepository>;
