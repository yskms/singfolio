import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { decorative } from './decorative';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 設定の項目（Profile の Appearance・Language・Tags・About）。押すと、選択肢のシートや別の画面を
 * 開く。`value` は、今の設定（右端に控えめに出す）。読み上げは、名前と値が続けて読まれる。
 */
export function SettingsRow({
  label,
  value,
  accessibilityHint,
  onPress,
}: {
  label: string;
  value?: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      <View style={styles.trailing}>
        {value !== undefined && (
          <Text numberOfLines={1} style={[styles.value, { color: colors.textSecondary }]}>
            {value}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} {...decorative} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { fontSize: 16, lineHeight: 22 },
  // 値が長くても、名前を押しのけない（名前は折り返さず、値を縮める）。
  trailing: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { flexShrink: 1, fontSize: 16, lineHeight: 22 },
});
