import { ScrollView, StyleSheet } from 'react-native';

import { SettingsSection } from '../../ui/SettingsSection';
import { useTheme } from '../../ui/theme';

// Settings。外観・言語・候補と、Tags・Artists・About への入口（`SettingsSection`）。
// 以前は Profile の下に並べていたが、「自分の Singfolio」（Profile）と設定は別の画面にした。
export default function SettingsScreen() {
  const { colors } = useTheme();
  return (
    // 文字を大きくした端末でも切れないよう、はみ出すときはスクロールできるようにする。
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <SettingsSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
});
