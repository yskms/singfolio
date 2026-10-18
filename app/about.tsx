import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_LICENSES, type FontLicense } from '../src/legal/fontLicenses';
import { MUSICBRAINZ_URL, PRIVACY_POLICY_URL } from '../src/legal/legalUrls';
import { reflowLicense } from '../src/legal/reflowLicense';
import { decorative } from '../ui/decorative';
import { useI18n } from '../ui/i18n';
import { SettingsRow } from '../ui/SettingsRow';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（Song Detail と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// About。Profile の Settings から開く。アプリの名前とバージョン、プライバシーポリシーへのリンク、自前で同梱したフォント（`assets/fonts/`）
// のライセンス（SIL Open Font License は、再配布するときに、著作権表示とライセンス全文を付けることを
// 求める）。アイコンフォント（Ionicons など）と npm の依存のライセンスは、ここには載せず、
// 「Open source licenses」（app/licenses.tsx）に出す。データの出どころ（アーティストの読みの辞書の
// MusicBrainz）も載せる（CC0 で、表記は義務ではないが、出どころを示す）。
export default function AboutScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // app.json の `version`。取れなければ、バージョンの行は出さない。
  const version = Constants.expoConfig?.version;

  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('settings.about') }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.app}>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>{t('app.name')}</Text>
          {version !== undefined && (
            <Text style={[styles.version, { color: colors.textSecondary }]}>
              {t('about.version', { version })}
            </Text>
          )}
        </View>

        <SettingsRow
          label={t('about.privacyPolicy')}
          accessibilityHint={t('about.privacyPolicyHint')}
          external
          // ブラウザで開く。開けなくても（ブラウザが無い端末は、まず無い）、アプリの動作には影響しない。
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
        />
        <SettingsRow label={t('about.licenses')} onPress={() => router.push('/licenses')} />

        <Text role="heading" style={[styles.section, styles.fonts, { color: colors.textSecondary }]}>
          {t('about.fonts')}
        </Text>
        {FONT_LICENSES.map((license) => (
          <FontLicenseItem key={license.name} license={license} />
        ))}

        <Text role="heading" style={[styles.section, styles.fonts, { color: colors.textSecondary }]}>
          {t('about.data')}
        </Text>
        <View style={[styles.font, { borderBottomColor: colors.border }]}>
          <Text style={[styles.fontName, { color: colors.textPrimary }]}>MusicBrainz</Text>
          <Text style={[styles.fontNote, { color: colors.textSecondary }]}>{t('about.musicBrainzNote')}</Text>
        </View>
        <SettingsRow
          label={t('about.musicBrainzLink')}
          accessibilityHint={t('about.privacyPolicyHint')}
          external
          // ブラウザで開く（アプリの通信ではない）。開けなくても、アプリの動作には影響しない。
          onPress={() => void Linking.openURL(MUSICBRAINZ_URL).catch(() => undefined)}
        />
      </ScrollView>
    </>
  );
}

// 書体の名前と著作権表示。ライセンスの全文は長いので、押して開く。
function FontLicenseItem({ license }: { license: FontLicense }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  // 先頭の行が著作権表示（`fontLicenses.test.ts` が確認する）。
  const copyright = license.text.split('\n')[0];
  return (
    <View style={[styles.font, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fontName, { color: colors.textPrimary }]}>{license.name}</Text>
      <Text style={[styles.fontNote, { color: colors.textSecondary }]}>{copyright}</Text>
      <Text style={[styles.fontNote, { color: colors.textSecondary }]}>{t('about.fontLicense')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
          {expanded ? t('about.hideLicense') : t('about.showLicense')}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
          {...decorative}
        />
      </Pressable>
      {expanded && (
        <Text selectable style={[styles.licenseText, { color: colors.textSecondary }]}>
          {reflowLicense(license.text)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 24 },
  app: { gap: 4, marginBottom: 32 },
  appName: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  version: { fontSize: 15, lineHeight: 22 },
  section: { marginBottom: 8, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  fonts: { marginTop: 24 },
  font: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  fontName: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  fontNote: { fontSize: 13, lineHeight: 18 },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  toggleLabel: { fontSize: 15, lineHeight: 20 },
  licenseText: { fontSize: 12, lineHeight: 17 },
});
