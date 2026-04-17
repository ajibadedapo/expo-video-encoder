require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoVideoEncoder'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = { :type => 'MIT', :file => 'LICENSE' }
  s.homepage       = package['homepage']
  s.authors        = { 'AJIBADE HAMMED ADEDAPO' => 'ajibadehammed@gmail.com' }
  s.platform       = :ios, '13.4'
  s.source         = { :git => package.dig('repository', 'url'), :tag => "v#{package['version']}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files   = 'ios/**/*.{swift,m,h}'
  s.swift_version  = '5.4'

  s.frameworks     = 'AVFoundation', 'UIKit', 'CoreVideo'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE'          => 'YES',
    'SWIFT_COMPILATION_MODE'  => 'wholemodule'
  }
end
