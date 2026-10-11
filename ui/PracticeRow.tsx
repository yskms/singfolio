import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Song } from '../src/domain/types';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Practice の一覧の1行（曲名・アーティスト・最終更新と、`Mark as Ready` のボタン）。曲の情報を
 * 押すと `onPress`（Song Detailを開く）、ボタンを押すと `onMarkReady`。Songs の行（`SongRow`）と
 * 違い、タグの代わりに最終更新を出す。管理用の情報（My Key・Private Note）は出さない。`updated` は、
 * 出す形に整えた文字列（日付の整形は呼び出し側。`memo` が効くよう、`Date` ではなく文字列で受ける）。
 * `song` と `updated` と2つの関数が変わらない限り再描画しない（関数は、呼び出し側で安定した関数にする）。
 *
 * `SongRow` とほぼ同じ作りだが、ボタンが入るため、あえて分けている（「共通化」しない）。
 * - 曲の情報（曲名・アーティスト・最終更新）を押す部分と、ボタンは、兄弟の要素にする。行全体を押せる
 *   `Pressable` の中にボタンを入れない。行を `accessible` にすると、iOS では子が1つにまとめられ、
 *   中のボタンにVoiceOverでフォーカスできなくなる。`Pressable` の入れ子は、押す範囲も競合する。
 * - 行の下の線は、2つを包む `View` に付ける（情報の `Pressable` に付けると、ボタンが線の外に出る）。
 */
export const PracticeRow = memo(function PracticeRow({
  song,
  updated,
  onPress,
  onMarkReady,
}: {
  song: Song;
  updated: string;
  onPress: (song: Song) => void;
  onMarkReady: (song: Song) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Pressable
        accessible
        accessibilityRole="button"
        onPress={() => onPress(song)}
        style={({ pressed }) => [
          styles.info,
          { backgroundColor: pressed ? colors.surface : 'transparent' },
        ]}
      >
        <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary }]}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={[styles.artist, { color: colors.textSecondary }]}>
          {song.artist}
        </Text>
        <Text numberOfLines={1} style={[styles.updated, { color: colors.textSecondary }]}>
          {updated}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('practice.markReadyLabel', { title: song.title })}
        onPress={() => onMarkReady(song)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: colors.textPrimary }]}>{t('practice.markReady')}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  artist: { fontSize: 14, lineHeight: 20 },
  updated: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  // 行の幅いっぱいにはしない（一覧に、同じ幅の大きなボタンが並ぶと、曲の名前より目立つ）。
  button: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
