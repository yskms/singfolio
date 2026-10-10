import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

export interface SuggestionRow {
  key: string;
  /** 1行目（曲名、またはアーティスト名） */
  primary: string;
  /** 2行目（曲の候補のアーティスト） */
  secondary?: string;
  /** 登録済みの印を出す */
  registered?: boolean;
  accessibilityLabel: string;
}

/**
 * Add / Edit Song の候補の一覧。入力欄の直下に出す（オーバーレイにしない。キーボードの余白と
 * 同じスクロールの中に置く）。行は低く、2行まで（キーボードの上に収めるため）。
 * `provider` は提供元の表記で、外部へ検索語を送る間は必ず出す（行が0件でも出す）。
 */
export function SuggestionList({
  rows,
  hint,
  onPick,
  provider,
}: {
  rows: readonly SuggestionRow[];
  /** 行の読み上げの補足（押すと何が入力されるか） */
  hint: string;
  onPick: (index: number) => void;
  provider?: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (rows.length === 0 && provider === undefined) return null;
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={row.accessibilityLabel}
          accessibilityHint={hint}
          onPress={() => onPick(index)}
          style={({ pressed }) => [
            styles.row,
            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View style={styles.texts}>
            <Text numberOfLines={1} style={[styles.primary, { color: colors.textPrimary }]}>
              {row.primary}
            </Text>
            {row.secondary !== undefined && (
              <Text numberOfLines={1} style={[styles.secondary, { color: colors.textSecondary }]}>
                {row.secondary}
              </Text>
            )}
          </View>
          {row.registered === true && (
            <Text style={[styles.badge, { color: colors.textSecondary }]}>
              {t('songForm.suggestionRegistered')}
            </Text>
          )}
        </Pressable>
      ))}
      {provider !== undefined && (
        <Text style={[styles.provider, { color: colors.textSecondary }]}>{provider}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  // 2行（16 + 13pt）で約40pt。余白を足して、押せる高さ（44pt）を超える。
  row: { minHeight: 52, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1 },
  primary: { fontSize: 16, lineHeight: 22 },
  secondary: { fontSize: 13, lineHeight: 18 },
  badge: { fontSize: 12, lineHeight: 16 },
  provider: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, lineHeight: 16 },
});
