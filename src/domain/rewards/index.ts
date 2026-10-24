// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Phase 2 emits an idempotent completion EVENT when a level first becomes complete.
// No XP accrual here — the XP/streak ledger stays Phase 4.

import { Level, LevelId } from '../content/catalog.types';
import { isLevelComplete, ProgressionState } from '../progression';

export interface LevelCompletedEvent {
  type: 'level-completed';
  trackId: string;
  levelId: LevelId;
}

// Pure diff: given the state BEFORE and AFTER a progression transition and the level,
// return a LevelCompletedEvent iff the level was NOT complete before and IS complete after.
// Idempotent by construction: re-running a transition that changes nothing yields [].
export function deriveCompletionEvents(
  before: ProgressionState,
  after: ProgressionState,
  level: Level,
  trackId: string,
): LevelCompletedEvent[] {
  const wasComplete = isLevelComplete(before, level, trackId);
  const isComplete = isLevelComplete(after, level, trackId);
  if (!wasComplete && isComplete) {
    return [{ type: 'level-completed', trackId, levelId: level.id }];
  }
  return [];
}
