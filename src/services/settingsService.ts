import type { Database } from '../db/appDatabase.ts';
import {
  isAppearance,
  isLanguageSetting,
  type Appearance,
  type LanguageSetting,
} from '../domain/types.ts';
import type { SettingsRepository } from '../repositories/settingsRepository.ts';
import { ServiceError } from './errors.ts';

export interface SettingsServiceDeps {
  db: Database;
  settings: SettingsRepository;
}

const APPEARANCE_KEY = 'appearance';
const LANGUAGE_KEY = 'language';

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

    /**
     * 言語の設定（`system` / `en` / `ja`）。未設定や、型の外から来た値（アプリの将来の
     * バージョンが保存した言語など）は、起動を止めないよう `system`（端末の言語に従う）に
     * する。実際に使う言語は、これと端末の言語から `src/i18n` の `resolveLanguage` が決める。
     */
    async getLanguageSetting(): Promise<LanguageSetting> {
      const value = await settings.get(db, LANGUAGE_KEY);
      return isLanguageSetting(value) ? value : 'system';
    },

    /** 不正な値は `invalid-language`。 */
    async setLanguageSetting(setting: LanguageSetting): Promise<void> {
      if (!isLanguageSetting(setting)) throw new ServiceError('invalid-language');
      await db.transaction((tx) => settings.set(tx, LANGUAGE_KEY, setting));
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
