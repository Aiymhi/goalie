# Design Review — Goalie Phases 3 + 4 (Fair Rewards & Supportive Coaching)

Reviewed document: `/Users/Shared/goalie/.agents/tasks/design-phase34.md`
Reviewer: fresh design-review pass, read against the actual Phase 2 source in `/Users/Shared/goalie/src` and `/Users/Shared/goalie/__tests__`. No prior design context was assumed; every "the existing code does X" claim in the design was verified by reading the referenced file.

This is the design's third review round. The document's §12 / §12.1 claim to resolve the eight findings of round 1 and the four findings of round 2 (the latter recorded in the pre-existing `design-phase34-review.json`). I independently re-verified each of the four round-2 resolutions against the current text (see the Verified Assumptions section); all four are genuinely fixed in place. This pass then re-reads the whole design fresh for anything still open.

---

## Verdict summary

The design is strong and, on the mandated correctness axes, specified correctly and verifiably against the real code: XP idempotency + once-ever semantics, local-day streak with gap-reset, badge-only-when-earned, XP/mastery separation, the v1→v2 migration preserving progression with no retroactive XP, the injected clock, the improvement-comparison honesty rule, the optional AI adapter that never awards anything and degrades gracefully, and no API key in the mobile bundle. I confirmed each against source (details below).

I found a small number of residual issues. The blocking ones concern test/harness feasibility and one interface-contract omission that an implementer coding strictly from the document would get wrong. None touch the core reward/coaching correctness, which is sound.

---

## Findings

### 1. MEDIUM — The provider's `ProgressionContextValue` return-type change is required by §6.2 but never specified
Location: §6.1 / §6.2 / §10 "Modify → `ProgressionProvider.tsx`", vs the real `ProgressionContextValue` in `src/ui/context/ProgressionProvider.tsx`.

The current context interface declares:

```ts
completeLesson: (trackId, levelId, lessonId) => Promise<void>;
recordMasteryResult: (trackId, levelId, result) => Promise<void>;
```

§6.2 binds both screens to render coaching and XP/badge lines from values the wrappers **return** (`{ outcome, badgeEarned, priorPracticeAttempt }` for `completeLesson`; `{ outcome, badgeEarned, priorByQuestionId }` for `recordMasteryResult`), and §6.1 adds an optional `practiceAnswer?: string` parameter to `completeLesson`. But the design never states the new **return types** for these context methods, nor that `ProgressionContextValue` must change from `Promise<void>` to a `Promise<CompleteLessonOutcome>` / `Promise<MasteryOutcome>`. §10 only says "expose `viewRewards`/`RewardOutcome` to screens," which is not the same as pinning the wrapper return contracts the screens depend on. Under TS strict an implementer who extends the interface loosely (or forgets to widen it) produces either a compile error or screens that cannot read `badgeEarned`/`priorPracticeAttempt`.

Concrete fix: add to §6.1 the exact new context signatures, e.g.

```ts
export interface CompleteLessonOutcome {
  outcome: RewardOutcome;
  badgeEarned: string | null;
  priorPracticeAttempt: PriorPracticeAttempt | null;
}
export interface MasteryOutcome {
  outcome: RewardOutcome;
  badgeEarned: string | null;
  priorByQuestionId: Record<string, PriorQuestionAttempt | null>;
}
// ProgressionContextValue:
completeLesson: (trackId: string, levelId: LevelId, lessonId: string, practiceAnswer?: string) => Promise<CompleteLessonOutcome>;
recordMasteryResult: (trackId: string, levelId: LevelId, result: MasteryResult) => Promise<MasteryOutcome>;
```

and record in §10 that `ProgressionContextValue` changes these two members' return types (not just adds fields).

### 2. MEDIUM — The screen smoke-test harness cannot drive §8.26/§8.29a/§8.29b/§8.29c as written
Location: §8 "Provider / screens" tests 26, 29a, 29b, 29c, vs the real harness in `__tests__/screens.smoke.test.tsx`.

The existing harness `mount()` hard-codes `<ProgressionProvider>` with **no `clock` prop** and registers exactly one screen per test from a `ROUTE_COMPONENTS` map that currently lists only `Focus`, `CoursePath`, and `Progress` — not `Result` or `MasteryResult`. The mandated tests require (a) injecting a `FakeClock` into the provider (29b), (b) rendering the `Result`/`MasteryResult` screens so completion flows run (26, 27, 29a), (c) re-mounting the provider from the saved AsyncStorage document and revisiting a screen (26, 29a), and (d) asserting on `coachMasteryQuestion`'s `comparison.improved`, which is an internal value not necessarily present in the rendered string output the harness collects via `renderedText`. The design says "extend the existing smoke-test harness" but does not specify these harness changes (threading `clock` into `mount`, adding `Result`/`MasteryResult` to `ROUTE_COMPONENTS`, a re-mount helper, and a way to observe coaching output rather than only rendered strings). An implementer taking the harness as-is cannot write tests 26/29a/29b/29c.

Concrete fix: add a short §8 note (or a sub-bullet under the provider/screen tests) specifying the harness extensions: `mount(routeName, params, { clock })` forwarding `clock` to `ProgressionProvider`; registering `Result` and `MasteryResult` in `ROUTE_COMPONENTS`; a re-mount-from-saved-doc helper; and that the coaching assertions (29a) observe the `CoachingFeedback` the screen builds (e.g. assert on the rendered comparison copy that is only present when `comparison.improved`), since `renderedText` sees only strings. Alternatively, move 29a's `comparison.improved` assertion into the pure `coaching.test.ts` (§8.14 already covers the pure incorrect→correct case) and keep the smoke test to asserting the rendered "improved"/"last time" copy appears only across the two-mount sequence.

### 3. NIT — Existing v1-shaped `store.test.ts` cases will fail after the v2 migration unless updated, which §8 does not call out
Location: §5.3 / §8 items 18–25, vs the existing `__tests__/store.test.ts`.

The current `store.test.ts` has a round-trip test that saves a `version: 1` document and asserts `expect(loaded).toEqual(data)` **and** `expect(warn).not.toHaveBeenCalled()`, plus two deletion tests that save `version: 1` docs. After the v1→v2 migration lands (§5.2), loading a stored v1 document returns a **v2** document (not equal to the v1 input) and writes it back — so the round-trip equality assertion breaks. The design's §8 lists new v2 tests but never states that the pre-existing v1-shaped tests must be migrated to the v2 shape (or re-purposed as the migrate-v1→v2 case §8.18). The "tests stay green" guarantee is a stated project requirement, so the omission is worth closing even though the design's intent (v2 is the current shape) clearly implies it.

Concrete fix: add a sentence to §8 (or §5.3): "The existing v1 round-trip and deletion tests in `store.test.ts` are rewritten to the v2 shape via `defaultPersistedData()`; the former v1 round-trip becomes the §8.18 migrate-and-write-back case."

### 4. NIT — `MasteryResultScreen`/`ResultScreen` currently import `deriveCompletionEvents` and recompute events; §6.2 says to stop, but §10 does not list removing the import
Location: §6.1/§6.2 ("screens stop recomputing completion events … the wrapper's `badgeEarned` is the single source") vs the real `ResultScreen.tsx` / `MasteryResultScreen.tsx`, which both `import { deriveCompletionEvents } from '../../domain/rewards'` and call it locally to set `justCompletedLevel`.

The design correctly makes the wrapper the single source of badge truth, but the screens today also use `deriveCompletionEvents` + `isLevelComplete` to drive the existing "You completed the <level> level." copy — not just badges. §6.2 tells the screens to render the badge line from `badgeEarned` and "not recompute completion events," but does not say what happens to the existing level-complete copy that currently depends on the local recompute, nor does §10's per-screen entry mention removing the now-dead import. This is a small clarity gap that could leave an unused import (lint failure under `eslint .`) or an accidentally-dropped "level complete" message.

Concrete fix: in §6.2 state that the existing "You completed the <level> level." line is now driven by `badgeEarned !== null` (the badge is earned exactly on the `false→true` completeness edge, so it is the same signal), and the local `deriveCompletionEvents`/`isLevelComplete` recompute and its import are removed from both screens. Note it in the §10 entries for `ResultScreen.tsx` and `MasteryResultScreen.tsx`.

### 5. NIT — `import { MasteryResult }` name collision risk is noted for the route param but not for the provider/screen value
Location: §6.4 "`MasteryResult` note" and §6.1 wrappers.

§6.4 helpfully disambiguates the domain type `MasteryResult` from the route `MasteryResult`. Good. But the new `MasteryOutcome`-style return value (Finding 1) and the per-question `priorByQuestionId` typing both live in files that already import the domain `MasteryResult` and reference the route param list — the design should state once that the domain type keeps its name and the returned outcome uses a distinct name (e.g. `MasteryOutcome`, not `MasteryResultOutcome`) to avoid a third same-named symbol. Purely a naming-hygiene note so the implementer does not introduce a shadow.

Concrete fix: one sentence in §6.1: "the mastery wrapper's return type is named `MasteryOutcome` (distinct from the domain `MasteryResult` and the route param) to avoid a same-name collision in the provider module."

---

## Verified Assumptions (checked against source, confirmed correct)

1. **Phase 2 domain surface exists as the design describes.** `src/domain/progression/index.ts` exports `completeLesson`, `recordMasteryResult`, `isLevelComplete`, `emptyProgression`, `ProgressionState` (`version: 1`), and `ProgressionError`. The design's `RewardError`/`CoachingError` mirror the `ProgressionError` class pattern exactly. ✓
2. **`deriveCompletionEvents` / `LevelCompletedEvent` live in `src/domain/rewards/index.ts`** and fire only on the `false→true` edge of `isLevelComplete`, idempotent by construction. The design's "extend, do not replace" instruction is correct — the file currently holds only these. ✓ (The existing `__tests__/rewards.test.ts` tests only `deriveCompletionEvents`, so "extend the file" is accurate.)
3. **Lesson ids are globally unique across the whole catalog.** `loadCatalog` (`src/domain/content/catalog.ts`) shares one `lessonIds: Set<string>` across all tracks/levels and throws on a duplicate. So §3.2's ledger-keying lesson XP by the bare lesson id (no track/level prefix) cannot collide. ✓
4. **Mastery question ids are globally unique too** (shared `questionIds` set), so §4.4's attempt-history keyed by `questionId` cannot collide across levels. ✓
5. **`GradedQuestion` carries indices only** (`questionId`, `selectedIndex`, `correctIndex`, `correct`) — no option text — confirming §4.2's requirement to resolve option text from `question.options[...]`. `gradeMastery` grades an out-of-range/non-integer `selectedIndex` as incorrect without throwing, so §4.2's out-of-range guard ("no valid option") is warranted. ✓
6. **Content guarantees the fields coaching consumes.** `loadCatalog` requires non-empty `nextStep`, non-empty `practice.answerExplanation`, a length-4 `options` array of non-empty strings, and an in-range integer `correctIndex`. So §4.2/§4.5's "builders trust parsed content" precondition is real. Mastery questions carry **no** per-question explanation field (confirmed in `catalog.types.ts`), validating §4.1/§4.2's "mastery hint is a deterministic restatement, not an `answerExplanation`." ✓
7. **Persistence shape and contract.** `src/persistence/store.ts` has `STORAGE_KEY = 'goalie.v1'`, `PersistedData` v1 = `{ version:1, selectedTrackId, displayName, progression }`, a structural guard that fails corrupt docs to `defaultPersistedData()` + one `console.warn('goalie: discarding unreadable store')`, and single-key save/clear. The design's `PersistedDataV1` migration-input type matches this exactly, and keeping the key string while bumping `document.version` matches the existing "version lives in the document" approach. ✓
8. **Route param vs domain type.** `RootStackParamList.MasteryResult` carries `answers: number[]`; `Result` carries `{ trackId, levelId, lessonId }`. §6.4's claim that mastery coaching reads the graded `perQuestion` (from `gradeMastery(level.mastery.questions, answers)` as the screen already does) and that only `Result` needs a new optional `practiceAnswer?: string` is correct. ✓
9. **`findTrack`/`findLevel` exist in `src/ui/screens/catalogLookup.ts` and return `null` on a miss** — so §6.1's `resolveLevel` (XP/streak-only when catalog is null or an id is stale) is buildable as described. ✓
10. **TS strict is on** (`tsconfig.json` `"strict": true`), confirming round-2 Finding 1 was a real compile error and that the current `source: 'local' | 'ai'` union (§4.1) is the correct fix. ✓
11. **Dependency matrix matches.** `package.json` pins Expo 54, React 19.1.0, RN 0.81.5, async-storage 2.2.0, React Navigation 7.5.1 / native-stack 7.21.0, TS 5.9.3, jest-expo 54.0.18 — all as §2 states. No mobile runtime dep is added by the design; Express lives only in a separate `server/package.json`. The `server/`, `src/ai/`, `src/ui/rewards/`, and `docs/ai-coaching.md` paths do not yet exist, consistent with the "New" list. ✓
12. **Round-2 findings genuinely resolved:** (R2-1) §4.1 types `source: 'local' | 'ai'`; (R2-2) §6.2 passes `route.params.practiceAnswer ?? ''` as `currentAnswerText`; (R2-3) §3.4 step 3 enumerates branches (a) null→first, (b) `delta<0`→no change, (c) `===0`→same day, (d) `===1`→consecutive, (e) `>=2`→reset, with the `<0` guard ordered before the gap arm; (R2-4) §3.2 states `lastLocalDateYYYYMMDD !== null ⇒ count >= 1` and the consecutive branch references it. ✓

### Mandated correctness checks (all confirmed specified correctly)

- **XP idempotency + once-ever:** id-keyed persisted ledger (`awardedXp`), repeat ⇒ `alreadyAwarded`, `xpAwarded:0`, `prev` returned by reference; survives reopen because the ledger is persisted, not a screen flag (§3.4 step 1, §6.1 idempotency note). ✓
- **Streak local-day + gap-reset:** injected `localDateYYYYMMDD()`, signed `daysBetweenLocalDates`, branches null/backwards/same/consecutive/gap, credited only when first-time XP was awarded; never on app open or focus (the Focus screen never calls the wrappers — confirmed it doesn't import the provider's mutators). ✓
- **Badge only when earned:** `applyBadge` driven by `deriveCompletionEvents` (real `isLevelComplete` edge), append-only, de-duplicated, never from XP (§3.6). ✓
- **XP/mastery separation:** XP never gates mastery/certificates; badges tied to completeness not XP; Progress screen labels XP/streak as effort vs "levels mastered" (§3.7, §6.3). ✓
- **v1→v2 migration preserves progression, no retroactive XP, writes back once, future version treated as corrupt** (§5.2). ✓
- **Injected clock** with explicit `localDateYYYYMMDD()`; production impl in the UI layer, `FakeClock` in tests; domain never touches `Date` (§3.3). ✓
- **Improvement honesty:** `comparison` null unless a comparable prior + current exist; `improved` only on incorrect→correct (mastery) and never asserted from ungraded practice text; regressions stated plainly (§4.3); read-before-write ordering keeps it honest (§6.1). ✓
- **AI never awards + degrades gracefully:** output shape-checked down to a single `hint`, substituted only into `CoachingFeedback.hint`; any failure falls back to local; off by default; `gradeMastery`/`applyReward`/`applyBadge`/`buildCertificatePreview` are unreachable from the AI path (§9). ✓
- **No API key in the bundle:** device knows only an optional URL; provider key lives only in `server/` env; client uses RN-global `fetch`+`AbortController`, no SDK/dep (§2, §9.1–9.3). ✓

## Unverified / Wrong Assumptions

No assumption in the design was found to be wrong against the source. Two items could not be fully verified at design-review time and are flagged above as feasibility findings rather than factual errors:

- Whether the smoke-test harness can observe `CoachingFeedback.comparison.improved` and inject a `FakeClock` — it currently cannot without the harness extensions called out in **Finding 2** (the harness collects rendered strings only and hard-codes the provider without a `clock` prop).
- Whether the existing `store.test.ts` v1 round-trip/deletion assertions survive the migration — they will not without the update called out in **Finding 3**.

---

## Verdict

Blocking findings (HIGH or MEDIUM): **2** (Findings 1 and 2).
Non-blocking (NIT): 3 (Findings 3, 4, 5).

Per the mechanical rule, any HIGH or MEDIUM ⇒ **CHANGES_REQUESTED**. The core reward and coaching design is correct and verified; the two blocking items are an unspecified provider return-contract and an under-specified test harness, both of which an implementer would otherwise have to guess at. Both are quick to close.
