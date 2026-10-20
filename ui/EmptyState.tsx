import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/** 一覧が空のときの案内（題・説明・ボタン）。Songsで使う。題とボタンは省略できる。 */
export function EmptyState({
  title,
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      {title !== undefined && (
        <Text role="heading" style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
      )}
      <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.emptyButtonLabel, { color: colors.onPrimary }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  emptyMessage: { marginTop: 8, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyButton: {
    marginTop: 24,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
