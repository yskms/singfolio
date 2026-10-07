import { StyleSheet, Text, View } from 'react-native';

// Profile（WBS 5.1）までのプレースホルダー。
export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
