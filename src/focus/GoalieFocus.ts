// Typed JS API for the native focus module (design.md section 4.1 / 4.2).
//
// When the native module is absent OR the platform is not iOS, this resolves to
// a stub whose methods reject with FocusUnavailableError(reason) rather than an
// opaque "module not found" error. The availability layer (availability.ts) is
// the first line of honest reporting; these rejections are the defensive second.

import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import {
  AuthorizationStatus,
  FocusSelection,
  FocusSession,
  FocusUnavailableError,
  FocusUnavailableReason,
  GoalieFocusApi,
} from './types';

// The registered name of the local Expo native module (its Swift `Name(...)`).
// FEAT-003's modules/goalie-focus must register under this exact name.
export const NATIVE_MODULE_NAME = 'GoalieFocus';

// The raw native module, or null when it did not load (e.g. Expo Go, non-iOS,
// or a plain managed build without the custom native module).
export const nativeFocusModule =
  requireOptionalNativeModule<GoalieFocusApi>(NATIVE_MODULE_NAME);

// Whether the custom native focus module is registered in this binary.
export function isNativeModuleAvailable(): boolean {
  return nativeFocusModule != null;
}

function unavailableReason(): FocusUnavailableReason {
  if (Platform.OS !== 'ios') {
    return FocusUnavailableReason.NotIOS;
  }
  // On iOS the only reason the module surface is missing here is that the custom
  // native module did not load (e.g. Expo Go / a non-dev-client build).
  return FocusUnavailableReason.ExpoGo;
}

function makeUnavailableStub(): GoalieFocusApi {
  const reject = (): Promise<never> =>
    Promise.reject(new FocusUnavailableError(unavailableReason()));
  return {
    getAuthorizationStatus: reject,
    requestAuthorization: reject,
    presentActivityPicker: reject,
    getSelection: reject,
    startFocusSession: reject,
    stopFocusSession: reject,
    getActiveSession: reject,
  };
}

// Resolve to the real native module on iOS when present; otherwise the honest
// rejecting stub.
const impl: GoalieFocusApi =
  Platform.OS === 'ios' && nativeFocusModule != null
    ? nativeFocusModule
    : makeUnavailableStub();

export const GoalieFocus: GoalieFocusApi = {
  getAuthorizationStatus(): Promise<AuthorizationStatus> {
    return impl.getAuthorizationStatus();
  },
  requestAuthorization(): Promise<AuthorizationStatus> {
    return impl.requestAuthorization();
  },
  presentActivityPicker(): Promise<FocusSelection> {
    // Native rejects with FocusCancelledError on user dismissal; it propagates
    // unchanged for the caller to treat as a no-op.
    return impl.presentActivityPicker();
  },
  getSelection(): Promise<FocusSelection | null> {
    return impl.getSelection();
  },
  startFocusSession(durationSeconds: number): Promise<FocusSession> {
    return impl.startFocusSession(durationSeconds);
  },
  stopFocusSession(): Promise<void> {
    return impl.stopFocusSession();
  },
  getActiveSession(): Promise<FocusSession | null> {
    return impl.getActiveSession();
  },
};

export default GoalieFocus;
