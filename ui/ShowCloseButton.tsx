import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { decorative } from './decorative';
import { useI18n } from './i18n';
import { useTheme } from './theme';

/** Show Mode のヘッダーの右の `×`。通常の画面へ戻る。 */
export function ShowCloseButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('show.closeA11y')}
      // 戻る先が無いのは、通常は起こらない（リンクから直接開いても、`app/_layout.tsx` の
      // `initialRouteName` で、下に (tabs) がある）。念のための分岐。
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="close" size={28} color={colors.textPrimary} {...decorative} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
