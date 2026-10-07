import type { ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';

// 端末の設定（Appearance・Languageなど）の保存先。キーと値の意味・検証は
// Service層（settingsService）。ここは文字列の読み書きだけを持つ。
export function createSettingsRepository() {
  return {
    /** 保存されていないキーは `null`。 */
    async get(db: ReadExecutor, key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return row ? row.value : null;
    },

    async set(tx: WriteExecutor, key: string, value: string): Promise<void> {
      await tx.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
