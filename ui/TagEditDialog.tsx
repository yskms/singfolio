import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tag } from '../src/domain/types';
import { FormField } from './FormField';
import { FormInput } from './FormInput';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * タグの名前の変更と削除（Tags 画面）。画面の上の方に出す（Androidはエッジ・ツー・エッジで、
 * キーボードが出ても画面が縮まないので、下に置くと入力欄がキーボードに隠れる）。幕・Androidの
 * 戻る操作でも閉じる。`tag` ごとに作り直す（`key` に `tag.id` を渡す）。
 *
 * 保存は、名前を変えられたら閉じる（閉じるのは呼び出し側）。変えられなかったら、`onSave` が返す
 * 文言（重複など）を入力欄の下に出して、開いたままにする。入力を変えると、その文言は消す。
 * 削除は、確認の後の処理を含めて呼び出し側（`onDelete`）に任せる。
 */
export function TagEditDialog({
  tag,
  onSave,
  onDelete,
  onClose,
}: {
  tag: Tag;
  /** 名前を変える。変えられなかったときは、利用者向けの文言を返す（成功なら `undefined`）。 */
  onSave: (name: string) => Promise<string | undefined>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(tag.name);
  // 開いた直後は、名前を全選択にして、そのまま打ち直せるようにする。`selectTextOnFocus` は、
  // iOSでは `autoFocus` と組み合わせると効かない（カーソルが末尾に置かれる。iOSシミュレータで確認。
  // Androidは効く）ので、`selection` で指定する。`selection` を渡し続けると、利用者が動かした
  // カーソルが、次の再描画で戻されるため、選択が変わったら（入力・カーソルの移動）手放す。
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>({
    start: 0,
    end: tag.name.length,
  });
  const [error, setError] = useState<string | undefined>(undefined);
  // 保存が重ならないようにする（state は再描画まで古い）。
  const savingRef = useRef(false);

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setError(await onSave(name));
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 48 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: 0.4 }]}
        />
        <View
          accessibilityViewIsModal
          // VoiceOverは、ダイアログの外の幕（上の「閉じる」ボタン）に触れられないため、2本指の
          // Zジェスチャ（escape）で閉じられるようにする。Androidは戻る操作（`onRequestClose`）。
          onAccessibilityEscape={onClose}
          style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Text role="heading" style={[styles.title, { color: colors.textPrimary }]}>
            {t('tags.renameTitle')}
          </Text>

          <FormField label={t('tags.nameLabel')} error={error}>
            <FormInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(undefined);
              }}
              invalid={error !== undefined}
              accessibilityLabel={t('tags.nameLabel')}
              autoFocus
              selection={selection}
              onSelectionChange={(event) => {
                const { start, end } = event.nativeEvent.selection;
                if (selection && (start !== selection.start || end !== selection.end)) {
                  setSelection(undefined);
                }
              }}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonLabel, { color: colors.textPrimary }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{t('tags.save')}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.buttonLabel, { color: colors.error }]}>{t('tags.delete')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  // 縁の線は、ダークで、幕に暗くした背景とダイアログの区別がつくようにするため。
  dialog: { width: '100%', maxWidth: 420, padding: 20, gap: 16, borderRadius: 16, borderWidth: 1 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
