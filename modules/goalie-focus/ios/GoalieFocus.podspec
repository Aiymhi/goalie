require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'GoalieFocus'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Goalie'
  s.homepage       = 'https://github.com/goalie/goalie'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Family Controls / ManagedSettings / DeviceActivity are weak-linked system
  # frameworks (iOS 16+). The module guards every call with #available / canImport.
  s.weak_frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # GoalieFocusConstants.swift is also compiled into the DeviceActivityMonitor
  # extension target by the config plugin; it lives here as the single source.
  s.source_files = '**/*.{h,m,swift}'
end
