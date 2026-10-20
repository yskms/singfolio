import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { getServices } from '../../src/services';
import { useI18n } from '../../ui/i18n';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { useFocusRefreshKey } from '../../ui/useFocusRefreshKey';

// Profile。端末内の、自分のSingfolioの画面（公開プロフィールではない）。
// 歌える（Ready）曲の数と、Show Mode を開く入口。設定は、別のタブ（Settings。`app/(tabs)/settings.tsx`）。
export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  // 歌える（Ready）曲の数。読み込み前は undefined。再読み込みのあいだは前の値を出し続ける
  // （タブを切り替えるたびに、件数が一瞬消えないように）。
  const [readyCount, setReadyCount] = useState<number | undefined>(undefined);
  // 他の画面で曲が変わったあと（Songs の行のボタン、Song Detail など）にこのタブへ
  // 戻ってきたら、読み直す。
  const refreshKey = useFocusRefreshKey();
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    // 読み込み中に再び読み込みが始まったとき、先の結果で上書きしない。
    let cancelled = false;
    (async () => {
      const { songs } = await getServices();
      const counts = await songs.countSongsByStatus();
      if (!cancelled) setReadyCount(counts.ready);
    })().catch((error) => {
      if (!cancelled) setFailure({ error });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  return (
    // 文字を大きくした端末でも切れないよう、はみ出すときはスクロールできるようにする。
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.count, { color: colors.textPrimary }]}>
        {readyCount === undefined ? '' : t('profile.count', { count: readyCount })}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('profile.showMySongsHint')}
        // Show Mode は、素早い連打で重ねて開かない（`app/_layout.tsx` の `dangerouslySingular`）。
        onPress={() => router.push('/show')}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{t('profile.showMySongs')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, gap: 20 },
  // 読み込み前は空欄。件数が出ても、ボタンの位置が動かないよう、行の高さを確保する。
  count: { minHeight: 28, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
