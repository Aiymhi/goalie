// Shared types/enums for the focus feature (design.md section 4.2).

export enum AuthorizationStatus {
  NotDetermined = 'notDetermined',
  Denied = 'denied',
  Approved = 'approved',
}

export enum FocusUnavailableReason {
  NotIOS = 'not-ios', // web / Android
  Simulator = 'simulator', // iOS Simulator: Screen Time APIs are no-ops / unsupported
  ExpoGo = 'expo-go', // custom native module did not load (e.g. Expo Go)
  OSTooOld = 'os-too-old', // < iOS 16 (Family Controls availability)
  NotAuthorized = 'not-authorized', // authorization not Approved
}

export type FocusAvailability =
  | { available: true }
  | { available: false; reason: FocusUnavailableReason };

// Single shared selection type, referenced by presentActivityPicker() and getSelection().
export type FocusSelection = { summary: string };

export interface FocusSession {
  id: string;
  deadlineEpochMs: number;
  selectionSummary: string;
}

// Thrown for honest "feature cannot run here" conditions.
export class FocusUnavailableError extends Error {
  constructor(public reason: FocusUnavailableReason) {
    super(reason);
    this.name = 'FocusUnavailableError';
  }
}

// Thrown ONLY when the user dismisses the Family Activity picker — a normal outcome, not a failure.
export class FocusCancelledError extends Error {
  constructor(message = 'focus activity picker cancelled') {
    super(message);
    this.name = 'FocusCancelledError';
  }
}

export interface GoalieFocusApi {
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  requestAuthorization(): Promise<AuthorizationStatus>;
  presentActivityPicker(): Promise<FocusSelection>; // rejects FocusCancelledError on dismissal
  getSelection(): Promise<FocusSelection | null>;
  startFocusSession(durationSeconds: number): Promise<FocusSession>;
  stopFocusSession(): Promise<void>;
  getActiveSession(): Promise<FocusSession | null>;
}
