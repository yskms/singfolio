import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Language } from '../src/domain/types';
import { createAppTranslator, type Translate } from '../src/i18n';
import { getServices } from '../src/services';

interface I18nContextValue {
  /** 表示言語。 */
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
 * 表示言語を保持して、文言（`t`）を渡す。`initialLanguage` は、保存した言語（初回起動のとき
 * は、端末の言語から決めて保存したもの。`app/_layout.tsx`）。言語は `setLanguage` で変えたときだけ
 * 変わり、端末の言語が変わっても追従しない。
 *
 * DBが使えない場面（起動時の失敗を出すエラー画面。`ErrorBoundary` は、`app/_layout.tsx`
 * の Provider の外で描画される）では、端末の言語（`deviceLanguage`）を `initialLanguage` に
 * 渡して使う。`setLanguage` を呼ばない限りDBに触れない。
 */
export function I18nProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState(initialLanguage);

  const setLanguage = useCallback(async (next: Language) => {
    const { settings } = await getServices();
    await settings.setLanguage(next);
    setLanguageState(next);
  }, []);

  const t = useMemo(() => createAppTranslator(language), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
