import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { runMigrations } from './migrate';
import { migrations } from './migrations';

const DATABASE_NAME = 'singfolio.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    // 外部キー制約は接続ごとの設定で、DBファイルには保存されない。
    // ON DELETE CASCADE（曲・タグの削除時に song_tags を消す）に必要。
    // マイグレーション中だけは runMigrations が一時的に無効にし、終了後に戻す。
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
  } catch (error) {
    // closeAsync の失敗で、本来のエラー（マイグレーションの失敗）を隠さない。
    await db.closeAsync().catch(() => {});
    throw error;
  }
  return db;
}

/**
 * マイグレーション済みのDB接続を返す。初回呼び出し時にDBを開いて
 * マイグレーションを実行し、以降は同じ接続を返す。
 * 失敗した場合は次の呼び出しで再試行する。
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  databasePromise ??= openAndMigrate().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}
