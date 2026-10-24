# Goalie — Phase 1 Design & Feasibility

Status: Design pass (no application code in this step). Target repo: `/Users/Shared/goalie` (git `main`, local-only, no remote, no worktree). All paths below are absolute under that root.

> Revision note (pass 3): this document was first revised to resolve an earlier review (2 HIGH / 4 MEDIUM / 4 NIT, all addressed), then again to resolve a second review (0 HIGH / 3 MEDIUM / 6 NIT), and now **again** to resolve the current review at `/Users/Shared/goalie/.agents/tasks/design-review.json` (verdict `CHANGES_REQUESTED`, 0 HIGH / 2 MEDIUM / 3 NIT). A point-by-point response to the current review's five findings is in §12; the two prior reviews' responses are retained in §10 and §11 for history.

## 1. Overview

Goalie is a learning app whose differentiator is a *real* focus-blocking feature backed by Apple's Screen Time APIs (Family Controls / ManagedSettings / DeviceActivity). Phase 1 delivers the foundation: a React Native + TypeScript app scaffolded as an **Expo custom dev build** (NOT Expo Go), a clean content/domain/ui separation that preserves the existing course catalog, and a **real** native iOS focus module (Swift) wired through an Expo config plugin that injects the entitlements and extension targets into the prebuilt `ios/` project. A JS availability layer honestly reports when focus protection cannot run.

The central constraint shapes every decision: there is **no physical iPhone, no paid Apple Developer account, and no Family Controls entitlement** in this environment, and the iOS Simulator cannot execute Screen Time / Family Controls / ManagedSettings / DeviceActivity. Therefore the blocking code is written for real but is **explicitly unverifiable at runtime here**. The ceiling of verification in this environment is *compile-only*. We never fake a blocked state and never simulate shielding with a JS timer.

## 2. Technology Stack (PINNED — locked once approved)

Chosen line: **Expo SDK 54** — the chosen settled line. Newer stable lines exist (SDK 55, 56, and 57 are all published stable dist-tags, and 58 is the current `next`/`latest`; canary builds are a separate tag series), but SDK 54 is deliberately selected because it has the known-good, settled `bundledNativeModules.json` matrix we want for a *foundational native build* where compile-stability matters more than being on the newest line. We are not chasing the newest tag; we are anchoring to the line with the most-exercised compatibility matrix. These versions come directly from `expo@54.0.38`'s `bundledNativeModules.json` and Expo's recommended tooling for the 54 line.

| Package | Pinned version | Source / reason |
|---|---|---|
| `expo` | `54.0.38` | Latest stable SDK 54 patch; anchor of the matrix |
| `react` | `19.1.0` | Exact pin from SDK 54 bundledNativeModules |
| `react-dom` | `19.1.0` | Matches `react` (web availability stub) |
| `react-native` | `0.81.5` | Exact pin from SDK 54 bundledNativeModules |
| `react-native-safe-area-context` | `~5.6.0` | SDK 54 bundled range (navigation dep) |
| `react-native-screens` | `~4.16.0` | SDK 54 bundled range (navigation dep) |
| `expo-device` | `~8.0.10` | SDK 54 bundled; `Device.isDevice` for simulator detection (§6) |
| `expo-constants` | `~18.0.14` | SDK 54 bundled; app metadata/config access (NOT used for Expo Go detection — see §6) |
| `@react-navigation/native` | `7.5.1` (exact, no caret) | Navigation shell; peer-compatible with RN 0.81 / React 19. Current published v7 verified against the registry. Write the exact version into `package.json` |
| `@react-navigation/native-stack` | `7.21.0` (exact, no caret) | Native stack for the shell; current published v7 verified. Peers (`@react-navigation/native ^7.5.1`, `react-native-screens >=4.0.0`, `react-native-safe-area-context >=4.0.0`, `react >=18.2.0`) all satisfied by this matrix; does **not** peer-require reanimated/gesture-handler. Write the exact version into `package.json` |
| `expo-dev-client` | `~6.0.21` | SDK 54 bundled; required for the custom dev build (replaces Expo Go) |
| `expo-build-properties` | `~1.0.10` | SDK 54 bundled; config plugin to set iOS deployment target |
| `typescript` | `5.9.3` | Expo 54's recommended TS. **TS 7 (`7.0.2`) is explicitly rejected** — not stable, not compatible with the current `tsc`/type-defs matrix |
| `@types/react` | `19.1.17` | Matches React 19.1 |
| `jest-expo` | `54.0.18` | Exact pin from SDK 54 bundledNativeModules; Jest preset |
| `jest` | `~29.7.0` | Version `jest-expo@54` is built against |
| `@types/jest` | `^29.5.x` | Matches Jest 29 |
| `eslint` | `^9.x` | Satisfies `eslint-config-expo@10` peer (`eslint >=8.10`); flat config |
| `eslint-config-expo` | `10.0.0` | SDK 54's ESLint config line |

**Navigation scope decision:** Phase 1 uses only `@react-navigation/native-stack` (a native-backed stack). `react-native-reanimated` and `react-native-gesture-handler` are **intentionally not included** — Phase 1 has no drawer, no gesture-driven navigation, and no JS-driven transitions, and native-stack v7 does not hard-require them. (SDK 54 bundles `react-native-reanimated@~4.1.1` and `react-native-gesture-handler@~2.28.0` if a later phase needs them; adding them is a deliberate later decision, not an oversight here.)

**React Navigation pinning:** `@react-navigation/*` is the only part of the matrix that is not drawn from `bundledNativeModules.json`, so its peer compatibility with RN 0.81 / React 19 is asserted from the published v7 line rather than from an Expo-tested lock. The implementer must write the **exact versions with no caret** (`@react-navigation/native` `7.5.1`, `@react-navigation/native-stack` `7.21.0`) directly into `package.json` — not `^7.5.1` — commit the resulting `package-lock.json`, and then **record the actually-resolved patch back into this §2 table after install** (replacing the design-time value if `npm` resolves a newer patch). Exact pins prevent a future `npm install` from floating across the 7.x line. This keeps the "mutually-compatible pinned versions" guarantee holding for navigation too.

**Expo app identity (PINNED).** The Expo config `name` is **`Goalie`** and `slug` is **`goalie`**, set in `app.config.ts` (§3). These are locked because `expo prebuild` derives the generated iOS workspace and scheme names from `name`: `name: "Goalie"` produces `ios/Goalie.xcworkspace` and a `Goalie` scheme. The compile-ceiling verification in §8 does **not** hardcode these, however — it derives the scheme at runtime from the generated workspace (`xcodebuild -list -workspace ios/*.xcworkspace`) so a later rename of `name` cannot silently break verification. Bundle ids remain `com.goalie.app*` and the app group `group.com.goalie.app.focus` regardless of `name`.

Package manager: **npm 11.7.0** on **Node v20.19.4**. Lockfile: **`/Users/Shared/goalie/package-lock.json`** (committed). Navigation uses React Navigation rather than `expo-router` for Phase 1 because we need only a thin navigation shell with one placeholder screen; React Navigation keeps the shell explicit and file-system routing can be revisited in a later phase if screen count grows. (If the reviewer prefers `expo-router ~6.0.24`, it is the bundled alternative — but React Navigation is the chosen path here.)

Why mutually compatible: `react@19.1.0` + `react-native@0.81.5` is the exact pair Expo 54 ships and tests; `jest-expo@54.0.18` targets that same RN/React pair; `@types/react@19.1.17` matches React 19.1; `eslint-config-expo@10` is the 54-line config and accepts ESLint 9; `expo-device@~8.0.10` and `expo-constants@~18.0.14` are the SDK 54 bundled ranges. Nothing in the table floats across a major boundary that Expo 54 hasn't already validated, except the explicitly-pinned React Navigation patches above.

## 3. Project / Folder Layout (absolute paths)

Preserved untouched: `/Users/Shared/goalie/content/tracks.json` and `/Users/Shared/goalie/scripts/validate-catalog.mjs`. The domain layer **reads** `tracks.json` as the content source of truth; it does not rewrite it, and the existing validator keeps passing.

```
/Users/Shared/goalie/
├── app.config.ts                      # Expo config (TS); name 'Goalie' / slug 'goalie', registers config plugins, app group, bundle ids
├── package.json                       # scripts: typecheck, test, lint, prebuild
├── package-lock.json                  # npm lockfile (committed)
├── tsconfig.json                      # extends expo/tsconfig.base; strict: true
├── babel.config.js                    # babel-preset-expo
├── jest.config.js                     # preset: jest-expo
├── eslint.config.js                   # flat config, extends eslint-config-expo
├── index.ts                           # registerRootComponent entry
├── App.tsx                            # mounts navigation shell
├── content/                           # EXISTING — unchanged
│   └── tracks.json
├── scripts/                           # EXISTING — unchanged
│   └── validate-catalog.mjs
├── src/
│   ├── domain/                        # PURE TS. No react / react-native imports.
│   │   ├── content/
│   │   │   ├── catalog.ts             # load + parse tracks.json into typed Catalog
│   │   │   └── catalog.types.ts       # Track/Level/Lesson types mirroring the JSON schema
│   │   ├── assessment/index.ts        # placeholder pure module (stub + types)
│   │   ├── rewards/index.ts           # placeholder pure module
│   │   ├── progression/index.ts       # placeholder pure module
│   │   └── certificates/index.ts      # placeholder pure module
│   ├── focus/                         # JS side of the native module + availability layer
│   │   ├── GoalieFocus.ts             # typed JS API that calls the native module
│   │   ├── availability.ts            # platform + authorization detection, honest "unavailable"
│   │   └── types.ts                   # shared enums/types (AuthorizationStatus, FocusUnavailableReason, FocusSelection, ...)
│   └── ui/
│       ├── navigation/RootNavigator.tsx   # native-stack shell
│       └── screens/HomeScreen.tsx         # placeholder Home that runs + shows focus availability
├── modules/
│   └── goalie-focus/                  # local Expo native module (Swift) + config plugin
│       ├── expo-module.config.json
│       ├── ios/
│       │   ├── GoalieFocusModule.swift        # main-app native module surface
│       │   └── GoalieFocus.podspec
│       ├── plugin/
│       │   └── withGoalieFocus.ts             # Expo config plugin (the subject of §5)
│       └── index.ts                            # re-exports the JS API
├── ios-extensions/                    # source templated into ios/ by the config plugin at prebuild
│   ├── DeviceActivityMonitor/
│   │   └── GoalieMonitor.swift        # DeviceActivityMonitor extension (shield release at deadline)
│   └── ShieldConfiguration/           # OPTIONAL
│       └── GoalieShieldConfig.swift   # custom shield UI
├── docs/
│   └── ios-focus-setup.md             # written in the implementation phase (device verify steps + blocker)
└── __tests__/                         # domain unit tests + availability tests
```

The `ios/` directory is a **prebuild artifact** (`npx expo prebuild`) and is not the source of truth; the config plugin in §5 is. Whether `ios/` is committed is a later-phase decision; Phase 1 treats it as regenerable.

### 3.1 Domain content layer — types and parse contract (the one real, testable logic this phase)

The native focus path is compile-only this phase, so `src/domain/content/` is the **only shippable, runtime-testable logic** in Phase 1. Its contract is therefore specified concretely here rather than left to the implementer.

**Types — `/Users/Shared/goalie/src/domain/content/catalog.types.ts`** (pure TS, mirrors `tracks.json` and the invariants `scripts/validate-catalog.mjs` already enforces):

```ts
export type LevelId = 'beginner' | 'intermediate' | 'advanced';

export interface Lesson { id: string; title: string; objective: string }
export interface Level  { id: LevelId; title: string; objective: string; lessons: Lesson[] }
export interface Track  { id: string; title: string; description: string; levels: Level[] }
export interface Catalog { schemaVersion: 1; tracks: Track[] }

export class CatalogError extends Error {
  constructor(message: string) { super(message); this.name = 'CatalogError'; }
}
```

`lessons` is typed `Lesson[]` even though every level currently ships `[]`; the type is forward-compatible with later phases that populate lessons, and the parser validates each lesson when present.

**Parse contract — `/Users/Shared/goalie/src/domain/content/catalog.ts`:**

```ts
export function loadCatalog(raw: unknown): Catalog;
```

`loadCatalog` takes the already-parsed JSON value (the caller does the `import`/`readFile` + `JSON.parse`; keeping `loadCatalog` a pure function of its input makes it trivially unit-testable with fixtures and free of RN/Node IO imports). It **re-validates** rather than trusting the JSON, because the domain layer must not assume the build-time validator ran. It enforces, in order, throwing a `CatalogError` with a specific message on the first violation (fail-fast; **never returns a partial catalog**):

1. `schemaVersion === 1` (else `CatalogError: unsupported schemaVersion`).
2. `tracks` is a non-empty array.
3. Every track has a non-empty string `id`, and track ids are **unique** (else `CatalogError: duplicate track id "<id>"`).
4. Every track has non-empty string `title` and `description`.
5. Every track has **exactly three levels with ids `beginner`, `intermediate`, `advanced` in that order** (else `CatalogError: <trackId>: levels must be beginner, intermediate, advanced in order`).
6. Every level has non-empty string `title` and `objective`, and `lessons` is an array; each present lesson has non-empty string `id`, `title`, `objective`.

On success it returns a fully-typed `Catalog`. The validation set is intentionally the same shape the existing `scripts/validate-catalog.mjs` enforces, so the domain layer and the build-time validator agree (note: the domain parser validates structural invariants generically; it does **not** require the three specific starter-track ids — that "required starter tracks" check stays the build-time validator's job, since it is a content-policy rule, not a structural one).

**Named unit tests `npm test` will run** (fixtures under `/Users/Shared/goalie/__tests__/`):
- `loadCatalog` parses the real `tracks.json` into a `Catalog` of 3 tracks × 3 levels. (valid-parse)
- rejects a fixture with `schemaVersion: 2` → throws `CatalogError`. (wrong-schema)
- rejects a track missing its `intermediate` level → throws `CatalogError`. (missing-level)
- rejects a fixture with two tracks sharing an id → throws `CatalogError`. (duplicate-id)
- rejects levels out of order (`advanced` before `beginner`) → throws `CatalogError`. (order)

### 3.2 Placeholder domain modules — defined surface

`assessment`, `rewards`, `progression`, `certificates` are Phase-1 placeholders, but each still exports a **named, typed, intentionally-unimplemented surface** so there is something real to type-check and a trivial contract to test. Each `index.ts` exports a single typed function that throws a `NotImplementedError` until its phase lands, e.g.:

```ts
// src/domain/assessment/index.ts
export class NotImplementedError extends Error {
  constructor(feature: string) { super(`${feature} not implemented in Phase 1`); this.name = 'NotImplementedError'; }
}
export interface AssessmentResult { trackId: string; levelId: LevelId; passed: boolean }
export function evaluateAssessment(_input: never): AssessmentResult { throw new NotImplementedError('assessment'); }
```
(`rewards` → `grantReward`, `progression` → `advanceProgress`, `certificates` → `issueCertificate`, each with a named return type and a `NotImplementedError` throw.) The matching unit test asserts the export exists and throws `NotImplementedError` — a real contract, so §8's "placeholders behave as specified" is accurate rather than overstated.

## 4. Native iOS Module Design

### 4.1 Swift module surface (main app) — `GoalieFocusModule.swift`

An Expo module (`expo-modules-core`) exposing these async functions. Each maps 1:1 to a JS method and returns a serializable result or rejects with a typed error code.

- `getAuthorizationStatus() -> String` — reads `AuthorizationCenter.shared.authorizationStatus`, maps to `"notDetermined" | "denied" | "approved"`.
- `requestAuthorization() -> String` — calls `AuthorizationCenter.shared.requestAuthorization(for: .individual)` (Individual, not `.child` — no parent/MDM flow). Returns resulting status; rejects `E_AUTH_DENIED` / `E_AUTH_FAILED`.
- `presentActivityPicker() -> FocusSelection` — presents Apple's `FamilyActivityPicker` (SwiftUI) from the top view controller. On confirm, persists the chosen `FamilyActivitySelection` to the app group (serialization in §4.4) and returns `FocusSelection = { summary: string }` (derived counts). On user dismissal/cancel, rejects with `E_PICKER_CANCELLED` (a distinct, catchable cancellation outcome — **not** an "unavailable" condition; see §4.2).
- `getSelection() -> FocusSelection | null` — reads the persisted selection from the app group and returns `{ summary: string }`, or `null` if none persisted. (`FocusSelection` is the single shared type defined in §4.2.)
- `startFocusSession(durationSeconds: Int) -> FocusSession` — **enforces the ordering invariant** (§4.3) and the duration validation (§4.5). **Rejects `E_SESSION_ACTIVE` if an active session is already persisted** (not idempotent on start — see §4.3 step 3). Also rejects `E_INVALID_DURATION`, `E_NO_SELECTION`, `E_NOT_AUTHORIZED`, `E_SCHEDULE_FAILED`, `E_SHIELD_FAILED`. Mints the session `id` as `UUID().uuidString` at persist time (§4.3 step c).
- `stopFocusSession() -> void` — clears `ManagedSettingsStore(named:).shield.applications` / `.applicationCategories`, stops the `DeviceActivity` schedule, and removes the persisted session key. **Idempotent, including the case where no session was ever persisted** (see §4.3 step 4).
- `getActiveSession() -> FocusSession | null` — reads session metadata (`id`, deadline, selection summary) from the app group and returns the **identical `id`** that `startFocusSession` minted and persisted.

The main app and the DeviceActivityMonitor extension communicate **only through the shared app group** `UserDefaults`, using the exact key/identifier literals in §4.4. No direct IPC.

### 4.2 Typed JS API shape — `src/focus/GoalieFocus.ts` + `types.ts`

```ts
export enum AuthorizationStatus { NotDetermined='notDetermined', Denied='denied', Approved='approved' }

export enum FocusUnavailableReason {
  NotIOS='not-ios',                 // web / Android
  Simulator='simulator',            // iOS Simulator: Screen Time APIs are no-ops / unsupported
  ExpoGo='expo-go',                 // custom native module did not load (e.g. Expo Go)
  OSTooOld='os-too-old',            // < iOS 16 (Family Controls availability)
  NotAuthorized='not-authorized',   // authorization not Approved
}

export type FocusAvailability =
  | { available: true }
  | { available: false; reason: FocusUnavailableReason };

// Availability is ASYNC because its last step (§6 step 5) awaits a native bridge call.
export function getFocusAvailability(): Promise<FocusAvailability>;

// Single shared selection type, referenced by presentActivityPicker() and getSelection().
export type FocusSelection = { summary: string };

export interface FocusSession { id: string; deadlineEpochMs: number; selectionSummary: string }

// Thrown for honest "feature cannot run here" conditions.
export class FocusUnavailableError extends Error { constructor(public reason: FocusUnavailableReason) { super(reason); } }
// Thrown ONLY when the user dismisses the Family Activity picker — a normal outcome, not a failure.
export class FocusCancelledError extends Error {}

export interface GoalieFocusApi {
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  requestAuthorization(): Promise<AuthorizationStatus>;
  presentActivityPicker(): Promise<FocusSelection>;   // rejects FocusCancelledError on dismissal
  getSelection(): Promise<FocusSelection | null>;
  startFocusSession(durationSeconds: number): Promise<FocusSession>;
  stopFocusSession(): Promise<void>;
  getActiveSession(): Promise<FocusSession | null>;
}
```

Error contract on the JS side, by category:
- **Unavailable platform/state** — on any non-iOS platform, or when the native module did not load, the module resolves to a stub whose methods reject with `FocusUnavailableError(reason)` rather than opaque "module not found" errors. The availability layer (§6) is the first line; these rejections are the defensive second line.
- **User cancellation** — `presentActivityPicker()` rejects with `FocusCancelledError`. The Home-screen caller catches it and treats it as a **no-op** (no error UI, state unchanged). Cancellation is never reported as "focus unavailable."
- **Operation failures** — the native error codes from §4.1 (`E_SESSION_ACTIVE`, `E_INVALID_DURATION`, `E_NO_SELECTION`, `E_NOT_AUTHORIZED`, `E_SCHEDULE_FAILED`, `E_SHIELD_FAILED`) surface as rejected promises with those codes for the caller to handle/log.

### 4.3 The authorize → pick → shield → remove → expiry flow and the ordering invariant

1. **Authorize** — `requestAuthorization()`; proceed only when status is `Approved`.
2. **Pick** — `presentActivityPicker()`; on confirm, persist the `FamilyActivitySelection` to the app group (§4.4). Blocking cannot start with an empty selection (`E_NO_SELECTION`). On dismissal, `FocusCancelledError` and no state change.
3. **Start session** — in `startFocusSession(durationSeconds)`, in this exact order:
   - **0. Validate (no side effects yet).** First, **reject a concurrent start: if an active session is already persisted** (the `session.v1` key exists in the app group), reject `E_SESSION_ACTIVE` immediately. `startFocusSession` is deliberately **not** idempotent — a second start while one is live is a caller error, not a silent replace, so we never double-schedule or orphan a prior schedule. (To restart with a new duration/selection, the caller calls `stopFocusSession()` first.) Then validate `durationSeconds` per §4.5 (`E_INVALID_DURATION` if out of range), confirm a non-empty persisted selection exists (`E_NO_SELECTION`), and confirm authorization is `Approved` (`E_NOT_AUTHORIZED`).
   - **a. Schedule expiry FIRST.** First **defensively clear any orphaned schedule**: call `DeviceActivityCenter().stopMonitoring([activityName])` inside a `do/catch` (ignore/throw-swallow its error) *before* starting, regardless of session state. This closes the gap where a prior failed start (step 3b whose rollback `stopMonitoring` itself threw) left a live schedule under the same `activityName` while persisting no `session.v1` — the step-3.0 `E_SESSION_ACTIVE` guard keys only off `session.v1`, so without this clear a retry could double-schedule the same activity. Then build a `DeviceActivitySchedule` whose interval ends at `now + durationSeconds` and call `DeviceActivityCenter().startMonitoring(activityName, during: schedule)`. If this throws, **reject `E_SCHEDULE_FAILED` and apply NO shields.** This is the invariant: never shield apps without a scheduled release, so a crash/close can never strand the user behind a permanent shield.
   - **b. Then apply the shield.** `store.shield.applications = selection.applicationTokens` and `store.shield.applicationCategories = .specific(selection.categoryTokens)` on the named `ManagedSettingsStore`. **On failure, perform a best-effort, observable rollback:**
     1. Clear any partial shield: `store.shield.applications = nil`; `store.shield.applicationCategories = nil`.
     2. Stop the schedule from step (a): call `DeviceActivityCenter().stopMonitoring([activityName])` **inside a `do/catch`**. If `stopMonitoring` itself throws, capture that secondary error — do not let it mask the primary failure.
     3. **Do NOT persist session metadata** (step c is skipped), so no active session is recorded.
     4. Reject `E_SHIELD_FAILED`, attaching the secondary `stopMonitoring` error (if any) in the error's `userInfo`/message.

     Resulting state after a failed step b is thus deterministic: the shield store is cleared, monitoring was asked to stop (best-effort), and no session is persisted. If `stopMonitoring` threw during rollback, a schedule may still be live — but because no session is persisted and the DeviceActivityMonitor extension (step 5) clears the shield at interval end regardless, the worst case self-heals at the deadline and `stopFocusSession()` (step 4) can force-clear it immediately.
   - **c. Persist** session metadata to the app group under key `session.v1`: mint `id = UUID().uuidString`, store `{ id, deadlineEpochMs, selectionSummary }`, and return the matching `FocusSession`. The `selectionSummary` written here is **recomputed from the same decoded `selection.v1` used to build the shield in step b** — decode the persisted `FamilyActivitySelection` and format `"<n> apps, <m> categories"` where `n = applicationTokens.count` and `m = categoryTokens.count` (the identical derivation as §4.4). It is **not** a value carried over from picker time, so the session summary can never drift from the selection actually shielded (no stale/empty summary). Because the id is persisted here, a later `getActiveSession()` returns the **identical** id.
4. **Remove (manual)** — `stopFocusSession()` clears the named shield store (`shield.applications = nil`, `shield.applicationCategories = nil`) and calls `stopMonitoring` for the activity name. It is **idempotent and safe to call when nothing was persisted**: it reads the activity name/store id from constants (not from a persisted session), so it can always force-clear a stranded schedule or shield left by a failed start in step 3b. Calling it with no active session is a successful no-op.
5. **Expiry while app closed** — the **DeviceActivityMonitor extension** `GoalieMonitor.swift` overrides `intervalDidEnd(for:)` to clear the same named `ManagedSettingsStore` (shield off) even though the main app process is not running. This is why the schedule MUST exist before the shield.

### 4.4 Selection serialization + the shared constant namespace (app group round-trip)

Because the main app module (`GoalieFocusModule.swift`) and the DeviceActivityMonitor extension (`GoalieMonitor.swift`) communicate **only** through the app group, a single mismatched string silently breaks shield release. All such literals live in **one shared Swift constants source** (`GoalieFocusConstants.swift`, compiled into both the main module target and the extension target) so both sides reference identical values. The complete namespace:

| Constant | Exact literal | Used by | Purpose |
|---|---|---|---|
| App group id | `group.com.goalie.app.focus` | main + extension | the shared `UserDefaults(suiteName:)` suite |
| Selection key | `selection.v1` | main (write/read) | `Data` blob of the encoded `FamilyActivitySelection` |
| Session key | `session.v1` | main (write/read) | JSON of `{ id, deadlineEpochMs, selectionSummary }` active-session metadata |
| `ManagedSettingsStore` name | `goalie.focus` | main (apply/clear) + extension (clear) | the **named** store both sides shield/unshield |
| `DeviceActivityName` | `goalie.focus.session` | main (`startMonitoring`/`stopMonitoring`) + extension (`intervalDidEnd(for:)` match) | the monitored activity whose interval end triggers release |

The `ManagedSettingsStore(named: "goalie.focus")` name and the `DeviceActivityName("goalie.focus.session")` **must match on both sides** — the extension's `intervalDidEnd(for:)` compares against this exact activity name and clears this exact named store.

`ApplicationToken` and `ActivityCategoryToken` are **opaque `Codable`** types; they are only meaningful when round-tripped as encoded `Data` and never cross the JS bridge.

- **Write (on picker confirm):** `JSONEncoder().encode(selection)` of the entire `FamilyActivitySelection`, stored in the app-group `UserDefaults` under key `selection.v1` as `Data`. (The `.v1` suffix lets a future schema bump migrate without colliding.)
- **Read (in `startFocusSession` and `getSelection`):** `JSONDecoder().decode(FamilyActivitySelection.self, from: data)`; `startFocusSession` reads `.applicationTokens` and `.categoryTokens` from the decoded value to build the shield.
- **JS summary derivation:** the JS-visible `FocusSelection.summary` is a derived string `"<n> apps, <m> categories"` where `n = selection.applicationTokens.count` and `m = selection.categoryTokens.count`. **Only this count-based summary crosses the bridge** — raw tokens stay native.

### 4.5 Input validation — `durationSeconds`

`startFocusSession(durationSeconds)` rejects `E_INVALID_DURATION` unless `durationSeconds` is a **finite integer in `[60, 86400]`** (1 minute to 24 hours). This prevents degenerate/instantly-expired `DeviceActivitySchedule`s and absurd durations. Validation runs **twice**: on the JS side before the bridge call (fast feedback, avoids a native round-trip) and **defensively in Swift** (the native module never trusts its caller). A failed validation is a rejected promise with `E_INVALID_DURATION` and produces no side effects.

## 5. Expo Config Plugin Responsibilities — `modules/goalie-focus/plugin/withGoalieFocus.ts`

The plugin runs during `expo prebuild` and mutates the generated `ios/` project so the build is reproducible from config, not hand-editing Xcode. It:

1. **Entitlements** — adds `com.apple.developer.family-controls` (boolean `true`) to the main app target entitlements, and the **App Groups** entitlement (`com.apple.security.application-groups`) with the shared group id to the main app and every extension target.
2. **App group id** — `group.com.goalie.app.focus` (single source in `app.config.ts`, injected everywhere).
3. **Extension targets** — adds a **DeviceActivityMonitor** extension target with bundle id `com.goalie.app.DeviceActivityMonitor`, embedding `GoalieMonitor.swift` from `/Users/Shared/goalie/ios-extensions/DeviceActivityMonitor/`, with the `com.apple.deviceactivity.monitor-extension` point and the Family Controls + App Groups entitlements. Optionally adds a **ShieldConfiguration** extension `com.goalie.app.ShieldConfiguration` (`com.apple.managedsettingsui.shield-configuration-service`) for custom shield UI.

   **How the extension target is actually created (mechanism — §5.1):** `@expo/config-plugins` — resolved under Expo SDK 54 as **`@expo/config-plugins@54.0.6`** (the `sdk-54` dist-tag; the transitive dependency of `expo@54.0.38` via `~54.0.6`, so it is **not** a separate entry in the §2 pin table) — exposes **no** high-level helper that creates a `PBXNativeTarget` with its own sources phase, entitlements, extension-point `Info.plist`, and the host-app "Embed App Extensions" phase. The only supported path is the **`withXcodeProject` escape hatch** (exported by `@expo/config-plugins@54.0.6`) driving raw `pbxproj` mutation through its bundled pbxproj library **`xcode`** (`xcode@^4.0.0`, a direct dependency of `@expo/config-plugins@54.0.6`) — the `XcodeProject` object `withXcodeProject` hands the callback. We deliberately choose this escape-hatch route over adopting a third-party community extension-target plugin: it keeps the extension wiring auditable in-repo and avoids taking on an unpinned, sparsely-maintained dependency for the single most load-bearing build step. `withEntitlementsPlist` (used in item 1 for the **main app**) stays separate and is not part of this mechanism.

   Inside the `withXcodeProject` callback, the plugin performs this enumerated set of `pbxproj` mutations for the DeviceActivityMonitor extension (and, if enabled, the same shape for the ShieldConfiguration extension with its own extension-point identifier):
   - **Create an app-extension `PBXNativeTarget`** (`productType = "com.apple.product-type.app-extension"`) named e.g. `GoalieMonitor`, product name matching the bundle id `com.goalie.app.DeviceActivityMonitor`.
   - **Add a Sources (`PBXSourcesBuildPhase`)** to that target compiling the monitor Swift file (`GoalieMonitor.swift`, templated in from `ios-extensions/DeviceActivityMonitor/`) plus the shared `GoalieFocusConstants.swift` (§4.4). Register the files as `PBXBuildFile` / `PBXFileReference` entries and add a corresponding `PBXGroup` so they appear in the project tree.
   - **Generate a dedicated extension entitlements file** (separate from the main app's) carrying `com.apple.developer.family-controls = true` and the `com.apple.security.application-groups` App Groups entitlement with `group.com.goalie.app.focus`, and point the extension target's `CODE_SIGN_ENTITLEMENTS` build setting at it.
   - **Write the extension `Info.plist`** with `NSExtensionPointIdentifier = com.apple.deviceactivity.monitor-extension` (and the `NSExtensionPrincipalClass` for the monitor), and set `INFOPLIST_FILE` for the target.
   - **Set the extension target's `IPHONEOS_DEPLOYMENT_TARGET = 16.0`** (Family Controls minimum) and a matching `DEVELOPMENT_TEAM` placeholder (§5 item 5) in both `Debug` and `Release` `XCBuildConfiguration`s, created via a new `XCConfigurationList` for the target.
   - **Embed the extension into the main app** by adding a **`PBXCopyFilesBuildPhase` with `dstSubfolderSpec = 13`** ("Embed App Extensions") to the main app target, with the extension's product `.appex` as its file, and add the extension target to the main app target's `PBXTargetDependency` list so it builds first.

4. **Bundle ids / deployment target** — main app `com.goalie.app`; sets iOS deployment target to **16.0** (Family Controls minimum) via `expo-build-properties`.
5. **Signing team placeholder** — writes `DEVELOPMENT_TEAM = "<<APPLE_TEAM_ID>>"` as a placeholder so signing is wired but obviously unset; documented in `docs/ios-focus-setup.md`.

The plugin is the authoritative definition of the native project. `ios/` is regenerable from it.

## 6. Availability-Detection Strategy — `src/focus/availability.ts`

Honest reporting. The entry point is **async**:

```ts
export async function getFocusAvailability(): Promise<FocusAvailability>;
```

It is async because its final check awaits a native bridge call. **Steps 1–4 are synchronous guards evaluated first**, so on web, Android, the simulator, or an Expo Go / module-absent build **no bridge call is ever made** (those platforms can't service it anyway). **Only step 5 awaits** the native authorization status. The Home screen therefore `await`s `getFocusAvailability()` (it does not block or call it synchronously).

Checks run in this precedence order; **the first match wins**, and the order is chosen so that the hardest, most reliable platform facts are reported before any module-load heuristic:

1. **NotIOS** (sync) — `Platform.OS !== 'ios'` → `{ available:false, reason: NotIOS }` (web, Android). Hard platform fact.
2. **Simulator** (sync) — `!Device.isDevice` (`expo-device`) → `{ available:false, reason: Simulator }`. This is a hard platform fact independent of whether any native module loaded, so it is checked **before** the Expo Go / module-presence heuristic. Screen Time APIs are unsupported on the simulator; we never pretend otherwise. (This ordering fixes the earlier concern that a simulator could otherwise be mislabeled "Expo Go.")
3. **ExpoGo / module absent** (sync) — the single deterministic rule: **the focus native module is required; if it is absent/unregistered** (importing the native module resolves to `undefined`, or `expo-modules-core` reports it unregistered) → `{ available:false, reason: ExpoGo }`. We do **not** branch on `Constants.appOwnership` (deprecated/unreliable for this purpose); module presence is the authoritative signal in a custom dev build. The UI states focus requires the custom dev build. (Reaching this check implies a real iOS device per steps 1–2, so "module absent on a real device" genuinely means the custom native module did not load — e.g. running under Expo Go.)
4. **OSTooOld** (sync) — the iOS **major version** is read from `Device.osVersion` (`expo-device`, already in the §2 matrix). Its shipped type in `expo-device@8.0.10` is **`string | null`** (not just `string`), typically a string like `"18.5"` but possibly `null`. Compute the major as `parseInt(Device.osVersion ?? '', 10)` — note `parseInt(null, 10)` is `NaN` and `parseInt('', 10)` is `NaN`, so a `null`, empty, or otherwise malformed value yields `NaN`. If the result is `NaN` (null / unexpected / beta / empty string), **treat as `OSTooOld` — fail-closed**, never assume a modern OS. Minimum supported major is **16** (Family Controls availability); `major < 16` → `{ available:false, reason: OSTooOld }`. Examples: `"18.5"` → major 18, eligible; `"16"`/`"16.0"` → major 16, eligible; `"15.7"` → major 15, OSTooOld; `null` → `NaN` → OSTooOld; malformed/empty → OSTooOld.
5. **NotAuthorized** (async — the only awaited step) — `await getAuthorizationStatus()`; if the result `!== Approved` → `{ available:false, reason: NotAuthorized }` (the UI can route the user to the authorize step). **If this native call itself rejects** (transient bridge/native error), the availability function catches it and resolves to `{ available:false, reason: NotAuthorized }` — **fail-closed**: an errored status check is never reported as available.
6. Otherwise `{ available:true }`.

`expo-constants` remains in the dependency matrix for general app/config metadata, but is explicitly **not** used for Expo Go detection. The placeholder Home screen `await`s the verdict and renders it verbatim so that in *this* environment (simulator / dev build without entitlement) it will say focus protection is unavailable and precisely why — never a green "blocked" state.

## 7. Feasibility & Risk — on-device blocking is UNVERIFIABLE here

This is the single external blocker and it is structural, not a bug we can fix:

- **No physical iPhone.** Family Controls / ManagedSettings / DeviceActivity only do real work on a real device. The iOS **Simulator does not implement them** — authorization and shield calls are no-ops or fail, so a simulator run can never demonstrate real blocking.
- **No paid Apple Developer account.** The `com.apple.developer.family-controls` entitlement is a **restricted entitlement that Apple must grant by request** to a paid account. Without it, a device build cannot be signed to actually authorize/shield.
- **Consequence:** the authorize → pick → shield → remove → expiry behavior is written for real but **cannot be exercised in this environment**. The ceiling of verification here is **compile-only**: the Swift module and extensions type-check and build for an iPhone 16 simulator, and the JS/TS type-checks and unit tests pass. Compilation proves the code is well-formed and the targets/entitlements are wired; it proves **nothing** about runtime shielding.
- We mitigate by: (a) keeping the ordering invariant (schedule-before-shield) enforced in code so the device path is correct when a tester finally runs it; (b) making availability detection honest so no build ever claims a fake blocked state; (c) documenting the exact device-verification procedure in `/Users/Shared/goalie/docs/ios-focus-setup.md`, which records this blocker and the paid-account entitlement-request process.

**Top compile-only risk — pbxproj extension-target injection (§5.1).** Even within the compile-only ceiling, the single most fragile step is the raw `pbxproj` mutation that creates the DeviceActivityMonitor app-extension target via the `withXcodeProject` + `xcode`-library escape hatch. Because `@expo/config-plugins` offers no high-level helper for app-extension targets, every piece — the `PBXNativeTarget`, its Sources phase, the dedicated entitlements, the extension-point `Info.plist`, the deployment-target build settings, and the main app's `dstSubfolderSpec = 13` "Embed App Extensions" copy phase — is hand-built and is exactly what the `xcodebuild` compile step (§8) must prove. A malformed mutation here surfaces as a prebuild or Xcode project-load/compile failure rather than a runtime bug, so iterating on this plugin against `npx expo prebuild --clean` + the compile command is expected to be the bulk of the implementation effort.

## 8. Verification Commands (what the implementer runs — and what each proves)

Run from `/Users/Shared/goalie`. Environment facts confirmed this pass: `node v20.19.4`, `npm 11.7.0`, `Xcode 16.4 (16F6)`; the only installed iOS SDK is **iOS 18.5** (device + simulator); the `iPhone 16` simulator is available.

| Command | Proves | Does NOT prove |
|---|---|---|
| `npm install` | Dependency graph resolves; `package-lock.json` is produced/consistent | Nothing about iOS runtime |
| `node scripts/validate-catalog.mjs` | Existing content catalog still valid and untouched | Nothing about the app |
| `npm run typecheck` (`tsc --noEmit`, strict) | TS domain/focus/ui and the typed JS native API are type-sound | No runtime behavior |
| `npm run lint` (`eslint .`) | Style/static rules pass | No runtime behavior |
| `npm test` (`jest-expo`) | `loadCatalog` parse + rejection cases (§3.1: valid, wrong-schema, missing-level, duplicate-id, order), placeholder modules throw `NotImplementedError` (§3.2), the iOS-version parse rule (§6 step 4: `"18.5"` eligible / `"15.7"` OSTooOld / `null` OSTooOld / malformed OSTooOld), and the §6 availability precedence with Platform/Device stubbed return the correct reasons | Cannot test real native calls (authorize/picker/shield/expiry) |
| `npx expo prebuild --platform ios --clean` | Config plugin generates `ios/` with the entitlements, app group, and DeviceActivityMonitor (+ optional ShieldConfiguration) targets | Does not sign or run anything |
| `WS=$(ls -d ios/*.xcworkspace); SCHEME=$(xcodebuild -list -workspace "$WS" -json \| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).workspace.schemes;console.log(a.find(x=>x==="Goalie")??a[0])})'); xcodebuild -workspace "$WS" -scheme "$SCHEME" -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO build` | **Compile ceiling:** Swift module + extensions compile and the targets/entitlements are structurally valid against **the iOS SDK bundled with Xcode 16.4 (iOS 18.5 in this environment)**. The workspace and scheme are **derived at runtime** (`ios/*.xcworkspace` + `xcodebuild -list`) rather than hardcoded, so the command holds even if the Expo `name` changes; with `name: "Goalie"` they resolve to `ios/Goalie.xcworkspace` / scheme `Goalie`. The scheme derivation **prefers the scheme matching the pinned `name`** (`schemes.find(x => x === "Goalie") ?? schemes[0]`) rather than blindly taking `schemes[0]`: Expo prebuild emits a single shared app scheme named after `name`, and the DeviceActivityMonitor (and optional ShieldConfiguration) **app-extension target does not generate its own shared scheme**, so `name`-match is the stable selector and `schemes[0]` is only the fallback. Do not hardcode an SDK patch in scripts; let `xcodebuild` select the installed simulator runtime (omit a fixed OS in the destination) so the command stays valid if the runtime changes | Does **not** prove authorization, picker, shield apply/remove, or expiry-while-closed — those need a real device + paid entitlement |

What no command in this environment can prove: that apps are actually shielded, that the shield releases at the deadline while the app is closed, or that authorization succeeds. That verification is deferred to a physical device with a paid account per `docs/ios-focus-setup.md`.

## 9. Assumptions

- SDK 54 is the chosen settled line for a foundational native build. Newer stable lines (55, 56, 57 are all published stable dist-tags; 58 is `next`/`latest`) exist, but 54's matrix is the known-good one we want; if the reviewer requires the newest `latest`, the pins in §2 move as a set to that line's `bundledNativeModules.json`.
- React Navigation (not `expo-router`) for the Phase 1 shell, per §2 reasoning; its exact resolved patch versions get pinned into the lockfile at install time.
- App/group/extension bundle ids (`com.goalie.app*`, `group.com.goalie.app.focus`) are placeholders finalized with the signing team.
- `ios/` is treated as a regenerable prebuild artifact in Phase 1.
- Individual (`.individual`) authorization, not child/MDM, is the intended mode.

## 10. Responses to the Design Review

Review source: `/Users/Shared/goalie/.agents/tasks/design-review.json` (verdict `CHANGES_REQUESTED`). All ten findings are **addressed**; none backlogged or ignored.

1. **HIGH — wrong SDK claim (§8).** Addressed. Verified via `xcodebuild -showsdks` that the only installed iOS SDK is **18.5**. §8 no longer says "18.6"; it now says "the iOS SDK bundled with Xcode 16.4 (iOS 18.5 in this environment)" and instructs the implementer to let `xcodebuild` select the installed runtime instead of hardcoding a patch.
2. **HIGH — `startFocusSession` rollback failure mode (§4.3 step 3b).** Addressed. Rollback is now a best-effort, observable sequence: clear `shield.applications`/`.applicationCategories` to `nil`, call `stopMonitoring` inside `do/catch` capturing any secondary error, skip session persistence, reject `E_SHIELD_FAILED` with the secondary error attached. The resulting state is defined precisely, and §4.3 step 4 now states `stopFocusSession()` idempotency explicitly covers "stop when nothing was persisted," reading the activity/store ids from constants so it can force-clear a stranded schedule.
3. **MEDIUM — `expo-device`/`expo-constants` unpinned (§2).** Addressed. Both added to the §2 table: `expo-device ~8.0.10` and `expo-constants ~18.0.14` (SDK 54 bundled ranges).
4. **MEDIUM — ambiguous Expo Go detection (§6).** Addressed. §6 step 3 is now a single deterministic rule — report `ExpoGo` when the focus native module is absent/unregistered — and explicitly does **not** branch on `Constants.appOwnership`.
5. **MEDIUM — availability-check ordering (§6).** Addressed. Order is now NotIOS → **Simulator** → ExpoGo → OSTooOld → NotAuthorized, with the rationale stated: Simulator is a hard platform fact (`!Device.isDevice`) that must win over module-load heuristics, so a simulator is never mislabeled "Expo Go."
6. **MEDIUM — selection serialization unspecified (§4.1/§4.2).** Addressed via new **§4.4**: `JSONEncoder`-encode the whole `FamilyActivitySelection` to app-group `UserDefaults` key `selection.v1` as `Data`; `startFocusSession` decodes and reads `.applicationTokens`/`.categoryTokens`; JS `summary` is derived counts (`"<n> apps, <m> categories"`); tokens never cross the bridge.
7. **NIT — `getSelection()` return shape mismatch (§4.1/§4.2).** Addressed. `FocusSelection` is now defined once in `types.ts` as `{ summary: string }` and referenced consistently by both `presentActivityPicker()` and `getSelection()`.
8. **NIT — `durationSeconds` validation (§4.1/§4.3).** Addressed via new **§4.5**: reject `E_INVALID_DURATION` unless a finite integer in `[60, 86400]`; validated on JS before the bridge and defensively in Swift.
9. **NIT — picker cancellation not in JS contract (§4.1/§4.2).** Addressed. §4.2 defines a distinct `FocusCancelledError` (separate from `FocusUnavailableError`); `presentActivityPicker()` rejects it on dismissal and the Home caller treats cancellation as a no-op.
10. **NIT — reanimated/gesture-handler omission (§2).** Addressed. §2 now states Phase 1 uses only native-stack and intentionally excludes `react-native-reanimated` / `react-native-gesture-handler`, noting the SDK 54 bundled versions available if a later phase needs them.

Additionally, the review's "unverified assumption" about floating React Navigation pins is resolved: §2 now pins the resolved patch versions (`@react-navigation/native 7.5.1`, `@react-navigation/native-stack 7.21.0`) and instructs the implementer to lock whatever `npm install` resolves into `package-lock.json`.

## 11. Responses to the Current Design Review (pass 2)

Review source: `/Users/Shared/goalie/.agents/tasks/design-review.json` (verdict `CHANGES_REQUESTED`, 0 HIGH / 3 MEDIUM / 6 NIT). All nine findings are **addressed**; none backlogged or ignored. Every change aligns with the original brief (honest unavailability, schedule-before-shield invariant, preserved content/validator, compile-only ceiling).

1. **MEDIUM — domain catalog types & parse-failure behavior unspecified.** Addressed via new **§3.1**: concrete `Lesson`/`Level`/`Track`/`Catalog` types plus a `CatalogError`, a `loadCatalog(raw: unknown): Catalog` contract that re-validates (schemaVersion===1, non-empty unique track ids, exactly `beginner/intermediate/advanced` in order, required non-empty strings) and throws on the first violation without returning partials, and five named unit tests (valid, wrong-schema, missing-level, duplicate-id, order). §8's `npm test` row now names these.
2. **MEDIUM — availability layer async shape undefined.** Addressed in **§4.2 and §6**: entry point is `export async function getFocusAvailability(): Promise<FocusAvailability>`; steps 1–4 are synchronous guards (no bridge call on web/Android/simulator/Expo Go) and only step 5 awaits the native status. If the step-5 call rejects, availability resolves `{ available:false, reason: NotAuthorized }` (fail-closed). The Home screen `await`s it.
3. **MEDIUM — iOS major-version source unspecified.** Addressed in **§6 step 4**: read `Device.osVersion` (expo-device), major = `parseInt(osVersion, 10)`, `NaN` → OSTooOld (fail-closed), minimum major 16, with worked examples and a named parse unit test added to §8.
4. **NIT — `FocusSession.id` generation unspecified.** Addressed in **§4.1 and §4.3 step c**: Swift mints `id = UUID().uuidString` at persist time and stores it under `session.v1`, so `getActiveSession()` returns the identical id.
5. **NIT — concurrent `startFocusSession` behavior undefined.** Addressed in **§4.1 and §4.3 step 3.0**: start is **not** idempotent — if a `session.v1` already exists it rejects `E_SESSION_ACTIVE`; restarting requires `stopFocusSession()` first. Prevents double-scheduling/orphaned schedules.
6. **NIT — app-group key namespace partially specified.** Addressed via the new constants table in **§4.4**: `group.com.goalie.app.focus`, `selection.v1`, `session.v1`, store name `goalie.focus`, activity `goalie.focus.session`, all sourced from one shared `GoalieFocusConstants.swift` compiled into both the main module and the extension.
7. **NIT — inaccurate SDK tag characterization.** Addressed in **§2 and §9**: restated as "54 is the chosen settled line; 55–58 exist as newer stable lines (58 is `next`/`latest`), but 54 has the known-good matrix for a foundational native build," no longer mislabeling 55/56 as canary.
8. **NIT — React Navigation pin wording risked a cross-7.x float.** Addressed in **§2**: write exact versions with no caret (`7.5.1` / `7.21.0`) into `package.json`, commit the resulting `package-lock.json`, and record the resolved patch back into the §2 table after install. The verified peer deps are noted in the table.
9. **NIT — placeholder modules had no defined surface.** Addressed via new **§3.2**: each of `assessment`/`rewards`/`progression`/`certificates` exports a named typed function that throws `NotImplementedError`, with a trivial contract test, so §8's "placeholders behave as specified" is accurate.

## 12. Responses to the Current Design Review (pass 3)

Review source: `/Users/Shared/goalie/.agents/tasks/design-review.json` (verdict `CHANGES_REQUESTED`, 0 HIGH / 2 MEDIUM / 3 NIT). All five findings are **addressed**; none backlogged or ignored. Every change holds the original brief (honest unavailability, schedule-before-shield invariant, preserved `content/tracks.json` + `scripts/validate-catalog.mjs`, compile-only ceiling).

1. **MEDIUM (§5) — how the config plugin creates the DeviceActivityMonitor extension target was unspecified.** Addressed in **§5 item 3 / new §5.1** and **§7**. `@expo/config-plugins@54.0.6` (the `sdk-54` dist-tag and the version that resolves transitively under `expo@54.0.38`) has no high-level app-extension helper, so the plugin uses its exported **`withXcodeProject` + `xcode@^4.0.0`-library escape hatch** (chosen over a community plugin for auditability), and §5.1 enumerates every required `pbxproj` mutation: app-extension `PBXNativeTarget`; a Sources phase compiling `GoalieMonitor.swift` (+ shared `GoalieFocusConstants.swift`); dedicated extension entitlements with Family Controls + App Groups; `Info.plist` `NSExtensionPointIdentifier=com.apple.deviceactivity.monitor-extension`; `IPHONEOS_DEPLOYMENT_TARGET=16.0`; and a `PBXCopyFilesBuildPhase` with `dstSubfolderSpec=13` ("Embed App Extensions") plus a target dependency on the main app. §7 adds a note that this pbxproj target injection is the **top compile-only risk**. (Main-app entitlements via `withEntitlementsPlist`, §5 item 1, stay separate.)
2. **MEDIUM (§8 vs §3) — Expo app name/slug the hardcoded workspace/scheme derived from were unpinned.** Addressed in **§2 (new "Expo app identity (PINNED)" note) and §3**: `name: "Goalie"`, `slug: "goalie"`, with the note that `expo prebuild` derives `ios/Goalie.xcworkspace` / scheme `Goalie` from `name`. The §8 compile command is also made **robust**: it now derives the workspace via `ios/*.xcworkspace` and the scheme at runtime via `xcodebuild -list` instead of hardcoding `Goalie`, so a rename cannot break verification.
3. **NIT (§6 step 4) — `Device.osVersion` typed as `string` but actually `string | null`.** Addressed in **§6 step 4** (and the §8 test row): the type is stated as `string | null` for `expo-device@8.0.10`; `null`/empty/malformed → `parseInt` → `NaN` → treated as `OSTooOld` (fail-closed). A `null → OSTooOld` worked example is added to §6 and to the §8 parse-rule test list.
4. **NIT (§4.3 step c) — `selectionSummary` persisted into `session.v1` not said to be recomputed.** Addressed in **§4.3 step c**: `selectionSummary` is recomputed by decoding `selection.v1` and formatting `"<n> apps, <m> categories"` (same derivation as §4.4), guaranteeing the session summary matches the selection used to build the shield — never a stale/empty value carried from picker time.
5. **NIT (§4.3 step 3.0 vs 3b) — orphaned-schedule retry could double-schedule.** Addressed in **§4.3 step a**: `startFocusSession` now defensively calls `DeviceActivityCenter().stopMonitoring([activityName])` inside a `do/catch` **before** `startMonitoring`, regardless of session state, clearing any orphaned schedule left by a prior failed start whose rollback `stopMonitoring` threw — so a retry can never double-schedule the same activity name even though the `E_SESSION_ACTIVE` guard keys only off `session.v1`.

## 13. Responses to the Fix Re-Review (pass 3 re-review)

Review source: `/Users/Shared/goalie/.agents/tasks/design-fix-review.json` (verdict `CHANGES_REQUESTED`, 0 HIGH / 1 MEDIUM / 1 NIT) — a focused re-review of the five §12 fixes. Fixes 2–5 were confirmed correctly and completely addressed and are unchanged. The two new findings are **addressed**; none backlogged or ignored. Both changes hold the original brief (honest unavailability, schedule-before-shield invariant, preserved `content/tracks.json` + `scripts/validate-catalog.mjs`, compile-only ceiling).

1. **MEDIUM (§5 item 3 / §5.1 / §7 / §12 item 1) — config-plugins version attribution was wrong and labeled "verified."** Addressed in **§5.1** and **§12 item 1**. The design previously cited `expo-config-plugins@58.0.10` as "the version resolved under Expo SDK 54." That is wrong: `expo@54.0.38` depends on `@expo/config-plugins ~54.0.6`, the `sdk-54` dist-tag is `54.0.6`, and `58.0.10` is the `latest`/SDK-58 line (all re-confirmed against the npm registry this pass). Every mention of `58.0.10` is removed; the mechanism is now attributed to **`@expo/config-plugins@54.0.6`** (the `sdk-54` dist-tag / transitive dep of `expo@54.0.38`, so it stays out of the §2 pin table), and §5.1 now states its bundled pbxproj library is **`xcode@^4.0.0`** (a direct dependency of `54.0.6`) and that `withXcodeProject` is exported there. The mechanism itself was already correct and feasible under `54.0.6` (confirmed: `withXcodeProject` exported, `xcode@^4.0.0` present), so only the version string changed. §7's "top compile-only risk" note referenced the escape hatch generically with no version, so it needed no edit.
2. **NIT (§8 compile command) — `schemes[0]` assumed the app scheme is first.** Addressed in **§8**. The runtime scheme derivation now selects the scheme matching the pinned `name` with `schemes[0]` as fallback (`schemes.find(x => x === "Goalie") ?? schemes[0]`), and the row explains that Expo prebuild emits a single shared app scheme named after `name` while the DeviceActivityMonitor (and optional ShieldConfiguration) app-extension target does not generate its own shared scheme — so a multi-scheme workspace can no longer cause the wrong scheme to be built.
