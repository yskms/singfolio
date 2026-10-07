import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../ui/theme';

// 練習中の曲の一覧（WBS 3.1）までのプレースホルダー。
export default function PracticeScreen() {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textPrimary }}>Practice</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
