import { useRouter } from 'expo-router';

import { useI18n } from '../ui/i18n';
import { MessageScreen } from '../ui/MessageScreen';

// 存在しない画面を開いたとき（Expo Routerの既定の画面は、英語の直書きで黒い背景）。
// 外部からのリンク（`singfolio://...`）で届くことがある。
export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <MessageScreen
      title={t('notFound.title')}
      message={t('notFound.message')}
      action={{ label: t('notFound.home'), onPress: () => router.replace('/') }}
    />
  );
}
