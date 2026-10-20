import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSemitones } from '../src/domain/keyOffset';
import type { Song, SongStatus } from '../src/domain/types';
import { decorative } from './decorative';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/** 原曲のまま（`0`）のMy Keyの、一覧での表記。行ごとに「Original」と並べると賑やかなので、ハイフンにする。 */
const ORIGINAL_MARK = '-';

/**
 * 曲の一覧の1行（曲名・アーティスト・タグ、右にMy Key）。押すと `onPress`（Song Detailを開く）。
 * My Keyは、歌う前に見たい情報なので、一覧に出す（`0` は `-`。Song Detail・入力画面は「Original」）。
 * Private Noteは出さない。人に見せる画面（Show Mode）は、この行を使わない（`ShowSongRow`）。
 *
 * `actionTarget` を渡すと、右端に、その曲のステータスを `actionTarget` に変えるボタンを出す
 * （Songs を Practice で絞ると「Ready」へ、Want で絞ると「Practice」へ。押すと `onAction`）。
 * ボタンは行の高さを増やさない（My Keyの右に並べる）。
 *
 * 数百曲でも軽いよう、props が変わらない限り再描画しない（関数は、呼び出し側で安定した関数にする）。
 *
 * 曲の情報（押すと Song Detail）とボタンは、兄弟の要素にする。行全体を押せる `Pressable` の中に
 * ボタンを入れない。行を `accessible` にすると、iOS では子が1つにまとめられ、中のボタンに
 * VoiceOver でフォーカスできなくなる。`Pressable` の入れ子は、押す範囲も競合する。
 * そのため、行の下の線は、2つを包む `View` に付ける。押したときの色の変化は、曲の情報の部分だけ。
 */
export const SongRow = memo(function SongRow({
  song,
  onPress,
  actionTarget,
  onAction,
}: {
  song: Song;
  onPress: (song: Song) => void;
  actionTarget?: SongStatus;
  onAction?: (song: Song, target: SongStatus) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const original = song.keyOffset === 0;
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

      {actionTarget !== undefined && onAction !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            actionTarget === 'ready' ? 'songs.action.toReadyLabel' : 'songs.action.toPracticeLabel',
            { title: song.title },
          )}
          // 見た目は小さく（行の高さを増やさない）、押せる範囲は広げる。
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          onPress={() => onAction(song, actionTarget)}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="arrow-forward" size={16} color={colors.primary} {...decorative} />
          <Text numberOfLines={1} style={[styles.buttonLabel, { color: colors.textPrimary }]}>
            {t(`status.${actionTarget}`)}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  main: { flex: 1 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  artist: { fontSize: 14, lineHeight: 20 },
  tags: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  // 「+2」と `-` で幅が変わっても、行の間で右端がそろうよう、右寄せにする。
  key: { minWidth: 48, alignItems: 'flex-end' },
  keyLabel: { fontSize: 12, lineHeight: 16 },
  keyValue: { fontSize: 15, lineHeight: 20 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    marginRight: 16,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
