// ログインの処理（IDトークンの検証から、セッションの発行まで）。順序と理由は
// docs/singfolio-publishing-backend.md §8「認証の方式」の「ログインの処理の順序」。
//
// D1に書くのは、IDトークンの検証まで通ったあと。それより前の検査は、D1にも外部にも触れない。
import { audienceFor, type IdTokenProvider, type IdTokenVerifier } from './idToken.ts';
import { resolveIdentity } from './identity.ts';
import { consumeNonce, verifyNonce, type NonceKind } from './nonce.ts';
import { createSession } from './session.ts';

export interface SignInInput {
  provider: IdTokenProvider;
  /** 受け付ける `T` の種別。`native` の `T` は、アプリがネイティブのサインインで使ったもの。 */
  kind: NonceKind;
  idToken: string;
  /** Workerが発行した `T`（`POST /auth/nonce`）。IDトークンの `nonce` は、SHA-256(T)。 */
  nonce: string;
}

// `rejected` は、どの検査で落ちたかを教えない（呼ぶ側は同じ401にする）。`unavailable` は、
// 公開鍵を取得できないこと（トークンの問題ではないので、アプリがやり直せる）。
export type SignInResult = { ok: true; session: string } | { ok: false; reason: 'rejected' | 'unavailable' };

const rejected: SignInResult = { ok: false, reason: 'rejected' };

export async function signIn(
  env: Env,
  verifier: IdTokenVerifier,
  { provider, kind, idToken, nonce }: SignInInput,
  now: number,
): Promise<SignInResult> {
  // 1. `T` の署名・種別・期限。D1にも外部にも触れない。
  const verifiedNonce = await verifyNonce(env.NONCE_HMAC_KEY, nonce, kind, now);
  if (!verifiedNonce.ok) return rejected;

  // 2. 受け付ける `aud`。無い組み合わせ（Googleの `web`）は拒否する。公開鍵を取りに行く前に弾く。
  const audience = audienceFor(env, provider, kind);
  if (audience === null) return rejected;

  // `web` の `T` は `C` を含み、`V` との照合が要る（7.3.9）。照合を足すまでは受け付けない（飛ばさない）。
  if (verifiedNonce.challenge !== null) return rejected;

  // 3. IDトークンの検証（`nonce` が SHA-256(T) と一致するところまで）。
  const verified = await verifier.verify({ provider, idToken, audience, nonce: verifiedNonce.nonceHash, now });
  if (!verified.ok) return { ok: false, reason: verified.reason === 'unavailable' ? 'unavailable' : 'rejected' };

  // 4. ここから先がD1への書き込み。`T` を使用済みにする（2回目は弾く）。このあとD1が失敗しても `T` は
  //    使い切りになる（アプリが新しい `T` で、やり直す）。
  if (!(await consumeNonce(env.DB, verifiedNonce.nonceHash, verifiedNonce.expiresAt, now))) return rejected;

  // 5. ログイン手段の引き当て（無ければユーザーごと作る）、6. セッションの発行。
  const { identityId } = await resolveIdentity(env.DB, provider, verified.sub, now);
  return { ok: true, session: await createSession(env.DB, identityId, now) };
}
