// マイグレーション実行器とv1スキーマのテスト。`npm test` で実行する。
//
// 実行には node:sqlite を使う。実機のexpo-sqliteとは別実装なので、ここで通っても
// 実機での確認の代わりにはならない（特にトランザクションまわり）。
// そのためアダプターは、expo-sqliteの withTransactionAsync と同じく
// BEGIN / COMMIT / ROLLBACK を発行するだけの形にしている。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations, type Migration, type MigrationDb } from './migrate.ts';
import { migrations } from './migrations.ts';

function openDb() {
  const raw = new DatabaseSync(':memory:');
  // アプリ本体（database.ts）と同じく、外部キーを有効にして実行器へ渡す。
  raw.exec('PRAGMA foreign_keys = ON');
  const db: MigrationDb = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async getFirstAsync<T>(sql: string) {
      return (raw.prepare(sql).get() as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      try {
        raw.exec('BEGIN');
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { raw, db };
}

const one = <T>(raw: DatabaseSync, sql: string) =>
  raw.prepare(sql).get() as T;
const count = (raw: DatabaseSync, table: string) =>
  one<{ c: number }>(raw, `SELECT count(*) AS c FROM ${table}`).c;
const userVersion = (raw: DatabaseSync) =>
  one<{ user_version: number }>(raw, 'PRAGMA user_version').user_version;
const foreignKeys = (raw: DatabaseSync) =>
  one<{ foreign_keys: number }>(raw, 'PRAGMA foreign_keys').foreign_keys;
const columns = (raw: DatabaseSync, table: string) =>
  (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );

const insertSong = (raw: DatabaseSync, id: string, status = 'ready') =>
  raw.exec(
    `INSERT INTO songs (id, title, artist, status, created_at, updated_at)
     VALUES ('${id}', 'title', 'artist', '${status}', 1, 1)`,
  );

describe('runMigrations', () => {
  it('新規DBにすべてのマイグレーションを適用し、再実行しても何も変わらない', async () => {
    const { raw, db } = openDb();
    await runMigrations(db, migrations);
    assert.equal(userVersion(raw), migrations.length);
    const tables = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as { name: string }[]
    ).map((t) => t.name);
    assert.deepEqual(tables, ['settings', 'song_tags', 'songs', 'tags']);

    await runMigrations(db, migrations);
    assert.equal(userVersion(raw), migrations.length);
  });

  it('未適用のマイグレーションだけを実行し、既存のデータを保持する', async () => {
    const { raw, db } = openDb();
    await runMigrations(db, migrations);
    insertSong(raw, 's1');

    const next: Migration = {
      version: migrations.length + 1,
      sql: 'ALTER TABLE songs ADD COLUMN extra TEXT;',
    };
    await runMigrations(db, [...migrations, next]);
    assert.equal(userVersion(raw), next.version);
    assert.equal(count(raw, 'songs'), 1);
    assert.ok(columns(raw, 'songs').includes('extra'));
  });

  it('途中で失敗したマイグレーションは、変更もバージョンも残さない', async () => {
    const { raw, db } = openDb();
    await runMigrations(db, migrations);

    const bad: Migration = {
      version: migrations.length + 1,
      sql: 'ALTER TABLE songs ADD COLUMN extra TEXT; SELECT * FROM no_such_table;',
    };
    await assert.rejects(runMigrations(db, [...migrations, bad]));
    assert.equal(userVersion(raw), migrations.length);
    assert.ok(!columns(raw, 'songs').includes('extra'));
    assert.equal(foreignKeys(raw), 1, '失敗しても外部キー制約は元の状態へ戻す');
  });

  it('アプリより新しいDBは、スキーマに触れずに拒否する', async () => {
    const { raw, db } = openDb();
    raw.exec('PRAGMA user_version = 99');
    await assert.rejects(
      runMigrations(db, migrations),
      /newer than this app supports/,
    );
    assert.equal(
      count(raw, 'sqlite_master'),
      0,
      'テーブルを作っていないこと',
    );
  });

  it('番号が1から連番でないマイグレーションは拒否する', async () => {
    const { db } = openDb();
    await assert.rejects(
      runMigrations(db, [{ version: 2, sql: '' }]),
      /numbered 1, 2, 3/,
    );
  });

  describe('テーブルの作り直し（SQLite公式の手順）', () => {
    // songs を作り直すマイグレーション。外部キーが有効なままだと、DROP TABLE が
    // ON DELETE CASCADE を発火させて song_tags が全件消える。
    const rebuildSongs: Migration = {
      version: migrations.length + 1,
      sql: `
        CREATE TABLE songs_new (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('ready', 'practice', 'want')),
          key_offset INTEGER NOT NULL DEFAULT 0,
          private_note TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          extra TEXT
        );
        INSERT INTO songs_new
          SELECT id, title, artist, status, key_offset, private_note,
                 created_at, updated_at, NULL
          FROM songs;
        DROP TABLE songs;
        ALTER TABLE songs_new RENAME TO songs;
        CREATE INDEX idx_songs_status ON songs (status);
      `,
    };

    async function seeded() {
      const { raw, db } = openDb();
      await runMigrations(db, migrations);
      insertSong(raw, 's1');
      raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t1', 'Rock', 1)");
      raw.exec("INSERT INTO song_tags VALUES ('s1', 't1')");
      return { raw, db };
    }

    it('songs を作り直しても song_tags が消えない', async () => {
      const { raw, db } = await seeded();
      await runMigrations(db, [...migrations, rebuildSongs]);
      assert.equal(userVersion(raw), rebuildSongs.version);
      assert.equal(count(raw, 'songs'), 1);
      assert.equal(count(raw, 'song_tags'), 1);
      assert.ok(columns(raw, 'songs').includes('extra'));
      assert.equal(foreignKeys(raw), 1, '完了後は外部キー制約を元の状態へ戻す');
    });

    it('外部キー違反を残すマイグレーションは、ロールバックして失敗する', async () => {
      const { raw, db } = await seeded();
      const orphan: Migration = {
        version: migrations.length + 1,
        // 外部キー制約が無効な間は挿入できてしまう孤児行。
        sql: "INSERT INTO song_tags VALUES ('no-such-song', 't1');",
      };
      await assert.rejects(
        runMigrations(db, [...migrations, orphan]),
        /foreign key/i,
      );
      assert.equal(userVersion(raw), migrations.length);
      assert.equal(count(raw, 'song_tags'), 1);
      assert.equal(foreignKeys(raw), 1);
    });
  });
});

describe('v1スキーマ', () => {
  async function migrated() {
    const { raw, db } = openDb();
    await runMigrations(db, migrations);
    return raw;
  }

  it('既定値: key_offset は 0（Original）、private_note は空文字', async () => {
    const raw = await migrated();
    insertSong(raw, 's1');
    const song = one<{ key_offset: number; private_note: string }>(
      raw,
      "SELECT * FROM songs WHERE id = 's1'",
    );
    assert.equal(song.key_offset, 0);
    assert.equal(song.private_note, '');
  });

  it('不正な status と、タイトルの NULL を拒否する', async () => {
    const raw = await migrated();
    assert.throws(() => insertSong(raw, 's1', 'done'), /CHECK/);
    assert.throws(
      () =>
        raw.exec(
          "INSERT INTO songs (id, title, artist, status, created_at, updated_at) VALUES ('s2', NULL, 'a', 'ready', 1, 1)",
        ),
      /NOT NULL/,
    );
  });

  it('タグ名は大文字小文字（ASCIIのみ）を区別せず一意', async () => {
    const raw = await migrated();
    raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t1', 'Rock', 1)");
    assert.throws(
      () => raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t2', 'rock', 1)"),
      /UNIQUE/,
    );
    // NOCASE は ASCII 以外の大文字小文字・全角半角を同一視しない（data-model.md参照）。
    raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t3', 'Ｒock', 1)");
  });

  it('song_tags は同じ組の重複と、存在しない曲・タグへの参照を拒否する', async () => {
    const raw = await migrated();
    insertSong(raw, 's1');
    raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t1', 'Rock', 1)");
    raw.exec("INSERT INTO song_tags VALUES ('s1', 't1')");
    assert.throws(() => raw.exec("INSERT INTO song_tags VALUES ('s1', 't1')"), /UNIQUE|PRIMARY/);
    assert.throws(() => raw.exec("INSERT INTO song_tags VALUES ('nope', 't1')"), /FOREIGN/);
    assert.throws(() => raw.exec("INSERT INTO song_tags VALUES ('s1', 'nope')"), /FOREIGN/);
  });

  it('曲を消すと関連だけが消え、タグを消しても曲は残る', async () => {
    const raw = await migrated();
    insertSong(raw, 's1');
    insertSong(raw, 's2');
    raw.exec("INSERT INTO tags (id, name, created_at) VALUES ('t1', 'Rock', 1)");
    raw.exec("INSERT INTO song_tags VALUES ('s1', 't1'), ('s2', 't1')");

    raw.exec("DELETE FROM songs WHERE id = 's1'");
    assert.equal(count(raw, 'song_tags'), 1);
    assert.equal(count(raw, 'tags'), 1, 'タグは残る');

    raw.exec("DELETE FROM tags WHERE id = 't1'");
    assert.equal(count(raw, 'song_tags'), 0);
    assert.equal(count(raw, 'songs'), 1, '曲は残る');
  });
});
