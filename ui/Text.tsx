import { Text as NativeText, type TextProps } from 'react-native';

import { fontFamilies } from '../src/theme/fonts';
import { useI18n } from './i18n';

/** 表示言語の書体（英語はInter、日本語はNoto Sans JP）。`I18nProvider` の内側で使う。 */
export function useFontFamily(): string {
  const { language } = useI18n();
  return fontFamilies[language];
}

/**
 * アプリの文字は、React Nativeの `Text` ではなく、これを使う（`Text` を直接importすると
 * OS既定の書体になる。`npm test` が検出する）。表示言語の書体を既定にし、言語の切り替えに
 * すぐ追従する。`style` で `fontFamily` を指定すれば上書きできる。太さは `fontWeight` の
 * '400' / '700' に限る（`src/theme/fonts.ts`）。
 *
 * Androidの `includeFontPadding` は既定でオフにする。オンだと、Noto Sans JP の縦方向の
 * 寸法（上下の余白）が大きく、行間が Inter の約1.8倍に開く（Androidエミュレータで確認）。
 * iOSには無い指定で、無視される。
 *
 * 入力欄は、同じ理由で `ui/TextInput.tsx` の `TextInput` を使う。
 */
export function Text({ style, ...props }: TextProps) {
  const fontFamily = useFontFamily();
  return <NativeText {...props} style={[{ fontFamily, includeFontPadding: false }, style]} />;
}
