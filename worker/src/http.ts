// 認証のエンドポイント（src/auth.ts）が共有する、レスポンスと本文の読み取り。
// リクエスト・レスポンスの形は docs/singfolio-publishing-backend.md §8「認証の方式」。

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    // 発行した値（nonce・セッション）を、どこにもキャッシュさせない。
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const noContent = (): Response => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const invalidRequest = (): Response => json({ error: 'invalid_request' }, 400);
export const payloadTooLarge = (): Response => json({ error: 'payload_too_large' }, 413);
// 認証に失敗したときの応答。どの検査で落ちたかを、呼んだ側に教えない。
export const unauthorized = (): Response => json({ error: 'unauthorized' }, 401);
// 認証の相手（公開鍵の取得元）が使えないとき。トークンの問題ではないので、アプリがやり直せる。
export const serviceUnavailable = (): Response => json({ error: 'service_unavailable' }, 503);
export const methodNotAllowed = (allow: string): Response => json({ error: 'method_not_allowed' }, 405, { allow });

// 本文を、上限を超えた時点で読むのをやめて返す（超えたら null）。`request.text()` は本文を全部
// メモリに読んでから大きさを測れるので、認証の要らない経路では使わない（Content-Length の無い
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

export type JsonObjectResult = { ok: true; body: Record<string, unknown> } | { ok: false; response: Response };

/**
 * 本文をJSONのオブジェクトとして読む。上限を超えたら413、JSONでない・オブジェクトでないなら400（どちらも
 * `response` を返す）。宣言（`Content-Length`）が上限を超えていれば、読まずに断る（早道。宣言が無い・
 * でたらめでも、読み込みが上限で止める）。
 */
export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonObjectResult> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return { ok: false, response: payloadTooLarge() };
  const text = await readTextLimited(request, maxBytes);
  if (text === null) return { ok: false, response: payloadTooLarge() };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: invalidRequest() };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, response: invalidRequest() };
  }
  return { ok: true, body: body as Record<string, unknown> };
}
