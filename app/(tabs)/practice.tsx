import { StyleSheet, Text, View } from 'react-native';

// 練習中の曲の一覧（WBS 3.1）までのプレースホルダー。
export default function PracticeScreen() {
  return (
    <View style={styles.container}>
      <Text>Practice</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
