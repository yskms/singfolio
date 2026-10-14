import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { TextInput as NativeTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ArtistSummary } from '../src/domain/types';
import { readingProblem } from '../src/services/readingRules';
import { normalizeReading, normalizeText } from '../src/services/text';
import { FormField } from './FormField';
import { FormInput } from './FormInput';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * アーティストの名前と読みの変更（Artists 画面）。画面の上の方に出す（Androidはエッジ・ツー・エッジで、
 * キーボードが出ても画面が縮まないので、下に置くと入力欄がキーボードに隠れる）。幕・Androidの戻る
 * 操作でも閉じる。`artist` ごとに作り直す（`key` に `artist.id` を渡す）。
 *
 * 保存は、変えられたら閉じる（閉じるのは呼び出し側）。変えられなかったら、`onSave` が返す文言
 * （名前の重複など）を名前の欄の下に出して、開いたままにする。読みは、空でないこと、日本語の設定では
 * かなだけであることを、保存の前に確認する（読みを**変えたときだけ**。開いただけで、保存済みの読みが
 * 規則に合わないことを、咎めない）。入力を変えると、その欄の文言は消す。
 */
export function ArtistEditDialog({
  artist,
  onSave,
  onClose,
}: {
  artist: ArtistSummary;
  /** 名前と読みを変える。変えられなかったときは、利用者向けの文言を返す（成功なら `undefined`）。 */
  onSave: (input: { name: string; reading: string }) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(artist.name);
  const [reading, setReading] = useState(artist.reading);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [readingError, setReadingError] = useState<string | undefined>(undefined);
  // 保存が重ならないようにする（state は再描画まで古い）。
  const savingRef = useRef(false);
  const nameRef = useRef<NativeTextInput>(null);
  const readingRef = useRef<NativeTextInput>(null);

  const save = async () => {
    if (savingRef.current) return;
    const nameMissing = normalizeText(name) === '';
    const changed = normalizeReading(reading) !== artist.reading;
    const problem = readingProblem(reading, language);
    // 空は、いつも不可。かなだけの規則は、読みを変えたときだけ。
    const readingMessage =
      problem === 'required'
        ? t('error.artistReadingRequired')
        : problem === 'kana-only' && changed
          ? t('error.readingKanaOnly')
          : undefined;
    setNameError(nameMissing ? t('error.artistNameRequired') : undefined);
    setReadingError(readingMessage);
    if (nameMissing || readingMessage !== undefined) {
      (nameMissing ? nameRef : readingRef).current?.focus();
      return;
    }

    savingRef.current = true;
    try {
      const message = await onSave({ name, reading });
      if (message !== undefined) setNameError(message);
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
            {t('artists.editTitle')}
          </Text>

          <FormField label={t('artists.nameLabel')} error={nameError}>
            <FormInput
              ref={nameRef}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setNameError(undefined);
              }}
              invalid={nameError !== undefined}
              accessibilityLabel={t('artists.nameLabel')}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => readingRef.current?.focus()}
              submitBehavior="submit"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField label={t('songForm.reading')} note={t('songForm.readingNote')} error={readingError}>
            <FormInput
              ref={readingRef}
              value={reading}
              onChangeText={(text) => {
                setReading(text);
                setReadingError(undefined);
              }}
              invalid={readingError !== undefined}
              accessibilityLabel={t('songForm.reading')}
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
              <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{t('artists.save')}</Text>
            </Pressable>
          </View>
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
  buttonLabel: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
