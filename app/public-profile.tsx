import { Redirect, Stack } from 'expo-router';

import { getServices } from '../src/services';
import { useI18n } from '../ui/i18n';
import { PublicProfileSection } from '../ui/PublicProfileSection';
import { useLoad } from '../ui/useLoad';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（Account と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Public Profile。Profile タブから開く。`username` の確保・Display Name と Bio・Publish・Unpublish。中身は `PublicProfileSection`。
//
// **アカウントが使えないビルド（`account.available` が偽。リリースのビルドは 7.3.13 まで）では、画面ごと開かない**。
// Profile の入口を出さないだけでは、`singfolio://public-profile` のリンクで開けてしまう（Account と同じ）。先頭の画面へ戻す。
export default function PublicProfileScreen() {
  const { t } = useI18n();
  const available = useLoad(async () => (await getServices()).account.available);
  if (available === undefined) return null;
  if (!available) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('publicProfile.title') }} />
      <PublicProfileSection />
    </>
  );
}
