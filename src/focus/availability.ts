// Honest availability detection (design.md section 6).
//
// Async because the final check awaits a native bridge call. Steps 1-4 are
// synchronous guards evaluated first, so on web / Android / simulator / an
// Expo Go (module-absent) build no bridge call is ever made. Only step 5 awaits.
// First match wins. Precedence: NotIOS -> Simulator -> ExpoGo -> OSTooOld ->
// NotAuthorized. Fail-closed throughout.

import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { GoalieFocus, isNativeModuleAvailable } from './GoalieFocus';
import {
  AuthorizationStatus,
  FocusAvailability,
  FocusUnavailableReason,
} from './types';

const MIN_SUPPORTED_MAJOR = 16;

export async function getFocusAvailability(): Promise<FocusAvailability> {
  // 1. NotIOS (sync) — hard platform fact.
  if (Platform.OS !== 'ios') {
    return { available: false, reason: FocusUnavailableReason.NotIOS };
  }

  // 2. Simulator (sync) — hard platform fact, independent of module load.
  if (!Device.isDevice) {
    return { available: false, reason: FocusUnavailableReason.Simulator };
  }

  // 3. ExpoGo / module absent (sync) — the focus native module is required.
  if (!isNativeModuleAvailable()) {
    return { available: false, reason: FocusUnavailableReason.ExpoGo };
  }

  // 4. OSTooOld (sync) — Device.osVersion is `string | null`. null / empty /
  //    malformed -> parseInt -> NaN -> fail-closed to OSTooOld.
  const major = parseInt(Device.osVersion ?? '', 10);
  if (Number.isNaN(major) || major < MIN_SUPPORTED_MAJOR) {
    return { available: false, reason: FocusUnavailableReason.OSTooOld };
  }

  // 5. NotAuthorized (await) — the only awaited step. A rejected status check is
  //    treated as NotAuthorized (fail-closed), never reported as available.
  try {
    const status = await GoalieFocus.getAuthorizationStatus();
    if (status !== AuthorizationStatus.Approved) {
      return { available: false, reason: FocusUnavailableReason.NotAuthorized };
    }
  } catch {
    return { available: false, reason: FocusUnavailableReason.NotAuthorized };
  }

  return { available: true };
}
