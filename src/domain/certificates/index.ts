// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Phase 2 builds a certificate PREVIEW from real completion state — not a PDF (Phase 6).

import { LevelId, Track } from '../content/catalog.types';
import { isLevelComplete, ProgressionState } from '../progression';

export interface CertificatePreview {
  trackId: string;
  trackTitle: string;
  displayName: string | null; // from persistence; null if not set
  completedLevels: LevelId[]; // only levels that are truly complete
  trackComplete: boolean; // all three levels complete
  generatedPreviewAtEpochMs: number; // passed in by caller (keeps function pure/testable)
}

// Pure: the clock is passed in rather than calling Date.now() so output is deterministic in
// tests. Only lists levels that pass isLevelComplete — a preview can never show an unearned
// level. trackComplete is true iff every level of the track is complete.
export function buildCertificatePreview(
  state: ProgressionState,
  track: Track,
  displayName: string | null,
  nowEpochMs: number,
): CertificatePreview {
  const completedLevels = track.levels
    .filter((level) => isLevelComplete(state, level, track.id))
    .map((level) => level.id);
  return {
    trackId: track.id,
    trackTitle: track.title,
    displayName,
    completedLevels,
    trackComplete: completedLevels.length === track.levels.length,
    generatedPreviewAtEpochMs: nowEpochMs,
  };
}
