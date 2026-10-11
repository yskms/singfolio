import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { Song } from '../src/domain/types';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Practice の一覧の1行（曲名・アーティスト・最終更新）。押すと `onPress`（Song Detailを開く）。
 * Songs の行（`SongRow`）と違い、タグの代わりに最終更新を出す。管理用の情報（My Key・Private Note）は
 * 出さない。`updated` は、出す形に整えた文字列（日付の整形は呼び出し側。`memo` が効くよう、
 * `Date` ではなく文字列で受ける）。`song` と `updated` と `onPress` が変わらない限り再描画しない
 * （`onPress` は、呼び出し側で安定した関数にする）。
 *
 * `SongRow` とほぼ同じ作りだが、あえて分けている。WBS 3.2 で、各行に `Mark as Ready` のボタンが
 * 入るため。3.2 では、次の形にする（`SongRow` と「共通化」しない）。
 * - 行全体を押せる `Pressable` の中にボタンを入れない。行を `accessible` にすると、iOS では子が
 *   1つにまとめられ、中のボタンにVoiceOverでフォーカスできなくなる。`Pressable` の入れ子は、
 *   押す範囲も競合する。
 * - 曲の情報（曲名・アーティスト・最終更新）を押す部分と、ボタンを、兄弟の要素にする。
 */
export const PracticeRow = memo(function PracticeRow({
  song,
  updated,
  onPress,
}: {
  song: Song;
  updated: string;
  onPress: (song: Song) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      onPress={() => onPress(song)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : 'transparent' },
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
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  artist: { fontSize: 14, lineHeight: 20 },
  updated: { marginTop: 2, fontSize: 13, lineHeight: 18 },
});
