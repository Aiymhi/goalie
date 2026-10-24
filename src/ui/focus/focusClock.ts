// UI-layer production implementation of the domain FocusClock port. The domain
// (src/domain/focus-session) only ever sees the FocusClock interface; this is
// the single place that reads the real device clock for the focus feature.

import { FocusClock } from '../../domain/focus-session';

export const focusClock: FocusClock = {
  nowEpochMs: () => Date.now(),
};
