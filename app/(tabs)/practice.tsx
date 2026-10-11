import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, StyleSheet, View } from 'react-native';

import type { Song } from '../../src/domain/types';
import { errorMessageKey, formatDay } from '../../src/i18n';
import { getServices, ServiceError } from '../../src/services';
import { EmptyState } from '../../ui/EmptyState';
import { useI18n } from '../../ui/i18n';
import { PracticeRow } from '../../ui/PracticeRow';
import { SearchField } from '../../ui/SearchField';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { useFocusRefreshKey } from '../../ui/useFocusRefreshKey';

interface Loaded {
  /**
   * この一覧を読み込んだときの検索語。件数・空の状態は、表示中の一覧に合わせるため、現在の
   * state（入力は、読み込みより先に変わる）ではなく、これで決める。
   */
  search: string;
  /** 練習中の曲（更新が新しい順）。`search` で絞り込み済み */
  songs: Song[];
  /** 練習中の曲の総数（検索に関係なく）。0なら、検索のせいではなく、練習中の曲が無い */
  total: number;
}

export default function PracticeScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();

  // 検索語。タブは開いたままなので、アプリを終了するまで残る（Songsの絞り込みと同じ）。
  const [search, setSearch] = useState('');

  // 行の `memo` が効くよう、行へ渡す関数は毎回作り直さない。
  const openSong = useCallback((song: Song) => router.push(`/song/${song.id}`), [router]);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Mark as Ready のあとに、一覧を読み直す合図。他の画面で変わったときの `refreshKey` とは別
  // （こちらは、この画面の中で変えたときに増やす）。増えると、読み込み中の古い結果は捨てられる。
  const [reloadKey, setReloadKey] = useState(0);
  // Mark as Ready の処理中の曲。同じ曲のボタンを続けて押しても、2回は変えない。曲ごとに分けるのは、
  // 別の曲のボタンは、続けて押せるようにするため（書き込みは直列になる）。
  const markingIds = useRef(new Set<string>());
  // 最終更新の「今日」の判定に使う現在時刻。一覧を読み込むたびに更新するほか、アプリが
  // バックグラウンドから戻ったときも更新する。戻っても、タブのフォーカスは変わらず、一覧は
  // 読み直さない（曲が変わるのはアプリの中だけ）ので、これが無いと、昨夜開いたまま閉じて
  // 翌朝開いたとき、昨日更新した曲が「今日」のまま残る。読み直しは要らず、日付の文字列だけが変わる。
  // 画面を見ている最中に日付をまたいだ場合は、読み直す（タブの切り替え・検索の変更）まで変わらない。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  // 他の画面で曲が変わったあと（Song Detail など）に戻ってきたら、読み直す。
  const refreshKey = useFocusRefreshKey();
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    // 検索語がすぐに変わると、先の読み込みが後から終わることがある。古い結果で上書きしない
    // よう、条件が変わったら捨てる。
    let cancelled = false;
    (async () => {
      const { songs } = await getServices();
      const [list, counts] = await Promise.all([
        songs.listSongs({ status: 'practice', search, sortBy: 'updatedAt', direction: 'desc' }),
        songs.countSongsByStatus(),
      ]);
      if (cancelled) return;
      setLoaded({ search, songs: list, total: counts.practice });
      setNow(Date.now());
    })().catch((error) => {
      if (!cancelled) setFailure({ error });
    });
    return () => {
      cancelled = true;
    };
  }, [search, refreshKey, reloadKey]);

  const markReady = useCallback(
    async (song: Song) => {
      if (markingIds.current.has(song.id)) return;
      markingIds.current.add(song.id);
      let changed = false;
      try {
        const { songs } = await getServices();
        await songs.setStatus(song.id, 'ready');
        changed = true;
      } catch (error) {
        // 曲が既に無いときは、一覧から消えれば済む（伝えることは無い）。読み直す。
        if (error instanceof ServiceError && error.code === 'song-not-found') {
          changed = true;
        } else {
          Alert.alert(t('practice.markReadyFailedTitle'), t(errorMessageKey(error)), [
            { text: t('common.ok') },
          ]);
        }
      } finally {
        markingIds.current.delete(song.id);
      }
      // Ready になった曲は Practice ではなくなるので、一覧から外れる。
      if (changed) setReloadKey((key) => key + 1);
    },
    [t],
  );

  const renderSong = useCallback(
    ({ item }: { item: Song }) => {
      const day = formatDay(item.updatedAt, now, language);
      const updated = day === null ? t('practice.updatedToday') : t('practice.updated', { date: day });
      return <PracticeRow song={item} updated={updated} onPress={openSong} onMarkReady={markReady} />;
    },
    [openSong, markReady, now, language, t],
  );

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  const header = (
    <View style={styles.header}>
      <Text style={[styles.count, { color: colors.textSecondary }]}>
        {loaded === null ? '' : t('practice.count', { count: loaded.songs.length })}
      </Text>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={t('songs.searchPlaceholder')}
        clearLabel={t('songs.searchClear')}
      />
    </View>
  );

  // 空の状態。読み込み前は出さない（曲があるのに「練習中の曲はありません」が一瞬見える）。
  let empty: { title: string; message: string; action?: { label: string; onPress: () => void } } | null =
    null;
  if (loaded !== null && loaded.songs.length === 0) {
    if (loaded.total === 0 || loaded.search.trim() === '') {
      empty = { title: t('practice.empty.title'), message: t('practice.empty.message') };
    } else {
      empty = {
        title: t('songs.noMatch.title'),
        message: t('practice.noMatch.message'),
        action: { label: t('songs.searchClear'), onPress: () => setSearch('') },
      };
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 24 },
  // 件数と検索欄は、一覧と一緒にスクロールする（Songsと同じ。検索欄は固定しない）。
  // 検索欄を含むので、FlatListのヘッダーには、コンポーネントではなく要素を渡す
  // （毎回別の関数になると、入力欄が作り直されてフォーカスを失う）。
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  // 読み込み前は空欄。件数が出ても、検索欄の位置が動かないよう、行の高さを確保する。
  count: { minHeight: 20, fontSize: 14, lineHeight: 20 },
});
