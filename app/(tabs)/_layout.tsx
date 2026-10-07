import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ボトムタブはSongs / Practice / Profileの3つ（Wantは独立タブにしない）。
// 並び順がそのままタブの並びで、先頭のSongsがメイン導線。
// タブ名は直書きしている。多言語化の仕組み（WBS 1.6）ができたらそちらへ移す。
// 色もプラットフォームの既定のまま。テーマ（WBS 1.5）で定める。
const TABS: { name: string; title: string; icon: IconName; iconFocused: IconName }[] = [
  { name: 'index', title: 'Songs', icon: 'musical-notes-outline', iconFocused: 'musical-notes' },
  { name: 'practice', title: 'Practice', icon: 'repeat-outline', iconFocused: 'repeat' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
