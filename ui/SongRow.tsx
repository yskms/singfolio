import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Song } from '../src/domain/types';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 曲の一覧の1行（曲名・アーティスト・タグ）。管理用の情報（My Key・Private Note）は
 * 一覧に出さない。数百曲でも軽いよう、`song` が変わらない限り再描画しない。
 */
export const SongRow = memo(function SongRow({ song }: { song: Song }) {
  const { colors } = useTheme();
  return (
    <View accessible style={[styles.row, { borderBottomColor: colors.border }]}>
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
    </View>
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
