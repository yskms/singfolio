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
const payloadTooLarge = () => json({ error: 'payload_too_large' }, 413);

// 本文を、上限を超えた時点で読むのをやめて返す（超えたら null）。`request.text()` は本文を全部
// メモリに読んでから大きさを測れるので、認証の要らないこの経路では使わない（Content-Length の無い
// chunked や、数値でない Content-Length では、宣言を当てにできない。Freeの本文の上限は100MBで、
// Workerのメモリは128MB）。
async function readTextLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // 残りを読まない。取り消しの失敗は、応答に関係しない。
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function handleNonce(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  }
  // 宣言が上限を超えていれば、読まずに断る（早道。宣言が無い・でたらめでも、下の読み込みが上限で止める）。
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) return payloadTooLarge();
  const text = await readTextLimited(request, MAX_BODY_BYTES);
  if (text === null) return payloadTooLarge();

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
