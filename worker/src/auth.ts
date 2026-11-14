// POST /auth/nonce。リクエスト・レスポンスの形は docs/singfolio-publishing-backend.md §8「認証の方式」。
// ログイン前の経路なので、D1に書かない（nonce は無状態で発行する。src/nonce.ts）。
import { isChallenge, issueNonce } from './nonce.ts';

// 受け付ける本文の上限。`web` の本文でも 100 バイトほど。
const MAX_BODY_BYTES = 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    // 発行した値を、どこにもキャッシュさせない。
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const invalidRequest = () => json({ error: 'invalid_request' }, 400);

export async function handleNonce(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalidRequest();
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalidRequest();
  const { kind, challenge } = body as { kind?: unknown; challenge?: unknown };

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
