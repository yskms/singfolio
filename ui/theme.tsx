import { DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance as NativeAppearance, useColorScheme } from 'react-native';

import type { Appearance } from '../src/domain/types';
import { getServices } from '../src/services';
import { colorsByScheme, type ColorSchemeName, type ThemeColors } from '../src/theme/colors';

/**
 * 外観の設定（System / Light / Dark）をアプリ全体へ反映する。
 *
 * JSの色だけでなく、ステータスバー・OSのダイアログ・Androidのウィンドウ背景など、
 * ネイティブ側も同じ配色にする必要があるため、JSだけで上書きせず、端末側のカラー
 * スキームを切り替える（iOSはウィンドウのスタイル、AndroidはAppCompatのNightモード）。
 * `System` は端末の設定に戻す（`unspecified`）。以降は `useColorScheme()` が、
 * 設定を反映した実際の配色を返す。
 */
export function applyAppearance(appearance: Appearance): void {
  NativeAppearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
}

/** 実際に使われている配色。`useColorScheme()` は、端末の設定または `applyAppearance` の結果を返す。 */
export function useTheme(): { scheme: ColorSchemeName; colors: ThemeColors } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: colorsByScheme[scheme] };
}

interface AppearanceContextValue {
  appearance: Appearance;
  /** 保存してから反映する。保存に失敗したら reject し、表示は変えない。 */
  setAppearance(next: Appearance): Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** 外観の設定（Settingsの Appearance 用）。`ThemeProvider` の内側で使う。 */
export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance は ThemeProvider の内側で使う');
  return value;
}

/**
 * ナビゲーション（ヘッダー・タブバー・画面の背景）と、ルートビューの背景に、
 * テーマの色を渡す。`initialAppearance` は、最初の画面を描く前に `applyAppearance` で
 * 端末へ反映済みの値（起動時に、既定の配色が一瞬見えないようにするため）。
 */
export function ThemeProvider({
  initialAppearance,
  children,
}: {
  initialAppearance: Appearance;
  children: ReactNode;
}) {
  const [appearance, setAppearanceState] = useState(initialAppearance);
  const { scheme, colors } = useTheme();

  const setAppearance = useCallback(async (next: Appearance) => {
    const { settings } = await getServices();
    await settings.setAppearance(next);
    applyAppearance(next);
    setAppearanceState(next);
  }, []);

  // ネイティブのルートビューの背景。画面（Stack・Tabs）の背景より下に見える
  // 部分（遷移中・キーボードの出入りなど）が、別の配色の色にならないようにする。
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch((error) => {
      console.warn('ルートビューの背景色を設定できませんでした', error);
    });
  }, [colors.background]);

  const navigationTheme = useMemo<Theme>(
    () => ({
      dark: scheme === 'dark',
      colors: {
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.primary,
      },
      fonts: DefaultTheme.fonts,
    }),
    [scheme, colors],
  );

  const appearanceValue = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);

  return (
    <AppearanceContext.Provider value={appearanceValue}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </AppearanceContext.Provider>
  );
}
