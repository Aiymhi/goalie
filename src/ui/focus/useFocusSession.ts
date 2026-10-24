// Phase 5 voluntary focus-session hook. It layers the honest focus UX on top of
// the Phase 1 native module WITHOUT ever fabricating a blocked/active state:
//   - getFocusAvailability() is the single honesty truth (verdict exposed as-is).
//   - the native GoalieFocus surface is the only thing that applies a real block;
//     this hook never simulates a shield with a JS timer.
//   - the deadline / native release is the only source of release; a display-only
//     tick re-derives remainingSeconds but is NEVER the source of the block end.
//   - reconcile(localMirror, getActiveSession(), now) decides the phase, with the
//     native app-group record authoritative.
// A focus session never creates learning credit (no progression/rewards calls).

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FocusClock,
  FocusPhase,
  FocusSessionRecord,
  reconcile,
  remainingSeconds as remainingSecondsOf,
  validateDuration,
} from '../../domain/focus-session';
import { getFocusAvailability } from '../../focus/availability';
import { GoalieFocus } from '../../focus/GoalieFocus';
import {
  FocusAvailability,
  FocusCancelledError,
  FocusSession,
} from '../../focus/types';
import { useProgression } from '../context/ProgressionProvider';
import { focusClock as defaultFocusClock } from './focusClock';

// The native FocusSession is structurally identical to the domain record.
function toRecord(session: FocusSession): FocusSessionRecord {
  return {
    id: session.id,
    deadlineEpochMs: session.deadlineEpochMs,
    selectionSummary: session.selectionSummary,
  };
}

export interface UseFocusSession {
  // null while the one-time availability check is in flight.
  availability: FocusAvailability | null;
  // Current selection summary (from getSelection()), or null when nothing picked.
  selectionSummary: string | null;
  // Honest derived lifecycle of the current session.
  phase: FocusPhase;
  // Whole seconds left until the deadline (display only; never ends the block).
  remainingSeconds: number;
  // The reconciled record driving phase/remaining, or null when idle.
  record: FocusSessionRecord | null;
  // The honest error from the last failed start, or null. Never a fake block.
  startError: string | null;
  // Present the native Family Activity picker; a user cancel is a clean no-op.
  presentPicker: () => Promise<void>;
  // Validate the duration, then start the native session. On any native reject
  // the UI stays non-active and startError carries the honest reason.
  start: (durationSeconds: number) => Promise<void>;
  // Always available while active: stop the native session, then clear the mirror.
  emergencyRelease: () => Promise<void>;
  // Re-read the authoritative native session and reconcile (used on mount).
  reconcileNow: () => Promise<void>;
}

export function useFocusSession(
  clock: FocusClock = defaultFocusClock,
): UseFocusSession {
  const { focusSession: localMirror, setFocusSession } = useProgression();

  const [availability, setAvailability] = useState<FocusAvailability | null>(
    null,
  );
  const [selectionSummary, setSelectionSummary] = useState<string | null>(null);
  // The authoritative native record from the last reconcile (null = none).
  const [nativeRecord, setNativeRecord] = useState<FocusSessionRecord | null>(
    null,
  );
  const [startError, setStartError] = useState<string | null>(null);
  // Display-only tick so remainingSeconds counts down; it never ends the block.
  const [, setTick] = useState(0);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reconcileNow = useCallback(async () => {
    try {
      const native = await GoalieFocus.getActiveSession();
      if (!mounted.current) {
        return;
      }
      setNativeRecord(native === null ? null : toRecord(native));
    } catch {
      // A failed read must never fabricate an active state; treat as no native
      // session and fall back to the (non-authoritative) local mirror.
      if (mounted.current) {
        setNativeRecord(null);
      }
    }
  }, []);

  // One-time availability check; only when available do we read selection +
  // reconcile the authoritative native session.
  useEffect(() => {
    let active = true;
    (async () => {
      const verdict = await getFocusAvailability();
      if (!active) {
        return;
      }
      setAvailability(verdict);
      if (!verdict.available) {
        return;
      }
      try {
        const selection = await GoalieFocus.getSelection();
        if (active) {
          setSelectionSummary(selection?.summary ?? null);
        }
      } catch {
        if (active) {
          setSelectionSummary(null);
        }
      }
      await reconcileNow();
    })();
    return () => {
      active = false;
    };
  }, [reconcileNow]);

  // Display-only 1s tick while a session is reconciled as active. This only
  // re-renders so remainingSeconds updates; the deadline/native release remains
  // the sole source of the block ending.
  const { phase, record } = reconcile(
    localMirror,
    nativeRecord,
    clock.nowEpochMs(),
  );

  useEffect(() => {
    if (phase !== 'active') {
      return;
    }
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const presentPicker = useCallback(async () => {
    try {
      const selection = await GoalieFocus.presentActivityPicker();
      if (mounted.current) {
        setSelectionSummary(selection.summary);
      }
    } catch (error) {
      // User dismissal is a normal outcome: a clean no-op, no error state.
      if (error instanceof FocusCancelledError) {
        return;
      }
      throw error;
    }
  }, []);

  const start = useCallback(
    async (durationSeconds: number) => {
      setStartError(null);
      const validation = validateDuration(durationSeconds);
      if (!validation.ok) {
        setStartError(validation.reason);
        return;
      }
      try {
        const session = await GoalieFocus.startFocusSession(durationSeconds);
        const record = toRecord(session);
        // Persist the local mirror and record the authoritative native session.
        await setFocusSession(record);
        if (mounted.current) {
          setNativeRecord(record);
        }
      } catch (error) {
        // "If scheduling fails, do not start protection": surface the honest
        // native error code and DO NOT enter an active UI state.
        const message =
          error instanceof Error ? error.message : String(error);
        if (mounted.current) {
          setStartError(message);
        }
      }
    },
    [setFocusSession],
  );

  const emergencyRelease = useCallback(async () => {
    // stopFocusSession is idempotent native emergency release; always allowed.
    await GoalieFocus.stopFocusSession();
    await setFocusSession(null);
    if (mounted.current) {
      setNativeRecord(null);
    }
  }, [setFocusSession]);

  return {
    availability,
    selectionSummary,
    phase,
    remainingSeconds: remainingSecondsOf(record, clock.nowEpochMs()),
    record,
    startError,
    presentPicker,
    start,
    emergencyRelease,
    reconcileNow,
  };
}
