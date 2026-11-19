import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PublicTagChoice } from '../src/domain/types';
import { errorMessageKey } from '../src/i18n';
import { getServices, ServiceError } from '../src/services';
import { PUBLISH_LIMITS } from '../src/services/publishSnapshot';
import { EmptyState } from './EmptyState';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Public Tags 画面（`app/public-tags.tsx`）の中身。端末のすべてのタグを並べ、公開ページに出すタグをオンにする。
 * **オンにしたタグが、Ready の曲のそのタグが付いたところに出る**（オフのタグは名前も送らない）。既定は全部オフ。
 *
 * 選択は端末内だけの設定で、押すたびにその場で保存する（通信しない・サインインも要らない。保存ボタンは無い）。公開中の内容は
 * すぐには変わらず、次の Publish から反映される。保存に失敗したら、そのタグの表示は元に戻す。
 */
export function PublicTagsSection() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [choices, setChoices] = useState<PublicTagChoice[] | undefined>(undefined);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // 保存中のタグ。同じタグの連打が重ならないようにする（state は再描画まで古いので、参照でも持つ）。
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const savingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async () => {
    try {
      const { publish } = await getServices();
      const list = await publish.listPublicTagChoices();
      if (mountedRef.current) setChoices(list);
    } catch (error) {
      if (mountedRef.current) setFailure({ error });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 読み込みの失敗は、Tags と同じく、ルートのErrorBoundary（エラー画面）に任せる（端末内のDBの読み取りで、通信は無い）。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  const toggle = async (choice: PublicTagChoice, next: boolean) => {
    if (savingRef.current.has(choice.id)) return;
    savingRef.current.add(choice.id);
    setSaving(new Set(savingRef.current));
    // 先に見た目を変える（保存は数ミリ秒。失敗したら戻す）。
    setChoices((current) => current?.map((c) => (c.id === choice.id ? { ...c, isPublic: next } : c)));
    try {
      const { publish } = await getServices();
      await publish.setTagPublic(choice.id, next);
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(t('publicTags.saveFailedTitle'), t(errorMessageKey(error)), [{ text: t('common.ok') }]);
        // タグが既に無いときは、一覧ごと読み直す。それ以外は、そのタグの表示だけを元に戻す。
        if (error instanceof ServiceError && error.code === 'tag-not-found') {
          await load();
        } else {
          setChoices((current) => current?.map((c) => (c.id === choice.id ? { ...c, isPublic: choice.isPublic } : c)));
        }
      }
    } finally {
      savingRef.current.delete(choice.id);
      if (mountedRef.current) setSaving(new Set(savingRef.current));
    }
  };

  if (choices === undefined) return null;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
      data={choices}
      keyExtractor={(choice) => choice.id}
      ListHeaderComponent={
        choices.length > 0 ? (
          <View style={styles.header}>
            <Text style={[styles.note, { color: colors.textPrimary }]}>{t('publicTags.intro')}</Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              {t('publicTags.limitNote', { limit: PUBLISH_LIMITS.tagsPerSong })}
            </Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>{t('publicTags.applyNote')}</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <TagRow choice={item} disabled={saving.has(item.id)} onChange={(next) => void toggle(item, next)} />
      )}
      ListEmptyComponent={<EmptyState title={t('publicTags.empty.title')} message={t('publicTags.empty.message')} />}
    />
  );
}

/**
 * 1行。行全体を押して切り替える。スイッチは見た目だけで、読み上げは行が「スイッチ」として1つにまとめる
 * （タグ名と、付いている Ready の曲の数を読む）。
 */
function TagRow({
  choice,
  disabled,
  onChange,
}: {
  choice: PublicTagChoice;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const songCount = t('publicTags.songCount', { count: choice.readySongCount });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={choice.name}
      accessibilityHint={songCount}
      accessibilityState={{ checked: choice.isPublic, disabled }}
      disabled={disabled}
      onPress={() => onChange(!choice.isPublic)}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.labels}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>
          {choice.name}
        </Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{songCount}</Text>
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={choice.isPublic}
          trackColor={{ false: colors.border, true: colors.primary }}
          // Settings の Suggestions と同じ（Androidのつまみは既定だとOSのアクセントの色になり、ブランドと合わない。理由は SettingsSection）。
          thumbColor={Platform.OS === 'android' ? (choice.isPublic ? colors.textPrimary : colors.textSecondary) : undefined}
          ios_backgroundColor={colors.border}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 16, paddingBottom: 8 },
  note: { fontSize: 14, lineHeight: 20 },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  labels: { flexShrink: 1, paddingVertical: 8 },
  name: { fontSize: 16, lineHeight: 22 },
  count: { fontSize: 13, lineHeight: 18 },
});
