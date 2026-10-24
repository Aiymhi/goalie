// Calls the Phase 1 getFocusAvailability() and renders the verdict HONESTLY.
// It NEVER shows a fake blocked/active state and never starts a session (full
// focus UX is Phase 5). States: loading ("Checking…"), unavailable (reason
// text from the shared REASON_TEXT map), available (only if the API truly says
// so).

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getFocusAvailability } from '../../focus/availability';
import { FocusAvailability } from '../../focus/types';
import { REASON_TEXT } from '../focus/reasonText';

export function FocusScreen() {
  const [availability, setAvailability] = useState<FocusAvailability | null>(null);

  useEffect(() => {
    let active = true;
    getFocusAvailability().then((result) => {
      if (active) {
        setAvailability(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Focus protection</Text>
      {availability === null ? (
        <View style={styles.statusRow}>
          <ActivityIndicator accessibilityLabel="Checking focus availability" />
          <Text style={styles.status}>Checking…</Text>
        </View>
      ) : availability.available ? (
        <Text style={[styles.status, styles.available]}>
          Available: focus protection can run on this device.
        </Text>
      ) : (
        <View>
          <Text style={[styles.status, styles.unavailable]}>
            Focus protection unavailable ({availability.reason})
          </Text>
          <Text style={styles.detail}>{REASON_TEXT[availability.reason]}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontSize: 16,
  },
  available: {
    color: '#0a7d28',
    fontWeight: '600',
  },
  unavailable: {
    color: '#b00020',
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: '#444',
    marginTop: 8,
  },
});

export default FocusScreen;
