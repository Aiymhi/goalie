// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Phase 5's voluntary focus-session domain: a deterministic, clock-injected
// model layered on top of the Phase 1 native module. The domain is the honest
// arbiter of a session's PHASE and its remaining time; it NEVER creates a block
// itself (the native deadline/release is the only source of a real block) and a
// focus session NEVER creates learning credit. The current instant is supplied
// by an injected FocusClock (mirrors the src/domain/rewards Clock pattern) so
// every behavior is testable without a device.

// The serializable record of a voluntary focus session. Mirrors the native
// FocusSession shape (src/focus/types.ts) so the app-group record and the local
// mirror are the same structure.
export interface FocusSessionRecord {
  id: string;
  deadlineEpochMs: number;
  selectionSummary: string;
}

// The honest lifecycle of a session as derived from a record + the current
// instant. 'idle' = no session; 'active' = before the deadline; 'expired' = the
// deadline has passed (the native release is the real end of the block);
// 'released' = ended early via emergency release (no record remains).
export type FocusPhase = 'idle' | 'active' | 'expired' | 'released';

// Injected determinism port. The domain only ever sees this interface; the
// production implementation (UI layer, src/ui/focus/focusClock.ts) reads the
// device clock.
export interface FocusClock {
  nowEpochMs(): number;
}

// Duration bounds are enforced NATIVELY (design.md) and mirrored here so the JS
// layer rejects out-of-range durations before ever calling the native start.
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 86400;

export class FocusSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FocusSessionError';
  }
}

// Pure. Enforces Number.isInteger and the inclusive [60, 86400] range. Returns a
// discriminated result rather than throwing so the UI can surface the reason.
export function validateDuration(
  seconds: number,
): { ok: true } | { ok: false; reason: string } {
  if (typeof seconds !== 'number' || !Number.isInteger(seconds)) {
    return { ok: false, reason: 'duration must be a whole number of seconds' };
  }
  if (seconds < MIN_DURATION_SECONDS) {
    return {
      ok: false,
      reason: `duration must be at least ${MIN_DURATION_SECONDS} seconds`,
    };
  }
  if (seconds > MAX_DURATION_SECONDS) {
    return {
      ok: false,
      reason: `duration must be at most ${MAX_DURATION_SECONDS} seconds`,
    };
  }
  return { ok: true };
}

// Pure. null -> 'idle'; now < deadline -> 'active'; now >= deadline -> 'expired'.
// A session that reaches its deadline is 'expired' regardless of how far the
// clock jumped forward — the block is never extended.
export function phaseOf(
  record: FocusSessionRecord | null,
  nowEpochMs: number,
): FocusPhase {
  if (record === null) {
    return 'idle';
  }
  return nowEpochMs < record.deadlineEpochMs ? 'active' : 'expired';
}

// Pure. Whole seconds remaining until the deadline, clamped at 0. Floor so a
// display never rounds up to a second that has already elapsed. Returns 0 for a
// null record.
export function remainingSeconds(
  record: FocusSessionRecord | null,
  nowEpochMs: number,
): number {
  if (record === null) {
    return 0;
  }
  const remainingMs = record.deadlineEpochMs - nowEpochMs;
  if (remainingMs <= 0) {
    return 0;
  }
  return Math.floor(remainingMs / 1000);
}

// Pure. Guard against starting a second session while one is already active —
// models the native E_SESSION_ACTIVE idempotency at the domain level. Throws
// FocusSessionError when `record` is a currently-active session; a null,
// expired, or released record is startable and returns normally.
export function assertCanStart(
  record: FocusSessionRecord | null,
  nowEpochMs: number,
): void {
  if (phaseOf(record, nowEpochMs) === 'active') {
    throw new FocusSessionError('a focus session is already active');
  }
}

// Pure. Reconcile the local mirror against the native (app-group) record, which
// is AUTHORITATIVE when present. Returns the chosen record and its derived
// phase. Rules:
//   - native present -> trust native (the device is the source of truth)
//   - native absent, local present -> fall back to the local mirror
//   - both absent -> idle
// The phase is always derived from the chosen record and `nowEpochMs`, so a
// device-clock jump at/after the deadline yields 'expired' (never extends a
// block).
export function reconcile(
  local: FocusSessionRecord | null,
  native: FocusSessionRecord | null,
  nowEpochMs: number,
): { record: FocusSessionRecord | null; phase: FocusPhase } {
  const record = native ?? local;
  return { record, phase: phaseOf(record, nowEpochMs) };
}
