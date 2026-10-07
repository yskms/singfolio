import { StyleSheet, Text, View } from 'react-native';

// 曲一覧（WBS 2.1）までのプレースホルダー。
export default function SongsScreen() {
  return (
    <View style={styles.container}>
      <Text>Songs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
