// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Phase 6 certificate DATA + HTML + share copy, derived entirely from real
// completion state. A certificate is produced ONLY for a level that passes
// isLevelComplete; the completion date comes from a recorded timestamp and is
// NEVER fabricated (null + completionDateUnknown when no timestamp exists). The
// reference id is a deterministic LOCAL string — no verification URL, no
// identity proof, no auto-posting. The HTML/share copy carry original Goalie
// branding only and contain no http/verification claim.

import { Level, Track } from '../content/catalog.types';
import { isLevelComplete, ProgressionState } from '../progression';

// The exact disclaimer that must appear verbatim on every certificate. Kept as
// a single exported constant so the UI/tests reference the one source of truth.
export const CERTIFICATE_DISCLAIMER =
  'Completion certificate — not academic credit or an accredited professional credential.';

export interface CertificateData {
  referenceId: string;
  studentDisplayName: string | null;
  trackTitle: string;
  levelTitle: string;
  levelId: string;
  completionDateEpochMs: number | null; // null when no timestamp was recorded
  completionDateUnknown: boolean; // true iff completionDateEpochMs is null
  skills: string[]; // derived from real content (level + lesson objectives)
  disclaimer: string; // always === CERTIFICATE_DISCLAIMER
}

export class CertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateError';
  }
}

// djb2 string hash rendered as unsigned hex. Deterministic, stable across
// calls, and differs when the input differs — used only to fingerprint the
// display name into the LOCAL reference id (not an identity proof).
function djb2hex(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    // hash * 33 + charCode, kept in 32-bit unsigned space.
    hash = (hash * 33 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

// Deterministic LOCAL reference id. Stable across calls for the same inputs and
// differs when the display name differs. Contains NO URL and NO verification
// claim — it is a local, human-readable fingerprint only.
export function buildCertificateReferenceId(
  trackId: string,
  levelId: string,
  displayName: string,
): string {
  return `goalie-${trackId}-${levelId}-${djb2hex(displayName || '')}`;
}

// The key format the store uses for completedLevels (see persistence/store.ts).
function completedLevelKey(trackId: string, levelId: string): string {
  return `${trackId}/${levelId}`;
}

// Build certificate data from REAL state. THROWS CertificateError unless the
// level truly passes isLevelComplete — a certificate can never be produced for
// an unearned level. The completion date is taken from the recorded timestamp
// in completedLevels; when absent it is null + completionDateUnknown (NEVER
// Date.now()). Skills are derived from real content.
export function buildCertificateData(
  state: ProgressionState,
  track: Track,
  level: Level,
  displayName: string | null,
  completedLevels: Record<string, number>,
): CertificateData {
  if (!isLevelComplete(state, level, track.id)) {
    throw new CertificateError(
      `Level "${level.id}" of track "${track.id}" is not complete; no certificate can be issued.`,
    );
  }

  const key = completedLevelKey(track.id, level.id);
  const recorded = completedLevels[key];
  const hasTimestamp =
    typeof recorded === 'number' &&
    Number.isFinite(recorded) &&
    recorded > 0;

  const skills = [level.objective, ...level.lessons.map((lesson) => lesson.objective)];

  return {
    referenceId: buildCertificateReferenceId(track.id, level.id, displayName ?? ''),
    studentDisplayName: displayName,
    trackTitle: track.title,
    levelTitle: level.title,
    levelId: level.id,
    completionDateEpochMs: hasTimestamp ? recorded : null,
    completionDateUnknown: !hasTimestamp,
    skills,
    disclaimer: CERTIFICATE_DISCLAIMER,
  };
}

// Minimal HTML escaping so a display name/title containing <, >, &, ", or ' can
// never break out of the markup or inject attributes.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format a recorded completion date (local civil date components of the epoch)
// or the honest "not recorded" copy when unknown. Pure: when a timestamp is
// present it is formatted via Date for display only (no Date.now()).
function formatCompletionDate(data: CertificateData): string {
  if (data.completionDateUnknown || data.completionDateEpochMs === null) {
    return 'Completion date not recorded';
  }
  const d = new Date(data.completionDateEpochMs);
  const year = `${d.getFullYear()}`.padStart(4, '0');
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A self-contained one-page HTML certificate with ORIGINAL Goalie branding
// only. A long display name wraps / truncates via CSS (never data loss). The
// exact disclaimer, track/level titles, reference id, skills, and completion
// date are present. Contains NO http/verification-URL claim.
export function buildCertificateHtml(data: CertificateData): string {
  const name = data.studentDisplayName
    ? escapeHtml(data.studentDisplayName)
    : 'Learner';
  const skillItems = data.skills
    .map((skill) => `<li>${escapeHtml(skill)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Goalie Certificate</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, Helvetica, Arial, sans-serif;
    color: #1a1a2e;
    padding: 48px;
  }
  .certificate {
    border: 3px solid #1f6feb;
    border-radius: 16px;
    padding: 40px;
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
  }
  .brand {
    font-size: 14px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #1f6feb;
    font-weight: 700;
  }
  .heading { font-size: 30px; font-weight: 700; margin: 16px 0 8px; }
  .subheading { font-size: 15px; color: #555; margin-bottom: 24px; }
  .name {
    font-size: 26px;
    font-weight: 700;
    margin: 12px 0;
    /* Long names wrap and are visually bounded without losing data. */
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: 120px;
    overflow: hidden;
  }
  .titles { font-size: 18px; margin: 8px 0; }
  .track { font-weight: 600; }
  .level { color: #1f6feb; font-weight: 600; }
  .skills {
    text-align: left;
    display: inline-block;
    margin: 20px auto;
    padding-left: 20px;
  }
  .skills li { margin: 4px 0; font-size: 14px; }
  .meta { font-size: 13px; color: #555; margin-top: 16px; }
  .reference {
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    color: #777;
    margin-top: 8px;
    overflow-wrap: anywhere;
  }
  .disclaimer {
    font-size: 12px;
    color: #8a5a00;
    background: #fff4e5;
    border: 1px solid #d9822b;
    border-radius: 8px;
    padding: 10px 14px;
    margin-top: 24px;
  }
</style>
</head>
<body>
  <div class="certificate">
    <div class="brand">Goalie</div>
    <div class="heading">Certificate of Completion</div>
    <div class="subheading">This certifies that</div>
    <div class="name">${name}</div>
    <div class="subheading">has completed</div>
    <div class="titles">
      <span class="level">${escapeHtml(data.levelTitle)}</span>
      &middot;
      <span class="track">${escapeHtml(data.trackTitle)}</span>
    </div>
    <ul class="skills">${skillItems}</ul>
    <div class="meta">Completion date: ${escapeHtml(formatCompletionDate(data))}</div>
    <div class="reference">Reference: ${escapeHtml(data.referenceId)}</div>
    <div class="disclaimer">${escapeHtml(data.disclaimer)}</div>
  </div>
</body>
</html>`;
}

// Editable LinkedIn/social copy naming the track/level. Contains NO URL and NO
// verification claim — it is a starting draft the learner edits before posting.
export function buildSharePostText(data: CertificateData): string {
  const who = data.studentDisplayName ? `${data.studentDisplayName} ` : '';
  return (
    `${who}completed the ${data.levelTitle} level of ${data.trackTitle} on Goalie. ` +
    `${data.disclaimer} ` +
    `(Reference: ${data.referenceId})`
  );
}
