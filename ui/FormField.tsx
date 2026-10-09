import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 入力画面の1項目（見出し・内容・エラー）。必須の項目は見出しの後ろに「*」を付ける
 * （見た目だけ。読み上げは、入力欄の `accessibilityHint` で伝える）。
 */
export function FormField({
  label,
  required = false,
  note,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  /** 見出しと内容の間に出す、短い説明 */
  note?: string;
  error?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
        {required && (
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {' *'}
          </Text>
        )}
      </Text>
      {note !== undefined && <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text>}
      {children}
      {error !== undefined && (
        // 入力の後に出るエラーを、読み上げにも伝える（Androidの live region）。
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.error }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 18 },
});
