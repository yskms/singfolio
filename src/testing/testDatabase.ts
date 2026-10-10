// テスト用。アプリ本体からは使わない（`node:sqlite` はNodeにしか無いため、
// tsconfig.json の対象から外している。型チェックは tsconfig.test.json）。
//
// 実機のexpo-sqliteとは別実装なので、ここで通っても実機での確認の代わりには
// ならない。アダプターは、expo-sqliteの withTransactionAsync と同じく
// BEGIN / COMMIT / ROLLBACK を発行するだけの形にしている。
/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createDatabase, type RawDatabase } from '../db/appDatabase.ts';
import { runMigrations } from '../db/migrate.ts';
import { migrations } from '../db/migrations.ts';
import type { RepositoryEnv } from '../repositories/env.ts';
import { createServices, type ServicesOptions } from '../services/createServices.ts';

export function createRawDatabase(sqlite: DatabaseSync): RawDatabase {
  return {
    async runAsync(sql, params) {
      const result = sqlite.prepare(sql).run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: SQLInputValue[]) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SQLInputValue[]) {
      return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      try {
        sqlite.exec('BEGIN');
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

/** 時刻を手で進められる時計と、連番のIDで、結果が毎回同じになる環境。 */
export function createTestEnv() {
  let time = 1_000;
  let sequence = 0;
  const env: RepositoryEnv = {
    newId: () => `id-${++sequence}`,
    now: () => time,
  };
  return {
    env,
    /** 時刻を `ms` だけ進める。 */
    advance(ms = 1_000) {
      time += ms;
    },
  };
}

/** マイグレーション済みのメモリ上のDBに、Serviceを組み立てて返す。 */
export async function createTestServices(options: ServicesOptions = {}) {
  const sqlite = new DatabaseSync(':memory:');
  // アプリ本体（database.ts）と同じく、外部キーを有効にしてからマイグレーションする。
  sqlite.exec('PRAGMA foreign_keys = ON');
  const raw = createRawDatabase(sqlite);
  await runMigrations(
    {
      execAsync: async (sql) => sqlite.exec(sql),
      getFirstAsync: <T>(sql: string) => raw.getFirstAsync<T>(sql, []),
      withTransactionAsync: raw.withTransactionAsync,
    },
    migrations,
  );
  const db = createDatabase(raw);
  const clock = createTestEnv();
  return { sqlite, raw, db, services: createServices(db, clock.env, options), ...clock };
}
