import type { ComponentProps } from 'react';
import { TextInput as NativeTextInput } from 'react-native';

import { useFontFamily } from './Text';

/**
 * 入力欄は、React Nativeの `TextInput` ではなく、これを使う（`Text`（`ui/Text.tsx`）と同じ
 * 理由。直接importするとOS既定の書体になる。`npm test` が検出する）。入力した文字・
 * プレースホルダーが、表示言語の書体になる。Androidの `includeFontPadding` を既定でオフに
 * するのも `Text` と同じ。
 */
export function TextInput({ style, ...props }: ComponentProps<typeof NativeTextInput>) {
  const fontFamily = useFontFamily();
  return <NativeTextInput {...props} style={[{ fontFamily, includeFontPadding: false }, style]} />;
}
