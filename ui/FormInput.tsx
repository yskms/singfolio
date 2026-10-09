import type { ComponentPropsWithRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { TextInput } from './TextInput';
import { useTheme } from './theme';

/**
 * 入力画面の入力欄（Add / Edit Songの曲名・アーティスト・新規タグ・Private Note）。
 * 一段浮いた面（`surface`）に入力を置く。`multiline` では複数行の高さになる。
 * `invalid` のときは縁をエラーの色にする（縁の太さは常に同じで、出入りで配置がずれない）。
 */
export function FormInput({
  invalid = false,
  containerStyle,
  style,
  multiline = false,
  ...props
}: ComponentPropsWithRef<typeof TextInput> & {
  invalid?: boolean;
  /** 入力欄を包む面のスタイル（横幅の指定など） */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        multiline ? styles.multilineBox : styles.box,
        { backgroundColor: colors.surface, borderColor: invalid ? colors.error : 'transparent' },
        containerStyle,
      ]}
    >
      <TextInput
        multiline={multiline}
        placeholderTextColor={colors.textSecondary}
        {...props}
        style={[multiline ? styles.multilineInput : styles.input, { color: colors.textPrimary }, style]}
      />
    </View>
  );
}

// 面のどこを押しても入力欄にフォーカスが入るよう、入力欄は、面いっぱいに広げる（入力欄が文字の1行分
// だけだと、面の余白を押しても反応しない）。複数行の高さ（120pt）は、入力欄の最小の高さと余白で決める。
const styles = StyleSheet.create({
  box: { height: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  multilineBox: { padding: 12, borderRadius: 12, borderWidth: 1.5 },
  // 行の高さは、親の高さに任せ、文字の上下の余白は0にする（AndroidのTextInputは、既定で
  // 上下に余白があり、文字が欠ける）。
  input: { flex: 1, paddingVertical: 0, fontSize: 16, lineHeight: 22 },
  // 複数行は、上から書き始める（Androidは既定で中央寄せ）。
  multilineInput: { minHeight: 96, paddingVertical: 0, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
});
