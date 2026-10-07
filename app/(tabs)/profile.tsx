import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../ui/theme';

// Profile（WBS 5.1）までのプレースホルダー。
export default function ProfileScreen() {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textPrimary }}>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
