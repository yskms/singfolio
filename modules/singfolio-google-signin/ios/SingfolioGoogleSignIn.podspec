Pod::Spec.new do |s|
  s.name           = 'SingfolioGoogleSignIn'
  s.version        = '1.0.0'
  s.summary        = 'Google Sign-In (official SDK) wrapper for Singfolio'
  s.description    = 'Returns a Google ID token carrying a caller-supplied nonce. Uses only the official Google Sign-In SDK.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # 版は固定する（更新は、差分を確かめてから手で上げる）。
  # 10.1.0 で、iOS Simulator の実測を済ませている（nonce 付きの signIn で、ID トークンの nonce が一致し、
  # aud が Web クライアントになる）。nonce 付きの signIn の形と既定のスコープは、9.2.0 から変わっていない。
  # 10.x は AppAuth 3.0・GTMAppAuth 6.0・GTMSessionFetcher 5.x に上がり、iOS 15.0 以上が要る（9.2.0 は iOS 12.0 以上）。
  # 10.1.0 でも、Swift の Pod（AppCheckCore）が GoogleUtilities・RecaptchaInterop を import するので、
  # Podfile の modular headers の指定（plugins/withGoogleSignIn.js）は外せない（外すと `pod install` が失敗する）。
  s.dependency 'GoogleSignIn', '10.1.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
