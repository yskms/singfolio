/// <reference types="node" />
// マイグレーションの落とし穴を固定する。外部キーが有効なとき、親テーブルの DROP TABLE は、
// 暗黙の DELETE として ON DELETE CASCADE を発動し、子の行を消す。D1は外部キーを常に有効に
// する。そのため、users・identities を「作り直し（新テーブル→コピー→DROP→RENAME）」で
// 変えるマイグレーションは、本番の identities・sessions を全部消しうる。
//
// 確かめた経路（ローカルのD1。本番では未確認）:
// - バッチの中（下のテスト）
// - 単独の文（下のテスト。`PRAGMA foreign_keys = OFF` は、実行後も値が 1 のまま）
// - `wrangler d1 migrations apply`（手で確認。テストには入れていない。3通りの PRAGMA で、
//   どれも子の行が消えた）
// ここが変わったら（D1・wranglerの更新で止められるようになったら）、docs §8 と
// migrations/0001_initial.sql の注意書きを直す。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openLocalDatabase } from './localDatabase.ts';

type Mode = 'batch' | 'standalone';

async function afterDroppingUsers(pragmas: string[], mode: Mode) {
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

    if (mode === 'batch') {
      await db.batch([...pragmas.map((sql) => db.prepare(sql)), db.prepare('DROP TABLE users')]);
    } else {
      for (const sql of pragmas) await db.prepare(sql).run();
    }
    const foreignKeys = (await db.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())?.foreign_keys;
    if (mode === 'standalone') await db.prepare('DROP TABLE users').run();

    const count = async (table: string) =>
      (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
    return { identities: await count('identities'), sessions: await count('sessions'), foreignKeys };
  } finally {
    await local.dispose();
  }
}

describe('親テーブルの DROP TABLE（マイグレーションの注意）', () => {
  it('子の行が消える', async () => {
    const result = await afterDroppingUsers([], 'batch');
    assert.deepEqual(result, { identities: 0, sessions: 0, foreignKeys: 1 });
  });

  it('バッチの中の defer_foreign_keys でも、foreign_keys = OFF でも、止まらない', async () => {
    for (const pragma of ['PRAGMA defer_foreign_keys = on', 'PRAGMA foreign_keys = OFF']) {
      const result = await afterDroppingUsers([pragma], 'batch');
      assert.deepEqual(result, { identities: 0, sessions: 0, foreignKeys: 1 }, pragma);
    }
  });

  it('単独の文で foreign_keys = OFF にしても、値は 1 のまま変わらず、止まらない', async () => {
    const result = await afterDroppingUsers(['PRAGMA foreign_keys = OFF'], 'standalone');
    assert.deepEqual(result, { identities: 0, sessions: 0, foreignKeys: 1 });
  });
});
