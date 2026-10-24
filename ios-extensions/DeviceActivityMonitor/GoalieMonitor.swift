import DeviceActivity
import Foundation
import ManagedSettings

// DeviceActivityMonitor extension (design.md §4.3 step 5).
//
// This runs in a SEPARATE process from the main app. When the scheduled focus
// interval ends — even while the main app is not running — the system calls
// intervalDidEnd(for:), and we clear the SAME named ManagedSettingsStore the
// main app shielded. This is exactly why the schedule MUST exist before the
// shield (§4.3 step a): the release path lives here, decoupled from the app.
//
// It references GoalieFocusConstants (compiled into this target by the config
// plugin) so the store name and activity name match the main app bit-for-bit.
class GoalieMonitor: DeviceActivityMonitor {
  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)

    // Only react to Goalie's own activity.
    guard activity == DeviceActivityName(GoalieFocusConstants.deviceActivityName) else {
      return
    }

    // Clear the shield on the same named store the main app used.
    let store = ManagedSettingsStore(named: .init(GoalieFocusConstants.managedSettingsStoreName))
    store.shield.applications = nil
    store.shield.applicationCategories = nil

    // Remove the persisted active-session metadata so the app reflects "no
    // active session" on next launch.
    UserDefaults(suiteName: GoalieFocusConstants.appGroupId)?
      .removeObject(forKey: GoalieFocusConstants.sessionKey)
  }
}
