import ExpoModulesCore
import GoogleSignIn

// SDK の説明どおり、アプリに渡された URL を GIDSignIn に渡す。UIScene 採用後は、
// ExpoAppSceneDelegate が ExpoAppDelegate へ転送し、ここに届く（plugins/withIosSceneDelegate.js）。
// false を返すので、他の購読者（expo-linking など）にも URL は届く。
public class SingfolioGoogleSignInAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    _ = GIDSignIn.sharedInstance.handle(url)
    return false
  }
}
