import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 横に並べた選択肢から1つ選ぶ（Add / Edit Songの Status）。選択中の見せ方は
 * `StatusTile`・`FilterChip` と同じ（Mintの面と、Purpleの縁）。縁の太さは選択の有無で
 * 変えない（変えると、押すたびに配置がずれる）。
 */
export function ChoiceRow<Value extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: checked ? colors.selected : colors.surface,
                borderColor: checked ? colors.primary : 'transparent',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[checked ? styles.labelChecked : styles.label, { color: checked ? colors.onSelected : colors.textPrimary }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
  },
  // fontWeight は、検査（src/theme/fonts.test.ts）のため、式ではなく文字列リテラルで書く。
  label: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  labelChecked: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
