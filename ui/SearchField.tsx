import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextInput } from './TextInput';
import { decorative } from './decorative';
import { useTheme } from './theme';

/**
 * 検索欄（虫眼鏡・入力・クリアボタン）。クリアボタンは、iOSの `clearButtonMode` ではなく
 * 自前で出す（AndroidにもiOSと同じボタンを出すため）。
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** クリアボタンの読み上げ用の文言 */
  clearLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: colors.surface }]}>
      <Ionicons name="search" size={18} color={colors.textSecondary} {...decorative} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.textPrimary }]}
      />
      {value !== '' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={8}
          onPress={() => onChangeText('')}
        >
          <Ionicons name="close-circle" size={20} color={colors.textSecondary} {...decorative} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  // 行の高さは、入力欄の高さ（親の44pt）に任せ、文字の上下の余白は0にする
  // （AndroidのTextInputは、既定で上下に余白があり、文字が欠ける）。
  input: { flex: 1, paddingVertical: 0, fontSize: 16, lineHeight: 22 },
});
