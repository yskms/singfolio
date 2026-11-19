// Worker（`singfolio.app`）への、JSONのHTTP。アカウント（authRepository）と公開（publishRepository）が共有する。
// 画面・Serviceは、これを直接使わない。
//
// `fetch` は注入する（`createServices`）。Nodeのテストは偽の `fetch` で動かす。
//
// 守ること（どちらのRepositoryも同じ。ここに1か所だけ置く）:
// - 再試行はしない（やり直しは利用者の操作）。
// - 5xx は、本文を読まずに一時的な失敗（`unavailable`）にする。D1が使えないときの Worker は、JSONでない
//   Cloudflareのエラーページを返す（1101）。日次の上限を超えたとき（1027）や、WAFの回数の制限（1015）は 429。
//   どれも「あとでやり直す」で、リクエストの中身の問題ではない。
// - 401 は `unauthorized`。認証が要る呼び出しは、Serviceが 401 のときだけ端末のセッションを捨てる
//   （`accountService` の `withSession`）。
// - 認証情報（Cookie）は送らない・受け取らない（`credentials: 'omit'`）。
// - 例外の `message` に、URL・セッション・応答の本文を載せない。
import { AuthError } from './authError.ts';

export type ApiMethod = 'GET' | 'POST' | 'PUT';

/** `fetch` のうち、ここで使う部分（グローバルの `fetch` をそのまま渡せる形）。 */
export type ApiFetchLike = (
  url: string,
  init: {
    method: ApiMethod;
    headers: Record<string, string>;
    body?: string;
    credentials: 'omit';
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** APIの置き場。本番のWorker（`singfolio.app`）。HTTPS以外は、Workerが403で拒否する。 */
export const API_ORIGIN = 'https://singfolio.app';
/** 応答を待つ上限。超えたら `network`。 */
export const DEFAULT_TIMEOUT_MS = 10_000;

// 値の中身は解釈しない（不透明な値）。ヘッダーに載せても安全な（見える ASCII だけの）、常識的な長さの
// 文字列かだけを確かめる。
const MAX_OPAQUE_LENGTH = 512;
export function isOpaqueValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_OPAQUE_LENGTH &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface ApiRequestInit {
  json?: unknown;
  session?: string;
  /** 応答を待つ上限（ミリ秒）。省略すると既定。 */
  timeoutMs?: number;
  /**
   * 401・429・5xx 以外の失敗（4xx）を、失敗にする。`undefined` を返すと、`invalid-request`。
   * 本文が読めない（JSONでない）ときは、投げられた例外を捨てて、`invalid-request` にする。
   */
  rejected?: (status: number, response: { json(): Promise<unknown> }) => Promise<Error | undefined>;
}

export function createApiClient(
  fetchImpl: ApiFetchLike,
  options: { origin?: string; timeoutMs?: number } = {},
) {
  const origin = (options.origin ?? API_ORIGIN).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** 送って、成功（2xx）の応答を `read` で読んで返す。失敗は `AuthError`（`rejected` が返したものを除く）。 */
  async function request<T>(
    method: ApiMethod,
    path: string,
    init: ApiRequestInit,
    read: (response: { json(): Promise<unknown> }) => Promise<T>,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: string | undefined;
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.json);
    }
    if (init.session !== undefined) headers.Authorization = `Bearer ${init.session}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? timeoutMs);
    try {
      let response: Awaited<ReturnType<ApiFetchLike>>;
      try {
        response = await fetchImpl(`${origin}${path}`, {
          method,
          headers,
          body,
          credentials: 'omit',
          signal: controller.signal,
        });
      } catch {
        // 例外の message は載せない（URLなど、内部の情報が入りうる）
        throw new AuthError('network');
      }
      if (response.status === 401) throw new AuthError('unauthorized');
      if (response.status === 429 || response.status >= 500) {
        throw new AuthError('unavailable', `HTTP ${response.status}`);
      }
      if (!response.ok) {
        let rejection: Error | undefined;
        try {
          rejection = await init.rejected?.(response.status, response);
        } catch {
          // 本文が読めない（JSONでない）。`invalid-request` のまま
        }
        throw rejection ?? new AuthError('invalid-request', `HTTP ${response.status}`);
      }
      try {
        return await read(response);
      } catch (error) {
        if (error instanceof AuthError) throw error;
        // 本文の途中で切れた・時間切れで中断された、は通信の失敗。JSONとして読めないものは応答の不備
        throw controller.signal.aborted ? new AuthError('network') : new AuthError('invalid-response');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { request };
}
