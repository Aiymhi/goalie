// Always-visible (not dismissible) disclaimer banner. Reads its text from the
// track's `disclaimer` content field — the single source of truth — so copy
// never drifts from the content. Rendered on every finance-track screen.

import { StyleSheet, Text, View } from 'react-native';

export function FinanceDisclaimerBanner({ text }: { text: string }) {
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessible
      accessibilityLabel={`Disclaimer: ${text}`}
    >
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff4e5',
    borderColor: '#d9822b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  text: {
    fontSize: 13,
    color: '#8a5a00',
  },
});

export default FinanceDisclaimerBanner;
