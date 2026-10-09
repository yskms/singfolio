import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSemitones, stepKeyOffset } from '../src/domain/keyOffset';
import { decorative } from './decorative';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * My Keyの入力（原曲からの半音差）。`−` / `+` で半音ずつ動かし、`0` は「Original」と出す。
 * 範囲は `MAX_KEY_OFFSET`（src/domain/keyOffset.ts）。端では、その向きのボタンを無効にする。
 */
export function KeyStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const lower = stepKeyOffset(value, -1);
  const raise = stepKeyOffset(value, 1);
  return (
    <View style={styles.row}>
      <StepButton
        icon="remove"
        label={t('songForm.keyLowerA11y')}
        disabled={lower === value}
        onPress={() => onChange(lower)}
      />
      <Text
        // 押したあとの値を、読み上げにも伝える（Androidの live region）。
        accessibilityLiveRegion="polite"
        style={[styles.value, { color: colors.textPrimary }]}
      >
        {value === 0 ? t('songForm.keyOriginal') : formatSemitones(value)}
      </Text>
      <StepButton
        icon="add"
        label={t('songForm.keyRaiseA11y')}
        disabled={raise === value}
        onPress={() => onChange(raise)}
      />
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.surface, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={icon} size={24} color={colors.textPrimary} {...decorative} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  // 「Original」と「+12」で幅が変わっても、ボタンが動かないよう、幅を固定して中央に置く。
  value: { minWidth: 96, textAlign: 'center', fontSize: 18, lineHeight: 24, fontWeight: '700' },
});
