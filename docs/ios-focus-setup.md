# Goalie iOS Focus — Setup, Signing, and Device Verification

This document is the operator's guide to the Goalie focus-blocking feature on iOS. It records the exact entitlement / app-group / bundle-id / signing wiring the Expo config plugin injects, the Apple paid-account process for obtaining the restricted Family Controls entitlement, the exact commands and manual Xcode steps to build onto a physical iPhone and verify the full flow, and — most importantly — an honest statement of what has and has **not** been verified in the environment this code was built in.

Source of truth for every decision here is `/.agents/tasks/design.md` (section 7 in particular). This doc does not redesign anything; it documents the wiring the plugin already produces.

---

## ⚠️ READ FIRST: on-device blocking is UNVERIFIED in this environment

**All on-device blocking in Goalie is UNVERIFIED here. The verification ceiling in this environment is COMPILE-ONLY.** The focus code is real native Swift (Family Controls / ManagedSettings / DeviceActivity), written to run correctly on a real device — but nothing in this environment can prove it actually shields apps.

Precisely why, point by point:

1. **No physical iPhone.** Family Controls, ManagedSettings, and DeviceActivity only do real work on a real device. There is no device here to run them on.
2. **The iOS Simulator cannot execute Screen Time APIs.** The simulator does not implement Family Controls / ManagedSettings / DeviceActivity — authorization and shield calls are no-ops or fail. A simulator run can never demonstrate real blocking.
3. **No paid Apple Developer account / no Family Controls entitlement.** `com.apple.developer.family-controls` is a *restricted* entitlement that Apple must grant by request to a **paid** Developer account. Without it, a device build cannot be signed to actually authorize or shield.

**Consequence:** the `authorize → pick → shield → remove → expiry` behavior is written for real but **cannot be exercised here**. Compiling proves the Swift module and extensions are well-formed and that the targets/entitlements are structurally wired; it proves **nothing** about runtime shielding, shield release at the deadline, or that authorization succeeds. The highest level of proof reachable here is: TypeScript type-checks, unit tests pass, and the native targets compile for an iPhone simulator with signing disabled.

**The app never fakes a blocked state.** The availability layer (`src/focus/availability.ts`) honestly reports focus protection as **unavailable** — with a specific reason — on web, Android, the iOS Simulator, an Expo Go / module-absent build, an OS older than iOS 16, or when authorization is not approved. It never shows a green "blocked" state it cannot back with real shielding, and it never simulates blocking with a JS timer.

If you are evaluating a demo: it is honest to say "on-device blocking is implemented as real native code but is not a runtime-verified capability in this build — here is exactly how it is wired and how it would be verified on a real device + paid account."

---

## 1. Exact wiring reference

These are the literal identifiers the Expo config plugin (`modules/goalie-focus/plugin/withGoalieFocus.ts`) injects into the generated `ios/` project during `expo prebuild`. They are defined once in `app.config.ts` / the plugin and must not drift.

| What | Exact value | Where it is set |
|---|---|---|
| Family Controls entitlement | `com.apple.developer.family-controls` (boolean `true`) | Main app entitlements **and** every extension's entitlements |
| App Groups entitlement | `com.apple.security.application-groups` | Main app + every extension |
| App group id | `group.com.goalie.app.focus` | `app.config.ts` (single source), injected everywhere |
| Main app bundle id | `com.goalie.app` | `app.config.ts` → `ios.bundleIdentifier` |
| DeviceActivityMonitor extension bundle id | `com.goalie.app.DeviceActivityMonitor` | Plugin (`withXcodeProject` pbxproj mutation) |
| ShieldConfiguration extension bundle id (optional) | `com.goalie.app.ShieldConfiguration` | Plugin (optional target) |
| Signing team placeholder | `DEVELOPMENT_TEAM = "<<APPLE_TEAM_ID>>"` | Plugin, written into every target's Debug + Release build settings |
| iOS deployment target | `16.0` (Family Controls minimum) | `expo-build-properties` (main app) + plugin (extension targets) |

Extension-point identifiers (set in each extension's `Info.plist` by the plugin):

- DeviceActivityMonitor → `com.apple.deviceactivity.monitor-extension`
- ShieldConfiguration (optional) → `com.apple.managedsettingsui.shield-configuration-service`

Shared app-group literals the main module and the DeviceActivityMonitor extension round-trip through (defined once in `GoalieFocusConstants.swift`, compiled into both targets — a single mismatched string silently breaks shield release):

| Constant | Exact literal |
|---|---|
| App group suite | `group.com.goalie.app.focus` |
| Selection key | `selection.v1` |
| Session key | `session.v1` |
| `ManagedSettingsStore` name | `goalie.focus` |
| `DeviceActivityName` | `goalie.focus.session` |

### Where to set the real signing team

`DEVELOPMENT_TEAM` is intentionally left as the obvious placeholder `<<APPLE_TEAM_ID>>` so an unsigned build fails loudly rather than silently using the wrong identity. Replace it with your real 10-character Apple Team ID (visible in the Apple Developer portal under Membership, and in Xcode under **Signing & Capabilities → Team**).

Two ways to set it, in order of preference:

1. **Permanent (survives `expo prebuild --clean`):** edit the placeholder in the config plugin so it is reinjected on every prebuild. Search `modules/goalie-focus/plugin/withGoalieFocus.ts` for `<<APPLE_TEAM_ID>>` and substitute your Team ID (or wire it to an env var the plugin reads at prebuild time). This is the durable fix because `ios/` is a regenerable prebuild artifact — a value set only in Xcode is wiped the next time you prebuild with `--clean`.
2. **One-off in Xcode (does NOT survive a clean prebuild):** in Xcode select each target (`Goalie`, `GoalieMonitor`, and the ShieldConfiguration target if enabled) → **Signing & Capabilities** → set **Team**. Use this only for a quick local test.

---

## 2. Requesting the restricted Family Controls entitlement (paid account)

`com.apple.developer.family-controls` is **not** self-service. It is a restricted entitlement that Apple grants by request to a **paid** Apple Developer Program account. Until Apple grants it, a device build using Family Controls cannot be signed to authorize or shield — the capability simply will not work on the device, regardless of how correct the code is.

Process:

1. Enroll in the **Apple Developer Program** (paid). A free account cannot hold this entitlement.
2. Submit the entitlement request to Apple. Apple provides a request form for Family Controls (Screen Time API) distribution usage; describe Goalie's use case — the user voluntarily blocks their own selected apps during a focus session (**Individual** authorization, not parent/child or MDM). Confirm the current request route in Apple's Family Controls documentation, as the exact form/location changes over time.
3. Wait for Apple to approve and attach the entitlement to your account/App ID. This is a manual review on Apple's side and is not instantaneous.
4. After approval, ensure the App ID for `com.goalie.app` (and the extension App IDs) carries the Family Controls capability, then let the signing identity pick it up (regenerate provisioning as needed).

**Development vs distribution note:** for *development* on a device you may be able to run with the entitlement present in the build while Apple's review is pending, but *distribution* (TestFlight / App Store) requires Apple's grant. Treat the grant as a hard prerequisite for any shareable build.

Without the grant, every device build here would still land in the honest "unavailable" state rather than shielding anything.

---

## 3. Build onto a physical iPhone and verify the full flow

Prerequisites: a paid Developer account with the Family Controls entitlement granted (section 2), a physical iPhone running **iOS 16.0 or later**, a USB cable (and/or the device enrolled for wireless debugging), and `DEVELOPMENT_TEAM` set to your real Team ID (section 1).

### 3.1 Generate the native project and set signing

Run from the repo root (`/Users/Shared/goalie`):

```bash
# 1. Install JS deps (if not already)
npm install

# 2. Generate ios/ from config + the plugin (entitlements, app group, extension targets)
npx expo prebuild --platform ios --clean

# 3. Install CocoaPods for the generated project
cd ios && pod install && cd ..

# 4. Open the generated workspace in Xcode
open ios/*.xcworkspace
```

### 3.2 Manual Xcode steps

1. **Set the team.** For each target — `Goalie` (main app), `GoalieMonitor` (DeviceActivityMonitor extension), and the ShieldConfiguration target if enabled — open **Signing & Capabilities** and select your **Team**. Confirm each target shows **Family Controls** and **App Groups** (`group.com.goalie.app.focus`) under its capabilities. (Prefer setting the team in the plugin per section 1 so it survives a clean prebuild.)
2. **Trust the device.** Plug in the iPhone. On the device, tap **Trust** when prompted. On first install you may also need **Settings → General → VPN & Device Management** on the phone to trust your developer certificate.
3. **Select scheme + destination.** In Xcode's toolbar choose the **`Goalie`** scheme and select your **physical iPhone** as the run destination (not a simulator).
4. **Run.** Press **Run** (⌘R). Xcode builds, signs with your team, installs, and launches Goalie on the device.

CLI alternative to the Xcode Run button (optional), once the team is set and the device is trusted:

```bash
# Derive the workspace and the app scheme at runtime (do not hardcode)
WS=$(ls -d ios/*.xcworkspace)
SCHEME=$(xcodebuild -list -workspace "$WS" -json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).workspace.schemes;console.log(a.find(x=>x==="Goalie")??a[0])})')

# Build for the connected device by its id (xcrun xctrace list devices shows ids)
xcodebuild -workspace "$WS" -scheme "$SCHEME" \
  -destination 'platform=iOS,id=<YOUR_DEVICE_UDID>' \
  build
```

### 3.3 Verify the full `authorize → pick → shield → remove → expiry` flow

On the device, step through the flow and confirm each stage. This is the only place the feature can actually be proven.

1. **Authorize.** Trigger authorization. iOS presents the system Family Controls (Screen Time) consent sheet. Approve it.
   - ✅ Expect: authorization status becomes `approved`; the app no longer reports "focus protection unavailable (not authorized)".
2. **Pick.** Open the app picker. iOS presents Apple's `FamilyActivityPicker`. Select one or more apps and/or categories and confirm.
   - ✅ Expect: the selection persists (summary like `"2 apps, 1 categories"`); dismissing the picker instead is a clean no-op (no error, no state change).
3. **Shield.** Start a focus session with a short duration (e.g. 60 seconds — the minimum). Then background Goalie and open one of the selected apps.
   - ✅ Expect: the selected app shows the iOS **shield** (blocked) screen. The schedule is created *before* the shield is applied (ordering invariant), so there is never a shield without a scheduled release.
4. **Remove (manual).** Return to Goalie and stop the session.
   - ✅ Expect: the shield clears immediately; the previously blocked app opens normally. Stopping when nothing is active is a safe no-op.
5. **Expiry while closed.** Start another short session, then **fully close Goalie** (swipe it away) and wait for the duration to elapse while a selected app would otherwise be shielded.
   - ✅ Expect: at the deadline the DeviceActivityMonitor extension's `intervalDidEnd(for:)` fires and clears the same named `ManagedSettingsStore`, so the shield lifts **even though the main app is not running**. Reopen the selected app and confirm it is no longer blocked.

If any stage fails, check (in order): the Family Controls entitlement is actually granted and present on all targets; the app group id matches on the main app and the extension; the `ManagedSettingsStore` name (`goalie.focus`) and `DeviceActivityName` (`goalie.focus.session`) literals match on both sides; and the device is on iOS 16+.

---

## 4. What *can* be checked here (compile-only ceiling)

These commands run and pass in this environment. They are the full extent of what can be verified without a device + paid entitlement.

```bash
cd /Users/Shared/goalie
npm run typecheck   # tsc --noEmit (strict) — TS domain/focus/ui + typed native API are type-sound
npm run lint        # eslint .
npm test            # jest-expo — catalog parse, placeholder contracts, availability precedence
node scripts/validate-catalog.mjs            # existing content catalog still valid
npx expo prebuild --platform ios --clean     # plugin generates ios/ with entitlements, app group, extension targets

# Compile ceiling: build the native targets for a simulator with signing disabled
WS=$(ls -d ios/*.xcworkspace)
SCHEME=$(xcodebuild -list -workspace "$WS" -json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).workspace.schemes;console.log(a.find(x=>x==="Goalie")??a[0])})')
xcodebuild -workspace "$WS" -scheme "$SCHEME" -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO build
```

Passing all of the above proves the code is well-formed and the targets/entitlements are structurally valid. It does **not** prove authorization, picker, shield apply/remove, or expiry-while-closed — see the warning at the top. Those are provable only on a physical iPhone with a paid account that holds the Family Controls entitlement, following section 3.
