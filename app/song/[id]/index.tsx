import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatSemitones } from '../../../src/domain/keyOffset';
import { SONG_STATUSES, type Song, type SongStatus } from '../../../src/domain/types';
import { errorMessageKey } from '../../../src/i18n';
import { getServices, ServiceError } from '../../../src/services';
import { ChoiceRow } from '../../../ui/ChoiceRow';
import { FormField } from '../../../ui/FormField';
import { useI18n } from '../../../ui/i18n';
import { MessageScreen } from '../../../ui/MessageScreen';
import { Text } from '../../../ui/Text';
import { useTheme } from '../../../ui/theme';

// 曲名はこの画面の本文に出すので、ヘッダーには題を付けない（戻るボタンの文字も出さない）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  title: '',
} as const;

// Song Detail。Songsの行から開く。ステータスは、ここで直接変えられる（保存の操作は無い）。
export default function SongDetailScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  // 読み込んだ曲。`id` は、どの曲のものか（開いたまま別のIDへ移動したとき、前の曲を出し続けない）。
  // `song` が null は、曲が無い（開いている間に消えた・存在しないIDのリンクを開いた）。
  const [loaded, setLoaded] = useState<{ id: string; song: Song | null } | undefined>(undefined);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // ステータスの変更が重ならないようにする（state は再描画まで古い）。
  const changingRef = useRef(false);
  // ステータスを変えるたびに増やす。変える前に読み始めた結果が、後から届いて、変えた後の曲を
  // 古い内容で上書きしないようにする。
  const changeCount = useRef(0);

  // 画面を開いたときと、上に重ねた画面（Edit Song）から戻ったときに、曲を読み直す。
  // 戻ったときは、前の内容を出したまま読み直す（空の画面を挟まない）。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const startedAt = changeCount.current;
      getServices()
        .then(({ songs }) => songs.getSong(id))
        .then(
          (song) => {
            if (!cancelled && changeCount.current === startedAt) setLoaded({ id, song });
          },
          (error) => {
            if (!cancelled) setFailure({ error });
          },
        );
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  const current = loaded?.id === id ? loaded : undefined;
  const song = current?.song ?? undefined;

  const changeStatus = async (status: SongStatus) => {
    if (!song || status === song.status || changingRef.current) return;
    changingRef.current = true;
    changeCount.current += 1;
    try {
      const { songs } = await getServices();
      const updated = await songs.setStatus(song.id, status);
      // 変えている間に、別の曲へ移動していたら（開いたままIDが変わったとき）、その曲の読み込みを残す。
      setLoaded((prev) => (prev !== undefined && prev.id !== song.id ? prev : { id: song.id, song: updated }));
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'song-not-found') {
        setLoaded({ id: song.id, song: null });
      } else {
        Alert.alert(t('songDetail.statusFailedTitle'), t(errorMessageKey(error)), [
          { text: t('common.ok') },
        ]);
      }
    } finally {
      changingRef.current = false;
    }
  };

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      {current !== undefined &&
        (song === undefined ? (
          // `replace('/')` にしない理由は、app/song/[id]/edit.tsx のコメントを参照。
          <MessageScreen
            title={t('songForm.notFoundTitle')}
            message={t('error.songNotFound')}
            action={{ label: t('notFound.home'), onPress: () => router.dismissTo('/') }}
          />
        ) : (
          <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
          >
            <View style={styles.heading}>
              <Text role="heading" style={[styles.title, { color: colors.textPrimary }]}>
                {song.title}
              </Text>
              <Text style={[styles.artist, { color: colors.textSecondary }]}>{song.artist}</Text>
            </View>

            <FormField label={t('songForm.status')}>
              <ChoiceRow
                options={SONG_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                value={song.status}
                onChange={(status) => void changeStatus(status)}
              />
            </FormField>

            <FormField label={t('songForm.myKey')}>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {song.keyOffset === 0 ? t('songForm.keyOriginal') : formatSemitones(song.keyOffset)}
              </Text>
            </FormField>

            {/* タグとPrivate Noteは、無ければ項目ごと出さない。 */}
            {song.tags.length > 0 && (
              <FormField label={t('songForm.tags')}>
                <View style={styles.tags}>
                  {song.tags.map((tag) => (
                    <View key={tag.id} style={[styles.tag, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.tagLabel, { color: colors.textPrimary }]}>{tag.name}</Text>
                    </View>
                  ))}
                </View>
              </FormField>
            )}

            {song.privateNote !== '' && (
              <FormField label={t('songForm.privateNote')}>
                <Text style={[styles.note, { color: colors.textPrimary }]}>{song.privateNote}</Text>
              </FormField>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/song/${song.id}/edit`)}
              style={({ pressed }) => [
                styles.editButton,
                { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.editLabel, { color: colors.textPrimary }]}>{t('songDetail.edit')}</Text>
            </Pressable>
          </ScrollView>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  heading: { gap: 4 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  artist: { fontSize: 16, lineHeight: 24 },
  value: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 18 },
  tagLabel: { fontSize: 14, lineHeight: 20 },
  // 改行を、入力したとおりに出す。
  note: { fontSize: 16, lineHeight: 24 },
  divider: { height: StyleSheet.hairlineWidth },
  editButton: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
