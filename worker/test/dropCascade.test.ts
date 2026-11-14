/// <reference types="node" />
// マイグレーションの落とし穴を固定する。外部キーが有効なとき、親テーブルの DROP TABLE は、
// 暗黙の DELETE として ON DELETE CASCADE を発動し、子の行を消す。D1は外部キーを常に有効に
// する。そのため、users・identities を「作り直し（新テーブル→コピー→DROP→RENAME）」で
// 変えるマイグレーションは、本番の identities・sessions を全部消しうる。
// ここが変わったら（D1・wranglerの更新で止められるようになったら）、docs §8 と
// migrations/0001_initial.sql の注意書きを直す。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openLocalDatabase } from './localDatabase.ts';

async function rowsLeftAfterDroppingUsers(pragmas: string[]) {
  const local = await openLocalDatabase();
  const db = local.db;
  try {
    await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('u1', 1).run();
    await db
      .prepare(
        "INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES ('i1', 'u1', 'apple', 's1', 1, 1)",
      )
      .run();
    await db
      .prepare("INSERT INTO sessions (token_hash, identity_id, created_at, last_used_at) VALUES ('h1', 'i1', 1, 1)")
      .run();

    await db.batch([...pragmas.map((sql) => db.prepare(sql)), db.prepare('DROP TABLE users')]);

    const count = async (table: string) =>
      (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
    return { identities: await count('identities'), sessions: await count('sessions') };
  } finally {
    await local.dispose();
  }
}

describe('親テーブルの DROP TABLE（マイグレーションの注意）', () => {
  it('子の行が消える', async () => {
    assert.deepEqual(await rowsLeftAfterDroppingUsers([]), { identities: 0, sessions: 0 });
  });

  it('defer_foreign_keys でも、foreign_keys = OFF（バッチ内）でも、止まらない', async () => {
    assert.deepEqual(await rowsLeftAfterDroppingUsers(['PRAGMA defer_foreign_keys = on']), {
      identities: 0,
      sessions: 0,
    });
    assert.deepEqual(await rowsLeftAfterDroppingUsers(['PRAGMA foreign_keys = OFF']), {
      identities: 0,
      sessions: 0,
    });
  });
});
