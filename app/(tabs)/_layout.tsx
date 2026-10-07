import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import type { MessageKey } from '../../src/i18n';
import { useI18n } from '../../ui/i18n';
import { useTheme } from '../../ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ボトムタブはSongs / Practice / Profileの3つ（Wantは独立タブにしない）。
// 並び順がそのままタブの並びで、先頭のSongsがメイン導線。
const TABS: { name: string; titleKey: MessageKey; icon: IconName; iconFocused: IconName }[] = [
  { name: 'index', titleKey: 'tabs.songs', icon: 'musical-notes-outline', iconFocused: 'musical-notes' },
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
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
