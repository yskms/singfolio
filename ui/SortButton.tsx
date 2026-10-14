import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { decorative } from './decorative';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 並び替えのボタン（アイコンと、今の並びの名前）。押すと `onPress`（`OptionSheet` を開く）。
 * Songs と Show Mode で同じ見た目にする。読み上げは `accessibilityLabel`（「Sort by: ○○」）。
 */
export function SortButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} {...decorative} />
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 13, lineHeight: 18 },
});
