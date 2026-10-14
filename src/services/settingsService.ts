import type { Database } from '../db/appDatabase.ts';
import { isAppearance, isLanguage, type Appearance, type Language } from '../domain/types.ts';
import { deviceLanguage } from '../i18n/deviceLanguage.ts';
import type { SettingsRepository } from '../repositories/settingsRepository.ts';
import { ServiceError } from './errors.ts';

export interface SettingsServiceDeps {
  db: Database;
  settings: SettingsRepository;
}

const APPEARANCE_KEY = 'appearance';
const LANGUAGE_KEY = 'language';
const SUGGESTIONS_KEY = 'suggestions';

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
     * 表示言語（`en` / `ja`）。保存した言語を返す。未保存のとき（初回起動）と、`en` / `ja` 以外の
     * 値（旧版の `system`、アプリの将来のバージョンが保存した言語など）のときは、端末の言語
     * （`deviceLanguageTags`。BCP 47、端末の優先順）から決めて、**保存してから**返す。起動を
     * 止めないため、不正な値でもエラーにしない。決めた後は、端末の言語が変わっても追従しない
     * （言語の切り替えは、Settingsのみ）。
     */
    async ensureLanguage(deviceLanguageTags: readonly string[]): Promise<Language> {
      const value = await settings.get(db, LANGUAGE_KEY);
      if (isLanguage(value)) return value;
      const language = deviceLanguage(deviceLanguageTags);
      await db.transaction((tx) => settings.set(tx, LANGUAGE_KEY, language));
      return language;
    },

    /** 不正な値は `invalid-language`。 */
    async setLanguage(language: Language): Promise<void> {
      if (!isLanguage(language)) throw new ServiceError('invalid-language');
      await db.transaction((tx) => settings.set(tx, LANGUAGE_KEY, language));
    },

    /**
     * 曲名・アーティストの候補を、外部の楽曲検索から出すか（オフなら、入力中の検索語を外部へ
     * 送らない）。未設定や、`off` 以外の値（アプリの将来のバージョンが保存した値など）は、
     * 起動を止めないよう、既定のオンにする。
     */
    async getSuggestionsEnabled(): Promise<boolean> {
      return (await settings.get(db, SUGGESTIONS_KEY)) !== 'off';
    },

    async setSuggestionsEnabled(enabled: boolean): Promise<void> {
      await db.transaction((tx) => settings.set(tx, SUGGESTIONS_KEY, enabled ? 'on' : 'off'));
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
