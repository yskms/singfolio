import { useLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Language, LanguageSetting } from '../src/domain/types';
import { createAppTranslator, resolveLanguage, type Translate } from '../src/i18n';
import { getServices } from '../src/services';

interface I18nContextValue {
  /** 実際に使っている表示言語（`system` のときは、端末の言語から決めたもの）。 */
  language: Language;
  /** 言語の設定（Settingsの Language 用）。 */
  languageSetting: LanguageSetting;
  /** 保存してから反映する。保存に失敗したら reject し、表示は変えない。 */
  setLanguageSetting(next: LanguageSetting): Promise<void>;
  /** 文言を、表示言語で返す。画面の文言は直書きせず、これを通す。 */
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** 表示言語と文言（`t`）。`I18nProvider` の内側で使う。 */
export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n は I18nProvider の内側で使う');
  return value;
}

/**
 * 表示言語を決めて、文言（`t`）を渡す。`initialSetting` は、保存済みの言語の設定。
 * `system` のあいだは端末の言語に従い、端末側で言語が変わったとき（Androidなどで、
 * アプリを開いたまま変えたとき）も追従する。言語を選んだ後は、端末の言語が変わっても
 * 選んだ言語のまま。
 *
 * DBが使えない場面（起動時の失敗を出すエラー画面。`ErrorBoundary` は、`app/_layout.tsx`
 * の Provider の外で描画される）では、`initialSetting="system"` で使う。端末の言語に従い、
 * `setLanguageSetting` を呼ばない限りDBに触れない。
 */
export function I18nProvider({
  initialSetting,
  children,
}: {
  initialSetting: LanguageSetting;
  children: ReactNode;
}) {
  const [languageSetting, setLanguageSettingState] = useState(initialSetting);
  const deviceLocales = useLocales();
  const language = resolveLanguage(
    languageSetting,
    deviceLocales.map((locale) => locale.languageTag),
  );

  const setLanguageSetting = useCallback(async (next: LanguageSetting) => {
    const { settings } = await getServices();
    await settings.setLanguageSetting(next);
    setLanguageSettingState(next);
  }, []);

  const t = useMemo(() => createAppTranslator(language), [language]);
  const value = useMemo(
    () => ({ language, languageSetting, setLanguageSetting, t }),
    [language, languageSetting, setLanguageSetting, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
