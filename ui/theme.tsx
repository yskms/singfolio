import { ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance as NativeAppearance, useColorScheme } from 'react-native';

import type { Appearance } from '../src/domain/types';
import { getServices } from '../src/services';
import { colorsByScheme, type ColorSchemeName, type ThemeColors } from '../src/theme/colors';
import { navigationFonts } from '../src/theme/fonts';
import { useFontFamily } from './Text';

/**
 * 外観の設定（System / Light / Dark）をアプリ全体へ反映する。
 *
 * JSの色だけでなく、ステータスバー・ダイアログ・Androidのウィンドウ背景など、
 * ネイティブ側も同じ配色にする必要があるため、JSだけで上書きせず、アプリ全体の
 * カラースキームを切り替える（iOSは自アプリのウィンドウのスタイル、Androidは自アプリの
 * AppCompatのNightモード）。OS自体の設定は変えない。`System` は、アプリを端末の設定に
 * 従う状態へ戻す（`unspecified`）。以降は `useColorScheme()` が、設定を反映した実際の
 * 配色を返す。
 *
 * 反映するまでの間は、次のとおり、直前や端末の配色が見える（どちらもiOSシミュレータ・
 * Androidエミュレータで確認済み。最終的には正しい配色になる）。
 * - `System` へ戻した直後は、ネイティブのイベントが届くまでの数十ms、`useColorScheme()`
 *   が直前の配色のままになる（`setColorScheme` の同期の戻りが切り替え前の値で、
 *   イベントも発火しないため）。Light / Dark への切り替えは、JSの値がすぐ変わる。
 * - 起動の直後は、この関数が呼ばれるまで、端末の配色になる。Androidでは、Activityを
 *   作り直したとき（バックキーで終了して、同じプロセスで再び開いたときなど）も同じ。
 *   Expoの SystemUI が、Activityの作成のたびにNightモードを端末に従う状態へ戻すため
 *   （Reactのルートも作り直されるので、`app/_layout.tsx` の起動処理が再び反映する）。
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
 * テーマの色を渡す。ナビゲーションの文字（ヘッダーの題・タブのラベル）の書体は、表示言語の
 * 書体にする（`I18nProvider` の内側で使う）。`initialAppearance` は、最初の画面を描く前に
 * `applyAppearance` で端末へ反映済みの値（起動時に、既定の配色が一瞬見えないようにするため）。
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
  const fontFamily = useFontFamily();

  const setAppearance = useCallback(async (next: Appearance) => {
    const { settings } = await getServices();
    await settings.setAppearance(next);
    applyAppearance(next);
    setAppearanceState(next);
  }, []);

  // ネイティブのルートビューの背景。画面（Stack・Tabs）の背景より下に見える
  // 部分（遷移中・キーボードの出入りなど）が、別の配色の色にならないようにする。
  // expo-system-ui は、渡した色を保存し、次の起動でJSより先に復元する。前回と別の配色で
  // 起動すると、この effect が走るまで前回の色になる（iOSで確認した限り、スプラッシュに
  // 隠れて見えなかった）。
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
      fonts: navigationFonts(fontFamily),
    }),
    [scheme, colors, fontFamily],
  );

  const appearanceValue = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);

  return (
    <AppearanceContext.Provider value={appearanceValue}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </AppearanceContext.Provider>
  );
}
