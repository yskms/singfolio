import ExpoModulesCore
import GoogleSignIn

// Google の公式 SDK（GoogleSignIn-iOS）だけを使い、ID トークンを1回取り出して返す。
// - nonce は呼び出し側（Worker 発行の値から作る）が決める。ID トークンの nonce クレームに入る。
// - クライアント ID は Info.plist の GIDClientID / GIDServerClientID（plugins/withGoogleSignIn.js が書く）。
//   GIDServerClientID が ID トークンの aud になる。
// - Google の状態（ユーザー・リフレッシュトークン）は端末に残さない。トークンを返したらすぐ signOut する。
// - トークンはログに出さない（このファイルは print / NSLog を持たない）。
public class SingfolioGoogleSignInModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SingfolioGoogleSignIn")

    AsyncFunction("signIn") { (nonce: String, promise: Promise) in
      DispatchQueue.main.async {
        guard GIDSignIn.sharedInstance.configuration != nil else {
          promise.reject(Self.failure("ERR_NOT_CONFIGURED", "GIDClientID is missing from Info.plist"))
          return
        }
        guard let presenting = self.appContext?.utilities?.currentViewController() else {
          promise.reject(Self.failure("ERR_NO_PRESENTER", "No view controller to present the sign-in"))
          return
        }
        GIDSignIn.sharedInstance.signIn(
          withPresenting: presenting,
          hint: nil,
          additionalScopes: nil,
          nonce: nonce
        ) { result, error in
          if let error = error as NSError? {
            if error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
              promise.reject(Self.failure("ERR_CANCELED", "The user canceled the sign-in"))
            } else {
              promise.reject(Self.failure("ERR_FAILED", "Sign-in failed (\(error.domain) \(error.code))"))
            }
            return
          }
          guard let idToken = result?.user.idToken?.tokenString else {
            promise.reject(Self.failure("ERR_NO_ID_TOKEN", "The sign-in result has no ID token"))
            return
          }
          GIDSignIn.sharedInstance.signOut()
          promise.resolve(idToken)
        }
      }
    }
  }

  private static func failure(_ code: String, _ message: String) -> Exception {
    Exception(name: "SingfolioGoogleSignInException", description: message, code: code)
  }
}
