// Placeholder Home screen. On mount it awaits getFocusAvailability() and renders
// the verdict verbatim. It NEVER shows a fake blocked/green state: in this
// environment (simulator / dev build without entitlement) it reports unavailable
// and precisely why.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getFocusAvailability } from '../../focus/availability';
import { FocusAvailability, FocusUnavailableReason } from '../../focus/types';

const REASON_TEXT: Record<FocusUnavailableReason, string> = {
  [FocusUnavailableReason.NotIOS]:
    'Focus protection only runs on iOS.',
  [FocusUnavailableReason.Simulator]:
    'Focus protection cannot run on the iOS Simulator. A physical device is required.',
  [FocusUnavailableReason.ExpoGo]:
    'Focus protection requires the Goalie custom dev build (the native module did not load).',
  [FocusUnavailableReason.OSTooOld]:
    'Focus protection requires iOS 16 or later.',
  [FocusUnavailableReason.NotAuthorized]:
    'Focus protection is not authorized yet. Grant Screen Time access to continue.',
};

export function HomeScreen() {
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
      <Text style={styles.title}>Goalie</Text>
      <Text style={styles.heading}>Focus protection status</Text>
      {availability === null ? (
        <View style={styles.statusRow}>
          <ActivityIndicator />
          <Text style={styles.status}>Checking…</Text>
        </View>
      ) : availability.available ? (
        <Text style={[styles.status, styles.available]}>
          Available: focus protection can run on this device.
        </Text>
      ) : (
        <View>
          <Text style={[styles.status, styles.unavailable]}>
            Unavailable ({availability.reason})
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontSize: 15,
    textAlign: 'center',
  },
  available: {
    color: '#0a7d28',
  },
  unavailable: {
    color: '#b00020',
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default HomeScreen;
