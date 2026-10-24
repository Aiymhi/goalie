# Goalie — Phase 2 Implementation Plan

Realizes the approved design at `/Users/Shared/goalie/.agents/tasks/design-phase2.md`. Target repo `/Users/Shared/goalie` (git `main`, local-only, no remote/push). All paths absolute. The design is the source of truth; this plan sequences it without re-deciding the architecture.

Baseline verified green before planning: `npm run typecheck` (strict) passes, `npm run lint` clean, `npx jest` = 3 suites / 21 tests pass, `node scripts/validate-catalog.mjs` prints the success line. `react-test-renderer@19.1.0` is already installed (used for render smoke tests). `@react-native-async-storage/async-storage` is NOT yet installed; Expo's `bundledNativeModules.json` pins it to `2.2.0` (confirmed in-repo).

Ordering rationale: **content-first** (enrich `tracks.json` + validator so the authored data exists and the structural gate passes), **then domain + tests** (types/parser tightened together with the enriched content so existing catalog tests stay honest, then pure assessment/progression/rewards/certificates with their new tests — zero mocks), **then persistence** (the only AsyncStorage consumer, tested with the official mock), **then UI** (navigation graph, context, screens, finance disclaimer, render smoke). Each item leaves the tree buildable.

Required NEW domain tests (called out by the task, each spelled out in its item): mastery grading including the exactly-4 boundary **pass** and 3-correct **fail** (and 5 pass); level-completion logic (both lessons + mastery passed); progression never regressing on a failing retry; and local-data deletion clearing state (persistence test with the AsyncStorage mock).

Verification to run and record verbatim into `/Users/Shared/goalie/.agents/tasks/verification-phase2.md`: `npm run typecheck` (strict, clean); `npm run lint` (clean); `npm test` including the new domain tests with suite/test counts; `node scripts/validate-catalog.mjs` against the enriched content; and a JS build smoke — `npx tsc --noEmit` plus a jest render smoke test of key screens. No need to re-run the full iOS `xcodebuild`: native does not change this phase.

---

## Content

- [ ] 1. Enrich `content/tracks.json` in place: add exactly 2 lessons and exactly one 5-question `mastery` object to each of the 9 levels, and add a non-empty `disclaimer` string on the `personal-finance` track only.
      Follow the §3.2 schema exactly. Lesson ids `<trackId>-<levelId>-<n>` and mastery-question ids `<trackId>-<levelId>-m<n>` with the LITERAL track id (`computer-science`/`economics`/`personal-finance`) and literal level id (`beginner`/`intermediate`/`advanced`), `n` 1-based; all ids globally unique. Each lesson has non-empty `id`,`title`,`objective`,`explanation`,`workedExample`,`nextStep` and a `practice` object with non-empty `prompt`,`answer`,`answerExplanation`. Each mastery has a non-empty `passRule` and exactly 5 questions; each question has unique non-empty `id`, non-empty `prompt`, exactly 4 non-empty-string `options`, integer `correctIndex` in 0..3 with exactly one defensible answer. Keep `schemaVersion: 1`; only ADD fields. Hand-check every numeric worked example and every `correctIndex`. Content is data-only; no copyrighted text.
      Files: `content/tracks.json`
      Verify: `node scripts/validate-catalog.mjs` will still pass under the OLD validator (additive change); the tightened checks land in item 2. Interim: `npx tsc --noEmit` stays green (JSON import unaffected).

- [ ] 2. Tighten `scripts/validate-catalog.mjs` with the §3.3 per-level checks, computing counts from the walked data.
      Keep existing checks (schemaVersion, track uniqueness/titles, exact level ids in order, required starter tracks). Add, inside the level loop: exactly-2-lessons; lesson required fields (incl. `practice.prompt/answer/answerExplanation`); `mastery` is an object with non-empty `passRule` and exactly 5 questions; each question has non-empty `id`/`prompt`, `options` length 4 all non-empty, integer `correctIndex` 0..3. Maintain two `Set`s for global lesson-id and question-id uniqueness. Require a non-empty `disclaimer` string on the `personal-finance` track specifically. Stay plain Node ESM (no new deps); set `process.exitCode = 1` on any error. Replace the hard-coded success line with one computed from accumulated `levelCount`/`lessonCount`/`questionCount`.
      Files: `scripts/validate-catalog.mjs`
      Verify: `node scripts/validate-catalog.mjs` prints the computed success line (e.g. "9 levels, 18 lessons, 45 mastery questions checked") and exits 0 against the item-1 content. (Optionally confirm it fails on a deliberately broken scratch copy, then discard it.)

- [ ] 3. Create `content/CONTENT-REVIEW.md` recording every lesson and every mastery check (§3.4).
      Open with a short statement that all content is original prose of general, widely-accepted facts and that numeric examples and every `correctIndex` were hand-checked for a single defensible answer. Then a table with three columns: item id, kind of source basis (category only, never copyrighted text — e.g. "standard introductory CS curriculum"), and `reviewed: yes/no`. Fill `reviewed: yes` only after the stated check.
      Files: `content/CONTENT-REVIEW.md`
      Verify: `node scripts/validate-catalog.mjs` still passes (doc is not parsed; confirms no accidental content change); every authored lesson/question id in `tracks.json` appears in the table.

## Domain + tests

- [ ] 4. Extend `src/domain/content/catalog.types.ts` with the enriched, uniformly-`readonly` types (§5.0) and tighten `src/domain/content/catalog.ts` to match the validator, landing WITH the item-1 content.
      Add `Practice`, `Lesson` (full fields), `MasteryQuestion` (`options: readonly string[]`, `correctIndex: number`), `MasteryCheck` (`passRule`, `questions: readonly MasteryQuestion[]`), extend `Level` (`lessons: readonly Lesson[]`, `mastery: MasteryCheck`) and `Track` (`disclaimer?: string`). Make all content collections `readonly`. In `catalog.ts`, fail-fast with a specific `CatalogError` when a level lacks exactly 2 fully-formed lessons, when `mastery.questions` is not length 5, when a question's `options` is not length 4 or `correctIndex` out of 0..3, or when the `personal-finance` track lacks a non-empty `disclaimer`. Also update the four negative fixtures in `__tests__/catalog.test.ts` so each carries 2 valid lessons + a valid 5-question mastery and isolates only its named defect (assertions stay `toThrow(CatalogError)`), and add new named tests: enriched-valid-parse, reject-wrong-lesson-count, reject-wrong-mastery-count, reject-correctIndex-out-of-range, reject-finance-missing-disclaimer.
      Files: `src/domain/content/catalog.types.ts`, `src/domain/content/catalog.ts`, `__tests__/catalog.test.ts`
      Verify: `npx jest __tests__/catalog.test.ts` — the positive parse (item-1 content) and all negative/new tests pass. `npm run typecheck` clean.

- [ ] 5. Replace the assessment placeholder with the pure `gradeMastery` grader (§5.1) and add its tests including the exactly-4 boundary.
      In `src/domain/assessment/index.ts` export `MASTERY_QUESTION_COUNT=5`, `MASTERY_PASS_THRESHOLD=4`, `GradedQuestion`, `MasteryResult`, `AssessmentError`, and `gradeMastery(questions, answers)`. `correct` iff `answers[i] === questions[i].correctIndex`; `passed` iff `correctCount >= 4`. Throw `AssessmentError` on length mismatch; treat out-of-range/non-integer `selectedIndex` as incorrect (not an error). Remove `NotImplementedError`/`evaluateAssessment`.
      Files: `src/domain/assessment/index.ts`, `__tests__/assessment.test.ts` (new)
      Verify: `npx jest __tests__/assessment.test.ts` — tests pass, explicitly 3-correct → `passed:false`, 4-correct → `passed:true`, 5-correct → `passed:true`, length-mismatch throws, out-of-range selection grades wrong.

- [ ] 6. Replace the progression placeholder with the pure reducer + non-regression invariant (§5.2) and add its tests.
      In `src/domain/progression/index.ts` export `PROGRESSION_STATE_VERSION=1`, `LevelProgress`, `ProgressionState`, `ProgressionError`, `emptyProgression`, `completeLesson`, `recordMasteryResult`, `isLevelComplete`, `viewLevelProgress`, `LevelProgressView`. State is plain JSON keyed `${trackId}/${levelId}`; functions never mutate input. `completeLesson` adds a de-duplicated lesson id (idempotent). `recordMasteryResult` OR's `masteryPassed` and max's `bestCorrectCount`. Derived reads take a `Level` and compute `${trackId}/${level.id}` (same key the writers use), intersecting completed ids against the level's real lesson ids. Empty ids throw `ProgressionError`.
      Files: `src/domain/progression/index.ts`, `__tests__/progression.test.ts` (new)
      Verify: `npx jest __tests__/progression.test.ts` — completing the same lesson twice yields identical state; a pass then a 2/5 retry keeps `masteryPassed===true` and `bestCorrectCount` at the max (non-regression); `isLevelComplete` true only when both lessons complete AND mastery passed; write with `levelId='beginner'` then read back via a `Level{id:'beginner'}` finds the same bucket; `viewLevelProgress` reports accurate counts.

- [ ] 7. Replace the rewards placeholder with idempotent completion-event derivation (§5.3) and add its tests.
      In `src/domain/rewards/index.ts` REMOVE `grantReward`, `Reward`, and `NotImplementedError`. Export `LevelCompletedEvent` and `deriveCompletionEvents(before, after, level, trackId)` returning one event iff the level was not complete in `before` and is complete in `after` (uses `isLevelComplete`). No XP accrual.
      Files: `src/domain/rewards/index.ts`, `__tests__/rewards.test.ts` (new)
      Verify: `npx jest __tests__/rewards.test.ts` — first completion emits exactly one event; a replayed no-op transition and a failing retry after completion emit none.

- [ ] 8. Replace the certificates placeholder with the pure preview builder (§5.4) and add its tests.
      In `src/domain/certificates/index.ts` REMOVE `issueCertificate`/`Certificate`/`NotImplementedError`. Export `CertificatePreview` and `buildCertificatePreview(state, track, displayName, nowEpochMs)` taking the clock as a parameter; `completedLevels` lists only levels passing `isLevelComplete`; `trackComplete` iff all three levels complete.
      Files: `src/domain/certificates/index.ts`, `__tests__/certificates.test.ts` (new)
      Verify: `npx jest __tests__/certificates.test.ts` — only truly-complete levels appear; `trackComplete` correct; output deterministic for a fixed `nowEpochMs`.

- [ ] 9. Delete `__tests__/placeholders.test.ts`.
      Its four subjects are implemented/removed in items 5–8; the file would fail to compile. Behavior is now covered by the new named tests.
      Files: `__tests__/placeholders.test.ts` (delete)
      Verify: `npm run typecheck` clean; `npx jest` collects no reference to the removed exports.

## Persistence

- [ ] 10. Add the `@react-native-async-storage/async-storage@2.2.0` dependency (exact SDK-54-matrix pin) and run install.
      Add to `package.json` dependencies with no caret. This is the only new runtime dependency.
      Files: `package.json`, `package-lock.json`
      Verify: `npm install` resolves and writes `package-lock.json`; `node_modules/@react-native-async-storage/async-storage/package.json` shows `2.2.0`; `npm run typecheck` clean.

- [ ] 11. Create the persistence module `src/persistence/store.ts` (§7.1/7.2/7.3) and its tests against the official AsyncStorage jest mock.
      Export `STORAGE_KEY='goalie.v1'`, `PersistedData`, `defaultPersistedData`, `loadData`, `saveData`, `clearData`. Only this module imports AsyncStorage. `loadData`: absent key → defaults; unparseable or shape-invalid (outer+inner `version===1`, `levels` a plain object, each `completedLessonIds` an array of non-empty strings, `masteryPassed` boolean, `bestCorrectCount` integer in [0,5]) → defaults + one `console.warn('goalie: discarding unreadable store')`; native read rejection → propagate. `saveData`: propagate on write rejection (warn), keep in-memory state. `clearData`: `removeItem(STORAGE_KEY)`. Tests `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))`.
      Files: `src/persistence/store.ts`, `__tests__/store.test.ts` (new)
      Verify: `npx jest __tests__/store.test.ts` — load-absent→defaults; load-corrupt→defaults+warn; `bestCorrectCount:999` and `completedLessonIds:[null]` each → defaults+warn; save→load round-trip; **clear→empty (deletion clears state)**; reopen (fresh `loadData`) confirms nothing persisted.

## UI + navigation

- [ ] 12. Extract the focus reason→copy map into `src/ui/focus/reasonText.ts` (§6.2).
      Move the `REASON_TEXT: Record<FocusUnavailableReason, string>` currently private in `HomeScreen.tsx` into a new shared module exporting `REASON_TEXT`; the new `Home` and `Focus` screens import it.
      Files: `src/ui/focus/reasonText.ts`
      Verify: `npm run typecheck` clean (exhaustive `Record<FocusUnavailableReason,string>` still compiles).

- [ ] 13. Create the UI context `src/ui/context/ProgressionProvider.tsx` plus shared components `FinanceDisclaimerBanner` and `ScreenState` (§6.1/§6.2).
      `ProgressionProvider` performs the async `loadData()`, holds `Catalog` + `ProgressionState` + display name + selected track, and exposes `completeLesson`/`recordMasteryResult`/`deleteAllData` wrappers that call the pure domain functions then persist via `saveData`/`clearData`. It is the single place the UI touches persistence. `FinanceDisclaimerBanner` reads the track's `disclaimer` content field (always-visible). `ScreenState` renders loading/empty/error consistently.
      Files: `src/ui/context/ProgressionProvider.tsx`, `src/ui/components/FinanceDisclaimerBanner.tsx`, `src/ui/components/ScreenState.tsx`
      Verify: `npm run typecheck` clean.

- [ ] 14. Expand `RootNavigator.tsx` to the full typed `RootStackParamList` and screen graph, and author all screen components under `src/ui/screens/` with honest states (§6.1/§6.2).
      Screens: `TrackSelect`, `Home`, `CoursePath`, `Lesson`, `Practice`, `Result`, `Mastery`, `MasteryResult`, `Progress`, `Focus`, `Certificate`, `Settings`. Each uses the catalog/context/focus API as its data source and handles loading/empty/error explicitly. `Result` is where a lesson flips to complete (reaching Result = completed); `MasteryResult` calls `gradeMastery` + `recordMasteryResult` + `deriveCompletionEvents` and offers Retry. `Focus` calls `getFocusAvailability()` and uses the shared `REASON_TEXT`; never fakes a blocked/active state. `Certificate` renders a clearly-labeled preview. `Settings` has the local-data deletion confirm → `deleteAllData` → route to `TrackSelect`. Finance screens render `FinanceDisclaimerBanner`. `RootNavigator` keeps ownership of `RootStackParamList`/`NavigationContainer` and accepts the computed `initialRouteName` prop. Replace the Phase 1 `HomeScreen.tsx` with the new `Home`.
      Files: `src/ui/navigation/RootNavigator.tsx`, `src/ui/screens/*.tsx` (new per-screen files), remove/replace `src/ui/screens/HomeScreen.tsx`
      Verify: `npm run typecheck` clean; `npm run lint` clean.

- [ ] 15. Wire the async root gate in `App.tsx` (§6.1): wrap `RootNavigator` in `ProgressionProvider`, render the loading state while `loadData()` is pending and an error-with-retry if the native read rejects, then compute `initialRouteName` (`TrackSelect` if no track selected, else `Home`) and pass it to `RootNavigator`.
      Leave `index.ts` unchanged (it only `registerRootComponent(App)`).
      Files: `App.tsx`
      Verify: `npm run typecheck` clean.

- [ ] 16. Add render smoke tests for key screens using `react-test-renderer` (§7.4 UI, JS build smoke).
      Render (at least) `Focus` (asserts honest unavailable state via the shared `REASON_TEXT`), a finance screen (asserts `FinanceDisclaimerBanner` renders from the `disclaimer` field), and `Progress` (asserts a badge renders only when `isLevelComplete`). Mock AsyncStorage as in item 11 where a screen pulls context state. Use `react-test-renderer@19.1.0` (already installed); no new dep.
      Files: `__tests__/screens.smoke.test.tsx` (new)
      Verify: `npx jest __tests__/screens.smoke.test.tsx` — renders without throwing and the honest-state assertions pass.

## Final verification (record into verification-phase2.md)

- [ ] 17. Run the full verification suite and record the exact commands and outputs into `/Users/Shared/goalie/.agents/tasks/verification-phase2.md`.
      Run, in order: `npm run typecheck` (strict, clean); `npm run lint` (clean); `npm test` (capture the "Test Suites: N passed / Tests: M passed" counts, confirming the new assessment/progression/rewards/certificates/store/screens tests are included); `node scripts/validate-catalog.mjs` (the enriched-content success line); and the JS build smoke — `npx tsc --noEmit` + the jest render smoke test from item 16. State explicitly that the full iOS `xcodebuild` is intentionally not re-run because native code is unchanged this phase. Clean up any temporary scratch files created during verification.
      Files: `/Users/Shared/goalie/.agents/tasks/verification-phase2.md`
      Verify: the file contains each command and its real captured output; all five checks are green.

---

## Notes / assumptions

- Lesson/mastery content wording is authored originally in item 1; the plan fixes the schema and gate, not the exact prose. `CONTENT-REVIEW.md` is the semantic gate that the authored answers each have a single defensible correct option.
- Persistence tests rely on the official mock path `@react-native-async-storage/async-storage/jest/async-storage-mock`, which ships with the pinned `2.2.0` package installed in item 10.
- Render smoke tests use the already-present `react-test-renderer@19.1.0`; no `@testing-library/react-native` is added (not in the pinned matrix), keeping the dependency set to the single AsyncStorage addition the design allows.
