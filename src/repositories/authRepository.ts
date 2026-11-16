// アカウントのHTTP（POST /auth/nonce・/auth/login・/auth/apple/login・/auth/logout）。Serviceからだけ使う。画面・Serviceは、
// URLやレスポンスの形を知らない（候補検索の songCatalogRepository と同じ）。リクエスト・レスポンスの
// 形は docs/singfolio-publishing-backend.md §8「認証の方式」が正で、Worker（worker/）とはコードを共有しない。
//
// `fetch` は注入する（`createServices`）。Nodeのテストは偽の `fetch` で動かす。
//
// 守ること:
// - IDトークン・nonce・セッションの値を、エラーの `message` にも、ログにも出さない（応答の本文も載せない）。
// - 再試行はしない（やり直しは利用者の操作。公開鍵の取得に失敗した503では、`T` も使い切りにならない）。
// - 5xx は、本文を読まずに一時的な失敗（`unavailable`）にする。D1が使えないときの Worker は、JSONでない
//   Cloudflareのエラーページを返す（1101）。日次の上限を超えたとき（1027）や、WAFの回数の制限（1015）は 429。
//   どれも「あとでやり直す」で、トークンの問題ではない。
// - 認証情報（Cookie）は送らない・受け取らない（`credentials: 'omit'`）。
import type { AuthProvider } from '../domain/types.ts';
import { AuthError } from './authError.ts';

/** `fetch` のうち、ここで使う部分（グローバルの `fetch` をそのまま渡せる形）。 */
export type AuthFetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body?: string;
    credentials: 'omit';
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** APIの置き場。本番のWorker（`singfolio.app`）。HTTPS以外は、Workerが403で拒否する。 */
export const API_ORIGIN = 'https://singfolio.app';
/** 応答を待つ上限。超えたら `network`。 */
const DEFAULT_TIMEOUT_MS = 10_000;

// 値の中身は解釈しない（不透明な値）。ヘッダーに載せても安全な（見える ASCII だけの）、常識的な長さの
// 文字列かだけを確かめる。
const MAX_OPAQUE_LENGTH = 512;
function isOpaqueValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_OPAQUE_LENGTH &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface LoginRequest {
  provider: AuthProvider;
  /** 各社のサインインが返したIDトークン（全文。保存・ログ出力はしない） */
  idToken: string;
  /** `requestNonce` が返した `T`（IDトークンの `nonce` は、これのハッシュ） */
  nonce: string;
}

export interface AppleCodeLoginRequest {
  /** Appleの認可コード（Custom Tab のリダイレクトで得たもの。1回限り。保存・ログ出力はしない） */
  code: string;
  /** `requestWebNonce` が返した `T`（web） */
  nonce: string;
  /** `T` の元にした `C = SHA-256(V)` の `V`（アプリだけが持つ乱数。フローが終わるまで、アプリの外に出さない） */
  verifier: string;
}

export function createAuthRepository(
  fetchImpl: AuthFetchLike,
  options: { origin?: string; timeoutMs?: number } = {},
) {
  const origin = (options.origin ?? API_ORIGIN).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** POST して、成功（2xx）の応答を返す。失敗は `AuthError`。 */
  async function post<T>(
    path: string,
    init: { json?: unknown; session?: string },
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
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Awaited<ReturnType<AuthFetchLike>>;
      try {
        response = await fetchImpl(`${origin}${path}`, {
          method: 'POST',
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
      if (!response.ok) throw new AuthError('invalid-request', `HTTP ${response.status}`);
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

  return {
    /**
     * `POST /auth/nonce`（`native`）。ログインの前に呼ぶ。返す `T` は不透明な値で、中身を解釈しない。
     * 各社のサインインには `T` のハッシュ（`SHA-256(T)` の base64url）を渡し、`T` は `login` に渡す。
     */
    requestNonce(): Promise<string> {
      return post('/auth/nonce', { json: { kind: 'native' } }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !isOpaqueValue(data.nonce)) throw new AuthError('invalid-response');
        return data.nonce;
      });
    },

    /**
     * `POST /auth/nonce`（`web`）。AndroidのAppleログイン（Web経由）の前に呼ぶ。`challenge` は、検証用の値 `V` の
     * ハッシュ `C = SHA-256(V)` の base64url（43字）。返す `T` は `C` を含む。Appleの認可リクエストには `SHA-256(T)` を渡す。
     */
    requestWebNonce(challenge: string): Promise<string> {
      return post('/auth/nonce', { json: { kind: 'web', challenge } }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !isOpaqueValue(data.nonce)) throw new AuthError('invalid-response');
        return data.nonce;
      });
    },

    /**
     * `POST /auth/apple/login`。AndroidのAppleログイン（Web経由）。認可コード・`T`（web）・`V` を送る。Workerが、
     * `V` を照合して、コードをAppleで交換し、セッションを返す。セッションの値（不透明）を返す。
     */
    loginWithAppleCode({ code, nonce, verifier }: AppleCodeLoginRequest): Promise<string> {
      return post('/auth/apple/login', { json: { code, nonce, verifier } }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !isOpaqueValue(data.session)) throw new AuthError('invalid-response');
        return data.session;
      });
    },

    /** `POST /auth/login`。セッションの値（不透明）を返す。期限は返ってこない。 */
    login({ provider, idToken, nonce }: LoginRequest): Promise<string> {
      return post('/auth/login', { json: { provider, idToken, nonce } }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !isOpaqueValue(data.session)) throw new AuthError('invalid-response');
        return data.session;
      });
    },

    /**
     * `POST /auth/logout`。サーバー側のセッションを失効させる（すでに失効している値でも成功）。
     * 401 は、ヘッダーの形が違うときだけ（失効するものが無い）。本文は読まない。
     */
    logout(session: string): Promise<void> {
      return post('/auth/logout', { session }, async () => {});
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
