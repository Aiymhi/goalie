// Production Clock implementation (UI layer). It lives here, NOT in the domain,
// precisely because it touches the environment (the device's wall clock and
// local timezone). The domain only ever sees the Clock interface; it never
// calls Date(). Tests inject a FakeClock instead of this value.

import { Clock, LocalDateYYYYMMDD } from '../../domain/rewards';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// The LOCAL calendar date derived from the device's local time components,
// zero-padded to exactly 8 digits (YYYYMMDD). getMonth() is 0-based, so +1.
function localDateYYYYMMDD(): LocalDateYYYYMMDD {
  const now = new Date();
  const year = `${now.getFullYear()}`.padStart(4, '0');
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  return `${year}${month}${day}`;
}

export const systemClock: Clock = {
  nowEpochMs: () => Date.now(),
  localDateYYYYMMDD,
};

export default systemClock;
