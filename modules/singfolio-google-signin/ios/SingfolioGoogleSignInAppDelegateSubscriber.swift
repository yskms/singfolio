import ExpoModulesCore
import GoogleSignIn

// SDK の説明どおり、アプリに渡された URL を GIDSignIn に渡し、Google のサインインの URL だったら true を返す。
// - 普段は、ここに URL は来ない。Googleのリダイレクトは、ASWebAuthenticationSession が直接受け取る
//   （AppAuth。iOS 12 以降）。GIDSignIn.handleURL が要るのは、iOS 10 の SFSafariViewController と、Google Device
//   Policy アプリ（EMM）のときだけ（SDK の GIDSignIn.m のコメント）。
// - 戻り値は、他の購読者や JS（expo-linking・expo-router）への配送を変えない。ExpoAppDelegateSubscriberManager は、
//   戻り値に関わらず、すべての購読者を呼ぶ。UIScene 採用後は、ExpoAppSceneDelegate の SceneEventForwarder が、
//   AppDelegate の戻り値を捨てて（`_ = delegate?.application(...)`）、RCTLinkingManager にも通知する
//   （plugins/withIosSceneDelegate.js。UIScene 採用前の AppDelegate の上書きは、戻り値が false のときだけ
//   RCTLinkingManager を呼ぶ）。したがって、true を返しても、Googleの URL が JS の Linking に届くことは防げない。
public class SingfolioGoogleSignInAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return GIDSignIn.sharedInstance.handle(url)
  }
}
