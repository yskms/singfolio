import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSemitones } from '../src/domain/keyOffset';
import type { Song } from '../src/domain/types';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/** 原曲のまま（`0`）のMy Keyの、一覧での表記。行ごとに「Original」と並べると賑やかなので、ハイフンにする。 */
const ORIGINAL_MARK = '-';

/**
 * 曲の一覧の1行（曲名・アーティスト・タグ、右にMy Key）。押すと `onPress`（Song Detailを開く）。
 * My Keyは、歌う前に見たい情報なので、一覧に出す（`0` は `-`。Song Detail・入力画面は「Original」）。
 * Private Noteは出さない。人に見せる画面（Show Mode）は、この行を使わない（`ShowSongRow`）。
 * 数百曲でも軽いよう、`song` と `onPress` が変わらない限り再描画しない（`onPress` は、
 * 呼び出し側で安定した関数にする）。
 */
export const SongRow = memo(function SongRow({
  song,
  onPress,
}: {
  song: Song;
  onPress: (song: Song) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const original = song.keyOffset === 0;
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
      <View style={styles.main}>
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
      <View style={styles.key}>
        <Text numberOfLines={1} style={[styles.keyLabel, { color: colors.textSecondary }]}>
          {t('songForm.myKey')}
        </Text>
        <Text
          numberOfLines={1}
          // 原曲のままは控えめに、ずらしている曲だけを目立たせる（Regular / Bold だけを使う）。
          // `-` は読み上げに向かないので、原曲のままのときは「Original」と読ませる。
          accessibilityLabel={original ? t('songForm.keyOriginal') : undefined}
          style={[
            styles.keyValue,
            original
              ? { color: colors.textSecondary, fontWeight: '400' }
              : { color: colors.textPrimary, fontWeight: '700' },
          ]}
        >
          {original ? ORIGINAL_MARK : formatSemitones(song.keyOffset)}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  artist: { fontSize: 14, lineHeight: 20 },
  tags: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  // 「Original」と「+2」で幅が変わっても、行の間で右端がそろうよう、右寄せにする。
  key: { minWidth: 64, alignItems: 'flex-end' },
  keyLabel: { fontSize: 12, lineHeight: 16 },
  keyValue: { fontSize: 15, lineHeight: 20 },
});
