// Repositoryが使うDBのインターフェース。expo-sqlite には依存せず、必要な
// メソッドだけを持つ（SQLiteDatabase はそのまま `createDatabase` へ渡せる。
// Nodeのテストでは node:sqlite を同じ形に包んで渡す）。

export type SqlValue = string | number | null;

export interface ReadExecutor {
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}

export interface WriteExecutor extends ReadExecutor {
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
}

/**
 * 書き込みは `transaction` の中でしかできない（`Database` 自体は読み取り専用の型）。
 * 理由は `createDatabase` を参照。
 */
export interface Database extends ReadExecutor {
  transaction<T>(task: (tx: WriteExecutor) => Promise<T>): Promise<T>;
}

// expo-sqlite の接続。params は省略できない（理由は `createDatabase` のコメント）。
export interface RawDatabase {
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * マイグレーション済みの接続（`getDatabase()` の戻り値）を `Database` に包む。
 * 接続ごとに1つだけ作ること（排他の状態をこの中に持つため）。
 *
 * expo-sqlite の `withTransactionAsync` は排他ではなく、トランザクションの途中で
 * 同じ接続の他の書き込みが割り込みうる（割り込んだ書き込みは、トランザクションが
 * ロールバックされると一緒に消える）。そのため、書き込みをすべて `transaction` に
 * 限り、`transaction` 同士を直列に実行する。読み取りは待たせず、実行中の
 * トランザクションの途中の状態を読むことがある（この接続からは未コミットの変更が
 * 見える）。UIは書き込みの完了後に読み直すため、問題にならない。
 *
 * `task` の中から、外側で取得した `Database` の `transaction` を呼ばないこと
 * （自分の終了を待つため、完了しなくなる）。
 */
export function createDatabase(raw: RawDatabase): Database {
  // expo-sqlite は、params に undefined を1つ渡すと「undefined を1つ束縛する」と
  // 解釈してしまうため、省略時は空の配列にする。
  const executor: WriteExecutor = {
    getAllAsync: (sql, params = []) => raw.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => raw.getFirstAsync(sql, params),
    runAsync: (sql, params = []) => raw.runAsync(sql, params),
  };

  let tail: Promise<unknown> = Promise.resolve();

  return {
    getAllAsync: executor.getAllAsync,
    getFirstAsync: executor.getFirstAsync,
    transaction<T>(task: (tx: WriteExecutor) => Promise<T>): Promise<T> {
      const result = tail.then(async () => {
        const box = {} as { value: T };
        await raw.withTransactionAsync(async () => {
          box.value = await task(executor);
        });
        return box.value;
      });
      // 失敗した（ロールバックした）トランザクションが、後続を止めないようにする。
      tail = result.catch(() => {});
      return result;
    },
  };
}
