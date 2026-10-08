import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { errorScreenContent } from '../src/i18n';
import { I18nProvider, useI18n } from './i18n';
import { MessageScreen } from './MessageScreen';

function ErrorContent({ error, retry }: ErrorBoundaryProps) {
  const { t } = useI18n();
  const { titleKey, messageKey, canRetry } = errorScreenContent(error);
  return (
    <MessageScreen
      title={t(titleKey)}
      message={t(messageKey)}
      action={
        canRetry
          ? {
              label: t('errorScreen.retry'),
              onPress: () => {
                // retry が終わるのは、描き直した後。結果は待たない。
                void retry();
              },
            }
          : undefined
      }
    />
  );
}

/**
 * 起動時の失敗（DBを開けない・アプリより新しいDB）や、画面の描画の失敗を出すエラー画面。
 * Expo Router の `ErrorBoundary`（`app/_layout.tsx` が export する）として使う。
 *
 * ルートの `ErrorBoundary` は `app/_layout.tsx` の Provider の外で描画される。DBが使えない
 * 場面もあるため、保存した設定は読まず、端末の言語（`system`）で出す（配色も、端末の設定に従う）。
 */
export function ErrorScreen(props: ErrorBoundaryProps) {
  return (
    <I18nProvider initialSetting="system">
      <StatusBar style="auto" />
      <ErrorContent {...props} />
    </I18nProvider>
  );
}
