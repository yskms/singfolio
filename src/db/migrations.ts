import type { Migration } from './migrate.ts';

// 一度リリースしたマイグレーションは書き換えない。スキーマを変える場合は、
// 末尾に次の番号のマイグレーションを追加する。
// スキーマの意味・各カラムの方針は docs/singfolio-data-model.md を参照。
export const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE songs (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'practice', 'want')),
        key_offset INTEGER NOT NULL DEFAULT 0,
        private_note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_songs_status ON songs (status);

      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE song_tags (
        song_id TEXT NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (song_id, tag_id)
      ) WITHOUT ROWID;
      CREATE INDEX idx_song_tags_tag_id ON song_tags (tag_id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
  {
    // アーティストを、曲の文字列（songs.artist）から、テーブルに分ける。読み（reading）が、
    // アーティストの属性（曲ごとではない）だから。既存の曲は、アーティスト名ごとに（ASCIIの
    // 大文字小文字を区別せず、最初に登録された表記で）アーティストを作り、読みは名前そのまま
    // にする（空にしない）。songs の作り直しは、外部キーを無効にした状態で行う（migrate.ts）。
    // `ON DELETE` を付けないのは、曲があるアーティストを消せないようにするため。
    version: 3,
    sql: `
      CREATE TABLE artists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        reading TEXT NOT NULL CHECK (reading <> ''),
        created_at INTEGER NOT NULL
      );

      INSERT INTO artists (id, name, reading, created_at)
        SELECT
          lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))), 2) || '-' ||
            substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) ||
            '-' || lower(hex(randomblob(6))),
          artist,
          artist,
          MIN(created_at)
        FROM songs
        GROUP BY artist COLLATE NOCASE;

      CREATE TABLE songs_new (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist_id TEXT NOT NULL REFERENCES artists (id),
        status TEXT NOT NULL CHECK (status IN ('ready', 'practice', 'want')),
        key_offset INTEGER NOT NULL DEFAULT 0,
        private_note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO songs_new
          (id, title, artist_id, status, key_offset, private_note, created_at, updated_at)
        SELECT s.id, s.title, a.id, s.status, s.key_offset, s.private_note, s.created_at, s.updated_at
        FROM songs s
        JOIN artists a ON a.name = s.artist COLLATE NOCASE;
      DROP TABLE songs;
      ALTER TABLE songs_new RENAME TO songs;
      CREATE INDEX idx_songs_status ON songs (status);
      CREATE INDEX idx_songs_artist_id ON songs (artist_id);
    `,
  },
  {
    // 公開（Publish。7.4）の、端末側の状態。サーバーが持つ状態（`username`・版・公開中か）の写しではなく、
    // **この端末が最後に合意した状態**: `base_version` は Publish のリクエストの `baseVersion`（この端末が最後に
    // Publish した、または置き換えを確認した版。サーバーの今の版を黙って取り込まない: 別の端末の Publish を確認なしに
    // 上書きしてしまう）。`display_name`・`bio` は、この端末が最後に Publish した値。`published_songs` は、最後に Publish
    // した曲ごとの内容のハッシュ（「N unpublished changes」を数える。曲が消えても行は残る: 取り下げの変更として数える）。
    // `songs` への外部キーは持たない（曲を消したあとも、公開した記録として残す）。行が1つだけ（`id = 1`）なのは、
    // アカウントが1つだけ端末に紐づくため。`username` が変わったら（別のアカウントでサインインし直したら）捨てる。
    version: 4,
    sql: `
      CREATE TABLE publish_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        username TEXT NOT NULL,
        base_version INTEGER NOT NULL CHECK (base_version >= 0),
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL
      );

      CREATE TABLE published_songs (
        song_id TEXT PRIMARY KEY NOT NULL,
        content_hash TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
];
