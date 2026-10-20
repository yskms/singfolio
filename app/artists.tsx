import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ArtistSummary } from '../src/domain/types';
import { errorMessageKey } from '../src/i18n';
import { getServices, ServiceError } from '../src/services';
import { ArtistEditDialog } from '../ui/ArtistEditDialog';
import { decorative } from '../ui/decorative';
import { EmptyState } from '../ui/EmptyState';
import { useI18n } from '../ui/i18n';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（Tags と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Artists。Settings タブから開く。アーティストの名前と読みの変更（アーティストを作るのは、
// 曲の追加・編集。ここでは作らない。曲が1つも無くなったアーティストは、自動で消える）。変更は、
// そのアーティストの全曲に効く。曲の最終更新は変わらない。一覧は、読みの五十音順。
export default function ArtistsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [artists, setArtists] = useState<ArtistSummary[] | undefined>(undefined);
  // 変更の後に増やして、一覧を読み直す（前の一覧は、読み直しが終わるまで出し続ける）。
  const [reloadKey, setReloadKey] = useState(0);
  // 変更しているアーティスト（ダイアログを出す）。
  const [editing, setEditing] = useState<ArtistSummary | null>(null);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getServices()
      .then(({ artists: service }) => service.listArtists())
      .then(
        (list) => {
          if (!cancelled) setArtists(list);
        },
        (error) => {
          if (!cancelled) setFailure({ error });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  const save = async (
    artist: ArtistSummary,
    input: { name: string; reading: string },
  ): Promise<string | undefined> => {
    try {
      const { artists: service } = await getServices();
      await service.updateArtist(artist.id, input);
    } catch (error) {
      // アーティストが既に無いときは、入力を直しても解消しない。ダイアログを閉じて、一覧を読み直す
      // （曲を消して、最後の曲のアーティストが消えた直後など、来ない想定の防御）。
      if (!(error instanceof ServiceError && error.code === 'artist-not-found')) {
        return t(errorMessageKey(error));
      }
    }
    setEditing(null);
    setReloadKey((key) => key + 1);
    return undefined;
  };

  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('artists.title') }} />
      {artists !== undefined && (
        <FlatList
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
          data={artists}
          keyExtractor={(artist) => artist.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.reading}, ${t('artists.songCount', { count: item.songCount })}`}
              accessibilityHint={t('artists.rowHint')}
              onPress={() => setEditing(item)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.texts}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={[styles.reading, { color: colors.textSecondary }]}>
                  {item.reading}
                </Text>
              </View>
              <Text style={[styles.count, { color: colors.textSecondary }]}>
                {t('artists.songCount', { count: item.songCount })}
              </Text>
              <Ionicons name="create-outline" size={20} color={colors.textSecondary} {...decorative} />
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState title={t('artists.empty.title')} message={t('artists.empty.message')} />
          }
        />
      )}
      {editing !== null && (
        <ArtistEditDialog
          key={editing.id}
          artist={editing}
          onSave={(input) => save(editing, input)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texts: { flex: 1, flexShrink: 1 },
  name: { fontSize: 16, lineHeight: 22 },
  reading: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 13, lineHeight: 18 },
});
