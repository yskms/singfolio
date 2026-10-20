import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tag } from '../src/domain/types';
import { errorMessageKey } from '../src/i18n';
import { getServices, ServiceError } from '../src/services';
import { decorative } from '../ui/decorative';
import { EmptyState } from '../ui/EmptyState';
import { useI18n } from '../ui/i18n';
import { TagEditDialog } from '../ui/TagEditDialog';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（Song Detail と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Tags。Settings タブから開く。作成済みのタグの名前の変更と削除（タグを作るのは、曲の
// 追加・編集。ここでは作らない）。名前を変えても、曲の最終更新は変わらない。削除すると、付いて
// いた曲から外れる（曲は残る）。
export default function TagsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [tags, setTags] = useState<Tag[] | undefined>(undefined);
  // 変更・削除の後に増やして、一覧を読み直す（前の一覧は、読み直しが終わるまで出し続ける）。
  const [reloadKey, setReloadKey] = useState(0);
  // 名前を変えているタグ（ダイアログを出す）。
  const [editing, setEditing] = useState<Tag | null>(null);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // 削除が重ならないようにする（state は再描画まで古い）。
  const deletingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getServices()
      .then(({ tags: service }) => service.listTags())
      .then(
        (list) => {
          if (!cancelled) setTags(list);
        },
        (error) => {
          if (!cancelled) setFailure({ error });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // 読み込みの失敗は、画面の描画の失敗と同じく、ルートのErrorBoundary（エラー画面）に任せる。
  // Errorでない値は包む（`app/_layout.tsx` と同じ理由）。
  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));

  const rename = async (tag: Tag, name: string): Promise<string | undefined> => {
    try {
      const { tags: service } = await getServices();
      await service.renameTag(tag.id, name);
    } catch (error) {
      // タグが既に無いときは、入力を直しても解消しない。ダイアログを閉じて、一覧を読み直す
      // （削除はこの画面だけなので、来ない想定の防御）。
      if (!(error instanceof ServiceError && error.code === 'tag-not-found')) {
        return t(errorMessageKey(error));
      }
    }
    setEditing(null);
    setReloadKey((key) => key + 1);
    return undefined;
  };

  const remove = async (tag: Tag) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      const { tags: service } = await getServices();
      await service.deleteTag(tag.id);
      setEditing(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      Alert.alert(t('tags.deleteFailedTitle'), t(errorMessageKey(error)), [{ text: t('common.ok') }]);
    } finally {
      deletingRef.current = false;
    }
  };

  const confirmDelete = (tag: Tag) => {
    Alert.alert(t('tags.deleteTitle'), t('tags.deleteMessage', { name: tag.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('tags.deleteConfirm'), style: 'destructive', onPress: () => void remove(tag) },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('tags.title') }} />
      {tags !== undefined && (
        <FlatList
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
          data={tags}
          keyExtractor={(tag) => tag.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t('tags.rowHint')}
              onPress={() => setEditing(item)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>
                {item.name}
              </Text>
              <Ionicons name="create-outline" size={20} color={colors.textSecondary} {...decorative} />
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState title={t('tags.empty.title')} message={t('tags.empty.message')} />
          }
        />
      )}
      {editing !== null && (
        <TagEditDialog
          key={editing.id}
          tag={editing}
          onSave={(name) => rename(editing, name)}
          onDelete={() => confirmDelete(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 22 },
});
