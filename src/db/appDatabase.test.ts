// createDatabase（トランザクションの直列化）のテスト。`npm test` で実行する。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRawDatabase } from '../testing/testDatabase.ts';
import { createDatabase } from './appDatabase.ts';

function open() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE log (value TEXT NOT NULL)');
  const db = createDatabase(createRawDatabase(sqlite));
  const values = () =>
    (sqlite.prepare('SELECT value FROM log ORDER BY rowid').all() as { value: string }[]).map(
      (row) => row.value,
    );
  return { sqlite, db, values };
}

// 他の非同期処理に実行を譲る（expo-sqlite のクエリが、await の間に他の処理を
// 割り込ませる状況の再現）。
const yieldToOthers = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createDatabase', () => {
  it('transaction は task の戻り値を返し、書き込みをコミットする', async () => {
    const { db, values } = open();
    const result = await db.transaction(async (tx) => {
      await tx.runAsync('INSERT INTO log VALUES (?)', ['a']);
      return 42;
    });
    assert.equal(result, 42);
    assert.deepEqual(values(), ['a']);
  });

  it('task が失敗したらロールバックし、エラーをそのまま投げる', async () => {
    const { db, values } = open();
    const failure = new Error('boom');
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.runAsync('INSERT INTO log VALUES (?)', ['a']);
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(values(), []);
  });

  it('同時に呼んだ transaction は直列に実行され、互いに割り込まない', async () => {
    const { db, values } = open();
    const order: string[] = [];
    const run = (name: string) =>
      db.transaction(async (tx) => {
        order.push(`${name}:start`);
        await tx.runAsync('INSERT INTO log VALUES (?)', [`${name}1`]);
        await yieldToOthers();
        await tx.runAsync('INSERT INTO log VALUES (?)', [`${name}2`]);
        order.push(`${name}:end`);
      });
    // 直列化しないと、2つ目の BEGIN が「トランザクションの中でトランザクションを
    // 開始できない」で失敗する。
    await Promise.all([run('a'), run('b'), run('c')]);
    assert.deepEqual(order, [
      'a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end',
    ]);
    assert.deepEqual(values(), ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
  });

  it('失敗した transaction は、後続の transaction を止めない', async () => {
    const { db, values } = open();
    const failing = db.transaction(async (tx) => {
      await tx.runAsync('INSERT INTO log VALUES (?)', ['lost']);
      throw new Error('boom');
    });
    const following = db.transaction((tx) =>
      tx.runAsync('INSERT INTO log VALUES (?)', ['kept']),
    );
    await assert.rejects(failing);
    await following;
    assert.deepEqual(values(), ['kept']);
  });

  it('params を省略しても動く（expo-sqlite には空の配列として渡す）', async () => {
    const { db } = open();
    const received: unknown[] = [];
    const spy = createDatabase({
      async getAllAsync(_sql, params) {
        received.push(params);
        return [];
      },
      async getFirstAsync(_sql, params) {
        received.push(params);
        return null;
      },
      async runAsync(_sql, params) {
        received.push(params);
        return { changes: 0 };
      },
      async withTransactionAsync(task) {
        await task();
      },
    });
    await spy.getAllAsync('SELECT 1');
    await spy.getFirstAsync('SELECT 1');
    await spy.transaction((tx) => tx.runAsync('DELETE FROM log'));
    assert.deepEqual(received, [[], [], []]);
    // 実際のDBでも、パラメータなしのクエリが通る。
    assert.deepEqual(await db.getAllAsync('SELECT * FROM log'), []);
  });
});
