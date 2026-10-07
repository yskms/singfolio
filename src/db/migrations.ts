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
];
