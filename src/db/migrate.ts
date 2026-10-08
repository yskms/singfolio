import { DatabaseTooNewError } from './errors.ts';

// マイグレーション実行器。expo-sqlite には依存せず、必要なメソッドだけを持つ
// インターフェースで受ける（SQLiteDatabase はそのまま渡せる）。
export interface MigrationDb {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface Migration {
  /** 1から連番。DBの `PRAGMA user_version` にこの値が記録される。 */
  version: number;
  sql: string;
}

/**
 * 未適用のマイグレーションを順に実行する。
 *
 * 1つのマイグレーションは「SQLの実行」「外部キーの検査」「user_versionの更新」を
 * 同じトランザクションで行うため、途中で失敗してもそのバージョンの変更は残らない
 * （`PRAGMA user_version` はトランザクションに含まれる）。
 *
 * 外部キー制約は、マイグレーションの間だけ無効にする（終了後は元の状態へ戻す）。
 * 有効なままだと、テーブルを作り直すマイグレーション（新テーブル作成 → コピー →
 * DROP TABLE → RENAME。SQLiteで列の型や制約を変える唯一の方法）で、
 * `DROP TABLE songs` が ON DELETE CASCADE を発火させて song_tags が全件消える。
 * `PRAGMA foreign_keys` はトランザクション内では変更できず、何も起きないため、
 * マイグレーションのSQL側ではなく、ここでトランザクションの外から切り替える。
 * 代わりに、コミット前に `PRAGMA foreign_key_check` で整合性を検査する。
 *
 * アプリ起動時に、DBを他の処理へ渡す前に1回だけ呼ぶこと。
 * `withTransactionAsync` は排他ではなく、同じ接続の他のクエリが割り込みうる。
 */
export async function runMigrations(
  db: MigrationDb,
  migrations: readonly Migration[],
): Promise<void> {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations must be numbered 1, 2, 3, ... in order (got ${migration.version} at index ${index})`,
      );
    }
  });

  const latest = migrations.length;
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const current = versionRow?.user_version ?? 0;

  // 新しいバージョンのアプリで作られたDBを、古いアプリで開いた場合。
  // 知らないスキーマを書き換えないよう、起動を止める。
  if (current > latest) throw new DatabaseTooNewError(current, latest);

  const pending = migrations.filter((migration) => migration.version > current);
  if (pending.length === 0) return;

  const foreignKeysRow = await db.getFirstAsync<{ foreign_keys: number }>(
    'PRAGMA foreign_keys',
  );
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    for (const migration of pending) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(migration.sql);
        const violation = await db.getFirstAsync<object>(
          'PRAGMA foreign_key_check',
        );
        if (violation) {
          throw new Error(
            `Migration ${migration.version} left a foreign key violation: ${JSON.stringify(violation)}`,
          );
        }
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
    }
  } finally {
    await db.execAsync(
      `PRAGMA foreign_keys = ${foreignKeysRow?.foreign_keys ? 'ON' : 'OFF'}`,
    );
  }
}
