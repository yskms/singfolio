import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ShowSong } from '../src/domain/types';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Show Mode の曲の1行（曲名・タグ）。アーティストは、上の見出し（`ShowArtistHeader`）に出す。
 * 押せない。Song Detail は My Key・Private Note を出す管理の画面なので、人に見せる画面から
 * 開かない（`Pressable` にしない）。`ShowSong` は管理情報を持たないので、ここで出せない。
 */
export const ShowSongRow = memo(function ShowSongRow({ song }: { song: ShowSong }) {
  const { colors } = useTheme();
  return (
    <View accessible style={styles.row}>
      <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary }]}>
        {song.title}
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
  row: { paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 17, lineHeight: 24 },
  tags: { fontSize: 13, lineHeight: 18 },
});
