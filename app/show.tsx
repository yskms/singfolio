import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ShowListedSong, ShowSong, ShowSort } from '../src/domain/types';
import type { MessageKey } from '../src/i18n';
import { getServices, type ShowView } from '../src/services';
import { EmptyState } from '../ui/EmptyState';
import { FilterChip } from '../ui/FilterChip';
import { useI18n } from '../ui/i18n';
import { OptionSheet } from '../ui/OptionSheet';
import { SearchField } from '../ui/SearchField';
import { ShowArtistHeader } from '../ui/ShowArtistHeader';
import { ShowCloseButton } from '../ui/ShowCloseButton';
import { ShowSongRow } from '../ui/ShowSongRow';
import { SortButton } from '../ui/SortButton';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

// ヘッダーの題はブランド名（中央）。戻るボタンは出さず、右の `×` で閉じる（下から出入りする）。
// iOSの、画面の端からのスワイプでは閉じない（今の指定のままでも閉じないことを、iOSシミュレータで
// 確認した。人に渡して触られても管理の画面へ戻らないよう、明示的に無効にしている）。Androidは
// 戻るキー（戻るジェスチャーを含む）でも閉じる。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackVisible: false,
  headerTitleAlign: 'center',
  animation: 'slide_from_bottom',
  gestureEnabled: false,
  headerRight: () => <ShowCloseButton />,
} as const;

// 並びの選択肢。Songs の並び替え（`songs.sort.*`）と同じ文言を使う。管理の情報（更新日・追加日）の順は
// 持たない（人に見せる画面に、管理の情報を持ち込まない）。
const SORT_LABELS = {
  artist: 'songs.sort.artist',
  title: 'songs.sort.title',
} as const satisfies Record<ShowSort, MessageKey>;
const SORT_NAMES = Object.keys(SORT_LABELS) as ShowSort[];

// SectionList のまとまり。曲名順は見出しが無いので、`artist` が無い。
interface ShowSection {
  artist: string | undefined;
  data: ShowSong[];
}

// 曲名順の一覧の行は、アーティスト名を曲名の下に出す。
const isListed = (song: ShowSong): song is ShowListedSong => 'artist' in song;

// Show Mode。友人などにスマートフォンを見せて「この中から選んで」と使う、閲覧専用の画面。
// Readyの曲だけを、アーティスト別に出す。管理の情報（My Key・Private Note・Want）は、`songs` ではなく
// `show` Service を使うことで、そもそも持たない（docs の画面設計「Show Mode」）。
// 検索・タグの絞り込みと並びは、画面を閉じると捨てる（開くたびに、全部が見える状態から始める）。
export default function ShowModeScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<ShowSort>('artist');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [view, setView] = useState<ShowView | null>(null);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    // 検索語がすぐに変わると、先の読み込みが後から終わることがある。古い結果で上書きしない
    // よう、条件が変わったら捨てる。
    let cancelled = false;
    (async () => {
      const { show } = await getServices();
      const next = await show.getShowView({ search, tagId, sort });
      if (!cancelled) setView(next);
    })().catch((error) => {
      if (!cancelled) setFailure({ error });
    });
    return () => {
      cancelled = true;
    };
  }, [search, tagId, sort]);

  // SectionList の形にする。アーティスト別は、アーティストごとのまとまり（見出しあり）。曲名順は、
  // 見出しの無い1つのまとまり。
  const sections = useMemo<ShowSection[]>(() => {
    if (view === null) return [];
    if (view.sort === 'title') return [{ artist: undefined, data: view.songs }];
    return view.groups.map((group) => ({ artist: group.artist, data: group.songs }));
  }, [view]);

  // 行は、押しても何も起きない（props に関数が無いので、固定の関数でよい）。
  const renderSong = useCallback(
    ({ item }: { item: ShowSong }) => <ShowSongRow song={item} artist={isListed(item) ? item.artist : undefined} />,
    [],
  );

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  // Readyの曲が1つも無いときは、検索欄もタグも要らない。読み込み前は出しておく（曲があるときに、
  // 検索欄が後から現れて位置が動かないように）。そのため、Readyが0件のときだけ、読み込みが終わった
  // ところで検索欄が消える（0件で開くのは、まだ何もReadyにしていないときだけなので、割り切っている）。
  const hasSongs = view === null || view.readyCount > 0;

  // 検索欄を含むので、SectionListのヘッダーには、コンポーネントではなく要素を渡す
  // （毎回別の関数になると、入力欄が作り直されてフォーカスを失う）。
  const header = (
    <View style={styles.header}>
      <View style={styles.intro}>
        <Text role="heading" style={[styles.title, { color: colors.textPrimary }]}>
          {t('show.title')}
        </Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {view === null ? '' : t('show.count', { count: view.readyCount })}
        </Text>
      </View>

      {hasSongs && (
        <View style={styles.search}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t('songs.searchPlaceholder')}
            clearLabel={t('songs.searchClear')}
          />
        </View>
      )}

      {view !== null && view.tags.length > 0 && (
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
          {view.tags.map((tag) => (
            <FilterChip
              key={tag.id}
              label={tag.name}
              selected={tagId === tag.id}
              onPress={() => setTagId((current) => (current === tag.id ? undefined : tag.id))}
            />
          ))}
        </ScrollView>
      )}

      {hasSongs && (
        <View style={styles.sortRow}>
          <SortButton
            label={t(SORT_LABELS[sort])}
            accessibilityLabel={t('songs.sortButtonA11y', { sort: t(SORT_LABELS[sort]) })}
            onPress={() => setSortSheetOpen(true)}
          />
        </View>
      )}
    </View>
  );

  // 空の状態。読み込み前は出さない（曲があるのに「曲がありません」が一瞬見える）。
  let empty: { title: string; message: string; action?: { label: string; onPress: () => void } } | null =
    null;
  if (view !== null && (view.sort === 'title' ? view.songs.length === 0 : view.groups.length === 0)) {
    empty =
      view.readyCount === 0
        ? { title: t('show.empty.title'), message: t('show.empty.message') }
        : {
            title: t('songs.noMatch.title'),
            message: t('show.noMatch.message'),
            action: {
              label: t('songs.noMatch.clear'),
              onPress: () => {
                setSearch('');
                setTagId(undefined);
              },
            },
          };
  }

  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('app.name') }} />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <SectionList
          sections={sections}
          renderItem={renderSong}
          // 曲名順には見出しが無い（`artist` が無いまとまり）。
          renderSectionHeader={({ section }) =>
            section.artist === undefined ? null : (
              <ShowArtistHeader artist={section.artist} count={section.data.length} />
            )
          }
          keyExtractor={(song) => song.id}
          // アーティストの見出しを、スクロールしても上に残す（今どの人の曲かが分かる）。
          stickySectionHeadersEnabled
          ListHeaderComponent={header}
          ListEmptyComponent={empty && <EmptyState {...empty} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        />
        <OptionSheet
          visible={sortSheetOpen}
          title={t('songs.sortTitle')}
          options={SORT_NAMES.map((name) => ({ value: name, label: t(SORT_LABELS[name]) }))}
          selected={sort}
          onSelect={(value) => {
            setSort(value);
            setSortSheetOpen(false);
          }}
          onClose={() => setSortSheetOpen(false)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingTop: 16, gap: 12 },
  intro: { alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  // 読み込み前は空欄。件数が出ても、検索欄の位置が動かないよう、行の高さを確保する。
  count: { minHeight: 22, fontSize: 15, lineHeight: 22 },
  search: { paddingHorizontal: 16 },
  // チップの列は、左右の余白（16pt）をスクロールの内側に持たせて、画面の端まで流す。
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  // 並び替えのボタンは、右に寄せる（Songs の見出しの行の右端と同じ位置）。
  sortRow: { alignItems: 'flex-end', paddingHorizontal: 16 },
});
