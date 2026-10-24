# Goalie — Phase 2 Design: The Learning Experience

Status: Design pass (NO application code or content authored in this step). Target repo: `/Users/Shared/goalie` (git `main`, local-only, no remote, no `--amend`/force). All paths absolute under that root. Phase 1 is DONE and committed; this design extends it without breaking it.

This is a front-loaded design covering three things and nothing more: (1) the enriched **content structure** (lesson + mastery schema, how `validate-catalog.mjs` tightens, content-review and finance-disclaimer policy), (2) the **screens + navigation** graph with each screen's data source and honest states, and (3) the pure **domain contracts** (assessment grading, progression non-regression, completion-event hooks) plus the persistence API and deletion contract. It deliberately stays inside the Phase 1 architecture: TS strict, pinned deps from the SDK 54 matrix, content separated from logic, honest states, no fabricated data, and the domain layer kept free of any `react`/`react-native` import.

---

## 1. Overview

Phase 1 shipped a scaffold: a custom Expo dev build, a content/domain/ui split, a real (compile-only) iOS focus module, and one real runtime-testable unit — the `loadCatalog` parser — plus four typed-but-unimplemented domain placeholders (`assessment`, `rewards`, `progression`, `certificates`), each throwing `NotImplementedError`. Phase 2 turns the placeholders into real, tested logic and replaces the single placeholder Home screen with a real learning journey.

The through-line of Phase 2 is **honesty of state**. Every number a screen shows — progress percent, mastery score, badge earned — is derived from real persisted progression state, never fabricated. Focus protection continues to report its true Phase 1 availability (unavailable on this environment) and does not pretend to block. Certificates are an explicit *preview* of real completion data, not a generated artifact. The finance track carries an educational-only disclaimer in both content and UI.

Phase 2 is bounded against later phases: full XP/streak lives in **Phase 4** (we add only idempotent completion-event hooks here, or nothing), full focus-session UX is **Phase 5** (we only read the Phase 1 availability API), and the real PDF certificate is **Phase 6** (we show a labeled preview). We do not duplicate or pre-build those.

---

## 2. Technology Stack (PINNED — locked once approved)

Phase 2 inherits the entire Phase 1 matrix unchanged (Expo SDK 54, React 19.1.0, RN 0.81.5, React Navigation 7.5.1 / native-stack 7.21.0, TS 5.9.3, jest-expo 54.0.18). It adds exactly **one** runtime dependency and its types-free native setup:

| Package | Pinned version | Source / reason |
|---|---|---|
| `@react-native-async-storage/async-storage` | `2.2.0` | Exact pin from `expo@54.0.38`'s `bundledNativeModules.json` (verified in-repo). This is Expo's recommended key-value local store for SDK 54; it is a vetted native module in the 54 matrix. Chosen over `expo-sqlite` and `expo-secure-store` below. |

**Storage choice — AsyncStorage over the alternatives (decision, not a menu).** Three options are viable for local persistence on SDK 54: `expo-sqlite` (relational, overkill for a handful of keys and introduces migration/SQL surface we do not need), `expo-secure-store` (Keychain-backed, size-limited and meant for secrets — display name + progression are not secrets and the per-item size cap is a poor fit), and `@react-native-async-storage/async-storage` (simple async key→string store, bundled in the SDK 54 matrix). We **choose AsyncStorage**: the data is a small, bounded JSON document, there are no relational queries, and it is the storage Expo bundles and recommends for exactly this case. It is pinned to the exact SDK-54-matrix version `2.2.0`.

No other new dependencies. No navigation additions beyond what Phase 1 already pins — Phase 2 still uses only `@react-navigation/native` + `@react-navigation/native-stack` (see §6: a stack with a small set of screens is sufficient; we do not add tabs/drawer, which would pull in gesture-handler/reanimated unnecessarily). If a later phase wants a tab bar, that is a deliberate future decision.

**Jest + AsyncStorage.** `jest-expo` does not mock AsyncStorage automatically. The persistence module's unit tests use the official mock `@react-native-async-storage/async-storage/jest/async-storage-mock` registered via `jest.mock(...)` in the test file (no global setup file change required). The **pure domain layer has no AsyncStorage dependency at all** (§5), so the bulk of Phase 2 logic is tested with zero mocking.

---

## 3. Content Structure

### 3.1 Where content lives — extend `content/tracks.json` (decision)

The task says *prefer extending `tracks.json` since the validator reads it; a clean companion file is acceptable only if the schema truly needs it.* The schema does **not** need a split: lessons and a mastery check are naturally nested under each level, the validator already walks `tracks[].levels[].lessons[]`, and the Phase 1 `loadCatalog` parser already descends the same tree. **Decision: extend `content/tracks.json` in place.** We keep `schemaVersion: 1` structurally compatible by *adding* fields (lessons gain fields; a new `mastery` object is added per level); no existing field is removed or retyped, so the Phase 1 validator and parser continue to pass against the enriched file until they are tightened in §3.3/§5. Content remains data-only — no logic, no app strings embedded as behavior.

### 3.2 Enriched schema (authored in the content step, specified here)

Each of the 9 levels gets **exactly two lessons** and **exactly one mastery check of exactly five questions**. The shapes:

```jsonc
// Lesson (every field required, every string non-empty)
{
  "id": "computer-science-beginner-1", // unique in the catalog; kebab "<trackId>-<levelId>-<n>" where trackId is the literal track id
  "title": "What an algorithm is",
  "objective": "State an algorithm as a repeatable, ordered set of steps.",
  "explanation": "Plain-language prose. No copyrighted text.",
  "workedExample": "One concrete worked example with the reasoning shown.",
  "practice": {
    "prompt": "A short practice question.",
    "answer": "The expected answer (free-form, self-checked by the learner).",
    "answerExplanation": "Why that answer is correct."
  },
  "nextStep": "One useful, concrete next step."
}
```

```jsonc
// Mastery check (per level): exactly 5 single-correct multiple-choice questions
{
  "passRule": "Complete both lessons AND answer at least 4 of 5 correctly. Retries allowed; earned progress is never lost.",
  "questions": [
    {
      "id": "computer-science-beginner-m1", // unique in the catalog; "<trackId>-<levelId>-m<n>", trackId literal
      "prompt": "Which of these is an algorithm?",
      "options": [                   // exactly 4 options, each a non-empty string
        "A recipe's ordered steps",
        "A single number",
        "A random guess",
        "An empty list"
      ],
      "correctIndex": 0              // integer 0..3; exactly one defensible correct answer
    }
    // ... exactly 5 question objects
  ]
}
```

Key content-schema rules (enforced by the validator in §3.3 and the parser in §5):
- Every level has `lessons` of length **exactly 2**; each lesson has non-empty `id`, `title`, `objective`, `explanation`, `workedExample`, `nextStep`, and a `practice` object with non-empty `prompt`, `answer`, `answerExplanation`.
- Every level has a `mastery` object with a non-empty `passRule` string and `questions` of length **exactly 5**.
- Every mastery question has a unique non-empty `id`, non-empty `prompt`, `options` of length **exactly 4** (all non-empty strings), and an integer `correctIndex` in `[0, 3]`. Single-correct guarantees deterministic grading.
- All lesson ids and mastery-question ids are **globally unique** across the whole catalog (needed so persistence can key completion by id without collisions).
- **Id convention (binding):** lesson ids are `<trackId>-<levelId>-<n>` and mastery-question ids are `<trackId>-<levelId>-m<n>`, where `<trackId>` is the **literal** track id from `tracks.json` (`computer-science`, `economics`, `personal-finance`) and `<levelId>` is the literal level id (`beginner`, `intermediate`, `advanced`). No short prefixes (`cs`, `econ`, `fin`); the full track id is used verbatim so ids never drift from the track they belong to. `n` is 1-based within the level.

The mastery **pass rule is published in content** (`passRule` per level) and surfaced in the UI (§6 Mastery result + Course path legend), so the rule the learner sees is the same string the content carries — no drift between copy and logic. The grading threshold (`>= 4`) is *also* a domain constant (§5.1); the content string is human copy, the constant is the executable rule, and §5.1 pins them to the same number.

### 3.3 Tightening `scripts/validate-catalog.mjs` (specified diff)

The validator keeps its existing checks (schemaVersion, track uniqueness/titles, exact level ids in order, required starter tracks) and **adds** per-level enforcement. The additions, inside the existing `for (const level of track.levels ?? [])` loop, replacing the current permissive `lessons` check:

1. **Exactly two lessons:** `if ((level.lessons ?? []).length !== 2) errors.push(track.id + '/' + level.id + ': must have exactly 2 lessons');`
2. **Lesson required fields:** for each lesson, require non-empty `id`, `title`, `objective`, `explanation`, `workedExample`, `nextStep`, and a `practice` object whose `prompt`, `answer`, `answerExplanation` are non-empty strings. Push a specific message per missing field group.
3. **Mastery present and sized:** require `level.mastery` to be an object; `if (!Array.isArray(level.mastery?.questions) || level.mastery.questions.length !== 5) errors.push(... + ': mastery must have exactly 5 questions');` and require a non-empty `level.mastery.passRule` string.
4. **Mastery question shape:** for each question require non-empty `id`, non-empty `prompt`, `Array.isArray(options) && options.length === 4` with all options non-empty strings, and `Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex <= 3`.
5. **Global id uniqueness:** maintain two `Set`s (`lessonIds`, `questionIds`) across the whole walk and push an error on any duplicate lesson id or question id.

The validator stays a plain Node ESM script (no new deps), still sets `process.exitCode = 1` on any error and prints a success line otherwise. **The `npm run validate-catalog` script must pass** against the authored content — this is the content step's gate. The success line is extended to also report lessons/mastery counts, with the counts **computed from the walked data** (accumulate `levelCount`, `lessonCount`, `questionCount` during the walk) rather than hard-coded — e.g. `"<levelCount> levels, <lessonCount> lessons, <questionCount> mastery questions checked"`. Computing the counts keeps the line honest if tracks/levels ever change.

### 3.4 Content review record — `content/CONTENT-REVIEW.md` (new file, authored in content step)

A new Markdown file records, for **every** lesson and **every** mastery check, three columns: the item id, the *kind* of source basis (e.g. "standard introductory CS curriculum", "standard microeconomics curriculum", "general personal-finance education"), and `reviewed: yes/no`. It cites only the *category* of widely-accepted source — never copies copyrighted text. The file opens with a short statement that all content is original prose expressing general, widely-accepted facts, and that numeric worked examples and every mastery `correctIndex` were hand-checked for a single defensible correct answer. This file is the auditable record behind the "reviewed" claim; the implementer fills `reviewed: yes` only after the stated check.

### 3.5 Finance disclaimer (placement is a design decision)

Personal-finance content teaches **general concepts only** — no personalized investment, tax, legal, credit, or debt recommendations. The disclaimer appears in **two** places so it is unavoidable:
- **In content:** a top-level `disclaimer` string field on the `personal-finance` track in `tracks.json` (data, not hardcoded UI copy), e.g. *"Educational content only. This is general information, not personalized investment, tax, legal, credit, or debt advice."* The validator requires this field to be a non-empty string **on the `personal-finance` track specifically**.
- **In UI:** a persistent, visible disclaimer banner component rendered on every finance-track screen (Lesson, Practice, Result, Mastery, and the Course path when the finance track is selected). The banner reads its text from the track's `disclaimer` field (single source of truth) and is styled as an always-visible note, not a dismissible toast. See §6 for exact placement.

Testability note: because the disclaimer text is a content field, a unit test asserts the finance track exposes a non-empty `disclaimer`, and a component test asserts the banner renders on a finance screen.

---

## 4. Content Quality Gates

Correctness is a first-class requirement, so the design names the gates rather than leaving "write good content" implicit:
- **Deterministic grading relies on single-correct MCQs.** The schema forbids multi-correct: exactly one `correctIndex`. The content step must ensure each question has exactly one defensible answer and no two options are simultaneously correct or ambiguous. This is recorded in `CONTENT-REVIEW.md`.
- **Numeric examples are hand-checked.** Every worked example and any numeric mastery option (e.g. compound-growth figures in finance) is computed and verified by the author; the review file records `reviewed: yes` only after that check.
- **No ambiguous stems.** Prompts avoid "all of the above / none of the above" style traps and avoid opinion-based phrasing.
- **Validator is the structural gate; human review is the semantic gate.** The validator cannot judge whether an answer is *correct*, only whether the shape is right. The `CONTENT-REVIEW.md` record is the semantic gate and is required before the content is considered done.

---

## 5. Domain Contracts (pure TS — no `react`/`react-native`/AsyncStorage imports)

All Phase 2 domain logic lives under `src/domain/`, extending the Phase 1 modules. These modules import only from each other and from `src/domain/content/catalog.types.ts`. They take plain data in and return plain data out, which is what makes them unit-testable without any mock. The UI and persistence layers call into them; they never call out to IO.

### 5.0 Content types extension — `src/domain/content/catalog.types.ts`

Extend the existing interfaces (additively; `LevelId`, `Track`, `Catalog` unchanged in spirit):

```ts
export interface Practice {
  prompt: string; answer: string; answerExplanation: string;
}
export interface Lesson {
  id: string; title: string; objective: string;
  explanation: string; workedExample: string;
  practice: Practice; nextStep: string;
}
export interface MasteryQuestion {
  id: string; prompt: string;
  options: readonly string[];   // length 4, validated by parser
  correctIndex: number;         // 0..3
}
export interface MasteryCheck {
  passRule: string;
  questions: readonly MasteryQuestion[]; // length 5, validated by parser
}
export interface Level {
  id: LevelId; title: string; objective: string;
  lessons: readonly Lesson[];   // length 2, validated by parser
  mastery: MasteryCheck;
}
export interface Track {
  id: string; title: string; description: string;
  levels: readonly Level[];
  disclaimer?: string;          // required non-empty on personal-finance only
}
```

**Readonly policy (consistent):** all content collections are `readonly` arrays (`lessons`, `levels`, `options`, `questions`) because the catalog is parsed once and never mutated; the domain layer is pure and treats content as immutable. Adopting `readonly` uniformly removes the mixed-modifier inconsistency and prevents accidental in-place mutation of parsed content.

`loadCatalog` (`src/domain/content/catalog.ts`) gains matching fail-fast validation, mirroring §3.3 so the runtime parser and the build-time validator agree: reject with a `CatalogError` and a specific message when a level does not have exactly 2 fully-formed lessons, when `mastery.questions` is not length 5, when a question's `options` is not length 4 / `correctIndex` out of range, or when the `personal-finance` track lacks a non-empty `disclaimer`.

**Landing order and existing-test impact (binding, resolves the "still pass" claim).** Tightening the parser changes the behavior of `__tests__/catalog.test.ts`, so two things are required in the *same* change as the parser tightening:
1. **Enrich `content/tracks.json` first/together.** The parser tightening and the `tracks.json` enrichment (2 valid lessons + a valid 5-question mastery per level, plus the `personal-finance` `disclaimer`) must land in the same commit, so the positive test (`parses the real tracks.json…`) never sees a tightened parser against pre-enrichment content.
2. **Update the four negative fixtures in `catalog.test.ts`.** Their current tracks use the pre-enrichment shape (`lessons: []`, no `mastery`). Under the tightened parser they would throw for *lesson-count/mastery* reasons instead of the defect each name claims (`wrong-schema`, `missing-level`, `duplicate-id`, `order`), passing only by accident. Each negative fixture's levels must be given 2 valid lessons + a valid 5-question mastery so the fixture isolates the single defect it names; the assertions stay `toThrow(CatalogError)`. `__tests__/catalog.test.ts` is therefore a **modified** file (listed in §9).

**New named tests** are added (in a new or extended test file): enriched-valid-parse, reject-wrong-lesson-count, reject-wrong-mastery-count, reject-correctIndex-out-of-range, reject-finance-missing-disclaimer.

### 5.1 Assessment — `src/domain/assessment/index.ts` (replaces the placeholder)

Pure, deterministic grading of a 5-question mastery check. The placeholder `evaluateAssessment(_input: never)` is replaced by:

```ts
export const MASTERY_QUESTION_COUNT = 5;
export const MASTERY_PASS_THRESHOLD = 4; // correct >= 4 ; the single source of the rule

export interface GradedQuestion {
  questionId: string;
  selectedIndex: number;   // what the learner chose
  correctIndex: number;    // from content
  correct: boolean;
}
export interface MasteryResult {
  perQuestion: GradedQuestion[];
  correctCount: number;    // 0..5
  total: number;           // always 5
  passed: boolean;         // correctCount >= MASTERY_PASS_THRESHOLD
}

// answers: selectedIndex per question, in question order (length must equal questions.length)
export function gradeMastery(
  questions: readonly MasteryQuestion[],
  answers: readonly number[],
): MasteryResult;
```

Grading rules (the exactly-4 boundary is explicit): a question is `correct` iff `answers[i] === questions[i].correctIndex`. `correctCount` is the count of correct; `passed` is `correctCount >= 4` — so **4 passes, 3 fails**, and 5 passes; this boundary is unit-tested at 3 (fail), 4 (pass), and 5 (pass).

Error handling (concrete, per failure):
- **Length mismatch** (`answers.length !== questions.length`): fatal programmer error → throw `AssessmentError('answers length N does not match questions length 5')`. The caller (Mastery flow) guarantees a selection per question before calling, so this is an invariant breach, not user input; it is thrown, not returned. Not logged by the domain layer (pure); the UI boundary logs if it ever catches one.
- **Out-of-range `selectedIndex`** (`< 0` or `> 3`, or non-integer): treated as an **incorrect answer**, not an error — a selection can only come from tapping one of four options, so an out-of-range value means "no valid choice" and grades as wrong. This keeps grading total and side-effect-free. Documented and unit-tested.
- **Out-of-range `correctIndex` from content:** cannot occur at runtime because `loadCatalog` already rejected such content (§5.0); `gradeMastery` does not re-validate content, it trusts the parsed `MasteryQuestion`. Stated as a precondition.

`AssessmentError extends Error` (named, like Phase 1's `CatalogError`). The module has no IO, so nothing here is logged internally.

### 5.2 Progression — `src/domain/progression/index.ts` (replaces the placeholder)

Models lesson-completion and level-completion state as a pure reducer over a serializable state value. The placeholder `advanceProgress(_input: never)` is replaced by a small reducer-style API. **State is plain JSON** (so persistence in §7 can store/restore it verbatim) and the domain functions are pure transformations that **never mutate input** and **never regress earned progress**.

```ts
export const PROGRESSION_STATE_VERSION = 1;

export interface LevelProgress {
  completedLessonIds: string[];   // subset of that level's 2 lesson ids, de-duplicated
  masteryPassed: boolean;         // monotonic: once true, stays true
  bestCorrectCount: number;       // 0..5, monotonic max across retries (for display only)
}
export interface ProgressionState {
  version: 1;
  // key is `${trackId}/${levelId}`
  levels: Record<string, LevelProgress>;
}

export function emptyProgression(): ProgressionState;

// Mark a lesson complete. Idempotent: completing an already-complete lesson is a no-op.
export function completeLesson(
  state: ProgressionState, trackId: string, levelId: LevelId, lessonId: string,
): ProgressionState;

// Record a mastery attempt result. Non-regression: masteryPassed is OR'd (never cleared),
// bestCorrectCount is max'd. A failing retry after a pass leaves masteryPassed true.
export function recordMasteryResult(
  state: ProgressionState, trackId: string, levelId: LevelId, result: MasteryResult,
): ProgressionState;

// Derived, never stored: a level is complete iff BOTH lessons complete AND mastery passed.
export function isLevelComplete(
  state: ProgressionState, level: Level, trackId: string,
): boolean;

// Derived progress for the Course path (accurate, never fabricated).
export interface LevelProgressView {
  completedLessons: number;   // 0..2
  totalLessons: number;       // 2
  masteryPassed: boolean;
  bestCorrectCount: number;   // 0..5
  complete: boolean;          // === isLevelComplete
}
export function viewLevelProgress(
  state: ProgressionState, level: Level, trackId: string,
): LevelProgressView;
```

**The non-regression invariant (owned here, at the domain layer, and why):** earned progress is monotonic. `completeLesson` only ever *adds* a lesson id to the set (de-duplicated), never removes; `recordMasteryResult` sets `masteryPassed = prev.masteryPassed || result.passed` and `bestCorrectCount = max(prev.bestCorrectCount, result.correctCount)`. There is **no** API that clears a completed lesson or a passed mastery. A failing retry therefore cannot lower a level that was already complete. This invariant lives in the pure domain layer (not in the UI or persistence) because it is a logic rule that must hold regardless of how state is stored or displayed, and keeping it here makes it directly unit-testable without any mock. Unit tests: completing the same lesson twice yields identical state; a pass followed by a 2/5 retry keeps `masteryPassed === true` and `bestCorrectCount === max`; `isLevelComplete` is true only when both lessons are in the set and mastery passed; `viewLevelProgress` reports accurate counts (never a hardcoded percent).

Level completion is **derived, not stored** — computing it from `(both lessons complete) AND (mastery passed)` against the live catalog avoids a stored boolean drifting out of sync with the lesson/mastery facts.

**Lookup-key derivation (explicit, prevents read/write key mismatch).** `completeLesson`/`recordMasteryResult` write under the key `${trackId}/${levelId}`. The two derived read functions take a `Level` object rather than a bare `levelId`, so they **compute their lookup key as `${trackId}/${level.id}`** — exactly the same key the writers used. Both functions read that single bucket; there is no alternative key derivation. Unit test: write with `levelId='beginner'` via `completeLesson`, then read back through `isLevelComplete`/`viewLevelProgress` passing a `Level` with `id:'beginner'`, and assert the same bucket is found (no incomplete-read for a truly-complete level).

Error handling: the functions validate `trackId`/`levelId`/`lessonId` are non-empty strings and that `lessonId` belongs to the given `level` where a `Level` is in scope (`completeLesson` does not take a `Level`, so it trusts the caller's id; `isLevelComplete`/`viewLevelProgress` do take a `Level` and intersect against its real lesson ids — so a stale completed id for a lesson that no longer exists simply does not count toward completion). Invalid (empty) ids throw `ProgressionError`. No IO, nothing logged internally.

### 5.3 Completion-event hooks + rewards boundary — `src/domain/rewards/index.ts`

Phase 2 keeps rewards **minimal-but-correct**: it emits a completion *event* when a level first becomes complete, and does **not** build the XP/streak system (Phase 4). Decision: **emit events, do not accrue XP here.** Rationale — the task says keep XP for Phase 4 unless any XP added here is idempotent; the cleanest honest choice is to add a pure, idempotent *event derivation* and leave the XP ledger entirely to Phase 4, so we cannot double-count.

```ts
export interface LevelCompletedEvent {
  type: 'level-completed';
  trackId: string;
  levelId: LevelId;
}

// Pure diff: given the state BEFORE and AFTER a progression transition and the level,
// return a LevelCompletedEvent iff the level was NOT complete before and IS complete after.
// Idempotent by construction: re-running a transition that changes nothing yields [].
export function deriveCompletionEvents(
  before: ProgressionState, after: ProgressionState, level: Level, trackId: string,
): LevelCompletedEvent[];
```

The UI calls `deriveCompletionEvents` after a `completeLesson`/`recordMasteryResult` transition to decide whether to surface a "level complete" badge-earned moment. Because it is a before/after diff keyed on the derived `isLevelComplete`, replaying the same transition (e.g. a redundant retry) emits nothing — idempotent, no duplicate rewards. No XP numbers are produced or stored in Phase 2.

**Placeholder fate (decision, not either/or):** `grantReward` and the `Reward` type are **removed**. The rewards module exports only `LevelCompletedEvent` and `deriveCompletionEvents`; `NotImplementedError` is removed from this module. There is no XP accrual API in Phase 2 — that stays Phase 4. Unit-tested: first completion emits one event; any subsequent no-op or failing retry emits none.

### 5.4 Certificates — `src/domain/certificates/index.ts`

Phase 2 keeps this a **preview data builder**, not a PDF generator (Phase 6). It turns real completion state into the fields a certificate *would* contain:

```ts
export interface CertificatePreview {
  trackId: string;
  trackTitle: string;
  displayName: string | null;   // from persistence; null if not set
  completedLevels: LevelId[];   // only levels that are truly complete
  trackComplete: boolean;       // all three levels complete
  generatedPreviewAtEpochMs: number; // passed in by caller (keeps function pure/testable)
}
export function buildCertificatePreview(
  state: ProgressionState, track: Track, displayName: string | null, nowEpochMs: number,
): CertificatePreview;
```

Pure: takes the clock as a parameter rather than calling `Date.now()` so it is deterministic in tests. It only lists levels that pass `isLevelComplete` — a certificate preview can never show an unearned level. The screen renders this clearly labeled "Preview — not an official certificate (full PDF in a later release)."

---

## 6. Screens + Navigation

### 6.1 Navigation graph (native-stack, extends `RootNavigator.tsx`)

Phase 1's single-screen stack is replaced by a multi-screen native stack. One `RootStackParamList` enumerates the routes and their params (typed, strict). Decision: **one native-stack navigator**, no tabs/drawer — the journey is largely linear (Home → path → lesson → practice → result → mastery → result) with a few siblings (Progress, Focus, Settings, Certificate) reachable from Home/Progress. A stack keeps the Phase 1 dependency set intact (no gesture-handler/reanimated) and models the push/pop journey naturally.

```ts
export type RootStackParamList = {
  TrackSelect: undefined;                                   // first run / change track
  Home: undefined;                                          // one clear next action
  CoursePath: { trackId: string };                          // per-level progress
  Lesson:   { trackId: string; levelId: LevelId; lessonId: string };
  Practice: { trackId: string; levelId: LevelId; lessonId: string };
  Result:   { trackId: string; levelId: LevelId; lessonId: string }; // practice feedback
  Mastery:  { trackId: string; levelId: LevelId };          // 5-question flow
  MasteryResult: { trackId: string; levelId: LevelId };     // score + pass/fail + retry
  Progress: undefined;                                      // badges from real state
  Focus:    undefined;                                      // Phase 1 availability, honest
  Certificate: { trackId: string };                         // labeled preview
  Settings: undefined;                                      // a11y + delete local data
};
```

**Initial route selection** is decided at startup from persisted state (§7): if no track is selected yet → `TrackSelect`; otherwise → `Home`. This read is async, so the app shows a neutral loading state until the store resolves (a small root gate component), then sets the initial route. No fabricated default. **Where the gate lives (concrete against Phase 1):** Phase 1's `NavigationContainer`/`Stack.Navigator` already live inside `src/ui/navigation/RootNavigator.tsx`, and `App.tsx` only wraps it in `SafeAreaProvider`. Phase 2 keeps that layering: `App.tsx` wraps the tree in `ProgressionProvider` (which performs the async `loadData()` and holds the resolved state); the root gate renders the loading state while `loadData()` is pending and the error-with-retry state if the native read rejects (§7.2); once resolved it renders `RootNavigator`, passing the computed `initialRouteName` (`TrackSelect` vs `Home`) as a prop. `RootNavigator` keeps ownership of `RootStackParamList` and `NavigationContainer`; it does not call persistence itself. This avoids mounting the navigator against an unresolved/fabricated state. **Entry point (confirmed):** `package.json` has `"main": "index.ts"`; `index.ts` only registers the root component (`registerRootComponent(App)`) and is left unchanged. All Phase 2 wrapping (the `ProgressionProvider` and the async root gate) happens in `App.tsx`, which remains the single composition root above `RootNavigator` — so the entry file itself needs no edit.

A lightweight app-level context (`ProgressionProvider`, React context — this is UI-layer, not domain) holds the loaded `Catalog`, the current `ProgressionState`, and the display name, exposing `completeLesson`/`recordMasteryResult`/`deleteAllData` wrappers that call the pure domain functions and then persist (§7). Screens read from this context so every displayed number traces to real state. The context is the single place the UI touches persistence; screens never call AsyncStorage directly.

### 6.2 Per-screen responsibility, data source, and honest states

For every screen: **data source** is the catalog (content), the progression context (real state), or the focus availability API. **Honest states** means each screen explicitly handles loading, empty, and error rather than guessing.

- **TrackSelect** — lists the three tracks from the catalog; optional display-name text input. On confirm, persists `{ selectedTrackId, displayName }` and navigates to Home. States: loading (catalog parse pending — though catalog is bundled JSON so this is instant), error (if `loadCatalog` throws, show the `CatalogError` message and a retry, never a blank list). Accessibility: labeled input, large touch targets.
- **Home** — shows exactly **one** clear next action derived from real progression: resume the first incomplete lesson of the selected track, or "start mastery check" if both lessons of the current level are done but mastery not passed, or advance to the next level, or "track complete → view certificate preview" if all levels done. States: loading (while context resolves state), empty (new learner → "Start your first lesson"), error (persistence read failed → show message + retry, never a fake next action). Secondary links to Course path, Progress, Focus, Settings.
- **CoursePath** — for the selected track, lists its three levels with **accurate** per-level progress from `viewLevelProgress` (`completedLessons/2`, mastery passed, complete). No fabricated percentages; a level with zero progress shows "0 of 2 lessons", not a guessed bar. Shows the published mastery rule (from `mastery.passRule`). If the finance track: renders the finance disclaimer banner. States: loading, error.
- **Lesson** — renders one lesson's `objective`, `explanation`, `workedExample` from content. CTA → Practice. Finance track: disclaimer banner at top. No state beyond content (pure read); still handles a not-found lessonId defensively (bad route param → show "lesson not found" with a back action rather than crashing).
- **Practice** — renders the lesson's `practice.prompt`; a free-form input or "reveal answer" affordance (the practice answer is self-checked, not auto-graded — honest: we do not pretend to grade free text). CTA → Result.
- **Result / improvement** — shows the correct answer, `practice.answerExplanation`, and the lesson's `nextStep`. On arrival it marks the lesson complete via the context (`completeLesson`), then derives completion events. This is the single place a lesson flips to complete, so progress updates are consistent. **Completion definition (intentional):** because practice is self-checked rather than auto-graded (we do not pretend to grade free text), a lesson is defined as complete when the learner **reaches its Result screen** — i.e. "completed lesson" == "viewed the result for that lesson." This is a deliberate product choice given self-checked practice, not an accidental side effect, and it stays honest because no claim of correctness is attached to the free-form answer. States: the persist write is awaited; on write failure show "couldn't save your progress — retry" and do **not** claim completion in the UI until the write succeeds (honest).
- **Mastery** — the 5-question flow for the level. Loads the level's `mastery.questions`, presents them one at a time or as a list of single-correct MCQs, collects a `selectedIndex` per question, and requires all five answered before submit (so `gradeMastery` never hits its length-mismatch throw). Finance track: disclaimer banner. States: a partially-answered submit is blocked with inline guidance (not an error).
- **MasteryResult** — calls `gradeMastery`, shows `correctCount/5`, per-question correctness, and **pass/fail against the published rule** (`>= 4`). Records the result via the context (`recordMasteryResult`) — which applies the non-regression invariant — then derives completion events (badge-earned moment if the level just completed). Offers **Retry**, which returns to Mastery; retrying never lowers `masteryPassed`/`bestCorrectCount` (guaranteed by §5.2), and the screen states this. States: write-failure handling as in Result.
- **Progress & achievements** — shows level-completion badges that appear **only** when `isLevelComplete` is true for that level; no badge otherwise (no fake/greyed "almost" badges presented as earned). Shows `bestCorrectCount` per attempted level as honest history. Links to Certificate preview when a track (or all) is complete. States: loading, empty ("no badges yet — complete a level to earn one").
- **Focus settings & status** — calls the Phase 1 `getFocusAvailability()` from `src/focus/availability.ts` and renders the verdict **honestly**. **Shared reason→copy mapping (concrete):** the `REASON_TEXT: Record<FocusUnavailableReason, string>` constant currently lives *privately inside* `src/ui/screens/HomeScreen.tsx` (verified; referenced nowhere else). The Phase 1 `HomeScreen` is replaced by the Phase 2 `Home` (§6.1), so `REASON_TEXT` must be **extracted into a new shared module `src/ui/focus/reasonText.ts`** exporting `REASON_TEXT`; both the new `Home` (if it still surfaces focus status) and the new `Focus` screen import it. This avoids copy drift and the dangling reference when `HomeScreen.tsx` is replaced. `src/ui/focus/reasonText.ts` is listed in §9. In this environment the screen shows "focus protection unavailable on this device/build" with the precise reason. It **never** shows a fake blocked/active state and does not start a session (full focus UX is Phase 5). States: loading ("Checking…"), unavailable (reason text), available (only if the API truly says so).
- **Certificate preview** — builds `buildCertificatePreview` from real state and renders the fields a certificate would contain (track title, display name or "—", completed levels, track-complete flag). Clearly labeled **Preview — not an official certificate; full PDF in a later release.** Shows only truly-earned levels. States: empty (nothing complete yet → "complete a level to preview your certificate").
- **Settings** — accessibility-friendly controls (large tap targets, labeled controls, respects system text scaling) and the **local-data deletion** action. Deletion shows a confirm dialog (destructive, explained), then calls the context's `deleteAllData`, which clears persistence and resets in-memory state to `emptyProgression()` + no display name + no selected track, then routes back to `TrackSelect`. States: a delete that fails surfaces an error and leaves state untouched (no partial wipe claimed as success).

Shared UI: a `FinanceDisclaimerBanner` component (reads the track's `disclaimer` content field) and a small `ScreenState` wrapper that renders loading/empty/error consistently so no screen invents its own ad-hoc blank.

### 6.3 Honest-state principle (cross-cutting)

No screen renders a derived number it has not computed from real state. Loading is explicit (spinner + label, as Phase 1's Home already does). Errors show the underlying message and a recovery action. Empty is distinct from loading. Focus availability is the Phase 1 truth. Certificates are labeled previews. Badges require met criteria.

---

## 7. Persistence

### 7.1 Module API — `src/persistence/store.ts` (new; thin, async, AsyncStorage-backed)

A small module that is the **only** code that imports AsyncStorage. It (de)serializes a single versioned document and exposes typed async functions. It is not pure (it does IO), so it is tested with the official AsyncStorage jest mock; all the *logic* it wraps (progression transitions) is in the pure domain layer and tested without mocks.

```ts
export const STORAGE_KEY = 'goalie.v1';

export interface PersistedData {
  version: 1;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState;   // the domain state, stored verbatim
}

export function defaultPersistedData(): PersistedData; // { version:1, null, null, emptyProgression() }

export async function loadData(): Promise<PersistedData>;   // safe across reopen
export async function saveData(data: PersistedData): Promise<void>;
export async function clearData(): Promise<void>;           // deletion contract
```

### 7.2 Safe reads/writes across reopen (concrete error handling)

`loadData` reads `STORAGE_KEY`:
- **Key absent** (first run): return `defaultPersistedData()` — a normal empty state, not an error.
- **Present but unparseable** (`JSON.parse` throws) or **present but shape-invalid** (missing `version`, wrong `version`, or `progression` fails a structural guard): treat as corrupt. Decision: **fail safe to defaults, do not throw to the UI.** Return `defaultPersistedData()` and log a single warning (`console.warn('goalie: discarding unreadable store')`). Rationale — a corrupt local store must not brick the app or crash the root gate; the honest cost is losing unreadable local progress, which is preferable to an unrecoverable launch. This is logged (warn) because it is unexpected; it is recoverable (the app continues from empty). A future migration path keys off `version` (that is why the document is versioned).
- **AsyncStorage read itself rejects** (native failure): propagate as a rejected promise; the root gate catches it, shows an error state with retry, and does **not** proceed with a fabricated empty state silently labeled as "your data."

`saveData` writes the JSON string under `STORAGE_KEY`:
- **Write rejects:** propagate the rejection. The calling context surfaces "couldn't save your progress — retry" (see §6 Result/MasteryResult). The in-memory state is kept so the user can retry; we never silently drop a write and claim success. Logged at warn on failure.

Progression state is validated on load with a lightweight structural guard (not the full catalog parser), specified as explicit predicates so dishonest values cannot survive:
- the **outer** `PersistedData.version === 1` and the **inner** `progression.version === 1` (both checked);
- `progression.levels` is a **plain object** (not null, not array);
- **every** value in `levels` is an object with:
  - `completedLessonIds`: an **array** whose every element is a **non-empty string**;
  - `masteryPassed`: a **boolean**;
  - `bestCorrectCount`: an **integer in `[0, 5]`** (`Number.isInteger` and `0 <= n <= 5`).

Any predicate failure → treat the store as corrupt → return `defaultPersistedData()` + a single `console.warn` (as above). This closes the honest-state hole: a store with `bestCorrectCount: 999` or `completedLessonIds: [null]` is rejected rather than fed to `viewLevelProgress` (which would otherwise display e.g. "999/5"). Because level completeness is *derived* (§5.2), a schema addition later cannot invalidate stored completeness. Unit test: a stored `bestCorrectCount: 999` (and a `completedLessonIds: [null]`) each load back as `defaultPersistedData()` with one warn.

### 7.3 Deletion contract (must fully clear)

`clearData()` calls `AsyncStorage.removeItem(STORAGE_KEY)`. The context's `deleteAllData` wrapper: (1) `await clearData()`, (2) on success reset in-memory to `defaultPersistedData()` (empty progression, null display name, null selected track), (3) navigate to `TrackSelect`. **Full clear guarantee:** all Goalie-owned state lives under the single `STORAGE_KEY`, so removing that one key wipes display name, selected track, and all progression at once — no orphaned keys. If `removeItem` rejects, the wrapper surfaces an error and leaves both store and memory untouched (no partial/false "deleted"). Unit test (with the AsyncStorage mock): after `saveData` then `clearData`, `loadData` returns `defaultPersistedData()`; and a reopen (fresh `loadData`) confirms nothing persisted.

### 7.4 Testability

- Pure domain (§5): unit-tested with fixtures, zero mocks — grading boundary, non-regression, derived completeness, write-then-read-by-`Level` key match (§5.2), completion-event idempotency, certificate preview determinism (clock injected).
- Persistence (§7): unit-tested against the official AsyncStorage jest mock — load-absent→defaults, load-corrupt→defaults+warn, out-of-range `bestCorrectCount`/`completedLessonIds:[null]`→defaults+warn (§7.2 guard), save→load round-trip, clear→empty, reopen persistence.
- Validator (§3.3): `npm run validate-catalog` is the structural gate and must pass; a negative check can be added by temporarily feeding a bad fixture in a dedicated test if desired, but the primary gate is the live script passing on authored content.
- UI: screens are largely thin over context + pure functions; component tests can assert honest states (loading/empty/error), the finance banner renders on finance screens, and badges render only when `isLevelComplete`. Integration-level: the root gate's initial-route decision from persisted state.

---

## 8. Edge Cases

- **Bad route params** (lessonId/levelId not in catalog): screens defensively show "not found" + back, never crash.
- **All-answered guard** before mastery submit ensures `gradeMastery` never hits its length-mismatch throw from the UI.
- **Exactly-4 boundary:** 3 fails, 4 passes, 5 passes — pinned in content copy (`passRule`) and the `MASTERY_PASS_THRESHOLD = 4` constant.
- **Failing retry after a pass:** level stays complete; badge stays earned; `bestCorrectCount` is the max (non-regression).
- **Corrupt/absent store:** fail-safe to defaults (load), propagate on native IO failure (root gate shows retry).
- **Deletion mid-session:** resets to TrackSelect; no stale in-memory progress shown.
- **Stale completed lesson id** (content changed a lesson id): it simply does not count toward derived completeness; no crash.
- **Finance track:** disclaimer present in content and on every finance screen; validator requires the `disclaimer` field.
- **Focus unavailable here:** honest unavailable state, exactly as Phase 1 — no fake blocking.

---

## 9. Files Touched (summary)

Modify: `content/tracks.json` (enrich), `scripts/validate-catalog.mjs` (tighten), `src/domain/content/catalog.types.ts` + `catalog.ts` (enriched types + parse), `src/domain/assessment/index.ts` (replace `evaluateAssessment` placeholder with real `gradeMastery`), `src/domain/progression/index.ts` (replace `advanceProgress` placeholder with real reducer + invariant), `src/domain/rewards/index.ts` (replace `grantReward` placeholder; **remove** `grantReward`/`Reward`/`NotImplementedError`, add completion-event derivation — see §5.3), `src/domain/certificates/index.ts` (replace `issueCertificate` placeholder with preview builder), `src/ui/navigation/RootNavigator.tsx` (expand `RootStackParamList` + register the full screen graph; `NavigationContainer` already lives here), `App.tsx` (wrap `RootNavigator` with the `ProgressionProvider` and the async root gate — see §6.1), `__tests__/catalog.test.ts` (update the four negative fixtures to carry 2 valid lessons + a valid 5-question mastery per level so each isolates its named defect under the tightened parser — see §5.0). `package.json` already defines the `validate-catalog` script and has no AsyncStorage dependency yet, so the only package.json change is **adding** the `@react-native-async-storage/async-storage` `2.2.0` pin; the script is not re-added.

Delete: `__tests__/placeholders.test.ts` — its four subjects (`evaluateAssessment`, `grantReward`, `advanceProgress`, `issueCertificate`) asserted `toThrow(NotImplementedError)`. Phase 2 implements/removes all four, so this file would fail to compile/assert; its real behavior is now covered by the new named tests in §5 (grading boundary, progression invariant, completion-event idempotency, certificate-preview determinism). Removing it keeps `npm test` green, which is a stated gate (§7.4).

New: `content/CONTENT-REVIEW.md`, `src/persistence/store.ts`, `src/ui/context/ProgressionProvider.tsx`, `src/ui/focus/reasonText.ts` (shared `REASON_TEXT` extracted from the old `HomeScreen` — see §6.2 Focus), the screen components under `src/ui/screens/`, `src/ui/components/FinanceDisclaimerBanner.tsx` + `ScreenState.tsx`, and matching tests under `__tests__/`.

---

## 10. Key Decisions (recap)

1. **Content extends `tracks.json` in place** (nested lessons + mastery), no companion file — the schema fits and the validator/parser already walk the tree.
2. **AsyncStorage `2.2.0`** (SDK-54-matrix pin) for local persistence, chosen over expo-sqlite/secure-store; the only new dependency.
3. **One native-stack navigator**, no tabs/drawer — keeps Phase 1's dependency set, models the linear journey.
4. **Pure domain owns the rules:** deterministic `gradeMastery` with the `>=4` boundary; a progression reducer whose monotonic non-regression invariant lives in the domain layer and is unit-tested without mocks.
5. **Completion events, not XP, in Phase 2** — idempotent before/after diff; the XP ledger stays Phase 4.
6. **Certificates are a labeled preview** built from real completion data (clock injected for test determinism); PDF is Phase 6.
7. **Honest state everywhere:** no fabricated percentages/badges; focus reuses the Phase 1 availability truth (Phase 5 owns the real session UX); corrupt store fails safe to defaults; deletion wipes the single `goalie.v1` key completely.
8. **Finance disclaimer is a content field** surfaced by a banner on every finance screen and required by the validator.

---

## 11. Review Responses (iteration against `design-phase2-review.json`)

Every HIGH and MEDIUM finding is addressed; all four NITs were cheap and are also addressed. None backlogged or ignored. All changes stay inside the original requirements and hard constraints (compile-only ceiling, honest unavailability, no fake progress/badges/blocking, finance educational-only disclaimer, validator stays passing, `.kiro` untouched).

- **HIGH-1 (wrong `cs-` id examples)** — ADDRESSED. §3.2 examples changed to the real literal track id (`computer-science-beginner-1`, `computer-science-beginner-m1`), and a binding id-convention rule was added: `<trackId>-<levelId>-<n>` / `-m<n>` with the literal track id, no short prefixes. Verified against `content/tracks.json` (`computer-science`/`economics`/`personal-finance`) and `scripts/validate-catalog.mjs`.
- **HIGH-2 (placeholder test breaks, not listed)** — ADDRESSED. §9 now has a **Delete** entry for `__tests__/placeholders.test.ts`, explaining its four subjects are implemented/removed and covered by the new §5 tests, keeping `npm test` green.
- **HIGH-3 (catalog.test.ts fixtures + ordering)** — ADDRESSED. §5.0 adds a binding "Landing order and existing-test impact" subsection: `tracks.json` enrichment lands with the parser tightening, and the four negative fixtures gain 2 valid lessons + a valid 5-question mastery so each isolates its named defect. `__tests__/catalog.test.ts` is added to §9's modify list.
- **MEDIUM-1 (rewards either/or)** — ADDRESSED. §5.3 now decides: `grantReward` and `Reward` are **removed**; the module exports only `LevelCompletedEvent` and `deriveCompletionEvents`; `NotImplementedError` removed. §9 reflects the removal.
- **MEDIUM-2 (no shared reason→copy mapping)** — ADDRESSED. §6.2 Focus specifies extracting `REASON_TEXT` into a new shared `src/ui/focus/reasonText.ts`, imported by both the new `Home` and `Focus` screens; file listed in §9. Verified `REASON_TEXT` is currently private to `HomeScreen.tsx`.
- **MEDIUM-3 (key derivation for derived reads)** — ADDRESSED. §5.2 adds an explicit "Lookup-key derivation" paragraph: `isLevelComplete`/`viewLevelProgress` compute `${trackId}/${level.id}`, matching the writers' key, plus a write-then-read-by-`Level` unit test.
- **MEDIUM-4 (loose persisted-store guard)** — ADDRESSED. §7.2 replaces the prose guard with explicit predicates: outer+inner `version===1`, plain-object `levels`, `completedLessonIds` = array of non-empty strings, `masteryPassed` boolean, `bestCorrectCount` integer in `[0,5]`; any failure → defaults + one `console.warn`. Out-of-range unit test added (§7.4).
- **NIT-1 (hard-coded "9 levels")** — ADDRESSED. §3.3 success line now computes counts from the walked data.
- **NIT-2 (mixed readonly)** — ADDRESSED. §5.0 adopts a uniform `readonly`-arrays policy for all content collections and types `lessons`/`levels` as `readonly`.
- **NIT-3 (index.ts entry)** — ADDRESSED. §6.1 confirms (verified) `index.ts` only `registerRootComponent(App)` and is unchanged; all wrapping happens in `App.tsx`.
- **NIT-4 (lesson-completion definition)** — ADDRESSED. §6.2 Result states completion is defined as reaching the Result screen and that this is intentional given self-checked practice.
