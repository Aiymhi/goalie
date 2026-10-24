// Pure-domain tests for the voluntary focus-session model. A FakeClock injects
// the current instant so every lifecycle transition is deterministic and runs
// without a device.

import {
  assertCanStart,
  FocusClock,
  FocusSessionError,
  FocusSessionRecord,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  phaseOf,
  reconcile,
  remainingSeconds,
  validateDuration,
} from '../src/domain/focus-session';

// Deterministic clock. The test advances it explicitly; no real time is read.
class FakeClock implements FocusClock {
  constructor(private now: number) {}
  nowEpochMs(): number {
    return this.now;
  }
  set(now: number): void {
    this.now = now;
  }
  advance(ms: number): void {
    this.now += ms;
  }
}

function makeRecord(deadlineEpochMs: number): FocusSessionRecord {
  return {
    id: 'session-1',
    deadlineEpochMs,
    selectionSummary: '3 apps, 1 category',
  };
}

describe('validateDuration', () => {
  it('rejects a value below the minimum', () => {
    expect(validateDuration(59)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('rejects a value above the maximum', () => {
    expect(validateDuration(86401)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('rejects a non-integer value', () => {
    expect(validateDuration(60.5)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('rejects NaN', () => {
    expect(validateDuration(NaN)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('accepts the inclusive minimum', () => {
    expect(validateDuration(MIN_DURATION_SECONDS)).toEqual({ ok: true });
  });

  it('accepts the inclusive maximum', () => {
    expect(validateDuration(MAX_DURATION_SECONDS)).toEqual({ ok: true });
  });
});

describe('phaseOf', () => {
  it('is idle for a null record', () => {
    expect(phaseOf(null, 1_000)).toBe('idle');
  });

  it('is active before the deadline and expired at/after it', () => {
    const clock = new FakeClock(1_000);
    const record = makeRecord(1_000 + 60_000); // 60s session

    expect(phaseOf(record, clock.nowEpochMs())).toBe('active');

    clock.advance(59_999);
    expect(phaseOf(record, clock.nowEpochMs())).toBe('active');

    clock.advance(1); // exactly at the deadline
    expect(phaseOf(record, clock.nowEpochMs())).toBe('expired');

    clock.advance(10_000);
    expect(phaseOf(record, clock.nowEpochMs())).toBe('expired');
  });
});

describe('remainingSeconds', () => {
  it('reports whole seconds remaining and clamps to 0 after expiry', () => {
    const clock = new FakeClock(0);
    const record = makeRecord(60_000); // deadline at +60s

    expect(remainingSeconds(record, clock.nowEpochMs())).toBe(60);

    clock.set(59_500);
    expect(remainingSeconds(record, clock.nowEpochMs())).toBe(0); // floor of 0.5s

    clock.set(60_000);
    expect(remainingSeconds(record, clock.nowEpochMs())).toBe(0);

    clock.set(120_000); // far past the deadline
    expect(remainingSeconds(record, clock.nowEpochMs())).toBe(0);
  });

  it('is 0 for a null record', () => {
    expect(remainingSeconds(null, 1_000)).toBe(0);
  });
});

describe('reconcile', () => {
  it('prefers the native record over a stale local record', () => {
    const clock = new FakeClock(0);
    const local = makeRecord(30_000); // stale local mirror
    const native: FocusSessionRecord = {
      id: 'native-session',
      deadlineEpochMs: 90_000,
      selectionSummary: '5 apps',
    };

    const result = reconcile(local, native, clock.nowEpochMs());
    expect(result.record).toBe(native);
    expect(result.phase).toBe('active');
  });

  it('falls back to the local record when native is absent', () => {
    const clock = new FakeClock(0);
    const local = makeRecord(90_000);

    const result = reconcile(local, null, clock.nowEpochMs());
    expect(result.record).toBe(local);
    expect(result.phase).toBe('active');
  });

  it('returns idle when both are absent', () => {
    const result = reconcile(null, null, 1_000);
    expect(result.record).toBeNull();
    expect(result.phase).toBe('idle');
  });

  it('yields expired when the clock is at the deadline', () => {
    const record = makeRecord(60_000);
    const result = reconcile(null, record, 60_000);
    expect(result.phase).toBe('expired');
  });

  it('yields expired when the device clock jumps far beyond the deadline (never extends)', () => {
    const record = makeRecord(60_000);
    // Simulate a device-clock change that lands years in the future.
    const result = reconcile(record, null, 60_000 + 1_000 * 60 * 60 * 24 * 365);
    expect(result.phase).toBe('expired');
    expect(remainingSeconds(result.record, 60_000 + 1_000 * 60 * 60 * 24 * 365)).toBe(0);
  });
});

describe('assertCanStart', () => {
  it('allows starting when there is no record', () => {
    expect(() => assertCanStart(null, 0)).not.toThrow();
  });

  it('rejects a second start while a session is active (E_SESSION_ACTIVE)', () => {
    const clock = new FakeClock(0);
    const record = makeRecord(60_000);
    expect(() => assertCanStart(record, clock.nowEpochMs())).toThrow(
      FocusSessionError,
    );
  });

  it('allows starting once the previous session has expired', () => {
    const record = makeRecord(60_000);
    expect(() => assertCanStart(record, 60_000)).not.toThrow();
  });
});
