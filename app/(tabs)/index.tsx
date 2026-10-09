import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  SONG_STATUSES,
  type Song,
  type SongListQuery,
  type SongSortKey,
  type SongStatus,
  type SortDirection,
  type Tag,
} from '../../src/domain/types';
import type { MessageKey } from '../../src/i18n';
import { getServices } from '../../src/services';
import { decorative } from '../../ui/decorative';
import { FilterChip } from '../../ui/FilterChip';
import { useI18n } from '../../ui/i18n';
import { OptionSheet } from '../../ui/OptionSheet';
import { SearchField } from '../../ui/SearchField';
import { SongRow } from '../../ui/SongRow';
import { StatusTile } from '../../ui/StatusTile';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';

// 並び替えの選択肢。向きは、それぞれの自然な向き（新しい順・A→Z）に決めている。
// 曲名・アーティストは文字コード順で、日本語は読み順にならない（漢字の読みのデータが
// 無いため。docs/singfolio-data-model.md「曲の一覧」）。
const SORTS = {
  updated: { sortBy: 'updatedAt', direction: 'desc', labelKey: 'songs.sort.updated' },
  added: { sortBy: 'createdAt', direction: 'desc', labelKey: 'songs.sort.added' },
  title: { sortBy: 'title', direction: 'asc', labelKey: 'songs.sort.title' },
  artist: { sortBy: 'artist', direction: 'asc', labelKey: 'songs.sort.artist' },
} as const satisfies Record<string, { sortBy: SongSortKey; direction: SortDirection; labelKey: MessageKey }>;
type SortName = keyof typeof SORTS;
const SORT_NAMES = Object.keys(SORTS) as SortName[];

function renderSong({ item }: { item: Song }) {
  return <SongRow song={item} />;
}

interface Loaded {
  /**
   * この一覧を読み込んだときの条件。見出し・件数・空の状態は、表示中の一覧に合わせるため、
   * 現在の state（タイルや検索の操作で、読み込みより先に変わる）ではなく、これで決める。
   * 食い違うと、新しい条件の見出しの下に、前の条件の一覧が一瞬出る。
   */
  filter: { status: SongStatus | undefined; tagId: string | undefined; search: string };
  songs: Song[];
  counts: Record<SongStatus, number>;
  tags: Tag[];
}

export default function SongsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  // 絞り込み・並び替えの状態。タブは開いたままなので、アプリを終了するまで残る。
  // 起動時はReady（歌える曲）。選択中のタイルをもう一度押すと、ステータスで絞らない。
  const [status, setStatus] = useState<SongStatus | undefined>('ready');
  const [tagId, setTagId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortName>('updated');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // 他の画面で曲・タグが変わったあと（Song Detail・Practice・Settingsなど）に戻ってきたら、
  // 読み直す。
  const [refreshKey, setRefreshKey] = useState(0);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  const hasFocusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // 最初のフォーカスは、マウント時の読み込みと重なるので、読み直さない。
      if (hasFocusedBefore.current) setRefreshKey((key) => key + 1);
      hasFocusedBefore.current = true;
    }, []),
  );

  const { sortBy, direction } = SORTS[sort];
  useEffect(() => {
    // 条件がすぐに変わる（検索の入力）と、先の読み込みが後から終わることがある。
    // 古い結果で上書きしないよう、条件が変わったら捨てる。
    let cancelled = false;
    const query: SongListQuery = { status, tagId, search, sortBy, direction };
    (async () => {
      const { songs, tags } = await getServices();
      const [list, counts, allTags] = await Promise.all([
        songs.listSongs(query),
        songs.countSongsByStatus(),
        tags.listTags(),
      ]);
      if (cancelled) return;
      // 選んでいたタグが、Settingsで削除された。絞り込みを外す（読み直しが続く）。
      if (tagId !== undefined && !allTags.some((tag) => tag.id === tagId)) {
        setTagId(undefined);
        return;
      }
      setLoaded({ filter: { status, tagId, search }, songs: list, counts, tags: allTags });
    })().catch((error) => {
      if (!cancelled) setFailure({ error });
    });
    return () => {
      cancelled = true;
    };
  }, [status, tagId, search, sortBy, direction, refreshKey]);

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  // 読み込み前は、現在の条件。
  const shown = loaded?.filter ?? { status, tagId, search };
  const sectionTitle = t(`songs.section.${shown.status ?? 'all'}`);
  const songCount = loaded?.songs.length;

  const clearFilters = () => {
    setSearch('');
    setTagId(undefined);
  };

  // 検索欄を含むので、FlatListのヘッダーには、コンポーネント（毎回別の関数になると、入力欄が
  // 作り直されてフォーカスを失う）ではなく、要素を渡す。
  const header = (
    <View style={styles.header}>
      <View style={styles.tiles}>
        {SONG_STATUSES.map((value) => {
          const count = loaded?.counts[value];
          return (
            <StatusTile
              key={value}
              label={t(`status.${value}`)}
              count={count}
              selected={status === value}
              // 読み込み前は件数が空欄なので、「0曲」と読ませず、ステータス名だけにする。
              accessibilityLabel={
                count === undefined
                  ? t(`status.${value}`)
                  : t('songs.tileA11y', { status: t(`status.${value}`), count })
              }
              onPress={() => setStatus((current) => (current === value ? undefined : value))}
            />
          );
        })}
      </View>

      <View style={styles.search}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t('songs.searchPlaceholder')}
          clearLabel={t('songs.searchClear')}
        />
      </View>

      {loaded !== null && loaded.tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            label={t('songs.allTags')}
            // 見た目は「すべて」だけ。読み上げでは、何の「すべて」かを伝える。
            accessibilityLabel={t('songs.allTagsA11y')}
            selected={tagId === undefined}
            onPress={() => setTagId(undefined)}
          />
          {loaded.tags.map((tag) => (
            <FilterChip
              key={tag.id}
              label={tag.name}
              selected={tagId === tag.id}
              onPress={() => setTagId((current) => (current === tag.id ? undefined : tag.id))}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.section}>
        <View style={styles.sectionTitle}>
          <Text role="heading" numberOfLines={1} style={[styles.sectionLabel, { color: colors.textPrimary }]}>
            {sectionTitle}
          </Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
            {songCount === undefined ? '' : String(songCount)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('songs.sortButtonA11y', { sort: t(SORTS[sort].labelKey) })}
          hitSlop={8}
          onPress={() => setSortSheetOpen(true)}
          style={({ pressed }) => [styles.sortButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} {...decorative} />
          <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>{t(SORTS[sort].labelKey)}</Text>
        </Pressable>
      </View>
    </View>
  );

  // 空の状態。読み込み前は出さない（曲があるのに「まだ曲がありません」が一瞬見える）。
  let empty: { title?: string; message: string; action?: { label: string; onPress: () => void } } | null =
    null;
  if (loaded !== null && loaded.songs.length === 0) {
    const total = SONG_STATUSES.reduce((sum, value) => sum + loaded.counts[value], 0);
    if (total === 0) {
      empty = {
        title: t('songs.empty.title'),
        message: t('songs.empty.message'),
        action: { label: t('songs.empty.add'), onPress: () => router.push('/song/new') },
      };
    } else if (shown.search.trim() !== '' || shown.tagId !== undefined) {
      empty = {
        title: t('songs.noMatch.title'),
        message: t('songs.noMatch.message', { section: sectionTitle }),
        action: { label: t('songs.noMatch.clear'), onPress: clearFilters },
      };
    } else {
      // ステータスで絞って、その曲が無い（「すべて」で曲が無いのは、上の total === 0）。
      empty = { message: t(`songs.emptyStatus.${shown.status ?? 'ready'}`) };
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={loaded?.songs ?? []}
        renderItem={renderSong}
        keyExtractor={(song) => song.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty && <EmptyState {...empty} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
      />
      <OptionSheet
        visible={sortSheetOpen}
        title={t('songs.sortTitle')}
        options={SORT_NAMES.map((name) => ({ value: name, label: t(SORTS[name].labelKey) }))}
        selected={sort}
        onSelect={(name) => {
          setSort(name);
          setSortSheetOpen(false);
        }}
        onClose={() => setSortSheetOpen(false)}
      />
    </View>
  );
}

function EmptyState({
  title,
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      {title !== undefined && (
        <Text role="heading" style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
      )}
      <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.emptyButtonLabel, { color: colors.onPrimary }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 24 },
  header: { paddingTop: 12, gap: 12 },
  tiles: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  search: { paddingHorizontal: 16 },
  // チップの列は、左右の余白（16pt）をスクロールの内側に持たせて、画面の端まで流す。
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionLabel: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  sectionCount: { fontSize: 14, lineHeight: 20 },
  sortButton: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortLabel: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  emptyMessage: { marginTop: 8, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyButton: {
    marginTop: 24,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
