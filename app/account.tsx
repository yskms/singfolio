import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSection } from '../ui/AccountSection';
import { useI18n } from '../ui/i18n';
import { useTheme } from '../ui/theme';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（About と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Account。Settings タブから開く（`account.available` のビルドだけ。入口は `SettingsSection`）。
// ログイン・ログアウト・ほかの端末のログアウト・アカウントの削除。中身は `AccountSection`。
export default function AccountScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('account.title') }} />
      {/* 文字を大きくした端末でも切れないよう、はみ出すときはスクロールできるようにする。 */}
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <AccountSection />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16 },
});
