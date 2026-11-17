// アカウントの削除（POST /auth/delete）。方式と理由は
// docs/singfolio-publishing-backend.md §8「アカウントの削除とAppleのトークン失効」。
//
// セッション（`Authorization: Bearer`）で認証したうえで、**再認証**を求める: ログインと同じ手順（Workerが発行した `T`、
// 各社のIDトークン。AndroidのAppleは認可コードと `V`）で、本人確認と、取り返しのつかない操作の確認を兼ねる。
// 再認証で得た `sub` が、セッションを作ったログイン手段の `sub` と同じでなければ削除しない（別のAppleアカウント・Googleアカウントで
// 再認証しても通さない）。
//
// 守ること:
// - 順序: セッションの認証 → `T` → IDトークンの検証 → `sub` の一致 → `T` を使用済みに → （iOSのApple: 認可コードの交換）→
//   **D1の行を消す** → Apple のトークンの失効。外部への待ちは、消す前に済ませる（失効の1回を除く）。アプリが先に打ち切る・切断すると、
//   Workerは、消したあとの処理を打ち切りうる。消す前なら、何も消えず、やり直せる。
//   D1が失敗しうるのは、止められる前（やり直せる）まで。**失効は、あとから、削除を止めずに行う**（Appleの案内は、失効を
//   「すべき」とするもので、削除を難しくしないことが優先）。失効できなかったときは、`appleRevoked: false` で伝える（アプリが、
//   利用者に、Appleの設定から連携を解除できると案内できる）。
// - `refresh_token`・`access_token` は、メモリの中で、交換から失効に渡して終わる（D1にも、ログにも、応答にも出さない）。
// - 再認証の失敗（403）と、セッションの失効（401）を分ける。アプリは、401 のときだけ端末のセッションを捨てる（別のAppleアカウントで
//   再認証しただけで、サインアウトさせない）。
// - IDトークン・コード・`T`・`V`・`sub` を、ログにも応答にも出さない。
import { deleteUserAccount } from './account.ts';
import { getAppleCodeExchanger, type AppleCodeExchanger, type AppleRevocationToken } from './appleToken.ts';
import { APPLE_CALLBACK_URL } from './appleWeb.ts';
import { invalidRequest, json, methodNotAllowed, readJsonObject, serviceUnavailable, unauthorized } from './http.ts';
import { audienceFor, getIdTokenVerifier, type IdTokenProvider, type IdTokenVerifier } from './idToken.ts';
import { consumeNonce, isChallenge, nonceHash, verifyNonce, type NonceKind } from './nonce.ts';
import { authenticateSession, sessionTokenFromRequest } from './session.ts';

// IDトークン（1〜2KB）・認可コード・`T`（131字）・`V` で、数KB。
const MAX_BODY_BYTES = 10 * 1024;
const CODE_PATTERN = /^[\x21-\x7e]{1,1024}$/;

/** 再認証の入力（検証済みの形）。 */
export type ReauthInput =
  /** iOSのApple、iOS・AndroidのGoogle。`authorizationCode` は、Appleのトークンの失効に使う（無ければ失効しない）。 */
  | { provider: IdTokenProvider; kind: 'native'; nonce: string; idToken: string; authorizationCode?: string }
  /** AndroidのApple（Web経由）。IDトークンは、Workerが認可コードの交換で得る。 */
  | { provider: 'apple'; kind: 'web'; nonce: string; code: string; verifier: string };

export type DeleteResult =
  | {
      ok: true;
      /** Appleのトークンを失効できたか。Google は `null`（失効するものが無い）。 */
      appleRevoked: boolean | null;
    }
  | {
      ok: false;
      /**
       * - `reauth_failed`: 再認証が通らない（`T`・IDトークン・コードの不備、リプレイ）。やり直せる。
       * - `account_mismatch`: 再認証は通ったが、ログイン中のアカウントと別のアカウント。
       * - `unavailable`: 公開鍵・Appleが使えない。トークンの問題ではないので、やり直せる。
       */
      reason: 'reauth_failed' | 'account_mismatch' | 'unavailable';
    };

export interface DeleteAccountDeps {
  verifier?: IdTokenVerifier;
  exchanger?: AppleCodeExchanger;
  /** 失効の失敗の分類を出す先。既定は `console.error`（テストでは差し替える）。 */
  log?: (message: string) => void;
}

/**
 * アカウントを削除する。`session` は `authenticateSession` で得たもの（ユーザーIDをクライアントから受け取らない）。
 * D1に書くのは、再認証が通ったあと。
 */
export async function deleteAccount(
  env: Env,
  deps: Required<DeleteAccountDeps>,
  session: { userId: string; provider: IdTokenProvider; sub: string },
  input: ReauthInput,
  now: number,
): Promise<DeleteResult> {
  const { verifier, exchanger, log } = deps;
  const failed = (reason: 'reauth_failed' | 'account_mismatch' | 'unavailable'): DeleteResult => ({ ok: false, reason });
  // 呼び出し側（`handleDeleteAccount`）が、再認証の手段が、ログイン中の手段と同じであることを確かめてある。

  // 1. `T` の署名・種別・期限（D1にも外部にも触れない）。
  const verifiedNonce = await verifyNonce(env.NONCE_HMAC_KEY, input.nonce, input.kind, now);
  if (!verifiedNonce.ok) return failed('reauth_failed');
  const kind: NonceKind = input.kind;
  const audience = audienceFor(env, input.provider, kind);
  if (audience === null) return failed('reauth_failed');

  // 2. IDトークンを得る。AndroidのAppleは、`V` を照合して（`T` に結びつけた `V` を持つのは、フローを始めたアプリだけ）、
  //    認可コードを交換する。この1回の交換で、失効に使うトークンも得る（コードは1回限り）。
  let idToken: string;
  let revocation: AppleRevocationToken | null = null;
  let nativeCode: string | undefined;
  if (input.kind === 'native') {
    idToken = input.idToken;
    nativeCode = input.authorizationCode;
  } else {
    if (verifiedNonce.challenge === null || !isChallenge(input.verifier)) return failed('reauth_failed');
    if ((await nonceHash(input.verifier)) !== verifiedNonce.challenge) return failed('reauth_failed');
    const exchanged = await exchanger.exchangeWithToken(appleConfig(env, 'web'), input.code, now);
    if (!exchanged.ok) return failed(exchanged.reason === 'invalid_grant' ? 'reauth_failed' : 'unavailable');
    idToken = exchanged.idToken;
    revocation = exchanged.revocationToken;
  }

  // 3. IDトークンの検証（`nonce` が `SHA-256(T)` と一致するところまで）。`sub` が、ログイン中のアカウントと同じか。
  const verified = await verifier.verify({ provider: input.provider, idToken, audience, nonce: verifiedNonce.nonceHash, now });
  if (!verified.ok) return failed(verified.reason === 'unavailable' ? 'unavailable' : 'reauth_failed');
  if (verified.sub !== session.sub) return failed('account_mismatch');

  // 4. ここから先が書き込み。`T` を使用済みにする（2回目は弾く。リプレイでは、Appleを呼ばない）。
  if (!(await consumeNonce(env.DB, verifiedNonce.nonceHash, verifiedNonce.expiresAt, now))) return failed('reauth_failed');

  // 5. iOSのAppleは、失効に使うトークンを得るために、認可コードを交換する（コードは、IDトークンの検証には使わない）。
  //    **D1を消す前に行う**: 消したあとに待つのを、失効の1回（最大5秒）だけにするため。Workerは1回のリクエストの中で、Appleを
  //    順に待つ（それぞれ最大5秒）。アプリが先に打ち切る・切断すると、消したあとの処理は、打ち切られうる（失効が行われず、
  //    ログも残らない）。消す前なら、打ち切られても、何も消えず、やり直せる。交換の失敗は、削除を止めない（失効ができないだけ）。
  if (input.provider === 'apple' && input.kind === 'native' && nativeCode !== undefined) {
    try {
      const exchanged = await exchanger.exchangeWithToken(appleConfig(env, 'native'), nativeCode, now);
      if (exchanged.ok) revocation = exchanged.revocationToken;
    } catch {
      // 鍵の設定の不備（`APPLE_PRIVATE_KEY`）など。例外の中身は出さない。
      log('apple token revoke failed: unexpected');
    }
  }

  // 6. アカウントを消す（R2のスナップショットなどは、7.4 以降で `deleteUserAccount` に足す）。
  await deleteUserAccount(env.DB, session.userId);

  // 7. Appleのトークンの失効（削除を止めない。ここで例外が出ても、アカウントはもう消えているので、失敗にしない）。
  if (input.provider !== 'apple') return { ok: true, appleRevoked: null };
  if (revocation === null) return { ok: true, appleRevoked: false };
  try {
    return { ok: true, appleRevoked: await exchanger.revoke(appleConfig(env, input.kind), revocation, now) };
  } catch {
    // 鍵の設定の不備（`APPLE_PRIVATE_KEY`）など。例外の中身は出さない。
    log('apple token revoke failed: unexpected');
    return { ok: true, appleRevoked: false };
  }
}

/** Appleを呼ぶ設定。`web` は Services ID と Return URL、`native` は バンドルID（`redirect_uri` は付けない）。 */
function appleConfig(env: Env, kind: NonceKind) {
  return {
    clientId: kind === 'web' ? env.APPLE_SERVICES_ID : env.APPLE_BUNDLE_ID,
    ...(kind === 'web' ? { redirectUri: APPLE_CALLBACK_URL } : {}),
    teamId: env.APPLE_TEAM_ID,
    keyId: env.APPLE_KEY_ID,
    privateKey: env.APPLE_PRIVATE_KEY,
  };
}

/**
 * POST /auth/delete。`Authorization: Bearer <セッションの値>` と、再認証の本文:
 * - Apple（iOS）: `{"provider":"apple","nonce":"<T>","idToken":"…","authorizationCode":"…"}`（`authorizationCode` は省略できる）
 * - Apple（Android）: `{"provider":"apple","nonce":"<T（web）>","code":"…","verifier":"<V>"}`
 * - Google: `{"provider":"google","nonce":"<T>","idToken":"…"}`
 * 200 `{"appleRevoked":true|false|null}`。401（セッションが無効）・403（`reauth_failed`・`account_mismatch`）・
 * 400（形の不備）・503（公開鍵・Appleが使えない）。
 */
export async function handleDeleteAccount(
  request: Request,
  env: Env,
  now: number,
  deps: DeleteAccountDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const parsed = await readJsonObject(request, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const input = parseReauthInput(parsed.body);
  if (input === null) return invalidRequest();

  // 本文が正しい形でも、セッションが無効なら 401（本文の検査を先にするのは、形の不備を、認証の有無に関わらず400にするため）。
  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();

  // ログイン中の手段と、再認証の手段が違うのは、アプリの取り違え（利用者の操作ではない）。
  if (input.provider !== session.provider) return invalidRequest();

  const result = await deleteAccount(
    env,
    {
      verifier: deps.verifier ?? getIdTokenVerifier(),
      exchanger: deps.exchanger ?? getAppleCodeExchanger(),
      log: deps.log ?? ((message) => console.error(message)),
    },
    session,
    input,
    now,
  );
  if (result.ok) return json({ appleRevoked: result.appleRevoked });
  if (result.reason === 'unavailable') return serviceUnavailable();
  return json({ error: result.reason }, 403);
}

function parseReauthInput(body: Record<string, unknown>): ReauthInput | null {
  const { provider, nonce, idToken, authorizationCode, code, verifier } = body;
  if (typeof nonce !== 'string') return null;
  if (provider === 'google') {
    if (typeof idToken !== 'string' || authorizationCode !== undefined || code !== undefined || verifier !== undefined) return null;
    return { provider, kind: 'native', nonce, idToken };
  }
  if (provider !== 'apple') return null;
  if (typeof idToken === 'string') {
    // iOS。`code`・`verifier` は付かない。`authorizationCode` は省略できる。
    if (code !== undefined || verifier !== undefined) return null;
    if (authorizationCode !== undefined && (typeof authorizationCode !== 'string' || !CODE_PATTERN.test(authorizationCode))) return null;
    return { provider, kind: 'native', nonce, idToken, ...(authorizationCode === undefined ? {} : { authorizationCode }) };
  }
  // Android。IDトークンは付かない。
  if (idToken !== undefined || authorizationCode !== undefined) return null;
  if (typeof code !== 'string' || !CODE_PATTERN.test(code) || !isChallenge(verifier)) return null;
  return { provider, kind: 'web', nonce, code, verifier };
}
