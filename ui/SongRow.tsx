import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { Song } from '../src/domain/types';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 曲の一覧の1行（曲名・アーティスト・タグ）。押すと `onPress`（Song Detailを開く）。管理用の
 * 情報（My Key・Private Note）は一覧に出さない。数百曲でも軽いよう、`song` と `onPress` が
 * 変わらない限り再描画しない（`onPress` は、呼び出し側で安定した関数にする）。
 */
export const SongRow = memo(function SongRow({
  song,
  onPress,
}: {
  song: Song;
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
      {song.tags.length > 0 && (
        <Text numberOfLines={1} style={[styles.tags, { color: colors.textSecondary }]}>
          {song.tags.map((tag) => tag.name).join(' · ')}
        </Text>
      )}
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
  tags: { marginTop: 2, fontSize: 13, lineHeight: 18 },
});
