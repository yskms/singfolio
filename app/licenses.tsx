import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reflowLicense } from '../src/legal/reflowLicense';
import {
  THIRD_PARTY_LICENSE_TEXTS,
  THIRD_PARTY_PACKAGES,
  type ThirdPartyPackage,
} from '../src/legal/thirdPartyLicenses';
import { decorative } from '../ui/decorative';
import { useI18n } from '../ui/i18n';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

// ヘッダーの題は、画面の中で足す（言語に従う）。戻るボタンの文字は出さない（About と同じ）。
const SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  headerTitleAlign: 'left',
} as const;

// Open source licenses。About から開く。アプリに入る、npm の依存・取り込まれたコード・アイコンフォント・
// ネイティブのライブラリの名前・版・ライセンスの種類を並べ、押すと全文（著作権表示を含む）を開く。
// MIT などは、著作権表示と許諾表示を含めることを求める。一覧は、依存関係から生成したもの
// （`scripts/generate-licenses.mjs`。`src/legal/thirdPartyLicenses.ts`）で、手で直さない。片方の OS
// にだけ入るもの（AndroidX など）は、その OS でだけ出す。About の「Fonts」（自前で同梱した書体）とは別。
const ITEMS = THIRD_PARTY_PACKAGES.filter(
  (item) => item.platform === undefined || item.platform === Platform.OS,
);

export default function LicensesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ ...SCREEN_OPTIONS, title: t('about.licenses') }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t('licenses.intro')}</Text>
        {ITEMS.map((item) => (
          <PackageItem key={`${item.name}@${item.version ?? ''}`} item={item} />
        ))}
      </ScrollView>
    </>
  );
}

// 名前と、版・ライセンスの種類。全文は長いので、押して開く。
function PackageItem({ item }: { item: ThirdPartyPackage }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const detail = item.version === undefined ? item.license : `${item.version} · ${item.license}`;
  return (
    <View style={[styles.item, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${item.name}, ${detail}`}
        accessibilityHint={expanded ? t('about.hideLicense') : t('about.showLicense')}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={styles.titles}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
          {...decorative}
        />
      </Pressable>
      {expanded && (
        <>
          {item.includes !== undefined && (
            <Text selectable style={[styles.includes, { color: colors.textSecondary }]}>
              {t('licenses.includes', { list: item.includes.join(', ') })}
            </Text>
          )}
          <Text selectable style={[styles.licenseText, { color: colors.textSecondary }]}>
            {reflowLicense(THIRD_PARTY_LICENSE_TEXTS[item.text] ?? '')}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 24 },
  intro: { marginBottom: 8, fontSize: 14, lineHeight: 21 },
  item: { borderBottomWidth: StyleSheet.hairlineWidth },
  header: {
    minHeight: 56,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titles: { flexShrink: 1, gap: 2 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 18 },
  includes: { paddingBottom: 8, fontSize: 12, lineHeight: 17 },
  licenseText: { paddingBottom: 12, fontSize: 12, lineHeight: 17 },
});
