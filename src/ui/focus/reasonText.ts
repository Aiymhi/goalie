// Shared reason -> copy map for focus availability.
// Extracted verbatim from the old private map in HomeScreen.tsx so the new
// Home and Focus screens share one source of truth (no copy drift).
// Exhaustive over FocusUnavailableReason.

import { FocusUnavailableReason } from '../../focus/types';

export const REASON_TEXT: Record<FocusUnavailableReason, string> = {
  [FocusUnavailableReason.NotIOS]: 'Focus protection only runs on iOS.',
  [FocusUnavailableReason.Simulator]:
    'Focus protection cannot run on the iOS Simulator. A physical device is required.',
  [FocusUnavailableReason.ExpoGo]:
    'Focus protection requires the Goalie custom dev build (the native module did not load).',
  [FocusUnavailableReason.OSTooOld]:
    'Focus protection requires iOS 16 or later.',
  [FocusUnavailableReason.NotAuthorized]:
    'Focus protection is not authorized yet. Grant Screen Time access to continue.',
};
