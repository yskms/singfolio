import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useI18n } from '../../ui/i18n';
import { useTheme } from '../../ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabTitleKey = 'tabs.songs' | 'tabs.practice' | 'tabs.profile';

// ボトムタブはSongs / Practice / Profileの3つ（Wantは独立タブにしない）。
// 並び順がそのままタブの並びで、先頭のSongsがメイン導線。
// ヘッダーの題は、既定ではタブのラベルと同じ。Songsだけは、ホーム画面としてブランド名を出す。
const TABS: {
  name: string;
  titleKey: TabTitleKey;
  headerTitleKey?: 'app.name';
  icon: IconName;
  iconFocused: IconName;
}[] = [
  {
    name: 'index',
    titleKey: 'tabs.songs',
    headerTitleKey: 'app.name',
    icon: 'musical-notes-outline',
    iconFocused: 'musical-notes',
  },
  { name: 'practice', titleKey: 'tabs.practice', icon: 'repeat-outline', iconFocused: 'repeat' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        // タブバー・ヘッダーの背景と文字色はナビゲーションのテーマ（ui/theme.tsx）。
        // 選択中だけPurple、それ以外は控えめな色にする。
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        // ラベルは Regular。ナビゲーションのテーマ（ui/theme.tsx）では、タブのラベルの
        // `medium` が Bold に寄るため、ここで上書きする（ブランド資料のモックアップは、
        // 選択中か否かを色だけで分けた細い字）。
        tabBarLabelStyle: { fontWeight: '400' },
        // ヘッダーの題は、iOSの既定（中央）ではなく、ブランド資料のモックアップに合わせて左寄せ。
        headerTitleAlign: 'left',
        // Songsの検索欄にキーボードが出たとき、Androidで、タブバーがキーボードの上に残って
        // 一覧を狭めないようにする（iOSは、キーボードがタブバーに重なる）。
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            headerTitle: t(tab.headerTitleKey ?? tab.titleKey),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
