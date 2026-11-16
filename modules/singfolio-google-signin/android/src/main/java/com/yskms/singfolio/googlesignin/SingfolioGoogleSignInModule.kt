package com.yskms.singfolio.googlesignin

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Google 公式の Credential Manager（Sign in with Google）だけを使い、ID トークンを1回取り出して返す。
// - nonce は呼び出し側（Worker 発行の値から作る）が決める。ID トークンの nonce クレームに入る。
// - サーバー用クライアント ID は、文字列リソース singfolio_google_web_client_id
//   （plugins/withGoogleSignIn.js が書く）。ID トークンの aud になる。
// - トークンはログに出さない（このファイルはログを持たない）。
class SingfolioGoogleSignInModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SingfolioGoogleSignIn")

    AsyncFunction("signIn") Coroutine { nonce: String ->
      val activity = appContext.currentActivity
        ?: throw CodedException("ERR_NO_PRESENTER", "No activity to present the sign-in", null)

      val resourceId = activity.resources.getIdentifier(
        "singfolio_google_web_client_id", "string", activity.packageName
      )
      if (resourceId == 0) {
        throw CodedException("ERR_NOT_CONFIGURED", "singfolio_google_web_client_id is missing", null)
      }

      val option = GetSignInWithGoogleOption.Builder(activity.getString(resourceId))
        .setNonce(nonce)
        .build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

      val credential = try {
        withContext(Dispatchers.Main) {
          CredentialManager.create(activity).getCredential(activity, request).credential
        }
      } catch (e: GetCredentialCancellationException) {
        throw CodedException("ERR_CANCELED", "The user canceled the sign-in", e)
      } catch (e: NoCredentialException) {
        throw CodedException("ERR_NO_ACCOUNT", "No Google account is available on this device", e)
      } catch (e: GetCredentialException) {
        throw CodedException("ERR_FAILED", "Sign-in failed (${e.type})", e)
      }

      if (credential !is CustomCredential ||
        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        throw CodedException("ERR_NO_ID_TOKEN", "The sign-in result is not a Google ID token", null)
      }
      try {
        GoogleIdTokenCredential.createFrom(credential.data).idToken
      } catch (e: GoogleIdTokenParsingException) {
        throw CodedException("ERR_NO_ID_TOKEN", "The Google ID token could not be parsed", e)
      }
    }
  }
}
