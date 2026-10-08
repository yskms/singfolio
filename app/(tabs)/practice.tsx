import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../ui/i18n';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';

// 練習中の曲の一覧（WBS 3.1）までのプレースホルダー。
export default function PracticeScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textPrimary }}>{t('tabs.practice')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
