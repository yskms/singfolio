import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Show Mode のアーティストの見出し（名前と、右端にそのアーティストの曲数）。一覧の見出しとして
 * 上に貼り付くので、背景は不透明にする（下を流れる曲が透けない）。読み上げは、名前と曲数を
 * 1つにまとめる。
 */
export const ShowArtistHeader = memo(function ShowArtistHeader({
  artist,
  count,
}: {
  artist: string;
  count: number;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View
      accessible
      role="heading"
      accessibilityLabel={t('show.artistA11y', { artist, count })}
      style={[styles.header, { backgroundColor: colors.background }]}
    >
      <Text numberOfLines={1} style={[styles.artist, { color: colors.textPrimary }]}>
        {artist}
      </Text>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{String(count)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  artist: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  count: { flexShrink: 0, fontSize: 14, lineHeight: 20 },
});
