import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/** 絞り込みのチップ（Songsのタグ）。選択中の見せ方は `StatusTile` と同じ。 */
export function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      // 見た目は36ptで、押せる範囲は44ptにする。
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.selected : colors.surface,
          borderColor: selected ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, { color: selected ? colors.onSelected : colors.textPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 2,
  },
  label: { fontSize: 14, lineHeight: 20 },
});
