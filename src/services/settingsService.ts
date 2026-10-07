import type { Database } from '../db/appDatabase.ts';
import { isAppearance, type Appearance } from '../domain/types.ts';
import type { SettingsRepository } from '../repositories/settingsRepository.ts';
import { ServiceError } from './errors.ts';

export interface SettingsServiceDeps {
  db: Database;
  settings: SettingsRepository;
}

const APPEARANCE_KEY = 'appearance';

// 書き込みは必ず `db.transaction` の中で行う（理由は db/appDatabase.ts）。
export function createSettingsService({ db, settings }: SettingsServiceDeps) {
  return {
    /**
     * 外観の設定。未設定や、型の外から来た値（アプリの将来のバージョンが保存した
     * 値など）は、起動を止めないよう `system`（端末の設定に従う）にする。
     */
    async getAppearance(): Promise<Appearance> {
      const value = await settings.get(db, APPEARANCE_KEY);
      return isAppearance(value) ? value : 'system';
    },

    /** 不正な値は `invalid-appearance`。 */
    async setAppearance(appearance: Appearance): Promise<void> {
      if (!isAppearance(appearance)) throw new ServiceError('invalid-appearance');
      await db.transaction((tx) => settings.set(tx, APPEARANCE_KEY, appearance));
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
