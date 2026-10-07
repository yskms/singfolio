import { useLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Language } from '../src/domain/types';
import { createAppTranslator, resolveLanguage, type Translate } from '../src/i18n';
import { getServices } from '../src/services';

interface I18nContextValue {
  /** 実際に使っている表示言語。 */
  language: Language;
  /** 保存してから反映する。保存に失敗したら reject し、表示は変えない。 */
  setLanguage(next: Language): Promise<void>;
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
 * 表示言語を決めて、文言（`t`）を渡す。`initialLanguage` は、保存済みの、利用者が選んだ
 * 言語（選んでいなければ `null`）。`null` のあいだは端末の言語に従い、端末側で言語が
 * 変わったとき（Androidなどで、アプリを開いたまま変えたとき）も追従する。選んだ後は、
 * 端末の言語が変わっても選んだ言語のまま。
 *
 * DBが使えない場面（起動時の失敗を出すエラー画面。`ErrorBoundary` は、`app/_layout.tsx`
 * の Provider の外で描画される）では、`initialLanguage={null}` で使う。端末の言語に従い、
 * `setLanguage` を呼ばない限りDBに触れない。
 */
export function I18nProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language | null;
  children: ReactNode;
}) {
  const [saved, setSaved] = useState(initialLanguage);
  const deviceLocales = useLocales();
  const language = resolveLanguage(
    saved,
    deviceLocales.map((locale) => locale.languageTag),
  );

  const setLanguage = useCallback(async (next: Language) => {
    const { settings } = await getServices();
    await settings.setLanguage(next);
    setSaved(next);
  }, []);

  const t = useMemo(() => createAppTranslator(language), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
