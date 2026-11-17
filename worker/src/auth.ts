// 認証のエンドポイント（POST /auth/nonce・/auth/login・/auth/logout・/auth/logout-others）。リクエスト・レスポンスの形は
// docs/singfolio-publishing-backend.md §8「認証の方式」。
//
// /auth/nonce はログイン前の経路なので、D1に書かない（nonce は無状態で発行する。src/nonce.ts）。
// /auth/login が D1 に書くのは、IDトークンの検証まで通ったあと（src/login.ts）。
import { getIdTokenVerifier, type IdTokenVerifier } from './idToken.ts';
import {
  invalidRequest,
  json,
  methodNotAllowed,
  noContent,
  readJsonObject,
  serviceUnavailable,
  unauthorized,
} from './http.ts';
import { signIn, type SignInResult } from './login.ts';
import { isChallenge, issueNonce } from './nonce.ts';
import { authenticateSession, revokeOtherSessions, revokeSession, sessionTokenFromRequest } from './session.ts';

// 受け付ける本文の上限。`web` の本文でも 100 バイトほど。
const MAX_NONCE_BODY_BYTES = 1024;
// IDトークンは1〜2KB（大きすぎる判定は 8192 字。src/idToken.ts）。`T` は 131 字ほど。
const MAX_LOGIN_BODY_BYTES = 10 * 1024;

export async function handleNonce(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const parsed = await readJsonObject(request, MAX_NONCE_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { kind, challenge } = parsed.body;

  // `native` の T は C を含まない。付いていたら、取り違え（クライアントの不具合）として弾く。
  if (kind === 'native') {
    if (challenge !== undefined) return invalidRequest();
    return json(await issueNonce(env.NONCE_HMAC_KEY, { kind }, now));
  }
  if (kind === 'web') {
    if (!isChallenge(challenge)) return invalidRequest();
    return json(await issueNonce(env.NONCE_HMAC_KEY, { kind, challenge }, now));
  }
  return invalidRequest();
}

/**
 * POST /auth/login。`{"provider":"apple"|"google","idToken":"…","nonce":"<T>"}` を受け取り、
 * 200 `{"session":"<値>"}` を返す。`T` は `native` のものだけを受け付ける（AndroidのAppleログインは `/auth/apple/login`。src/appleWeb.ts）。
 * 失敗は、形の不備が400、検証に通らない（どの検査かは教えない）が401、公開鍵を取得できないが503。
 */
export async function handleLogin(
  request: Request,
  env: Env,
  now: number,
  verifier: IdTokenVerifier = getIdTokenVerifier(),
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const parsed = await readJsonObject(request, MAX_LOGIN_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { provider, idToken, nonce } = parsed.body;
  if ((provider !== 'apple' && provider !== 'google') || typeof idToken !== 'string' || typeof nonce !== 'string') {
    return invalidRequest();
  }

  return handleLoginResult(await signIn(env, verifier, { provider, kind: 'native', idToken, nonce }, now));
}

/** ログインの結果を応答にする（`/auth/login` と `/auth/apple/login` で同じ）。 */
export function handleLoginResult(result: SignInResult): Response {
  if (result.ok) return json({ session: result.session });
  return result.reason === 'unavailable' ? serviceUnavailable() : unauthorized();
}

/**
 * POST /auth/logout。`Authorization: Bearer <セッションの値>` のセッションの行を削除して、204 を返す。
 * 行が無い（すでに失効している）値でも204（何度呼んでも同じ）。ヘッダーが無い・形が違うときだけ401。
 */
export async function handleLogout(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  await revokeSession(env.DB, token, now);
  return noContent();
}

/**
 * POST /auth/logout-others。「ほかの端末をすべてログアウト」。`Authorization: Bearer <セッションの値>` で認証して、
 * そのセッション以外の、同じユーザーのセッションを、すべて失効させる（ログイン手段をまたぐ）。204（本文なし）。
 * 消すものが無くても204（何度呼んでも同じ）。ヘッダーが無い・形が違う・セッションが無効（無い・期限切れ）は401
 * （何も消さない。ログアウトと違い、認証が要る）。アプリは、401 のとき端末のセッションを捨てる。
 */
export async function handleLogoutOthers(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();
  await revokeOtherSessions(env.DB, session.userId, token);
  return noContent();
}
