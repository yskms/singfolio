// AndroidのAppleログイン（Web経由）のエンドポイント。方式と理由は
// docs/singfolio-publishing-backend.md §8「AndroidのAppleログイン（Web経由）」。
//
//   GET  /auth/apple/callback  Appleのリダイレクト先（Services ID の Return URL）。アプリのURLスキームへ戻すだけ。
//   POST /auth/apple/login     認可コード・`T`（web）・`V` を受け取り、Appleで交換して、セッションを返す。
//
// 守ること:
// - コールバックは、何も保存せず、Appleを呼ばない（認証の要らない経路。D1にも外部にも触れない）。戻り先の
//   URLスキームは、このファイルに固定で持ち、リクエストのパラメータからは決めない（オープンリダイレクトにしない）。
// - `code`・`state`・`error` は、形を確かめた値だけを、URLエンコードして戻り先に渡す。ログに出さない。
// - ログインの失敗の応答は `/auth/login` と同じ（形の不備が400、検証に通らないが401、Appleが使えないが503）。
import { getAppleCodeExchanger, type AppleCodeExchanger } from './appleToken.ts';
import { handleLoginResult } from './auth.ts';
import { invalidRequest, methodNotAllowed, readJsonObject } from './http.ts';
import { getIdTokenVerifier, type IdTokenVerifier } from './idToken.ts';
import { signIn } from './login.ts';
import { isChallenge } from './nonce.ts';

/** Services ID の Return URL に登録する値。Apple の認可リクエストの `redirect_uri` と、交換の `redirect_uri` に使う。 */
export const APPLE_CALLBACK_URL = 'https://singfolio.app/auth/apple/callback';

/** アプリへ戻すときのURL（アプリのURLスキーム `singfolio`。app.json の `scheme`）。 */
export const APP_RETURN_URL = 'singfolio://auth/apple';

// Appleが付けるパラメータの形。でたらめな値を、アプリへ持ち回らない。
const CODE_PATTERN = /^[\x21-\x7e]{1,1024}$/;
const ERROR_PATTERN = /^[a-z_]{1,64}$/;

function htmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * GET /auth/apple/callback。`?code=…&state=…`（取りやめなどは `?error=…&state=…`）を、アプリのURLスキームへの
 * 302 で戻す。形の不備は400（Appleからのリダイレクトではない）。
 */
export function handleAppleCallback(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  // `code` か `error` のどちらか1つ。`state`（`SHA-256(T)`）は、あれば形を確かめる（取りやめでは付かないことがある）。
  if ((code === null) === (error === null)) return invalidRequest();
  if (code !== null && !CODE_PATTERN.test(code)) return invalidRequest();
  if (error !== null && !ERROR_PATTERN.test(error)) return invalidRequest();
  if (state !== null && !isChallenge(state)) return invalidRequest();

  const target = new URL(APP_RETURN_URL);
  if (code !== null) target.searchParams.set('code', code);
  if (error !== null) target.searchParams.set('error', error);
  if (state !== null) target.searchParams.set('state', state);
  const location = target.toString();

  // 302 に、戻れなかったとき（リダイレクトに従わない環境）のためのリンクを添える。コードを含むので、
  // キャッシュさせず、Referer にも出さない。
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Singfolio</title><p><a href="${htmlEscape(location)}">Return to Singfolio</a></p>`;
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 302,
    headers: {
      location,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

// 本文の上限。認可コード（数十字）・`T`（131字）・`V`（43字）で、500バイトほど。
const MAX_BODY_BYTES = 4 * 1024;

/**
 * POST /auth/apple/login。`{"code":"<認可コード>","nonce":"<T（web）>","verifier":"<V>"}` を受け取り、
 * 200 `{"session":"<値>"}` を返す。`web` の `T` だけを受け付ける（`/auth/login` は `native` だけ）。
 * 失敗は `/auth/login` と同じ（400・401・503。理由は教えない）。
 */
export async function handleAppleWebLogin(
  request: Request,
  env: Env,
  now: number,
  deps: { verifier?: IdTokenVerifier; exchanger?: AppleCodeExchanger } = {},
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const parsed = await readJsonObject(request, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { code, nonce, verifier } = parsed.body;
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return invalidRequest();
  if (typeof nonce !== 'string' || !isChallenge(verifier)) return invalidRequest();

  const exchanger = deps.exchanger ?? getAppleCodeExchanger();
  const result = await signIn(
    env,
    deps.verifier ?? getIdTokenVerifier(),
    {
      provider: 'apple',
      kind: 'web',
      nonce,
      code,
      verifier,
      exchange: (value) =>
        exchanger.exchange(
          {
            clientId: env.APPLE_SERVICES_ID,
            redirectUri: APPLE_CALLBACK_URL,
            teamId: env.APPLE_TEAM_ID,
            keyId: env.APPLE_KEY_ID,
            privateKey: env.APPLE_PRIVATE_KEY,
          },
          value,
          now,
        ),
    },
    now,
  );
  return handleLoginResult(result);
}
