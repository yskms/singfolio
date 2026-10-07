import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { getServices } from '../src/services';

// 画面は、全タブをこのStackの1画面（(tabs)）として載せる。Song Detail・Add / Edit・
// Show Mode・Settingsは、このStackに足していく（タブバーを隠して全画面で出す）。
// 足すときは `export const unstable_settings = { initialRouteName: '(tabs)' }` も
// 入れる。無いと、ディープリンクで詳細画面だけが開かれたとき下にタブが無く、
// 戻る操作でアプリが終了する。
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  // DBを開いてマイグレーションが終わるまで、画面を出さない。
  // 画面からDB（getDatabase）を直接使わず、Serviceだけを使う。
  useEffect(() => {
    getServices().then(
      () => setReady(true),
      (error) => setFailure({ error }),
    );
  }, []);

  // 起動時のDB初期化に失敗したらアプリとして動作できないため、
  // そのまま例外にする（専用のエラー画面は未実装。WBS 1.7）。
  if (failure) throw failure.error;
  // スプラッシュは、Expo Routerがナビゲーションの準備完了（下のStackを描画した後）に
  // 閉じる。そのため、ここでnullを返している間（DB初期化中）はスプラッシュが残る。
  // ready より前に別のナビゲーターを描画したり、アプリ側で
  // SplashScreen.preventAutoHideAsync() を呼んだりすると、閉じるタイミングが変わる
  // （後者はアプリ自身がhideAsync()を呼ぶ必要がある。WBS 1.7）。
  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
