import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Tag } from '../src/domain/types';
import { decorative } from './decorative';
import { FilterChip } from './FilterChip';
import { FormInput } from './FormInput';
import { useI18n } from './i18n';
import { useTheme } from './theme';

/**
 * 曲のタグの入力（Add / Edit Song）。作成済みのタグをチップで複数選べ、下の入力欄で新しい
 * タグを足せる。足した新しいタグ（`pendingNames`）は、曲を保存するまでタグとして作らない
 * （保存せずに戻ったとき、使われないタグが残らないように）。選択中として並べ、もう一度
 * 押すと取り消せる。
 */
export function TagPicker({
  tags,
  selectedIds,
  pendingNames,
  onToggleTag,
  onRemovePending,
  input,
  onChangeInput,
  onSubmitInput,
  onInputFocus,
}: {
  /** 作成済みのタグ */
  tags: readonly Tag[];
  selectedIds: ReadonlySet<string>;
  /** 保存するときに作る、新しいタグの名前 */
  pendingNames: readonly string[];
  onToggleTag: (id: string) => void;
  onRemovePending: (name: string) => void;
  input: string;
  onChangeInput: (text: string) => void;
  /** 入力欄の名前を足す（Enter・追加ボタン） */
  onSubmitInput: () => void;
  /** 入力欄にフォーカスが入った */
  onInputFocus?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const canAdd = input.trim() !== '';
  return (
    <View style={styles.root}>
      {(tags.length > 0 || pendingNames.length > 0) && (
        <View style={styles.chips}>
          {tags.map((tag) => (
            <FilterChip
              key={tag.id}
              label={tag.name}
              selected={selectedIds.has(tag.id)}
              onPress={() => onToggleTag(tag.id)}
            />
          ))}
          {pendingNames.map((name) => (
            <FilterChip key={`new:${name}`} label={name} selected onPress={() => onRemovePending(name)} />
          ))}
        </View>
      )}
      <View style={styles.inputRow}>
        <FormInput
          containerStyle={styles.field}
          value={input}
          onChangeText={onChangeInput}
          placeholder={t('songForm.newTagPlaceholder')}
          accessibilityLabel={t('songForm.newTagPlaceholder')}
          returnKeyType="done"
          // Enterで足した後も、キーボードを閉じない（続けて足せるように。iOSで確認。Androidは、
          // 指定しても閉じる）。
          submitBehavior="submit"
          onSubmitEditing={onSubmitInput}
          onFocus={onInputFocus}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('songForm.addTag')}
          accessibilityState={{ disabled: !canAdd }}
          disabled={!canAdd}
          onPress={onSubmitInput}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: !canAdd ? 0.4 : pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="add" size={24} color={colors.onPrimary} {...decorative} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flex: 1 },
  addButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
