import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDatabase } from './src/db/database';

export default function App() {
  const [ready, setReady] = useState(false);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  // DBを開いてマイグレーションが終わるまで、画面を出さない。
  useEffect(() => {
    getDatabase().then(
      () => setReady(true),
      (error) => setFailure({ error }),
    );
  }, []);

  // 起動時のDB初期化に失敗したらアプリとして動作できないため、
  // そのまま例外にする（専用のエラー画面は未実装。WBS 1.7）。
  if (failure) throw failure.error;
  if (!ready) return null;

  return (
    <View style={styles.container}>
      <Text>Singfolio</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
