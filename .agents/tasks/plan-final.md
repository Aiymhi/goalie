# Goalie — Final Batch (Phases 8 + 9) Implementation Plan

Scope: FINAL batch for the Goalie Expo/React Native app at `/Users/Shared/goalie` (independent git repo, branch `main`, local-only — NO remote, NO push). Phases 1-7 are done and committed. This batch does: STEP A (reconcile working tree + full verification sweep), STEP B (Phase 8 — real `.kiro/` evidence + coverage + honesty), STEP C (Phase 9 — submission README + handoff docs). Write files only; produce NO video/audio.

## Current state (verified during planning, 2025-10-23)

- `git status`: clean working tree EXCEPT `.agents/tasks/` planning docs (2 modified, 11 untracked). No source/test changes are dangling — all Phase 1-7 app code is already committed.
- `.kiro/` directory DOES NOT EXIST yet. This is the single biggest Phase 8 gap. It is NOT in `.gitignore` (good — keep it that way).
- `README.md` DOES NOT EXIST yet. Phase 9 creates it.
- Baseline is green: `npm run typecheck` exit 0; `npm run lint` 0 errors (4 benign `require()` warnings in test files that register the AsyncStorage jest mock); `npm test` → 14 suites / 167 tests passing; `node scripts/validate-catalog.mjs` → 3 tracks, 9 levels, 18 lessons, 45 mastery questions valid.
- NOT yet verified this session: `rm -rf node_modules && npm install`, `npx expo prebuild`, and the iOS simulator `xcodebuild` compile. STEP A must run these and record exact output. Per `docs/ios-focus-setup.md` and `.agents/tasks/task-goalie-phase567/context.json`, the native verification ceiling is COMPILE-ONLY; runtime Screen Time behavior is NOT verifiable here and must never be claimed.

## Honesty contract (applies to every step)

- Never fake a green result. Record EXACT command output in `.agents/tasks/verification-final.md`.
- Never claim real on-device app-blocking works at runtime. It is real native Swift that COMPILES; runtime shielding needs a PAID Apple Developer account with the `com.apple.developer.family-controls` entitlement + a physical iPhone. The simulator cannot run Screen Time APIs.
- Do NOT retroactively claim the initial planning files (early README/plan/checklist/`tracks.json`) were Kiro-generated.
- Do NOT invent MCP usage — state honestly that MCP was not used.
- If any requirement can only be satisfied by a dishonest claim, STOP and raise it as a pause-for-user point (send_message severity "warning"); do not fabricate.
- If `npx expo prebuild` or `xcodebuild` cannot run in this environment (missing Xcode/CocoaPods/toolchain), record the exact failure and the compile-only ceiling honestly in `verification-final.md` — do NOT claim BUILD SUCCEEDED that was not observed.

---

## STEP A — Reconciliation & full verification sweep

- [ ] 1. Reconcile the working tree. Review `git status` and `git diff` for the `.agents/tasks/` changes. These are planning/tracking artifacts from the concurrent Phase 3-7 builds (design/plan/review/task docs), not app source. Stage and commit them in one logical chunk so the tree is clean; keep genuinely unrelated scratch out (there is none in source here). Commit message e.g. `chore: record Phase 2-7 planning/review artifacts`.
      Files: everything under `.agents/tasks/` currently modified/untracked.
      Verify: `git status` shows a clean tree (nothing but intentionally-ignored paths). `git log --oneline -1` shows the new commit.

- [ ] 2. Clean dependency install from lockfile. Run `rm -rf node_modules && npm install` and confirm `package-lock.json` is unchanged afterward (lockfile consistent).
      Files: none (node_modules is gitignored).
      Verify: `git status package-lock.json` shows no change; `npm install` exits 0. Record exact tail output.

- [ ] 3. Run the JS verification suite from clean state and record EXACT output to `.agents/tasks/verification-final.md`: `npm run typecheck` (expect exit 0), `npm run lint` (expect 0 errors), `npm test` (record suite/test counts — expect 14 suites / 167+ tests), `node scripts/validate-catalog.mjs` (expect 3 tracks / 9 levels / 18 lessons / 45 questions). Fix any red within scope before proceeding.
      Files: `.agents/tasks/verification-final.md` (create/overwrite).
      Verify: all four commands green; `verification-final.md` contains their verbatim output with exit codes.

- [ ] 4. Native compile sweep. Run `npx expo prebuild --platform ios --clean`, then a simulator `xcodebuild` compile using a runtime-derived scheme (derive the scheme from the generated workspace, e.g. `xcodebuild -workspace ios/*.xcworkspace -list` to read the scheme name, then `xcodebuild -workspace ios/<name>.xcworkspace -scheme <scheme> -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`). Confirm the whole app — including the `goalie-focus` native module, the DeviceActivityMonitor extension, and new pods (`expo-print`, `expo-sharing`, `expo-file-system`) — reaches `** BUILD SUCCEEDED **`. If the toolchain is unavailable or the build is red, record the EXACT failure and the compile-only ceiling honestly; fix within scope only if the fix is a real one, never fake success.
      Files: `.agents/tasks/verification-final.md` (append the prebuild + xcodebuild sections); `ios/` is gitignored so do not commit it.
      Verify: `verification-final.md` records the exact prebuild output and the xcodebuild result line (`** BUILD SUCCEEDED **` or the honest failure + ceiling note).

---

## STEP B — Phase 8: Kiro evidence, coverage, honesty

- [ ] 5. Create `.kiro/specs/` for the features actually built. Author concise, reality-matching specs (requirements.md + design.md + tasks.md) for the core delivered features, derived from the existing `.agents/tasks/design-*.md` + `plan-*.md` but trimmed to WHAT WAS ACTUALLY SHIPPED. At minimum one spec covering the learning journey + rewards/progression/certificates, and one covering the voluntary iOS focus feature (with its honest compile-only / unavailable states). Mark tasks that are done as done. Specs must reflect reality, not aspiration.
      Files: `.kiro/specs/learning-journey/{requirements.md,design.md,tasks.md}`, `.kiro/specs/focus-session/{requirements.md,design.md,tasks.md}`.
      Verify: files exist and are tracked after commit; `git ls-files .kiro/specs` lists them; content cross-checks against actual `src/` modules (progression/rewards/certificates/focus) and the honesty ceiling in `docs/ios-focus-setup.md`.

- [ ] 6. Create `.kiro/steering/` docs capturing conventions ACTUALLY followed. Cover: content-separate-from-logic (pure `src/domain/*` with no RN/AsyncStorage imports, clock injection for determinism); honest states (loading/empty/error + honest focus-unavailable, never fake blocking); deterministic rewards (no fake XP/percentages, server AI path can never grant score/XP/badge/certificate); persistence single-key versioned document with structural guard + v1→v2 migration; testing conventions (jest-expo, `__tests__/*`, AsyncStorage mock registration). Keep them as real steering guidance, not marketing.
      Files: `.kiro/steering/conventions.md`, `.kiro/steering/honesty.md` (or a single `.kiro/steering/goalie.md` if clearer — implementer picks one and states why).
      Verify: `git ls-files .kiro/steering` lists them after commit; each claim traces to real code (cite the file in the steering doc where useful).

- [ ] 7. Add at least ONE real, valid, useful Kiro hook. Use the classic standalone hook file format for this Kiro version: `.kiro/hooks/<name>.kiro.hook` containing JSON `{ "enabled": true, "name": "...", "description": "...", "version": "1", "when": { "type": "fileEdited", "patterns": ["content/tracks.json"] }, "then": { "type": "askAgent", "prompt": "Run node scripts/validate-catalog.mjs and report whether the course catalog is still structurally valid; if not, summarize the errors." } }`. A catalog-validator-on-save hook is genuinely useful here. Give it an accurate description. Where possible, observe and record its behavior; if it cannot be exercised headlessly, say so honestly in the kiro-dev-log rather than claiming observed runs.
      Files: `.kiro/hooks/validate-catalog-on-save.kiro.hook`.
      Verify: JSON parses (`node -e "JSON.parse(require('fs').readFileSync('.kiro/hooks/validate-catalog-on-save.kiro.hook','utf8'))"` exits 0); `git ls-files .kiro/hooks` lists it after commit.

- [ ] 8. Write/maintain an HONEST Kiro dev log at `docs/kiro-dev-log.md` with dated entries per feature/phase: spec decisions, work done via Kiro workflows/agents, human corrections, tests + ACTUAL results, remaining limitations. Explicitly state MCP was not used, and do NOT claim the early planning files were Kiro-generated. Note the native runtime-unverified limitation.
      Files: `docs/kiro-dev-log.md`.
      Verify: file exists, dated entries present, no overclaiming (self-review against the honesty contract).

- [ ] 9. Required-validation coverage check + targeted tests. Confirm tests exist for: assessment, rewards, progression, certificates (domain); persistence + v1→v2 migration; focus state + error handling; type checking + iOS simulator compile; accessibility on the main journey. The existing 14 suites already cover these (`assessment.test.ts`, `rewards.test.ts`, `progression.test.ts`, `certificates.test.ts`, `certificate-document.test.ts`, `store.test.ts`, `focus-session.test.ts`, `focus-screen.test.ts`, `availability.test.ts`, `accessibility.test.tsx`, `coaching.test.ts`, `aiCoaching.test.ts`, `catalog.test.ts`, `screens.smoke.test.tsx`). Identify any thin spot (e.g. explicit migration-path assertion, explicit focus error-handling branch) and add ONLY targeted tests where coverage is genuinely missing. Do not pad.
      Files: existing `__tests__/*` (add targeted cases only if a gap is found).
      Verify: `npm test` green with the same-or-higher count; name the gap each new test closes.

- [ ] 10. Secret / private-data scan. Grep the repo (excluding node_modules/.git/ios/android) for API keys, `.env`, private keys, and student PII. Confirm the AI server stub (`server/index.js`) carries NO real key (it reads `process.env.AI_PROVIDER_API_KEY` server-side only — correct). Confirm no `.env*` committed.
      Files: none (scan only; fix if anything found).
      Verify: scan returns nothing; record the command + empty result in the kiro-dev-log or verification-final.md.

- [ ] 11. Commit Phase 8 artifacts in logical chunks (specs, steering, hook, dev-log, any new tests). Confirm `.kiro` is tracked and `.kiro` is NOT in `.gitignore`.
      Files: `.kiro/**`, `docs/kiro-dev-log.md`, any new `__tests__/*`.
      Verify: `git ls-files .kiro | head` is non-empty; `grep -n kiro .gitignore` finds nothing.

---

## STEP C — Phase 9: submission README + handoff docs (write files only)

- [ ] 12. Rewrite `README.md` as the full submission README. Include the four-section TECHNICAL WRITE-UP: (1) Project Overview — problem statement + target users + solution summary + key features; (2) Design Decisions — technology choices + alternatives considered + trade-offs (cost vs performance, simplicity vs features) + security + scalability; (3) Kiro Usage — honest spec-driven vs vibe coding, steering, hooks, and an honest MCP statement (not used); (4) Learning Journey & Forward Thinking — challenges, what you'd do differently, future enhancements. PLUS standard README content: setup/run (Expo SDK 54 custom dev build, `npm install`, `npm run typecheck/lint/test`, `node scripts/validate-catalog.mjs`, `npx expo prebuild`/`run:ios` for native), architecture overview, privacy, supported platforms, test results (14 suites / 167 tests). Include an EXACT known-limitations section: real iPhone app-blocking is implemented as native Screen Time code but is NOT runtime-verified (needs paid Apple Developer account + `com.apple.developer.family-controls` entitlement + physical iPhone; simulator cannot run it). Link `docs/ios-focus-setup.md`, `docs/ai-coaching.md`, `docs/kiro-dev-log.md`.
      Files: `README.md` (create).
      Verify: all four write-up sections present; known-limitations section present and honest; links resolve to real files (`ls docs/ios-focus-setup.md docs/ai-coaching.md docs/kiro-dev-log.md`).

- [ ] 13. Create `docs/demo-script.md` — a precise 3-minute demo script the USER films (do NOT produce media). Structure: 0:00-0:30 PROBLEM, 0:30-2:30 LIVE DEMO of one complete learning journey + the honest Focus settings screen, 2:30-3:00 IMPACT. Include word-for-word voiceover + an exact tap-sequence SHOT LIST with timing. Recording setup: iPhone 16 iOS simulator + QuickTime. Any seeded/demo progress or sample certificate MUST be labeled as sample data. Must NOT instruct claiming real on-device blocking was demonstrated — the Focus screen is shown in its honest "unavailable" state with the explanation.
      Files: `docs/demo-script.md`.
      Verify: three timed sections present; voiceover never claims live on-device blocking; sample-data labeling called out.

- [ ] 14. Create `docs/known-blockers.md` — honest remaining blockers (paid Apple account + entitlement + physical device for Screen Time runtime; video must be filmed by user; remote/push + YouTube upload are user actions; no MCP).
      Files: `docs/known-blockers.md`.
      Verify: file exists; each blocker is real and actionable.

- [ ] 15. Create `docs/submission-checklist-status.md` — map each hackathon requirement (GitHub repo with README + setup; `.kiro/` present and NOT gitignored; technical documentation / architecture decisions; 3-min demo video; technical write-up four sections; optional MCP/AWS blog) to done / user-action-needed. Note explicitly that the video must be filmed by the user and that adding a git remote / pushing / YouTube upload are user actions (this workflow is local-only).
      Files: `docs/submission-checklist-status.md`.
      Verify: every listed requirement maps to a clear status; user-action items flagged.

- [ ] 16. Commit Phase 9 docs in a logical chunk.
      Files: `README.md`, `docs/demo-script.md`, `docs/known-blockers.md`, `docs/submission-checklist-status.md`.
      Verify: `git status` clean after commit.

---

## FINAL VERIFICATION of the batch

- [ ] 17. Re-run the STEP A sweep after all edits and confirm still green; update `.agents/tasks/verification-final.md` with the final run. Confirm `.kiro` is tracked (`git ls-files .kiro | head`) and NOT in `.gitignore` (`grep -n kiro .gitignore` finds nothing). Grep the repo for obvious secrets and confirm none committed.
      Files: `.agents/tasks/verification-final.md` (final run appended).
      Verify: typecheck/lint/test/catalog all green; native compile result recorded honestly; `.kiro` tracked; no secrets; final `git status` clean. Commit the final verification doc.

## Gaps / assumptions

- Native `expo prebuild` + `xcodebuild` may not be runnable in this environment. Assumption: attempt it; if the toolchain is missing or the build genuinely fails for environment reasons, record the exact output and keep the compile-only honesty ceiling — do NOT claim BUILD SUCCEEDED unobserved, and raise a warning if a green claim would otherwise be forced.
- Kiro hook format: the `.kiro.hook` classic standalone JSON is used (broadly recognized by the Kiro IDE Hook UI). If this Kiro version rejects it, the implementer should adapt to the installed version's schema and record the actual observed behavior in the dev-log rather than claiming an unverified run.
