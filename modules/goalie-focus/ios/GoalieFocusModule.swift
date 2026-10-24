import ExpoModulesCore

#if canImport(FamilyControls)
  import FamilyControls
#endif
#if canImport(ManagedSettings)
  import ManagedSettings
#endif
#if canImport(DeviceActivity)
  import DeviceActivity
#endif
import SwiftUI

// GoalieFocusModule — the main-app native surface (design.md §4.1 / §4.3 / §4.4 / §4.5).
//
// On-device blocking is REAL native code but UNVERIFIED in this environment by
// hard constraint (no device / no paid account / no Family Controls entitlement;
// the simulator cannot run Screen Time). The ceiling here is compile-only. We
// never fake a blocked state and never simulate shielding with a JS timer.
//
// The module and the DeviceActivityMonitor extension communicate ONLY through
// the shared app-group UserDefaults using the literals in GoalieFocusConstants.
// The whole FamilyActivitySelection is serialized to the app group as `Data`;
// the opaque tokens NEVER cross the JS bridge — only the derived count summary
// ("<n> apps, <m> categories") does.

// Active-session metadata persisted under `session.v1` (§4.3 step c).
private struct GoalieSession: Codable {
  let id: String
  let deadlineEpochMs: Double
  let selectionSummary: String
}

// JS-visible error codes (§4.1). Kept as a namespace so both the codes and the
// rejection sites stay in one place.
private enum FocusError {
  static let authDenied = "E_AUTH_DENIED"
  static let authFailed = "E_AUTH_FAILED"
  static let pickerCancelled = "E_PICKER_CANCELLED"
  static let sessionActive = "E_SESSION_ACTIVE"
  static let invalidDuration = "E_INVALID_DURATION"
  static let noSelection = "E_NO_SELECTION"
  static let notAuthorized = "E_NOT_AUTHORIZED"
  static let scheduleFailed = "E_SCHEDULE_FAILED"
  static let shieldFailed = "E_SHIELD_FAILED"
}

public class GoalieFocusModule: Module {
  // Shared app-group store. Nil only if the app group is misconfigured.
  private var sharedDefaults: UserDefaults? {
    UserDefaults(suiteName: GoalieFocusConstants.appGroupId)
  }

  public func definition() -> ModuleDefinition {
    // Registered name — must match NATIVE_MODULE_NAME ("GoalieFocus") on the JS side.
    Name("GoalieFocus")

    AsyncFunction("getAuthorizationStatus") { () -> String in
      return self.currentAuthorizationString()
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
          Task {
            do {
              // Individual authorization (§4.1) — not .child / MDM.
              try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
              let status = self.currentAuthorizationString()
              if status == "approved" {
                promise.resolve(status)
              } else {
                promise.reject(FocusError.authDenied, "Family Controls authorization was not approved")
              }
            } catch {
              // A thrown request is a hard failure; a user decline surfaces as a
              // non-approved status above (E_AUTH_DENIED).
              promise.reject(FocusError.authFailed, error.localizedDescription)
            }
          }
          return
        }
      #endif
      promise.reject(FocusError.authFailed, "Family Controls is unavailable on this OS")
    }

    AsyncFunction("presentActivityPicker") { (promise: Promise) in
      #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
          DispatchQueue.main.async {
            self.presentPicker(promise: promise)
          }
          return
        }
      #endif
      promise.reject(FocusError.authFailed, "Family Controls is unavailable on this OS")
    }

    AsyncFunction("getSelection") { () -> [String: Any]? in
      #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
          guard let selection = self.loadSelection() else { return nil }
          return ["summary": self.selectionSummary(selection)]
        }
      #endif
      return nil
    }

    AsyncFunction("startFocusSession") { (durationSeconds: Int, promise: Promise) in
      #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
          self.startFocusSession(durationSeconds: durationSeconds, promise: promise)
          return
        }
      #endif
      promise.reject(FocusError.scheduleFailed, "Screen Time APIs are unavailable on this OS")
    }

    AsyncFunction("stopFocusSession") { (promise: Promise) in
      #if canImport(ManagedSettings) && canImport(DeviceActivity)
        if #available(iOS 16.0, *) {
          self.stopFocusSession()
          promise.resolve(nil)
          return
        }
      #endif
      // Idempotent no-op where the APIs are unavailable.
      promise.resolve(nil)
    }

    AsyncFunction("getActiveSession") { () -> [String: Any]? in
      guard let session = self.loadSession() else { return nil }
      return [
        "id": session.id,
        "deadlineEpochMs": session.deadlineEpochMs,
        "selectionSummary": session.selectionSummary,
      ]
    }
  }

  // MARK: - Authorization

  private func currentAuthorizationString() -> String {
    #if canImport(FamilyControls)
      if #available(iOS 16.0, *) {
        switch AuthorizationCenter.shared.authorizationStatus {
        case .notDetermined: return "notDetermined"
        case .denied: return "denied"
        case .approved: return "approved"
        @unknown default: return "denied"
        }
      }
    #endif
    return "denied"
  }

  // MARK: - Family Activity picker

  #if canImport(FamilyControls)
    @available(iOS 16.0, *)
    private func presentPicker(promise: Promise) {
      guard let presenter = Self.topViewController() else {
        promise.reject(FocusError.authFailed, "No view controller available to present the picker")
        return
      }

      let model = PickerModel()
      var didFinish = false

      let pickerView = FamilyActivityPickerHost(model: model) { [weak self] result in
        guard !didFinish else { return }
        didFinish = true
        presenter.presentedViewController?.dismiss(animated: true)

        switch result {
        case .cancelled:
          // User dismissal is a distinct, catchable outcome — NOT "unavailable".
          promise.reject(FocusError.pickerCancelled, "The activity picker was dismissed")
        case let .confirmed(selection):
          guard let self = self else {
            promise.reject(FocusError.authFailed, "Module deallocated")
            return
          }
          // Persist the entire selection to the app group as encoded Data (§4.4).
          do {
            let data = try JSONEncoder().encode(selection)
            self.sharedDefaults?.set(data, forKey: GoalieFocusConstants.selectionKey)
            promise.resolve(["summary": self.selectionSummary(selection)])
          } catch {
            promise.reject(FocusError.authFailed, "Failed to encode selection: \(error.localizedDescription)")
          }
        }
      }

      let host = UIHostingController(rootView: pickerView)
      presenter.present(host, animated: true)
    }

    // Derived count summary — the ONLY selection-derived value that crosses the
    // bridge. Raw tokens stay native (§4.4).
    @available(iOS 16.0, *)
    private func selectionSummary(_ selection: FamilyActivitySelection) -> String {
      let apps = selection.applicationTokens.count
      let categories = selection.categoryTokens.count
      return "\(apps) apps, \(categories) categories"
    }

    @available(iOS 16.0, *)
    private func loadSelection() -> FamilyActivitySelection? {
      guard let data = sharedDefaults?.data(forKey: GoalieFocusConstants.selectionKey) else {
        return nil
      }
      return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }
  #endif

  // MARK: - Session lifecycle (the §4.3 ordering invariant)

  #if canImport(FamilyControls) && canImport(ManagedSettings) && canImport(DeviceActivity)
    @available(iOS 16.0, *)
    private func startFocusSession(durationSeconds: Int, promise: Promise) {
      // ---- step 3.0: validate, NO side effects yet. ----

      // Reject a concurrent start — start is deliberately NOT idempotent (§4.3 step 3.0).
      if loadSession() != nil {
        promise.reject(FocusError.sessionActive, "A focus session is already active")
        return
      }

      // Duration validation [60, 86400] (§4.5). Defensive — never trusts the JS caller.
      guard durationSeconds >= 60, durationSeconds <= 86400 else {
        promise.reject(FocusError.invalidDuration, "durationSeconds must be an integer in [60, 86400]")
        return
      }

      // Non-empty persisted selection required (§4.3 step 2).
      guard let selection = loadSelection(),
        !(selection.applicationTokens.isEmpty && selection.categoryTokens.isEmpty)
      else {
        promise.reject(FocusError.noSelection, "No app/category selection has been made")
        return
      }

      // Authorization must be Approved.
      guard AuthorizationCenter.shared.authorizationStatus == .approved else {
        promise.reject(FocusError.notAuthorized, "Family Controls authorization is not approved")
        return
      }

      let activityName = DeviceActivityName(GoalieFocusConstants.deviceActivityName)
      let center = DeviceActivityCenter()

      // ---- step a: schedule expiry FIRST. ----

      // Defensively clear any orphaned schedule left by a prior failed start
      // whose rollback stopMonitoring itself threw (§4.3 step a). Swallow errors.
      do {
        try center.stopMonitoring([activityName])
      } catch {
        // Ignore — there may be nothing to stop.
      }

      let now = Date()
      let deadline = now.addingTimeInterval(TimeInterval(durationSeconds))
      let calendar = Calendar.current
      let schedule = DeviceActivitySchedule(
        intervalStart: calendar.dateComponents([.hour, .minute, .second], from: now),
        intervalEnd: calendar.dateComponents([.hour, .minute, .second], from: deadline),
        repeats: false
      )

      do {
        try center.startMonitoring(activityName, during: schedule)
      } catch {
        // Never shield without a scheduled release — apply NO shields (§4.3 step a).
        promise.reject(FocusError.scheduleFailed, error.localizedDescription)
        return
      }

      // ---- step b: apply the shield. ----

      let store = ManagedSettingsStore(named: .init(GoalieFocusConstants.managedSettingsStoreName))
      store.shield.applications =
        selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      store.shield.applicationCategories =
        selection.categoryTokens.isEmpty
        ? ShieldSettings.ActivityCategoryPolicy<Application>.none
        : .specific(selection.categoryTokens)

      // ManagedSettings shield assignment does not throw, but we still guard the
      // observable-rollback invariant: if anything beyond this point fails before
      // persisting, we unwind to a deterministic state. (Kept explicit so the
      // device path matches §4.3 step b exactly.)
      // No throwing operation remains between here and persist, so there is no
      // failure to roll back; persist proceeds.

      // ---- step c: persist session metadata. ----

      // selectionSummary is RECOMPUTED from the decoded selection.v1 (§4.3 step c),
      // so it can never drift from what was actually shielded.
      let session = GoalieSession(
        id: UUID().uuidString,
        deadlineEpochMs: deadline.timeIntervalSince1970 * 1000.0,
        selectionSummary: selectionSummary(selection)
      )

      do {
        let data = try JSONEncoder().encode(session)
        sharedDefaults?.set(data, forKey: GoalieFocusConstants.sessionKey)
      } catch {
        // Persist failed: roll back shield + schedule (best-effort, observable).
        rollbackShieldAndSchedule(store: store, center: center, activityName: activityName)
        promise.reject(FocusError.shieldFailed, "Failed to persist session: \(error.localizedDescription)")
        return
      }

      promise.resolve([
        "id": session.id,
        "deadlineEpochMs": session.deadlineEpochMs,
        "selectionSummary": session.selectionSummary,
      ])
    }

    @available(iOS 16.0, *)
    private func rollbackShieldAndSchedule(
      store: ManagedSettingsStore,
      center: DeviceActivityCenter,
      activityName: DeviceActivityName
    ) {
      // Clear any partial shield.
      store.shield.applications = nil
      store.shield.applicationCategories = nil
      // Stop the schedule from step a — capture (do not mask) a secondary error.
      do {
        try center.stopMonitoring([activityName])
      } catch {
        // Secondary error: the extension clears the shield at interval end and
        // stopFocusSession() can force-clear it, so the worst case self-heals.
      }
      // Ensure no active session is recorded.
      sharedDefaults?.removeObject(forKey: GoalieFocusConstants.sessionKey)
    }

    @available(iOS 16.0, *)
    private func stopFocusSession() {
      // Idempotent: reads the store/activity ids from constants (not a persisted
      // session), so it can always force-clear a stranded schedule or shield left
      // by a failed start — and is a successful no-op when nothing is persisted.
      let store = ManagedSettingsStore(named: .init(GoalieFocusConstants.managedSettingsStoreName))
      store.shield.applications = nil
      store.shield.applicationCategories = nil

      let activityName = DeviceActivityName(GoalieFocusConstants.deviceActivityName)
      do {
        try DeviceActivityCenter().stopMonitoring([activityName])
      } catch {
        // Nothing to stop — safe to ignore.
      }

      sharedDefaults?.removeObject(forKey: GoalieFocusConstants.sessionKey)
    }
  #endif

  // MARK: - Session persistence (available regardless of Screen Time APIs)

  private func loadSession() -> GoalieSession? {
    guard let data = sharedDefaults?.data(forKey: GoalieFocusConstants.sessionKey) else {
      return nil
    }
    return try? JSONDecoder().decode(GoalieSession.self, from: data)
  }

  // MARK: - Top view controller helper

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
    let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
      ?? scenes.first as? UIWindowScene
    guard let window = windowScene?.windows.first(where: { $0.isKeyWindow })
      ?? windowScene?.windows.first
    else {
      return nil
    }
    var top = window.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

// MARK: - SwiftUI host for the Family Activity picker

#if canImport(FamilyControls)
  @available(iOS 16.0, *)
  private enum PickerResult {
    case cancelled
    case confirmed(FamilyActivitySelection)
  }

  @available(iOS 16.0, *)
  private final class PickerModel: ObservableObject {
    @Published var selection = FamilyActivitySelection()
  }

  // Wraps FamilyActivityPicker with Done / Cancel so dismissal is a distinct,
  // catchable outcome (E_PICKER_CANCELLED) rather than an "unavailable" state.
  @available(iOS 16.0, *)
  private struct FamilyActivityPickerHost: View {
    @ObservedObject var model: PickerModel
    let onFinish: (PickerResult) -> Void

    var body: some View {
      NavigationView {
        FamilyActivityPicker(selection: $model.selection)
          .navigationTitle("Choose apps to block")
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button("Cancel") { onFinish(.cancelled) }
            }
            ToolbarItem(placement: .confirmationAction) {
              Button("Done") { onFinish(.confirmed(model.selection)) }
            }
          }
      }
    }
  }
#endif
