// ログインの処理（IDトークンの検証から、セッションの発行まで）。順序と理由は
// docs/singfolio-publishing-backend.md §8「認証の方式」の「ログインの処理の順序」。
//
// D1に書くのは、IDトークンの検証まで通ったあと。それより前の検査は、D1にも外部にも触れない。
import type { AppleCodeExchange } from './appleToken.ts';
import { audienceFor, type IdTokenProvider, type IdTokenVerifier } from './idToken.ts';
import { resolveIdentity } from './identity.ts';
import { consumeNonce, isChallenge, nonceHash, verifyNonce } from './nonce.ts';
import { createSession } from './session.ts';

interface SignInBase {
  provider: IdTokenProvider;
  /** Workerが発行した `T`（`POST /auth/nonce`）。IDトークンの `nonce` は、SHA-256(T)。 */
  nonce: string;
}

/** ネイティブのサインイン（iOSのApple、iOS・AndroidのGoogle）。`native` の `T`、アプリが得たIDトークン。 */
export interface NativeSignInInput extends SignInBase {
  kind: 'native';
  idToken: string;
}

/**
 * AndroidのAppleログイン（Web経由）。`web` の `T`（`C = SHA-256(V)` を含む）、アプリが得た認可コードと `V`。
 * IDトークンは、Workerが `exchange`（Appleの `/auth/token`）で得る。
 */
export interface AppleWebSignInInput extends SignInBase {
  provider: 'apple';
  kind: 'web';
  code: string;
  /** アプリが `C` の元にした値 `V`（`SHA-256(V)` が、`T` の中の `C` と一致しなければならない）。 */
  verifier: string;
  exchange: (code: string) => Promise<AppleCodeExchange>;
}

export type SignInInput = NativeSignInInput | AppleWebSignInInput;

// `rejected` は、どの検査で落ちたかを教えない（呼ぶ側は同じ401にする）。`unavailable` は、
// 公開鍵を取得できないこと（トークンの問題ではないので、アプリがやり直せる）。
export type SignInResult = { ok: true; session: string } | { ok: false; reason: 'rejected' | 'unavailable' };

const rejected: SignInResult = { ok: false, reason: 'rejected' };

export async function signIn(
  env: Env,
  verifier: IdTokenVerifier,
  input: SignInInput,
  now: number,
): Promise<SignInResult> {
  const { provider, kind, nonce } = input;
  // 1. `T` の署名・種別・期限。D1にも外部にも触れない。
  const verifiedNonce = await verifyNonce(env.NONCE_HMAC_KEY, nonce, kind, now);
  if (!verifiedNonce.ok) return rejected;

  // 2. 受け付ける `aud`。無い組み合わせ（Googleの `web`）は拒否する。公開鍵を取りに行く前に弾く。
  const audience = audienceFor(env, provider, kind);
  if (audience === null) return rejected;

  // 2'. IDトークンを得る。ネイティブは、アプリが渡したもの。`web` は、`V` を照合して（`T` に結びつけた
  //     `V` を持つのは、フローを始めたアプリだけ。横取りされた `code` は、これで使えない）、認可コードを
  //     Appleで交換して得る。`V` の照合が先で、通らなければ Apple を呼ばない（認証の要らない経路に、外部の
  //     呼び出しを使わせない）。`challenge` は `web` の `T` なら必ず入っている（`verifyNonce` が保証する）。
  let idToken: string;
  if (input.kind === 'native') {
    idToken = input.idToken;
  } else {
    if (verifiedNonce.challenge === null || !isChallenge(input.verifier)) return rejected;
    if ((await nonceHash(input.verifier)) !== verifiedNonce.challenge) return rejected;
    const exchanged = await input.exchange(input.code);
    if (!exchanged.ok) return exchanged.reason === 'invalid_grant' ? rejected : { ok: false, reason: 'unavailable' };
    idToken = exchanged.idToken;
  }

  // 3. IDトークンの検証（`nonce` が SHA-256(T) と一致するところまで）。
  const verified = await verifier.verify({ provider, idToken, audience, nonce: verifiedNonce.nonceHash, now });
  if (!verified.ok) return { ok: false, reason: verified.reason === 'unavailable' ? 'unavailable' : 'rejected' };

  // 4. ここから先がD1への書き込み。`T` を使用済みにする（2回目は弾く）。このあとD1が失敗しても `T` は
  //    使い切りになる（アプリが新しい `T` で、やり直す）。
  if (!(await consumeNonce(env.DB, verifiedNonce.nonceHash, verifiedNonce.expiresAt, now))) return rejected;

  // 5. ログイン手段の引き当て（無ければユーザーごと作る）、6. セッションの発行。
  //    セッションを作らないことがある（`createSession`。Appleの通知との競合を吸収する）。理由は教えず、401にする。
  const { identityId } = await resolveIdentity(env.DB, provider, verified.sub, now);
  const session = await createSession(env.DB, identityId, now);
  return session === null ? rejected : { ok: true, session };
}
