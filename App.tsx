import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Phase 1 placeholder. FEAT-002 wires this to RootNavigator.
export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Text>Goalie</Text>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
