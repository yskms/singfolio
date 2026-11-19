import { Redirect, Stack } from 'expo-router';

import { getServices } from '../src/services';
import { useI18n } from '../ui/i18n';
import { PublicTagsSection } from '../ui/PublicTagsSection';
import { useLoad } from '../ui/useLoad';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（Tags と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Public Tags。Public Profile から開く。公開ページに出すタグを選ぶ（7.4.8）。中身は `PublicTagsSection`。
//
// **アカウントが使えないビルド（`account.available` が偽）では、画面ごと開かない**。Public Profile の入口を出さないだけでは、
// `singfolio://public-tags` のリンクで開けてしまう（Public Profile と同じ）。先頭の画面へ戻す。
export default function PublicTagsScreen() {
  const { t } = useI18n();
  const available = useLoad(async () => (await getServices()).account.available);
  if (available === undefined) return null;
  if (!available) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('publicTags.title') }} />
      <PublicTagsSection />
    </>
  );
}
