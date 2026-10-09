import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/**
 * ステータスごとの件数タイル（Songs）。押すと、そのステータスの曲だけに絞り込む。
 * 選択中は、色だけで伝えないよう、縁も付ける（`ThemeColors.selected`）。縁の太さは
 * 選択の有無で変えない（変えると、押すたびに配置がずれる）。
 */
export function StatusTile({
  label,
  count,
  selected,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  /** 件数。読み込み前は undefined（空で出す） */
  count: number | undefined;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: selected ? colors.selected : colors.surface,
          borderColor: selected ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.count, { color: selected ? colors.onSelected : colors.textPrimary }]}>
        {count === undefined ? '' : String(count)}
      </Text>
      <Text style={[styles.label, { color: selected ? colors.onSelected : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
  },
  count: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  label: { fontSize: 12, lineHeight: 16 },
});
