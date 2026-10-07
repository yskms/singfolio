import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../ui/theme';

// 曲一覧（WBS 2.1）までのプレースホルダー。
export default function SongsScreen() {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textPrimary }}>Songs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
