// Package surface for the local Expo native module (design.md §3 layout).
//
// The typed JS API, shared types, and the honest availability layer all live
// under src/focus; this module re-exports them so the `goalie-focus` package
// surface matches the design's folder layout. The Swift native module (ios/)
// is autolinked via expo-module.config.json; this file is the JS entry point.

export { GoalieFocus, default } from '../../src/focus/GoalieFocus';
export {
  NATIVE_MODULE_NAME,
  nativeFocusModule,
  isNativeModuleAvailable,
} from '../../src/focus/GoalieFocus';
export { getFocusAvailability } from '../../src/focus/availability';
export {
  AuthorizationStatus,
  FocusUnavailableReason,
  FocusUnavailableError,
  FocusCancelledError,
} from '../../src/focus/types';
export type {
  FocusAvailability,
  FocusSelection,
  FocusSession,
  GoalieFocusApi,
} from '../../src/focus/types';
