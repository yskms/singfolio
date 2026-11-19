import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/** ボタンの角の丸み。Appleのサインインのボタン（`AccountSection`）も、これに揃える。 */
export const BUTTON_RADIUS = 12;

/**
 * 画面の中の操作のボタン（Account の Google サインイン、Profile の Public Profile、Public Profile の Publish Now など）。
 * `primary` は主要な操作（Purple の塗り）、`secondary`（既定）は一段浮いた面に縁を付けたボタン。
 * 押せないとき（`disabled`）は、薄くして、押せない状態を読み上げにも伝える。
 */
export function ActionButton({
  label,
  disabled = false,
  variant = 'secondary',
  accessibilityHint,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        { opacity: disabled ? 0.5 : pressed ? (primary ? 0.8 : 0.7) : 1 },
      ]}
    >
      <Text style={[styles.label, { color: primary ? colors.onPrimary : colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
