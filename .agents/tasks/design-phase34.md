# Goalie — Phases 3 + 4 Design: Fair Rewards & Supportive Coaching

Status: Design pass (NO application code or content authored in this step). Target repo: `/Users/Shared/goalie` (git `main`, local-only, no remote, no `--amend`/force). All paths absolute under that root. Phases 1 and 2 are DONE and committed; this design extends them without breaking them. `scripts/validate-catalog.mjs` must keep passing and `.kiro` stays tracked.

This design covers Phases 3 and 4 as **one cohesive unit** built directly on the Phase 2 progression domain (`completeLesson`/`recordMasteryResult`/`isLevelComplete`), the `ProgressionProvider`, the persistence store (`STORAGE_KEY 'goalie.v1'`, `PersistedData`), and the Result / MasteryResult screens. Phase 4 (fair rewards) is designed **first** because it is the backbone: a deterministic, idempotent, persistent XP/streak/badge ledger in the pure domain. Phase 3 (supportive coaching) layers deterministic, evidence-based feedback on top, with an optional, off-by-default, server-side-only AI boundary that degrades gracefully to the local path.

It stays inside the established architecture: TS strict, pinned deps from the SDK 54 matrix, content separated from logic, honest states, no fabricated data, and the **domain layer free of any `react`/`react-native`/AsyncStorage import**. The clock/local-date is injected so every reward and comparison is deterministic in tests.

---

## 1. Overview

Phase 2 shipped: deterministic `gradeMastery`, a monotonic progression reducer, an idempotent `deriveCompletionEvents` level-complete signal, a certificate preview builder, the `ProgressionProvider` that wraps the pure domain and persists a single `goalie.v1` document, and the full screen graph including Result and MasteryResult (the two screens where a lesson flips to complete and a mastery result is recorded).

Phases 3 + 4 add two things and nothing more:

- **Phase 4 — Fair rewards (the backbone).** A new pure `src/domain/rewards/` surface that turns *completion events* into **XP, a streak, and level badges**, with four hard guarantees: **deterministic** (no `Date.now()` inside the domain; the clock/local-date is injected), **idempotent** (XP is keyed in a persisted ledger by lesson/level id, so repeating completed work never double-awards), **persistent** (the ledger lives in a bumped `PersistedData` v2 with a v1→v2 migration that preserves existing progression), and **honest** (XP is strictly separate from mastery/certificates — a large XP total never implies competence, and a badge appears only when a level's real completion criteria are met).

- **Phase 3 — Supportive coaching.** A new pure `src/domain/coaching/` surface that, for every practice and mastery answer, produces specific, respectful, **evidence-based** feedback from deterministic local logic that works with no network: one grounded strength, one important improvement/next step, a hint/explanation from the content, and a retry that preserves earned progress. An **improvement-comparison rule** means the word "improved" is only used when a comparable prior answer *and* a current answer both exist, and the specific difference is shown. Structured (MCQ mastery) grading stays deterministic-only — AI never changes a score, awards mastery, or issues a certificate.

The through-line remains **honesty of state** from Phase 2, extended with a second principle: **XP is motivation, not evidence.** Nothing in Phase 4 can gate or imply mastery; nothing in Phase 3's optional AI can touch a score, badge, XP value, or certificate.

The optional AI boundary is explicitly **off by default** and **server-side only** (API keys never in the mobile bundle). The app is fully functional without it; a client adapter + a documented server contract + a local stub are designed so the server can be a later, isolated add. Every AI failure mode (timeout, missing key, provider error, bad-shape output) falls back to the deterministic local feedback.

Phase boundaries respected: the real focus-session UX stays Phase 5 (unchanged here; still honestly unavailable), and the real PDF certificate stays Phase 6 (the preview builder is extended only to read the new display fields it already receives). We do not pre-build those.

---

## 2. Technology Stack (PINNED — locked once approved)

Phases 3 + 4 inherit the entire Phase 1 + Phase 2 matrix unchanged (Expo SDK 54, React 19.1.0, RN 0.81.5, React Navigation 7.5.1 / native-stack 7.21.0, TS 5.9.3, jest-expo 54.0.18, `@react-native-async-storage/async-storage` 2.2.0). **No new runtime dependency is added to the mobile app.** The domain additions are pure TS and the persistence change is a schema bump on the existing AsyncStorage document — neither needs a package.

**Optional AI server (separate, not in the mobile bundle).** The optional coaching server under `server/` is designed but, for this environment, delivered as a **documented contract plus a local stub handler**, not a running deployed service. Its stack is pinned so a later implementer does not re-decide it:

| Package | Pinned version | Source / reason |
|---|---|---|
| `express` | `4.21.2` | Minimal, ubiquitous Node HTTP handler; the current stable 4.x line. Only used by the optional `server/`, never imported by the mobile app. |
| `@types/express` | `4.17.21` | Dev types matching Express 4.x. Server-only devDependency. |

**Decision — Express over a bare `http` handler or a framework.** A bare `node:http` handler would avoid the dependency but re-implements routing/body-parsing we would then have to hand-verify; a heavier framework (Nest, Fastify-plus-plugins) is overkill for a single `POST /coach/explain` endpoint. Express 4.21.2 is the smallest well-known choice that keeps the handler readable and testable. **These server deps live in a separate `server/package.json`, not the root `package.json`**, so the mobile bundle's dependency graph and lockfile are untouched and an `npm install` for the app never pulls Express. The root app remains buildable and testable with zero knowledge of `server/`.

**Why no mobile-side AI dependency.** The client adapter (§9.2) uses the RN-global `fetch` with `AbortController` for timeouts — both already available in the RN 0.81 runtime — so there is no SDK, no API-client package, and crucially **no API key** on the device. The only thing the app ever does toward AI is an optional `fetch` to a URL the user configured; with the feature off (default) it does not even do that.

Package manager / Node / lockfile unchanged from Phase 1 (npm 11.7.0, Node v20.19.4, root `package-lock.json` committed). If `server/` is ever installed, it gets its own `server/package-lock.json`.

---

## 3. PHASE 4 — Fair Rewards domain (the backbone)

All of Phase 4's rules live in the pure domain so they are deterministic and unit-testable with zero mocks. The module is `src/domain/rewards/index.ts`, **extended** (not replaced) — the existing `LevelCompletedEvent` / `deriveCompletionEvents` from Phase 2 stay and become inputs to the new reward application.

### 3.1 The reward rules (exact, binding)

1. **Lesson XP: 20 XP for the FIRST completion of a lesson**, once per lesson id, ever. A second/third completion of the same lesson awards 0.
2. **Mastery XP: 50 XP for the FIRST passing mastery check of a level**, once per level id, ever. A failing attempt awards 0; a second passing attempt of the same level awards 0.
3. **Unlimited retries, no XP loss.** Repeating completed work never *removes* XP and never *duplicates* it. XP is monotonic-up-only and the ledger is the idempotency guard.
4. **Streak increases at most once per LOCAL CALENDAR DAY, and only after a COMPLETED LEARNING activity** (a lesson completion that awarded its first-time XP, or a mastery pass that awarded its first-time XP). Streak **never** moves on app open, focus timer, or a repeat of already-credited work.
5. **Missing a day never erases XP, skills, or certificates.** A gap resets the streak *count* to 1 on the next completion, but XP totals, badges, and progression persist untouched.
6. **A level badge appears ONLY after that level's completion criteria are met** — both lessons complete AND mastery passed (i.e. exactly `isLevelComplete` from Phase 2). XP is strictly separate from mastery: XP never gates mastery/certificates, and a large XP total never implies competence.

These rules are encoded as pure functions over a reward state value, driven by the real completion flow in §6.

### 3.2 The reward state shape (persisted, see §5 for the full v2 document)

```ts
// src/domain/rewards/index.ts — pure TS, no react/react-native/AsyncStorage.
export const REWARDS_STATE_VERSION = 2; // matches PersistedData v2 (§5)

// YYYYMMDD in the LOCAL calendar, e.g. "20250131". A string, not a Date, so the
// persisted value is stable, comparable, and timezone-frozen at capture time.
export type LocalDateYYYYMMDD = string;

export interface StreakState {
  count: number;                 // >= 0; 0 only before the first-ever credited completion
  lastLocalDateYYYYMMDD: LocalDateYYYYMMDD | null; // null before any credited completion
}

export interface RewardsState {
  version: 2;
  // Idempotency ledger. Keys are the exact ids the app already uses:
  //   lesson key:  lesson id (globally unique per Phase 2 content rules)
  //   mastery key: `mastery:${trackId}/${levelId}`  (level-scoped, not question-scoped)
  // The VALUE is the XP that key awarded (20 or 50). Presence of the key == already awarded.
  awardedXp: Record<string, number>;
  totalXp: number;               // sum of awardedXp values; stored for O(1) display, re-derivable
  streak: StreakState;
  earnedBadges: string[];        // badge ids `${trackId}/${levelId}`, de-duplicated, append-only
}

export function emptyRewards(): RewardsState {
  return { version: 2, awardedXp: {}, totalXp: 0, streak: { count: 0, lastLocalDateYYYYMMDD: null }, earnedBadges: [] };
}
```

**Ledger key design (binding, prevents double-award and read/write drift):**
- Lesson award key is the **lesson id verbatim** (Phase 2 guarantees lesson ids are globally unique across the catalog, so no track/level prefix is needed and collisions are impossible).
- Mastery award key is `mastery:${trackId}/${levelId}` — a distinct namespace (`mastery:` prefix) so a lesson id can never collide with a mastery key, and level-scoped because mastery XP is per level, not per question.
- Badge id is `${trackId}/${levelId}` — the same key shape `LevelCompletedEvent` already carries, so a badge maps 1:1 to a level-completed event.

`totalXp` is a cached sum. The reducer keeps it equal to `Σ awardedXp` on every transition; a unit test asserts the invariant `totalXp === sum(Object.values(awardedXp))` after each kind of transition, and the persistence guard (§5.2) rejects a stored document where they disagree, re-deriving rather than trusting a tampered total.

### 3.3 The clock / local-date injection (determinism)

The domain must never call `Date.now()` or `new Date()` internally. A tiny injected port provides the current instant and — critically — the **local calendar date** as a `YYYYMMDD` string, because "at most once per local calendar day" is a local-time concept and timezone handling must be explicit, not implicit in a `Date`:

```ts
export interface Clock {
  nowEpochMs(): number;
  // The LOCAL calendar date at `nowEpochMs()`, formatted YYYYMMDD. The production
  // implementation derives it from the device's local time; tests pass a fixed value.
  localDateYYYYMMDD(): LocalDateYYYYMMDD;
}
```

Why a dedicated `localDateYYYYMMDD()` rather than computing it from `nowEpochMs()` inside the domain: deriving a local date from an epoch requires the device timezone, which is an environmental input. Making it an explicit port method keeps the domain pure and makes "what local date is it" a single, test-injectable decision. The **production `Clock`** (UI layer, `src/ui/rewards/systemClock.ts`) formats the local date from `new Date()` using the device's local components (`getFullYear`/`getMonth`/`getDate`, zero-padded) — it lives in the UI layer precisely because it touches the environment; the domain only ever sees the `Clock` interface. Tests pass a `FakeClock` with a settable date (e.g. advance from `"20250131"` to `"20250201"` to exercise the streak).

### 3.4 Applying rewards (the pure reducer)

A single pure function applies the rules for one completion event. It takes the prior `RewardsState`, a typed completion input, and a `Clock`, and returns the next state plus a **transparent breakdown** of what changed (for honest UI messaging — "you earned 20 XP", "streak now 3", "no new XP, you already completed this").

```ts
export type RewardSource =
  | { kind: 'lesson-completed'; trackId: string; levelId: LevelId; lessonId: string }
  | { kind: 'mastery-passed';   trackId: string; levelId: LevelId };

export interface RewardOutcome {
  state: RewardsState;           // the next state (input never mutated)
  xpAwarded: number;             // 0, 20, or 50 — what THIS application added
  alreadyAwarded: boolean;       // true when the key was already in the ledger (no-op award)
  streakIncreased: boolean;      // true iff the streak count went up on this application
  streakReset: boolean;          // true iff a gap reset the count to 1 on this application
  newStreakCount: number;        // the resulting count (for display)
  badgeEarned: string | null;    // badge id if THIS application earned a new badge, else null
}

// Pure. Never mutates `prev`. `creditsLearningActivity` is derived, not passed:
// a day's streak is credited ONLY when this application awarded first-time XP
// (xpAwarded > 0). A repeat (alreadyAwarded) credits nothing and moves no streak.
export function applyReward(
  prev: RewardsState,
  source: RewardSource,
  clock: Clock,
): RewardOutcome;
```

**Algorithm (exact):**
1. Compute the ledger `key` for `source` (§3.2). If `key` already exists in `prev.awardedXp`, this is a **repeat**: return `{ state: prev, xpAwarded: 0, alreadyAwarded: true, streakIncreased: false, streakReset: false, newStreakCount: prev.streak.count, badgeEarned: null }`. No XP, no streak movement, nothing — this is the idempotency guarantee (rule 3). Note `prev` is returned **by reference** (safe: it was never mutated), so a redundant call is a true no-op even on the object identity.
2. Otherwise it is a **first-time** award. `xp = source.kind === 'lesson-completed' ? 20 : 50`. Build `awardedXp' = { ...prev.awardedXp, [key]: xp }` and `totalXp' = prev.totalXp + xp`.
3. **Streak** (rules 4–5), using `today = clock.localDateYYYYMMDD()`:
   - If `prev.streak.lastLocalDateYYYYMMDD === today` → **same day, already credited**: count unchanged, `streakIncreased: false`.
   - Else if `prev.streak.lastLocalDateYYYYMMDD === null` → **first-ever credited completion**: `count = 1`, `streakIncreased: true` (0→1).
   - Else if `today` is the **calendar day immediately after** `lastLocalDateYYYYMMDD` → **consecutive day**: `count = prev.count + 1`, `streakIncreased: true`.
   - Else (`today` is two or more days after, i.e. a **gap**) → **reset**: `count = 1`, `streakReset: true`, `streakIncreased: true` (count went up relative to… it is set to 1 regardless of prior; `streakIncreased` reflects that the count changed to a credited value today). In all credited branches set `lastLocalDateYYYYMMDD = today`.
   - "Immediately after" / "gap" are computed by parsing the two `YYYYMMDD` strings into a civil date and taking the difference in **days** (a pure helper `daysBetweenLocalDates(a, b)`; delta `=== 1` is consecutive, `>= 2` is a gap, `=== 0` is same day, `< 0` is a clock-moved-backwards anomaly handled in §3.5). This never constructs a timezone-bearing `Date` for the arithmetic — it does civil-date math on the parsed Y/M/D, so DST and timezone shifts cannot corrupt the day count.
4. **Badge** (rule 6): badges are **not** derived inside `applyReward` because `applyReward` does not see the catalog/progression. Instead badge earning is a separate pure step `applyBadge` driven by the **existing `deriveCompletionEvents`** signal (§3.6), so a badge can only ever appear when `isLevelComplete` is truly true. `applyReward` sets `badgeEarned: null`; the caller (§6) runs `applyBadge` from the level-completed event and merges. (Rationale: keeping XP/streak keyed on ids and badges keyed on the derived completeness keeps XP strictly separate from the completion criteria — rule 6 — and means a mastery pass that awards 50 XP does **not** by itself mint a badge unless the lessons are also done.)
5. Assemble and return the `RewardOutcome` with the new `RewardsState`.

### 3.5 Error handling and edge cases (concrete, per failure)

- **Empty/invalid ids in `source`** (empty `trackId`/`levelId`/`lessonId`): fatal programmer-invariant breach → throw `RewardError('<field> must be a non-empty string')` (named class, mirroring `ProgressionError`). The caller (the provider) only ever builds a `source` from real catalog/route ids, so this is an invariant, not user input. Not logged by the domain (pure); the UI boundary logs if it ever catches one. Recoverable at the UI level by not crashing the screen (the write simply does not proceed).
- **Unknown `source.kind`**: TypeScript's discriminated union makes this unreachable; a defensive `default` throws `RewardError('unknown reward source')` so a future added kind cannot silently award 0 and move on.
- **Clock moved backwards** (`today` parses to a civil date *before* `lastLocalDateYYYYMMDD`, delta `< 0`): treat as **same-day no-streak-change** for safety — we never *increment* on a backwards clock and never *reset to penalize* a backwards clock (the user did nothing wrong). `lastLocalDateYYYYMMDD` is left unchanged, `streakIncreased: false`, `streakReset: false`. XP is still awarded (the completion is real). This is documented and unit-tested so a device-clock change cannot inflate or destroy a streak. Not logged (expected-rare, benign).
- **Malformed `LocalDateYYYYMMDD`** reaching the domain (not 8 digits / unparseable): `daysBetweenLocalDates` throws `RewardError('malformed local date')`. This can only happen if a `Clock` implementation is wrong; it is an invariant breach, surfaced loudly rather than silently mis-counting. The production clock's formatter is unit-tested to always emit 8 digits.
- **`totalXp` vs ledger disagreement at load** (tampered/corrupt store): handled by the persistence guard (§5.2), which re-derives `totalXp` from the ledger rather than trusting the stored number — so a forged large `totalXp` cannot survive a reload. (Honesty: XP is never a competence signal, but it should still be internally consistent.)

### 3.6 Badge application (separate pure step, tied to real completeness)

```ts
// Pure. Given the existing Phase-2 level-completed events and the prior rewards
// state, append any newly-earned badge ids (de-duplicated). Idempotent: an event
// for an already-earned badge yields no change.
export function applyBadge(
  prev: RewardsState,
  events: LevelCompletedEvent[],
): { state: RewardsState; badgeEarned: string | null };
```

Because `deriveCompletionEvents` already fires **only** on the `false → true` edge of `isLevelComplete`, and `applyBadge` additionally de-dups against `earnedBadges`, a badge is earned exactly once, exactly when a level's real criteria (both lessons + mastery) are first met — never from XP, never twice. `earnedBadges` is append-only; there is no un-earn path, satisfying rule 5 (missing a day never removes a badge).

### 3.7 Reward view selectors (for honest UI)

```ts
export interface RewardsView {
  totalXp: number;
  streakCount: number;
  lastActivityDate: LocalDateYYYYMMDD | null;
  earnedBadgeCount: number;
  hasBadge(trackId: string, levelId: LevelId): boolean; // == earnedBadges.includes(`${trackId}/${levelId}`)
}
export function viewRewards(state: RewardsState): RewardsView;
```

The Progress screen renders only from this view. XP and streak are shown as **motivation copy explicitly labeled as effort, not competence** (§6.3), so a 500-XP learner who has not passed a mastery sees honest wording ("500 XP earned — keep going!" and separately "0 levels mastered"), never "500 XP — you've mastered this."

---

## 4. PHASE 3 — Supportive Coaching domain

Phase 3's feedback is pure, deterministic, and works with **no network**. It lives in a new module `src/domain/coaching/index.ts` (pure TS, no react/react-native). It never changes a score, XP value, badge, or certificate — it only *describes* an answer the deterministic assessment already produced (for mastery) or the self-checked practice answer (for practice).

### 4.1 The feedback contract (types, binding)

```ts
// src/domain/coaching/index.ts — pure TS.
export interface CoachingFeedback {
  // Always present, deterministic, grounded in the actual answer.
  strength: string;        // one evidence-based strength
  improvement: string;     // one important next step / improvement
  hint: string;            // a hint or brief explanation (from content's answerExplanation)
  // The improvement-comparison is OPTIONAL and only present when honestly earned (§4.3).
  comparison: ImprovementComparison | null;
  // Where the feedback came from, for the in-app disclosure and tests.
  source: 'local';         // 'local' here; the AI path (§9) sets 'ai' ONLY for the free-text hint
}

export interface ImprovementComparison {
  improved: boolean;       // true ONLY when a comparable prior AND current answer support it
  previousSummary: string; // what the earlier attempt did (e.g. "chose option 2 (incorrect)")
  currentSummary: string;  // what this attempt did (e.g. "chose option 1 (correct)")
  difference: string;      // the SPECIFIC difference shown, never a vague "you improved"
}
```

Two deterministic builders, one per answer kind:

```ts
// MASTERY (structured, single-correct MCQ). Uses the DETERMINISTIC GradedQuestion
// from assessment — AI is never consulted for structured grading.
export function coachMasteryQuestion(
  question: MasteryQuestion,
  graded: GradedQuestion,            // from gradeMastery (Phase 2)
  priorAttempt: PriorQuestionAttempt | null,
): CoachingFeedback;

// PRACTICE (self-checked free text). We do NOT grade the text; feedback is about the
// task, the suggested answer, and the explanation. Prior attempt enables honest comparison.
export function coachPractice(
  lesson: Lesson,
  currentAnswerText: string,         // UNTRUSTED student input — treated as data only (§4.4)
  priorAttempt: PriorPracticeAttempt | null,
): CoachingFeedback;
```

### 4.2 Deterministic feedback rules (per kind, exact)

**Mastery question (`coachMasteryQuestion`):**
- **Strength** — grounded in the actual selection: if `graded.correct`, the strength names *what they got right* referencing the chosen option text (e.g. "You correctly identified '<chosen option>' as the answer."). If incorrect, the strength is still real and specific, not hollow praise — it acknowledges the concrete attempt ("You engaged with the question and selected '<chosen option>'."), never "Great job!" on a wrong answer (that would be dishonest).
- **Improvement** — if incorrect, points to the correct option and the concept ("The expected answer was '<correct option>'. Review why that fits the prompt."). If correct, the improvement is a genuine next step ("Try explaining in your own words why '<correct option>' is right, to lock it in."), never a fabricated deficiency.
- **Hint** — the content's `answerExplanation` is *not* on mastery questions (that field is on practice); for mastery the hint is a brief, deterministic restatement pointing at the correct option and the question's own prompt. (If a later content revision adds per-question explanations, the builder prefers that field; until then it uses the prompt+correct-option restatement. Stated so the implementer does not invent a field.)
- **Retry** — the coaching object carries no retry button itself; the MasteryResult screen already offers Retry (Phase 2). Coaching only guarantees the *information* needed to retry well. Retry preserves earned progress by construction (Phase 2 non-regression + Phase 4 idempotent ledger).

**Practice (`coachPractice`):**
- **Strength** — honest about self-checked text: because we do not grade free text, the strength is grounded in the *act and shape* of the response, not a correctness claim — e.g. "You wrote a response and can compare it to the suggested answer below." If `currentAnswerText` is empty/whitespace, the strength instead acknowledges reaching the step ("You reached the practice reflection for this lesson.") and the improvement nudges writing an attempt. No false "correct!".
- **Improvement** — the lesson's `nextStep` (real content) framed as the next action.
- **Hint** — the lesson's `practice.answerExplanation` (real content). This is the one place the optional AI path (§9) may *replace* the hint with a richer free-text explanation — and only the hint, never strength/improvement/comparison, and never a score.

All four elements (strength, improvement, hint, retry-info) are therefore always available deterministically, satisfying the Phase 3 requirement with no network.

### 4.3 The improvement-comparison rule (binding honesty constraint)

`comparison` is `null` unless **both** a comparable prior attempt and the current attempt exist. "Comparable" means: same `questionId` (mastery) or same `lessonId` (practice). When present:
- **Mastery:** `improved = (prior.correct === false && graded.correct === true)`. `previousSummary` = "chose '<prior option text>' (incorrect)", `currentSummary` = "chose '<current option text>' (correct)", `difference` = the concrete delta ("Last time this question was answered incorrectly; this time it is correct."). If the prior was already correct and still correct, `improved = false` and the difference honestly says "Answered correctly both times." If it regressed (correct→incorrect), `improved = false` and the difference says so plainly — we never hide a regression and never call it improvement.
- **Practice:** because text is not graded, `improved` is **never** asserted from text quality (we cannot honestly judge free text). The comparison for practice is limited to the **factual** observation that a prior attempt exists ("You revisited this practice; your earlier response is on record."), with `improved: false` unless a future graded signal exists. This prevents the dishonest "you improved" on ungraded text.
- **No prior attempt → `comparison: null`.** The UI must not render any "improved" or "last time" language when `comparison` is null. A unit test asserts: first-ever attempt ⇒ `comparison === null`; incorrect-then-correct mastery ⇒ `comparison.improved === true` with both summaries populated; correct-then-incorrect ⇒ `improved === false` and the difference states the regression.

### 4.4 Prior-attempt tracking (local, enables honest comparison)

To compare, prior attempts must be recorded locally per question/lesson. This is **UI/persistence-layer state**, not domain state (it is history, not a reward), and it is kept small and bounded:

```ts
// shapes consumed by the coaching builders (passed in; the domain does not store them)
export interface PriorQuestionAttempt { selectedIndex: number; correct: boolean; atEpochMs: number }
export interface PriorPracticeAttempt { hadText: boolean; atEpochMs: number }
```

Storage decision: a bounded **attempt-history map** is added to `PersistedData` v2 (§5), keyed by `questionId` / `lessonId`, storing only the **most recent prior** attempt per key (one slot — we need "the previous answer", not the full log) plus `atEpochMs`. We store the minimum needed for an honest comparison and never the raw practice *text* (privacy + the text is untrusted and unneeded — we only record `hadText` and correctness). This caps growth at one record per question/lesson and keeps the persisted document small. The provider records the *current* attempt as the new "prior" **after** building feedback for this attempt, so the next visit compares against it.

**Untrusted student text (security).** `currentAnswerText` is treated as **data only**: the coaching builders never interpolate it into any executable context, never use it to build a prompt without escaping (the AI path §9 sends it as a bounded JSON string field, not concatenated into instructions), and never store it. Length is capped before any use (`MAX_PRACTICE_TEXT = 2000` chars; longer is truncated for display/transmission). There is no prompt-injection trust: even if the student writes "ignore previous instructions", it is a plain string the deterministic path only measures (`hadText`) and the AI path only quotes inside a JSON field the server re-validates.

### 4.5 Coaching error handling

- **Mismatched `graded` vs `question`** (`graded.questionId !== question.id`): `CoachingError('graded question id does not match question')` — invariant breach, thrown. The caller pairs them from the same `gradeMastery` output, so this cannot happen in normal flow.
- **Null/undefined content fields** cannot occur: `loadCatalog` (Phase 2) already guarantees non-empty `nextStep`/`answerExplanation`/`options`, so the builders trust parsed content (stated precondition, not re-validated).
- **Over-long practice text**: truncated to `MAX_PRACTICE_TEXT`, never an error.
- The coaching module does no IO and logs nothing internally.

---

## 5. Persistence — PersistedData v2 + v1→v2 migration

### 5.1 The v2 document (extends the existing store)

`src/persistence/store.ts` bumps `PersistedData` from v1 to v2, **adding** reward + coaching-history fields while preserving everything v1 had. `STORAGE_KEY` stays `'goalie.v1'` — the key name is just a storage slot and renaming it would orphan existing data; the document's own `version` field is the migration signal (this mirrors Phase 1/2's "version lives in the document" decision). A comment documents that the key string is intentionally kept.

```ts
export const STORAGE_KEY = 'goalie.v1';        // unchanged slot name; document.version drives migration
export const PERSISTED_VERSION = 2;

export interface PersistedDataV1 {             // retained for the migration's input typing
  version: 1;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState;
}

export interface PersistedData {               // == v2 (current)
  version: 2;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState;               // unchanged domain state, stored verbatim
  rewards: RewardsState;                        // NEW (§3.2)
  // most-recent prior attempt per question/lesson id, for honest comparison (§4.4)
  attemptHistory: {
    questions: Record<string, PriorQuestionAttempt>;
    practice: Record<string, PriorPracticeAttempt>;
  };
}

export function defaultPersistedData(): PersistedData {
  return {
    version: 2,
    selectedTrackId: null,
    displayName: null,
    progression: emptyProgression(),
    rewards: emptyRewards(),
    attemptHistory: { questions: {}, practice: {} },
  };
}
```

### 5.2 v1→v2 migration (preserves existing progression)

`loadData` becomes version-aware:

- **Key absent** → `defaultPersistedData()` (v2 empty). Unchanged behavior for first run.
- **Present, `version === 2`, passes the v2 structural guard** → return as-is.
- **Present, `version === 1`, passes the v1 structural guard** → **migrate**: build a v2 document that carries `selectedTrackId`, `displayName`, and `progression` **verbatim** from v1, and initializes the new fields to empty (`rewards: emptyRewards()`, `attemptHistory: { questions:{}, practice:{} }`). Then **persist the migrated v2 document back** (a single `saveData` of the upgraded shape) so the migration runs once, and return it. A learner who completed levels under v1 keeps every completed lesson, mastery pass, and derived badge-eligibility — and simply starts earning XP/streak from zero going forward (we do **not** retroactively award XP for pre-v2 completions, because there is no trustworthy per-id completion timestamp in v1 to make that honest; this is stated and unit-tested). Migration is logged once at info-less `console.warn`? No — migration is expected and benign, so it is **not** warned; it is silent and covered by a test asserting the round-trip.
- **Present but unparseable, or shape-invalid at its declared version, or an unknown/future `version`** → treat as corrupt: `defaultPersistedData()` + a single `console.warn('goalie: discarding unreadable store')` (same honest fail-safe as Phase 2; a corrupt local store must never brick the app). A **future** `version > 2` is treated as corrupt-from-this-build's-view rather than guessed at — we never down-convert an unknown newer shape.
- **Native read rejection** → propagate (root gate shows retry), unchanged from Phase 2.

The v2 structural guard extends Phase 2's predicate guard with reward + history checks (so dishonest values cannot survive a reload):
- outer `version === 2`; `progression` passes the existing Phase 2 inner guard unchanged.
- `rewards` is a plain object with `version === 2`; `awardedXp` is a plain object whose every value is a number in `{20, 50}`; `totalXp` is a non-negative integer **equal to the sum of `awardedXp` values** (if it disagrees, **re-derive** `totalXp` from the ledger rather than rejecting the whole store — the ledger is the source of truth; a single `console.warn('goalie: recomputed xp total')` is emitted); `streak.count` is a non-negative integer; `streak.lastLocalDateYYYYMMDD` is `null` or an 8-digit string; `earnedBadges` is an array of non-empty strings (de-duplicated on load).
- `attemptHistory.questions` / `.practice` are plain objects; each question record has an integer `selectedIndex`, a boolean `correct`, an integer `atEpochMs`; each practice record has a boolean `hadText`, an integer `atEpochMs`. Any malformed record → drop **that record** (not the whole store) and continue, because attempt history is non-authoritative convenience data; a `console.warn('goalie: dropped malformed attempt history')` fires at most once. (Distinguished from `rewards`/`progression`, which are authoritative and gate on the whole-store fail-safe.)

`saveData` / `clearData` are unchanged in contract: one JSON string under the single key; `clearData` wipes everything (including the new fields) because it removes the one key. The deletion contract (Phase 2 §7.3) still holds: delete wipes XP, streak, badges, history, progression, display name, and selected track together — no orphaned keys.

### 5.3 Persistence testability

Unit-tested against the official AsyncStorage jest mock (as Phase 2):
- **migrate-v1→v2:** a stored v1 document with real progression loads as v2 with that progression preserved and empty rewards/history, and is written back (a second `loadData` sees `version === 2`).
- **no-retro-XP:** the migrated document has `totalXp === 0` and empty `awardedXp` even when v1 had completed levels.
- **v2 round-trip:** save a v2 doc with XP/streak/badges/history → load equals it, no warn.
- **xp-total re-derive:** a stored v2 doc with `totalXp` disagreeing from the ledger loads with `totalXp` recomputed from the ledger + one `console.warn('goalie: recomputed xp total')`.
- **corrupt rewards → defaults+warn:** `awardedXp` value of `37` (not 20/50) ⇒ whole-store fail-safe to defaults + the discard warn.
- **malformed attempt record dropped, store kept:** a bad `questions` record is dropped but valid `rewards`/`progression` survive, with the dropped-history warn.
- **unknown future version → defaults+warn:** `version: 3` ⇒ defaults + discard warn.
- **delete wipes v2:** save v2 with XP/badges → `clearData` → load equals `defaultPersistedData()`.

---

## 6. Wiring rewards + coaching into the real flow (ProgressionProvider + screens)

The pure domains are inert until the UI drives them. All wiring goes through `ProgressionProvider` (the single place the UI touches persistence) so rewards apply **exactly once** and **survive reopen**, and screens stay thin.

### 6.1 ProgressionProvider extensions

`src/ui/context/ProgressionProvider.tsx` already holds the loaded `PersistedData` and wraps the pure domain. It is extended to:
- hold `rewards: RewardsState` and `attemptHistory` from the loaded `PersistedData` (now v2).
- inject a **production `Clock`** (`src/ui/rewards/systemClock.ts`) created once and passed to `applyReward`. (Injected at the provider boundary so the domain stays clock-free; a test can render the provider with a `FakeClock`.)
- change `completeLesson` and `recordMasteryResult` wrappers so that, **in the same persisted transaction** as the progression update, they also apply rewards:

```
completeLesson(trackId, levelId, lessonId):
  before = data.progression
  nextProg = completeLessonPure(before, trackId, levelId, lessonId)      // Phase 2 (idempotent)
  // reward only on a genuine first completion: detect via the ledger inside applyReward,
  // which returns alreadyAwarded when the lesson id is already credited.
  outcome = applyReward(data.rewards, { kind:'lesson-completed', trackId, levelId, lessonId }, clock)
  events  = deriveCompletionEvents(before, nextProg, level, trackId)      // Phase 2
  badge   = applyBadge(outcome.state, events)                            // Phase 4 §3.6
  nextRewards = badge.state
  persist({ ...data, progression: nextProg, rewards: nextRewards })
  return { outcome, badgeEarned: badge.badgeEarned }   // for the screen's honest message

recordMasteryResult(trackId, levelId, result):
  before = data.progression
  nextProg = recordMasteryResultPure(before, trackId, levelId, result)   // Phase 2 (monotonic)
  // mastery XP ONLY when this result is a pass; a fail never calls applyReward for mastery XP.
  rewardsAfterXp = result.passed
      ? applyReward(data.rewards, { kind:'mastery-passed', trackId, levelId }, clock).state-or-outcome
      : data.rewards
  events = deriveCompletionEvents(before, nextProg, level, trackId)
  badge  = applyBadge(rewardsAfterXp, events)
  persist({ ...data, progression: nextProg, rewards: badge.state })
  return { outcome, badgeEarned: badge.badgeEarned }
```

**Idempotency across reopen (the crucial guarantee).** Because the XP ledger is keyed by lesson/level id and persisted, re-entering the Result screen for an already-completed lesson (or reopening the app and revisiting) calls `applyReward` again but the ledger already holds the key → `alreadyAwarded: true`, `xpAwarded: 0`, no streak movement. The screen shows "already earned" rather than re-awarding. This is what makes "finishing a lesson or passing mastery updates XP/streak/badges exactly once, surviving reopen" true: the id-keyed persisted ledger — not any screen-local flag — is the single source of idempotency.

**Streak crediting rule enforced here, honestly.** The provider passes the completion to `applyReward`, and `applyReward` credits the streak **only when it awarded first-time XP** (§3.4 step 3). So a streak can only advance from a real first-time lesson completion or first-time mastery pass — never from app open, never from a focus timer (the Focus screen never calls these wrappers), never from a repeat. The provider does **not** itself touch the streak; all streak logic is in the pure domain.

**Attempt-history recording.** For practice: on the Result screen's successful completion, the provider records `attemptHistory.practice[lessonId] = { hadText, atEpochMs: clock.nowEpochMs() }` **after** feedback for the current attempt is built, so the next visit compares against this one. For mastery: on MasteryResult, after grading, the provider records `attemptHistory.questions[questionId] = { selectedIndex, correct, atEpochMs }` for each graded question. Recording happens in the same `persist` call as progression + rewards, so it survives reopen and never double-writes.

### 6.2 Result / MasteryResult / Practice screen changes (honest messaging)

- **ResultScreen** — already marks the lesson complete and shows `answer`/`answerExplanation`/`nextStep`. It now (a) reads the `RewardOutcome`/`badgeEarned` the wrapper returns and renders an **honest XP line**: "You earned 20 XP" on a first completion, or "You've already earned XP for this lesson" on a repeat (never a second +20); (b) renders the **coaching feedback** from `coachPractice(lesson, answerText, priorPracticeAttempt)` — strength, improvement (the `nextStep`), hint (the `answerExplanation`), and the comparison block **only if** `comparison !== null`; (c) shows the streak line only when `streakIncreased` ("Streak: 3 days"), otherwise nothing (no fake streak). The practice answer text is read from the Practice screen via route param (see §6.3) or re-entered; if absent it treats `hadText=false`. Write-failure handling is unchanged (do not claim completion/XP until the write succeeds).
- **MasteryResultScreen** — already grades and records. It now (a) renders the honest XP line for the **first mastery pass only** (+50), else "already earned" / nothing for a fail; (b) for each question renders `coachMasteryQuestion(question, graded, priorQuestionAttempt)` — the per-question strength/improvement/hint and the comparison block only when a prior attempt for that question exists and honestly supports it; (c) renders a badge-earned line only when `badgeEarned !== null` ("You earned the <level> badge."); (d) keeps the existing "retrying never lowers your best score" note — now also true for XP (idempotent, never subtracted). AI never influences any of this: the score, pass/fail, XP, and badge are all deterministic.
- **PracticeScreen** — passes the learner's `draft` text forward to Result so the practice coaching and `hadText` are grounded in what was actually written. Decision: add the free-text to the Result route param as an **optional** `practiceAnswer?: string` (bounded to `MAX_PRACTICE_TEXT`); it is display/coaching-only, never graded, never persisted as raw text (only `hadText` is stored). Optional so the existing "arrive at Result = complete" contract and any direct navigation still work with `hadText=false`.

### 6.3 ProgressScreen + Focus boundary + honest XP/streak copy

- **ProgressScreen** — now also shows `viewRewards`: total XP, streak count, earned-badge count, and per-level badges that render **only** when `hasBadge(trackId, levelId)` is true (which is `earnedBadges`, which is tied to real completeness). XP and streak are labeled as **effort/motivation**, explicitly separated from mastery: a section header like "Your effort" for XP/streak and "Levels mastered" for badges, so a large XP total is never presented as competence. No fabricated numbers — every value comes from `viewRewards`.
- **Focus screen** — **unchanged**; it never calls the reward wrappers, so opening it or (in a later phase) running a focus timer cannot move the streak. This is the structural enforcement of "streak never on app open or focus timer."
- **Certificate preview** — unchanged logic (still lists only `isLevelComplete` levels). XP/streak do **not** appear on the certificate and never gate it, preserving "XP never gates certificates."

### 6.4 New route param (typed)

`RootStackParamList.Result` gains an optional `practiceAnswer?: string`. All other routes unchanged. (The `MasteryResult` already carries `answers: number[]`, which is sufficient for coaching since the per-question coaching reads the same `answers` via the graded result.)

---

## 7. The feedback contract, reward rules, and persisted shape (consolidated reference)

For the implementer, the binding contracts in one place:

- **Reward values:** lesson first-completion = **20 XP** (keyed by lesson id); mastery first-pass = **50 XP** (keyed by `mastery:${trackId}/${levelId}`). Repeats = 0. `totalXp = Σ awardedXp`.
- **Streak:** at most +1 per **local calendar day**, only on a first-time-XP completion; consecutive-day → +1; gap (≥2 days) → reset to 1; same day → no change; backwards clock → no change. `streak = { count, lastLocalDateYYYYMMDD }`.
- **Badge:** `${trackId}/${levelId}`, appended once on the `false→true` edge of `isLevelComplete` (both lessons + mastery), de-duplicated, never removed.
- **Persisted v2:** `{ version:2, selectedTrackId, displayName, progression, rewards:{version:2, awardedXp, totalXp, streak, earnedBadges}, attemptHistory:{questions,practice} }` under `STORAGE_KEY 'goalie.v1'`.
- **Migration:** v1→v2 preserves `selectedTrackId`/`displayName`/`progression`, inits rewards/history empty, no retroactive XP, writes back once.
- **Clock injection:** `Clock { nowEpochMs(): number; localDateYYYYMMDD(): string }`; production impl in UI, `FakeClock` in tests; domain never calls `Date`.
- **Coaching:** `CoachingFeedback { strength, improvement, hint, comparison|null, source }`; `comparison` present only with a comparable prior + current answer and shows the specific difference; mastery grading stays deterministic; AI may only replace the practice **hint**.
- **AI boundary:** off by default, server-side only, no key in the bundle, validates output shape, treats student text as untrusted, falls back to local on any failure, never awards XP/mastery/certificates (§9).

---

## 8. Test matrix (exact — to implement in Phase 3/4)

Pure-domain tests use zero mocks; persistence uses the official AsyncStorage mock; screen tests use the existing smoke-test harness.

**Rewards domain — `__tests__/rewards.test.ts` (extend the existing file):**
1. first lesson completion awards exactly 20 XP; ledger has the lesson key; `totalXp === 20`.
2. repeating the same lesson completion awards 0 (`alreadyAwarded`, `xpAwarded===0`), state returned by reference, `totalXp` unchanged.
3. first mastery pass awards exactly 50; key `mastery:track/level`; fail awards 0 and adds no key.
4. repeating a mastery pass awards 0.
5. `totalXp === sum(values(awardedXp))` invariant after each of the above.
6. streak: first-ever credited completion sets count 1; same-day second completion keeps count 1; consecutive-day completion → count 2; a 2-day gap → reset to 1 (`streakReset`); `streakIncreased`/`streakReset`/`newStreakCount` flags correct in each.
7. streak only moves on first-time XP: a repeat completion (already awarded) does not change count or `lastLocalDateYYYYMMDD`.
8. backwards clock (today < last) → no streak change, XP still awarded.
9. `applyBadge`: a `false→true` level-completed event appends one badge; replay yields no new badge; two different levels yield two badges; badge is never earned from XP alone (mastery-pass-but-lessons-incomplete event list is empty ⇒ no badge).
10. `malformed local date` and empty-id `source` throw `RewardError`.
11. `viewRewards` reports totals/streak/badge count and `hasBadge` accurately.

**Coaching domain — new `__tests__/coaching.test.ts`:**
12. `coachMasteryQuestion` correct answer → strength references the chosen option, improvement is a genuine next step, hint restates the correct option; `source:'local'`.
13. incorrect answer → honest strength (no false praise), improvement points at the correct option, hint present.
14. comparison null on first attempt; incorrect→correct ⇒ `comparison.improved===true` with both summaries + specific difference; correct→incorrect ⇒ `improved===false` and difference states the regression; correct→correct ⇒ `improved===false`, "both times".
15. `coachPractice`: non-empty text → strength about having responded, improvement = `nextStep`, hint = `answerExplanation`; empty text → strength acknowledges reaching the step, improvement nudges an attempt; never asserts `improved` from text.
16. over-long practice text is truncated to `MAX_PRACTICE_TEXT`; a student string containing "ignore previous instructions" is treated as plain data (no behavior change, not stored).
17. mismatched `graded.questionId` vs `question.id` → `CoachingError`.

**Persistence — `__tests__/store.test.ts` (extend):**
18. migrate v1→v2 preserves progression, inits empty rewards/history, writes back (second load is v2).
19. no retroactive XP after migration (`totalXp===0`, empty `awardedXp`).
20. v2 save→load round-trip equality, no warn.
21. `totalXp` disagreement re-derives from ledger + one `recomputed xp total` warn.
22. corrupt rewards (xp value 37) → defaults + discard warn.
23. malformed attempt-history record dropped, authoritative data kept, one dropped-history warn.
24. unknown future `version:3` → defaults + discard warn.
25. `clearData` wipes v2 (XP/badges/history gone) → load equals defaults.

**Provider / screens — extend `__tests__/screens.smoke.test.tsx` (render with a `FakeClock`):**
26. completing a lesson once through the provider awards 20 XP and persists it; re-running the completion (reopen simulation: re-mount provider from the saved doc, revisit Result) awards no additional XP (ledger idempotency across reopen).
27. a mastery pass awards 50 and, when both lessons are already complete, earns the level badge exactly once; a failing retry afterward keeps the badge and does not change XP.
28. ProgressScreen renders XP/streak under an effort label and a level badge only when `hasBadge` is true; a high-XP / no-mastery state shows "0 levels mastered" (honest separation).
29. the Focus screen does not move the streak (rendering/opening it leaves `rewards` untouched).

**Optional AI adapter — new `__tests__/aiCoaching.test.ts` (client adapter only; server is a stub):**
30. feature flag off (default) ⇒ adapter is never called; feedback `source:'local'`.
31. adapter timeout / non-200 / missing-config ⇒ falls back to local feedback (`source:'local'`), no throw to the UI.
32. a well-formed AI response replaces only the practice **hint** and sets `source:'ai'`; a malformed/shape-invalid AI response is rejected by the client shape-check and falls back to local.
33. the adapter never returns a score/XP/badge/certificate field, and a response that tries to include one is ignored (shape-check strips to the hint only).

**Catalog validator:** `npm run validate-catalog` must still pass unchanged (no content schema change in Phases 3/4). A test run confirms it is green.

---

## 9. Optional AI boundary (off by default; graceful degradation)

### 9.1 Scope and the hard rules

The optional AI assists **only the free-text practice hint** — a richer explanation of the lesson's suggested answer. It is **off by default**, **server-side only**, and the app is **fully functional without it**. The hard rules, all enforced structurally:
- **No API key in the mobile bundle, ever.** The device only knows an optional server URL (user-entered or build-config). The provider key lives **only** in the server's environment.
- **AI never changes a score, awards mastery, grants XP, or issues a certificate.** Mastery grading (`gradeMastery`), XP (`applyReward`), badges (`applyBadge`), and certificates (`buildCertificatePreview`) are all pure deterministic domain code the AI path cannot reach — the adapter's output is shape-checked down to a single `hint` string and substituted only into `CoachingFeedback.hint` with `source:'ai'`.
- **Student text is untrusted** (§4.4): sent as a bounded JSON string field, never concatenated into the prompt instructions; the server re-validates and treats it as data.
- **Graceful degradation:** any failure (feature off, missing config, timeout, non-200, provider error, malformed/shape-invalid output) falls back to the deterministic local hint with `source:'local'`. The UI never blocks on the network and never surfaces a raw error for this optional path.

### 9.2 Client adapter — `src/ai/coachingClient.ts` (mobile, no key, no SDK)

Pure-ish TS (uses the RN-global `fetch` + `AbortController`); no new dependency. Shape:

```ts
export interface AiCoachingConfig { enabled: boolean; endpointUrl: string | null; timeoutMs: number } // default { enabled:false, endpointUrl:null, timeoutMs:4000 }

// Returns an AI hint string ONLY on a fully-validated success; otherwise null (caller uses local).
export async function fetchAiHint(
  input: { lessonId: string; prompt: string; suggestedAnswer: string; studentText: string },
  config: AiCoachingConfig,
): Promise<string | null>;
```

Behavior: if `!config.enabled || !config.endpointUrl` → return `null` immediately (no network). Else `POST` a JSON body (`studentText` truncated to `MAX_PRACTICE_TEXT`) with an `AbortController` timeout of `config.timeoutMs`; on any non-200, abort/timeout, network throw, or JSON that fails the **client shape-check** (`{ hint: string }` with a non-empty, length-bounded `hint` and no other trusted fields) → return `null`. The coaching integration calls `fetchAiHint`; a non-null result replaces only `CoachingFeedback.hint` and sets `source:'ai'`; `null` keeps the local hint and `source:'local'`. A unit test covers each branch (§8.30–33).

### 9.3 Server contract + local stub — `server/`

A documented contract and a minimal stub handler, not a deployed service:
- **Endpoint:** `POST /coach/explain`. Request `{ lessonId, prompt, suggestedAnswer, studentText }` (all strings; `studentText` already client-truncated, server re-truncates and re-validates types). Response `200 { hint: string }` on success; any error → non-200 (the client falls back). The server **never** returns a score/XP/badge/certificate.
- **Key handling:** the provider API key is read from `process.env` **on the server only**; it is never sent to or stored on the device. The stub handler ships **without** calling any external provider — it returns a deterministic canned `hint` (or a 503 to exercise the client's fallback), so `server/` is runnable and testable locally with no key and no network, and a real provider call is a clearly-marked TODO the implementer wires server-side.
- **Input safety:** the server treats `studentText` as untrusted data — it validates types/length, does not execute or eval it, and if it ever builds a provider prompt it places the student text in a quoted data section, never in the instruction section (documented in `docs/ai-coaching.md`).
- **Isolation:** `server/` has its own `package.json`/lockfile (§2) so it never affects the mobile build.

### 9.4 Data-leaves-the-device disclosure — `docs/ai-coaching.md` + in-app notice

`docs/ai-coaching.md` documents exactly what data leaves the device when (and only when) a user enables the feature and configures an endpoint: the lesson id, the lesson prompt, the lesson's suggested answer, and the student's practice text (truncated), sent to the user-configured endpoint. It states what is **not** sent (no name, no progression, no XP, no device identifiers) and that nothing is sent while the feature is off (the default). The in-app **disclosure** appears in Settings next to the enable toggle and must be acknowledged **before** the feature can be turned on — the toggle defaults off and enabling it surfaces the same summary. This satisfies "document exactly what data leaves the device + in-app disclosure before enabling."

---

## 10. Files touched (summary)

**Modify:**
- `src/domain/rewards/index.ts` — extend with `RewardsState`, `Clock`, `applyReward`, `applyBadge`, `viewRewards`, `RewardError`, `daysBetweenLocalDates`, `emptyRewards` (keep existing `LevelCompletedEvent`/`deriveCompletionEvents`).
- `src/persistence/store.ts` — bump to v2, add `rewards`/`attemptHistory`, v1→v2 migration, extend the structural guard (re-derive `totalXp`, drop malformed history records).
- `src/ui/context/ProgressionProvider.tsx` — hold rewards/history, inject the production `Clock`, apply rewards+badges inside `completeLesson`/`recordMasteryResult`, record attempt history, expose `viewRewards`/`RewardOutcome` to screens.
- `src/ui/screens/ResultScreen.tsx` — honest XP/streak lines + practice coaching (comparison only when earned).
- `src/ui/screens/MasteryResultScreen.tsx` — honest XP + per-question coaching + badge-earned line.
- `src/ui/screens/PracticeScreen.tsx` — forward bounded `practiceAnswer` to Result.
- `src/ui/screens/ProgressScreen.tsx` — XP/streak under an effort label; badges only when `hasBadge`.
- `src/ui/navigation/RootNavigator.tsx` — `Result` gains optional `practiceAnswer?: string`.
- `src/ui/screens/SettingsScreen.tsx` — AI enable toggle (default off) + disclosure acknowledgement.
- `__tests__/rewards.test.ts`, `__tests__/store.test.ts`, `__tests__/screens.smoke.test.tsx` — extend per §8.

**New:**
- `src/domain/coaching/index.ts` — `CoachingFeedback`, `coachMasteryQuestion`, `coachPractice`, `ImprovementComparison`, `CoachingError`, `MAX_PRACTICE_TEXT`.
- `src/ui/rewards/systemClock.ts` — production `Clock` (local-date formatter).
- `src/ai/coachingClient.ts` — the optional client adapter (`fetchAiHint`, `AiCoachingConfig`).
- `server/` — `package.json` (+ lockfile when installed), the `POST /coach/explain` stub handler, README noting the provider-key-server-only + TODO.
- `docs/ai-coaching.md` — the data-leaves-the-device disclosure.
- `__tests__/coaching.test.ts`, `__tests__/aiCoaching.test.ts` — new test files per §8.

**Unchanged (explicitly):** `content/tracks.json` and `scripts/validate-catalog.mjs` (no content schema change — validator stays green); the focus module (`src/focus/**`, Phase 5 owns real session UX); `src/domain/certificates/index.ts` logic (XP never gates certificates); `.kiro` stays tracked. `STORAGE_KEY` string stays `'goalie.v1'` (document `version` drives the migration).

---

## 11. Key decisions (recap)

1. **Phase 4 is the backbone, designed first:** a pure, deterministic, idempotent, persistent XP/streak/badge domain; Phase 3 coaching layers on top.
2. **Idempotency is an id-keyed persisted ledger**, not a screen flag — so XP can never double-award across retries or reopens, and the mastery award is level-scoped under a distinct `mastery:` namespace.
3. **The clock/local-date is injected** (`Clock` port with an explicit `localDateYYYYMMDD()`), so streaks and comparisons are deterministic and timezone handling is explicit; the production clock lives in the UI layer, the domain never touches `Date`.
4. **XP is strictly separate from mastery:** badges are tied to `isLevelComplete` via the existing `deriveCompletionEvents`, never to XP; the Progress screen labels XP/streak as effort, not competence.
5. **Streak moves only on a first-time-XP completion, at most once per local day**, resets to 1 after a gap, never on app open/focus timer, and never erases XP/skills/certificates on a missed day.
6. **v1→v2 migration preserves progression and awards no retroactive XP** (no honest timestamp for past completions); the store key name is unchanged and the document `version` drives migration; the guard re-derives `totalXp` and drops only malformed non-authoritative history.
7. **Coaching is deterministic and honest:** always a grounded strength, an improvement, and a content-based hint; the word "improved" appears only with a comparable prior + current answer showing the specific difference; structured grading is never AI-touched.
8. **The AI boundary is optional, off by default, server-side only, no key in the bundle, shape-validated, treats student text as untrusted, degrades gracefully to local, and can never award XP/mastery/certificates**; `server/` is isolated with its own deps; `docs/ai-coaching.md` + an in-app pre-enable disclosure document exactly what leaves the device.
