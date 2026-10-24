# Fair rewards and supportive coaching for Goalie (Phases 3+4)

Phases 3+4 add a pure, deterministic XP/streak/badge backbone and a deterministic, evidence-based coaching layer on top of the Phase 2 progression domain, wired into the real completion flow through `ProgressionProvider` and the Result/Mastery/Progress screens, with an optional AI practice-hint boundary that is off by default. The whole-diff review covers all five FEATs plus the integration state (rewards domain, coaching domain, store v2 + migration, provider/screen wiring, AI client + server stub). Every binding guarantee from the approved design holds in the code, and each is backed by a test. I independently re-ran the four verification commands rather than trusting the recorded evidence.

Watch for: nothing blocking. XP idempotency, the local-day streak with its branch ordering, badge-only-when-earned, the injected clock, the no-retro-XP migration, the pre-write prior that keeps "improved" honest, and the off-by-default no-key-in-bundle AI path are all implemented as specified (confirmed). The only observation is one cosmetic NIT in the AI client that changes no behavior.

**Verdict**: APPROVED

## High-level view

The reward model lives entirely in `src/domain/rewards`. XP is awarded through an id-keyed persisted ledger — the lesson id verbatim for 20 XP, `mastery:${trackId}/${levelId}` for 50 XP — so repeating completed work is a true no-op that returns the prior state by reference and awards zero. `totalXp` is a cached sum the store re-derives from the ledger on load, so a forged total can't survive a reload.

The streak is a local-calendar-day concept driven by an injected `Clock` that exposes `localDateYYYYMMDD()`; the domain never touches `Date`. `applyReward` credits the streak only when it awarded first-time XP, and the day branches are evaluated in the exact order the design mandates (first-ever, then `delta < 0` backwards-clock before the `delta >= 2` gap arm), so a backwards clock neither inflates nor penalizes the count and a gap resets to 1.

Badges are strictly separate from XP: `applyReward` never mints one, and `applyBadge` appends a badge only from a `deriveCompletionEvents` signal, which fires on the real `false→true` edge of `isLevelComplete` (both lessons complete AND mastery passed). XP never gates mastery or certificates, and the Progress screen labels XP/streak as effort distinct from "Levels mastered."

Persistence bumps `PersistedData` to v2. The v1→v2 migration carries `selectedTrackId`/`displayName`/`progression` verbatim, initializes rewards/history/aiCoaching to empty defaults, awards no retroactive XP (there is no honest per-id completion timestamp in v1), and writes the upgraded document back once. The v2 guard treats rewards/progression as authoritative (reject-the-store on a bad shape) and attempt-history/aiCoaching/focus/completedLevels as non-authoritative (repair or drop), and silently coerces `aiCoaching.enabled` to false unless the disclosure was acknowledged.

Rewards apply through `ProgressionProvider` in a single persisted transaction alongside the progression update. Each wrapper snapshots the pre-write prior attempt, computes reward/badge, then overwrites the slot and returns the pre-write prior, so the screens render the "improved" comparison from the snapshot rather than from live state that already holds the current attempt. Idempotency across reopen is the id-keyed ledger, not a screen flag.

Coaching in `src/domain/coaching` is deterministic and content-grounded: a real strength, an improvement, and a hint, with a comparison present only when a comparable prior and current answer exist. "Improved" is asserted only on a mastery incorrect→correct transition; practice text is never graded, so it never claims improvement from free text. Student text is treated as untrusted data — bounded, measured for presence only, never interpolated or stored.

The optional AI boundary assists only the practice hint. It is off by default, server-side only with no key in the mobile bundle, shape-checks the response down to a single bounded hint string, and falls back to the local hint on every failure mode. It cannot reach the score, XP, badge, or certificate paths.

<details>
<summary>Issues (1)</summary>

1. **AI abort reason not distinguished (NIT, cosmetic)** — `fetchAiHint` collapses timeout/abort, network throw, and JSON-parse failure into a single `null` return; both branches correctly fall back to local, so there is no behavioral gap. No action required for Phases 3+4.

</details>

<details>
<summary>Details</summary>

### XP idempotency via an id-keyed persisted ledger

`applyReward` computes a ledger key from the source — the lesson id verbatim for a lesson completion, `mastery:${trackId}/${levelId}` for a mastery pass — and if the key is already present it returns `{ state: prev (by reference), xpAwarded: 0, alreadyAwarded: true, ... }`. Because `prev` is never mutated and is returned by identity, a redundant call is a true no-op even on object identity. First-time awards are 20 or 50 and extend the ledger with `totalXp' = prev.totalXp + xp`. The `mastery:` namespace prevents any collision with a lesson id, and mastery XP is level-scoped, not question-scoped, exactly as the design binds. Repeats across reopen are handled by the same ledger because it is persisted, not a screen flag — the reopen-simulation smoke test (`awards 20 XP once for a lesson and no additional XP on reopen`) proves it.

The `totalXp === Σ awardedXp` invariant is asserted in `rewards.test.ts` and enforced on load by the store, which re-derives `totalXp` from the ledger when the stored number disagrees rather than trusting it.

### Local-day streak with mandated branch ordering

The domain never calls `Date`; it reads `clock.localDateYYYYMMDD()`. `applyReward` only moves the streak on a first-time-XP award, so repeats and (structurally) app-open and the focus timer can never advance it — the Focus screen never calls the reward wrappers, and the `the Focus screen moves no streak` smoke test confirms it. The branches run in the exact order the design requires:

```
last === null        -> count 1 (first-ever credit)
else delta = daysBetweenLocalDates(last, today):
  delta <  0  -> backwards clock: no streak change, XP still awarded
  delta === 0 -> same day: no change
  delta === 1 -> consecutive: count + 1
  delta >= 2  -> gap: reset to 1 (streakReset)
```

`daysBetweenLocalDates` returns a *signed* civil-day delta computed with Hinnant's civil algorithm over parsed Y/M/D components — no timezone-bearing `Date` is constructed, so DST/timezone shifts can't corrupt the count. It throws `RewardError('malformed local date')` only on non-8-digit input, so the `< 0` backwards-clock branch is reachable and is tested (`returns a signed delta without throwing for a valid earlier date` and `awards XP but does not move the streak when the clock moves backwards`). A gap resets only the count; XP, badges, and progression are untouched, satisfying "missing a day never erases XP, skills, or certificates."

### Badges tied to real completeness, strictly separate from XP

`applyReward` always returns `badgeEarned: null`. Badges come only from `applyBadge`, which appends (de-duplicated, append-only) from `LevelCompletedEvent`s produced by `deriveCompletionEvents` on the `false→true` edge of `isLevelComplete` — both lessons complete AND mastery passed. A mastery pass that awards 50 XP does not mint a badge unless the lessons are also done, because the provider feeds `applyBadge` the derived events, not the XP outcome. The `mastery pass awards 50 + badge once; a later failing retry keeps the badge and XP` test exercises the once-only edge and the non-regression of a later failing retry. XP never appears on the certificate and never gates it (the certificate domain is unchanged in this phase).

### Injected clock and domain purity

`Clock` is a domain interface with `nowEpochMs()` and `localDateYYYYMMDD()`. The production implementation lives in the UI layer (`src/ui/rewards/systemClock.ts`), formatting the device's local Y/M/D zero-padded to 8 digits. `ProgressionProvider` takes `clock = systemClock` as an optional prop so tests inject a `FakeClock`; the `credits a consecutive-day streak (count 2) when the fake clock advances a day` test drives the seam. A grep of `src/domain/**` confirms no `react`/`react-native`/`@react-native-async-storage` import and no `Date.now()`/`new Date()` in the rewards or coaching domains (confirmed).

### PersistedData v1→v2 migration with no retroactive XP

`migrateV1toV2` starts from `defaultPersistedData()` and overlays the v1 `selectedTrackId`/`displayName`/`progression` verbatim; rewards/attemptHistory/aiCoaching start empty/off. No XP is awarded for pre-v2 completions because v1 carries no trustworthy per-id completion timestamp — `awards no retroactive XP for pre-v2 completed levels` asserts `totalXp === 0` and an empty ledger even when v1 had completed levels. `loadData` writes the migrated document back once so a second load sees `version === 2` (`migrates a v1 document to v2, preserving progression and writing back`). The guard splits authoritative data (version/progression/rewards shape → reject the whole store on a bad shape, e.g. an `awardedXp` value of 37) from non-authoritative data (attempt history, aiCoaching, focus mirror, completedLevels → repair or drop with an at-most-once warn). The `enabled→false` coercion without an acknowledged disclosure is silent and tested (`coerces enabled to false without an acknowledged disclosure`), closing the path where a tampered store could run the AI feature without consent. `STORAGE_KEY` intentionally stays `'goalie.v1'`; the document `version` drives migration.

### Single-transaction wiring and the pre-write prior

Both `completeLesson` and `recordMasteryResult` run the design's exact sequence: snapshot the pre-write prior attempt(s), compute progression + reward + badge, overwrite the attempt slot with the current attempt, and persist progression/rewards/attemptHistory (and the Phase 6 `completedLevels`) in one `persist` call. They return the pre-write prior (`priorPracticeAttempt` / `priorByQuestionId`) so the screens render coaching from the snapshot, never from live `attemptHistory` (which already reflects this visit's write). This is the fix for the "improved" read/write race: the `renders the improved comparison copy across an incorrect-then-correct remount, and none on a first attempt` smoke test proves the screen reads the returned snapshot. `resolveLevel` returns null on a null catalog or stale id, in which case the wrapper applies XP/streak only with `events = []` and never throws (`wrapper applies XP/streak and returns badgeEarned:null without throwing on a stale id`). Mastery XP is awarded only on `result.passed`; a fail yields a synthetic zero-XP outcome so the screen renders without special-casing null.

### Deterministic, honest coaching

`coachMasteryQuestion` resolves option text from `question.options` with an out-of-range guard that renders "no valid option" instead of `undefined`, so a stray `selectedIndex` (which `gradeMastery` grades as incorrect without erroring) never crashes or interpolates garbage. A correct answer gets a grounded strength and a genuine next step; an incorrect answer gets an honest strength (no false praise) that points at the correct option. The comparison is `null` on a first attempt and asserts `improved: true` only on an incorrect→correct transition; a correct→incorrect transition states the regression plainly and a correct→correct says "both times" — all four cases tested. `coachPractice` never asserts `improved` from free text (text is self-checked, not graded) and acknowledges reaching the step on empty input. Untrusted student text is bounded to `MAX_PRACTICE_TEXT`, measured only for presence, never interpolated or stored; an "ignore previous instructions" string is treated as plain data (tested). A `graded.questionId` mismatch throws `CoachingError`.

### Optional AI boundary: off by default, server-side only, never awards

`fetchAiHint` returns `null` immediately (no network) when the feature is off or no endpoint is set — the default. When on, it POSTs a bounded JSON body with an `AbortController` timeout and accepts only `{ hint: string }` after a shape-check that strips every other field (score/xp/badge/certificate) and bounds the hint length. Any non-200, abort/timeout, network throw, or shape-invalid body returns `null`, and the caller keeps the deterministic local hint with `source: 'local'`; a validated hint replaces only `CoachingFeedback.hint` and flips `source` to `'ai'`, leaving strength/improvement/comparison deterministic. The `aiCoaching.test.ts` suite covers off-by-default (no network, local source), every failure fallback, the hint-only replacement, the field-stripping, and student-text truncation. No `process.env`/API-key reference exists anywhere in `src/**` (confirmed by grep); the key is read `process.env`-side only in the isolated `server/` stub, which re-validates types, re-truncates the student text, and returns only `{ hint }`. `server/` has its own `package.json` so the mobile bundle's dependency graph is untouched.

**AI abort-reason NIT (cosmetic).** `fetchAiHint` folds timeout/abort, network throw, and JSON-parse failure into one `null` return. Both outcomes correctly degrade to local, so there is no behavioral or security gap — this is purely an observability nicety and needs no change for Phases 3+4.

### Independent verification

Re-run from the worktree root, in order:

- `npm run typecheck` → exit 0, no type errors. The provider's changed return types (`CompleteLessonOutcome`/`MasteryOutcome`) and the `source: 'local' | 'ai'` union type-check against the screens.
- `npm run lint` → exit 0, 0 errors, 3 pre-existing benign `require()` warnings for the official AsyncStorage jest mock in three test files (established Phase 2 convention, not an integration failure).
- `npm test` → exit 0, 13 suites / 161 tests passing. One expected `console.warn('goalie: dropped malformed completed level')` surfaces from a store fail-safe path exercised by the smoke test.
- `node scripts/validate-catalog.mjs` → exit 0, "3 tracks, 9 levels, 18 lessons, 45 mastery questions checked" — unchanged baseline; no content schema change in Phases 3+4.

All four pass independently, matching the recorded verification evidence.

</details>

<details>
<summary>File map</summary>

- `src/domain/rewards/index.ts` — XP/streak/badge model: `RewardsState`, `applyReward`, `applyBadge`, `viewRewards`, `Clock`, `daysBetweenLocalDates`, `RewardError`; keeps `deriveCompletionEvents`.
- `src/domain/coaching/index.ts` — deterministic `coachMasteryQuestion`/`coachPractice`, `CoachingFeedback`, `ImprovementComparison`, `MAX_PRACTICE_TEXT`, `CoachingError`.
- `src/persistence/store.ts` — `PersistedData` v2, v1→v2 migration, authoritative-vs-repair guard, `totalXp` re-derive, aiCoaching coercion.
- `src/ui/context/ProgressionProvider.tsx` — single-transaction reward/badge/history wiring, clock prop seam, pre-write prior snapshot return, `setAiCoaching`.
- `src/ui/rewards/systemClock.ts` — production `Clock` (local-date formatter).
- `src/ui/screens/ResultScreen.tsx` — honest XP/streak/badge copy, practice coaching from the returned prior, optional AI hint, dead recompute removed.
- `src/ui/screens/MasteryResultScreen.tsx` — honest +50-on-first-pass, per-question coaching from returned priors, badge line, dead recompute removed.
- `src/ui/screens/PracticeScreen.tsx` — forwards `draft.trim().slice(0, MAX_PRACTICE_TEXT)` as `practiceAnswer`.
- `src/ui/screens/ProgressScreen.tsx` — XP/streak under "Your effort", badges only when `hasBadge`.
- `src/ai/coachingClient.ts` — optional `fetchAiHint`, shape-check, bounded student text, no key.
- `server/` — isolated `POST /coach/explain` stub (`index.js`, `package.json`, `README.md`); key `process.env`-side only.
- `__tests__/rewards.test.ts`, `__tests__/coaching.test.ts`, `__tests__/store.test.ts`, `__tests__/screens.smoke.test.tsx`, `__tests__/aiCoaching.test.ts` — the Phase 3/4 test matrix.

Full diff: `git diff 63886ed..HEAD` (Phases 3+4 commits bb41724, 0e175bb, 3bdf2c4, a326008, 4519e32 plus the integration verification record; Phase 5/6 commits 503793b/92d9f70 are adjacent work).

</details>
