import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';

import {
  APPEARANCES,
  LANGUAGES,
  type Appearance,
  type Language,
} from '../src/domain/types';
import { errorMessageKey, languageNames, type MessageKey } from '../src/i18n';
import { getServices } from '../src/services';
import { useI18n } from './i18n';
import { OptionSheet } from './OptionSheet';
import { SettingsRow } from './SettingsRow';
import { Text } from './Text';
import { useAppearance, useTheme } from './theme';
import { useLoad } from './useLoad';

const appearanceKeys = {
  system: 'settings.appearance.system',
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
} as const satisfies Record<Appearance, MessageKey>;

/**
 * Profile の、Show My Songs の下に並ぶ設定（Appearance・Language・Suggestions・Tags・About）。
 * Appearance・Language は、下から出るシートで選ぶ。選ぶと保存してから反映し、保存に失敗したら、
 * 表示は変えずに伝える。Tags・About は、別の画面を開く。
 *
 * 「Suggestions」（外部の楽曲検索から候補を出すか）は、外部の検索が使えないビルドでは、項目ごと出さない。
 */
export function SettingsSection() {
  const { colors } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const { appearance, setAppearance } = useAppearance();
  const router = useRouter();

  const [sheet, setSheet] = useState<'appearance' | 'language' | null>(null);

  // 外部の検索が使えるか（ビルドで決まる）と、今の設定。保存したら、`savedSuggestions` が優先する。
  const loaded = useLoad(async () => {
    const { settings, suggestions } = await getServices();
    return { available: suggestions.available, enabled: await settings.getSuggestionsEnabled() };
  });
  const [savedSuggestions, setSavedSuggestions] = useState<boolean | undefined>(undefined);
  // 保存が重ならないようにする（state は再描画まで古い）。
  const savingRef = useRef(false);

  const showSaveFailure = (error: unknown) =>
    Alert.alert(t('settings.saveFailedTitle'), t(errorMessageKey(error)), [{ text: t('common.ok') }]);

  const chooseAppearance = (next: Appearance) => {
    setSheet(null);
    if (next !== appearance) setAppearance(next).catch(showSaveFailure);
  };

  // 言語は、読みの入力ルール（日本語は、かなだけ）も変わるので、切り替える前に確認する。
  // ダイアログの文言は、切り替える前の言語。
  const chooseLanguage = (next: Language) => {
    setSheet(null);
    if (next === language) return;
    Alert.alert(
      t('settings.language.confirmTitle'),
      t('settings.language.confirmMessage', { language: languageNames[next] }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.language.confirmAction'),
          onPress: () => setLanguage(next).catch(showSaveFailure),
        },
      ],
    );
  };

  // 切り替えは、すぐ反映して、保存できなかったら戻す（スイッチが、指を離した後で戻らないように）。
  const toggleSuggestions = (next: boolean, previous: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavedSuggestions(next);
    (async () => {
      const { settings } = await getServices();
      await settings.setSuggestionsEnabled(next);
    })()
      .catch((error) => {
        setSavedSuggestions(previous);
        showSaveFailure(error);
      })
      .finally(() => {
        savingRef.current = false;
      });
  };

  // 読み込みは数ミリ秒で終わる（Service は、起動時に用意済み）。項目が後から増えて、下の項目が
  // 動かないよう、全体を、読み込みが終わってから出す。
  if (loaded === undefined) return null;
  const suggestionsEnabled = savedSuggestions ?? loaded.enabled;

  return (
    <View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <SettingsRow
        label={t('settings.appearance')}
        value={t(appearanceKeys[appearance])}
        onPress={() => setSheet('appearance')}
      />
      <SettingsRow
        label={t('settings.language')}
        value={languageNames[language]}
        onPress={() => setSheet('language')}
      />

      {loaded.available && (
        <View style={styles.suggestions}>
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{t('settings.suggestions')}</Text>
            <Switch
              accessibilityLabel={t('settings.suggestions')}
              value={suggestionsEnabled}
              onValueChange={(next) => toggleSuggestions(next, suggestionsEnabled)}
              trackColor={{ false: colors.border, true: colors.primary }}
              // Androidのつまみは、既定ではOSのアクセントの色（ティール）になり、ブランドと合わない。
              // つまみはトラックからはみ出し、背景の上にも載るので、背景と紛れない色にする（オンは、
              // ライトでは濃い色、ダークでは明るい色。`onPrimary` だと、ダークで背景に溶ける）。
              // iOSは、既定の白のまま。
              thumbColor={
                Platform.OS === 'android'
                  ? suggestionsEnabled
                    ? colors.textPrimary
                    : colors.textSecondary
                  : undefined
              }
              ios_backgroundColor={colors.border}
              // 親の `alignItems: 'center'` では、iOSでスイッチが行の上端に寄る（レイアウトの y が 0。
              // iOSシミュレータで確認）ので、`alignSelf` で中央にそろえる。
              style={styles.switch}
            />
          </View>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('settings.suggestionsNote')}</Text>
        </View>
      )}

      <SettingsRow label={t('settings.tags')} onPress={() => router.push('/tags')} />
      <SettingsRow label={t('settings.about')} onPress={() => router.push('/about')} />

      <OptionSheet
        visible={sheet === 'appearance'}
        title={t('settings.appearance')}
        options={APPEARANCES.map((value) => ({ value, label: t(appearanceKeys[value]) }))}
        selected={appearance}
        onSelect={chooseAppearance}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'language'}
        title={t('settings.language')}
        options={LANGUAGES.map((value) => ({ value, label: languageNames[value] }))}
        selected={language}
        onSelect={chooseLanguage}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  suggestions: { paddingBottom: 8 },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { fontSize: 16, lineHeight: 22 },
  switch: { alignSelf: 'center' },
  note: { fontSize: 13, lineHeight: 18 },
});
