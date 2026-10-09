import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { decorative } from './decorative';
import { useI18n } from './i18n';
import { useTheme } from './theme';

/** Songs画面のヘッダーの右の `＋`。Add Song を開く。 */
export function AddSongButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('songs.addA11y')}
      onPress={() => router.push('/song/new')}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="add" size={30} color={colors.primary} {...decorative} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
