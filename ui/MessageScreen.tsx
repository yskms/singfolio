import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 画面全体に、見出しと説明と（任意で）ボタン1つを出す。エラー画面・存在しない画面用。
 *
 * `ThemeProvider` の外でも使える（`useTheme` は Provider を要らない）。起動に失敗した
 * ときのエラー画面は、Provider の外で描画されるため。
 */
export function MessageScreen({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* 文字を大きくした端末でも切れないよう、はみ出すときはスクロールできるようにする。 */}
      <ScrollView contentContainerStyle={styles.content}>
        <Text role="heading" style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        {action && (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{action.label}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  message: { marginTop: 12, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 480 },
  button: {
    marginTop: 32,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
});
