# Phase 2 Design Review — `design-phase2.md`

Reviewed fresh against the actual repo at `/Users/Shared/goalie`. Every "the existing X does Y" claim in the design was checked against source. This design has already been through one review round (§11 "Review Responses"); this pass re-verifies those claims and the focus checklist from the step brief.

## Scope checked
- Enriched content schema + validator tightening (exactly 2 lessons, exactly 5 single-correct mastery questions, required fields).
- Deterministic grading contract (`pass = correct >= 4`, the exactly-4 boundary).
- Progression non-regression-on-retry invariant.
- Every screen's real data source + honest loading/empty/error states; no fabricated percentages/badges/blocking.
- Finance educational-only disclaimer placement.
- Persistence API + full-deletion contract.

---

## Findings

### 1. NIT — `jest.config.js` `transformIgnorePatterns` does not whitelist `@react-native-async-storage`
The design (§2 "Jest + AsyncStorage") states persistence tests use the official mock `@react-native-async-storage/async-storage/jest/async-storage-mock` via `jest.mock(...)`. I verified the current `jest.config.js`: its `transformIgnorePatterns` list (jest-expo preset) does **not** include `@react-native-async-storage`. When a test calls `jest.mock('@react-native-async-storage/async-storage', () => require('.../jest/async-storage-mock'))` the factory short-circuits module loading, so this usually works without transforming the package. But if any transitive import of the real module is evaluated (or the mock file itself uses untransformed syntax), the current ignore pattern can throw a `SyntaxError: Unexpected token`. 
Concrete fix: add `@react-native-async-storage` to the `transformIgnorePatterns` negative-lookahead group, i.e. append `|@react-native-async-storage` alongside the existing `@react-native(-community)?` entry, OR state explicitly in the design that the `jest.mock` factory form requires no transform change. The design currently asserts "no global setup file change required" — call out the `transformIgnorePatterns` line specifically so the implementer does not get surprised.

### 2. NIT — `content/` is not in the tsconfig `include` list, but the design does not note it
`tsconfig.json` `include` is `["App.tsx", "index.ts", "src", "modules", "__tests__"]` — `content` is absent. The enriched `tracks.json` is imported by `__tests__/catalog.test.ts` (an included file) and by the runtime via `src`, so `resolveJsonModule` (confirmed `true` in `expo/tsconfig.base.json`) still types it. This works today and will keep working. No action strictly required, but since the design adds a per-track optional `disclaimer` and nested `mastery`, note that the inferred JSON type will make `disclaimer` statically present only on tracks that literally have it — `loadCatalog(raw: unknown)` sidesteps this by taking `unknown`, which is correct. Flagged as a NIT only so the implementer does not try to type the raw import directly as `Catalog` (that would fail strict because the JSON lacks the narrowed `LevelId` literal type and the optional `disclaimer`).

---

## Checklist verdicts (the focus items)

All six focus areas are specified unambiguously. Details:

**Enriched content schema + validator tightening — PRECISE.** §3.2 pins exactly 2 lessons/level with every required field named (`id`, `title`, `objective`, `explanation`, `workedExample`, `nextStep`, and `practice.{prompt,answer,answerExplanation}`), and exactly 1 mastery check of exactly 5 single-correct MCQs with `options` length exactly 4 and integer `correctIndex` in `[0,3]`. §3.3 gives the concrete validator diff (length checks, per-field checks, global id-uniqueness Sets, computed success-line counts). §5.0 mirrors the same rules in the runtime parser and binds the id convention to the literal track id. Verified against the real `scripts/validate-catalog.mjs` (current permissive `lessons` check and `Lesson needs id/title/objective` is exactly what the diff replaces/extends) and the real `content/tracks.json` (track ids `computer-science`/`economics`/`personal-finance`, levels `beginner`/`intermediate`/`advanced`, all `lessons: []`, no `mastery` — so the tightening is a real behavior change, correctly acknowledged).

**Deterministic grading contract — UNAMBIGUOUS.** §5.1 defines `MASTERY_PASS_THRESHOLD = 4`, `passed = correctCount >= 4`, explicitly states "4 passes, 3 fails, 5 passes," and pins the boundary unit tests at 3/4/5. Out-of-range `selectedIndex` grades as incorrect (total, side-effect-free); length mismatch throws `AssessmentError` as an invariant breach with an all-answered UI guard (§6.2 Mastery, §8) preventing it. Single-correct schema guarantees determinism. No ambiguity.

**Progression non-regression-on-retry — CONCRETE.** §5.2 states the invariant in executable terms: `completeLesson` only adds (de-duplicated), `recordMasteryResult` sets `masteryPassed = prev || result.passed` and `bestCorrectCount = max(prev, result.correctCount)`, no API clears progress, level completeness is derived not stored, and the lookup key `${trackId}/${levelId}` is defined identically for writers and the `Level`-taking readers (closing the read/write key-mismatch risk). Unit tests enumerated. Solid.

**Per-screen data source + honest states — SATISFIED, no fabrication.** §6.2 names a real data source for every screen (catalog content, `ProgressionProvider` real state, or Phase 1 `getFocusAvailability()`), and loading/empty/error for each. Verified the Focus claim against source: `getFocusAvailability()` exists at `src/focus/availability.ts` and returns honest unavailable verdicts; `REASON_TEXT` is confirmed private to `src/ui/screens/HomeScreen.tsx` with all five `FocusUnavailableReason` keys, so the §6.2 extraction to `src/ui/focus/reasonText.ts` is correct and necessary (HomeScreen is being replaced). No fabricated percentages (CoursePath uses `viewLevelProgress` counts, "0 of 2 lessons" not a guessed bar), no fake badges (Progress shows a badge only when `isLevelComplete`), no fake blocking (Focus never shows blocked/active). Certificate is a labeled preview from real state.

**Finance disclaimer placement — SPECIFIED.** §3.5 pins both locations: a content field `disclaimer` on the `personal-finance` track (validator requires a non-empty string on that track specifically) and a persistent `FinanceDisclaimerBanner` reading that field on every finance screen (Lesson, Practice, Result, Mastery, CoursePath when finance selected), always-visible not dismissible. Single source of truth, with a content unit test and a component render test.

**Persistence API + full-deletion contract — CONCRETE.** §7.1 gives the full typed API (`STORAGE_KEY = 'goalie.v1'`, `PersistedData`, `defaultPersistedData`, `loadData`/`saveData`/`clearData`). §7.2 specifies safe reads (absent→defaults, corrupt/invalid→defaults+single `console.warn`, native reject→propagate to root gate with retry) with an explicit structural guard (outer+inner `version===1`, plain-object `levels`, `completedLessonIds` array of non-empty strings, boolean `masteryPassed`, integer `bestCorrectCount` in `[0,5]`). §7.3 full-deletion contract: single key wipe, reset in-memory to defaults, route to TrackSelect, no partial-wipe-claimed-as-success. The AsyncStorage `2.2.0` pin was verified against `expo@54.0.38`'s `bundledNativeModules.json` (line: `"@react-native-async-storage/async-storage": "2.2.0"`) — the claim is accurate.

---

## Verified Assumptions
- `scripts/validate-catalog.mjs` walks `tracks[].levels[].lessons[]` and has a permissive `lessons` check + a `lesson needs id, title, objective` check — exactly what §3.3 extends. ✔
- `content/tracks.json`: schemaVersion 1, tracks `computer-science`/`economics`/`personal-finance`, levels `beginner`/`intermediate`/`advanced` in order, every `lessons: []`, no `mastery`, no `disclaimer`. The design's enrichment and "tighten in the same commit" ordering (§5.0) is therefore required and correctly stated. ✔
- `src/domain/content/catalog.ts` `loadCatalog(raw: unknown)` re-validates parsed JSON fail-fast with `CatalogError`; current types in `catalog.types.ts` are the pre-enrichment `Lesson {id,title,objective}` / `Level {...lessons: Lesson[]}` with no `mastery`/`disclaimer`/`practice` — the §5.0 extension is additive and accurate. ✔
- `__tests__/catalog.test.ts` positive test asserts 3×3 and level order; the four negative fixtures (`wrong-schema`, `missing-level`, `duplicate-id`, `order`) all use `lessons: []` and no `mastery` — so under the tightened parser they would throw for the wrong reason. §5.0's "update the four negative fixtures" + §9's modify-list entry correctly address this. ✔
- `__tests__/placeholders.test.ts` asserts `toThrow(NotImplementedError)` for `evaluateAssessment`, `grantReward`, `advanceProgress`, `issueCertificate`. Phase 2 implements/removes all four, so the file must be deleted — §9's Delete entry is correct and keeps `npm test` green. ✔
- Domain placeholders verified: `assessment` (`evaluateAssessment(_input: never)`), `rewards` (`grantReward` + `Reward` + `NotImplementedError`), `progression` (`advanceProgress`), `certificates` (`issueCertificate`) all throw `NotImplementedError`. The §5/§9 replacements/removals match. ✔
- `REASON_TEXT` is private to `src/ui/screens/HomeScreen.tsx`, referenced nowhere else (grep confirms). §6.2/§9 extraction to `src/ui/focus/reasonText.ts` is accurate. ✔
- `getFocusAvailability()` lives at `src/focus/availability.ts` and the five `FocusUnavailableReason` values match `src/focus/types.ts`. The honest-focus screen claim holds. ✔
- `index.ts` only calls `registerRootComponent(App)` (NIT-3 claim true); `App.tsx` wraps only `SafeAreaProvider` + `RootNavigator`; `RootNavigator.tsx` owns `NavigationContainer` + `RootStackParamList = { Home: undefined }`. The §6.1 plan (wrap in `ProgressionProvider` + root gate in `App.tsx`, pass `initialRouteName` prop to `RootNavigator`, leave `index.ts` unchanged) is feasible and consistent with the real layering. ✔
- `package.json` `main: index.ts`, has the `validate-catalog` script already, and has NO AsyncStorage dependency — so the only package.json change is adding the pin. ✔
- AsyncStorage `2.2.0` is the exact SDK-54-matrix pin in `expo/bundledNativeModules.json`. ✔
- `resolveJsonModule: true` in `expo/tsconfig.base.json`; tsconfig `strict: true`. JSON import of `tracks.json` is typed and supported. ✔

## Unverified / Wrong Assumptions
- None wrong. Two environment notes the design does not mention (both NIT, above): `@react-native-async-storage` is absent from `jest.config.js` `transformIgnorePatterns`, and `content/` is absent from the tsconfig `include` list. Neither contradicts a design claim; they are gaps the implementer should be aware of.
- The package is not yet installed in `node_modules` (`@react-native-async-storage` absent). This is expected — the design adds it in the implementation step — not a defect.

---

## Verdict
0 HIGH, 0 MEDIUM, 2 NIT. Per the mechanical rule, **APPROVED**. The design stands on its own: every schema/grading/progression/persistence contract is concrete, every screen names a real data source with honest states, the finance disclaimer placement is pinned in both content and UI, and every "existing code does X" claim checks out against the repo. The two NITs are implementation-awareness notes and do not block.
