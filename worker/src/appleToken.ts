// Apple の認可コードの交換（`POST https://appleid.apple.com/auth/token`）と、トークンの失効
// （`POST https://appleid.apple.com/auth/revoke`）。方式は docs/singfolio-publishing-backend.md §8
// 「AndroidのAppleログイン（Web経由）」「アカウントの削除とAppleのトークン失効」。
//
// 守ること:
// - **ログイン（`exchange`）は、`id_token` だけを受け取る。** `refresh_token`・`access_token` は、読まず、保存せず、ログにも出さない
//   （ログインには要らない）。読むのは、アカウントの削除（7.3.10）の `exchangeWithToken` だけで、失効のために、メモリの中で
//   `revoke` へ渡して終わる（D1・ログ・結果の外へは出さない）。
// - Apple の応答の本文・コード・IDトークン・トークンを、結果にもエラーにも載せない。返すのは、`id_token`（と、削除のときの
//   失効用のトークン）か、失敗の分類だけ。
// - 再試行しない（認可コードは1回限りで、やり直しはアプリがする）。リダイレクトには従わない。5秒で打ち切る。
// - 失敗（`invalid_grant` 以外）は、分類だけを1行、`console.error` に出す。こちらの設定の不備（Appleの `invalid_client`。
//   Team ID・Key ID・鍵・Services ID の食い違い）も、Appleの障害も、利用者には同じ 503 になり、でたらめなコードでは
//   Appleは常に `invalid_grant` を返すので（測定）、本物のコードで試すまで設定の不備は分からない。切り分けは、この1行だけ
//   （Workers Logs は無効のままなので、`wrangler dev` の出力か `wrangler tail` で見る）。出すのは、ステータスと、許可リストにある
//   `error` の名前だけ。コード・トークン・Apple の応答の本文・例外の中身は出さない。
import { createAppleClientSecret } from './appleClientSecret.ts';

const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
const TIMEOUT_MS = 5000;
// IDトークンは1〜2KB。応答の大きさの上限（`id_token` と、使わない `refresh_token` などが入る）。
const MAX_RESPONSE_BYTES = 64 * 1024;

/** 失敗の分類を出す先。既定は `console.error`（テストでは差し替える）。 */
export type AppleLog = (message: string) => void;

// Apple の OAuth のエラー名（RFC 6749）。この外の値は、中身を出さず `other` と書く。
const KNOWN_APPLE_ERRORS = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
]);

/**
 * - `invalid_grant`: コードが無効（期限切れ・使用済み・でたらめ）。呼んだ側の問題で、やり直せば通りうる。
 * - `unavailable`: それ以外のすべて（通信の失敗・Appleの5xx・`invalid_client`（こちらの設定の不備）など）。コードの問題と
 *   区別できない・区別しても利用者にできることが無いので、まとめる。
 */
export type AppleCodeExchange = { ok: true; idToken: string } | { ok: false; reason: 'invalid_grant' | 'unavailable' };

export type AppleFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface AppleCodeExchangeConfig {
  clientId: string;
  /** 認可リクエストの `redirect_uri` と同じ値。ネイティブ（iOSのアプリ）のコードには、付けない。 */
  redirectUri?: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

/** 失効させるトークン。`refresh_token` があればそれ（Appleの失効は、これで連携が解除される）。 */
export interface AppleRevocationToken {
  value: string;
  hint: 'refresh_token' | 'access_token';
}

/** アカウントの削除用の交換の結果。`revocationToken` は、`revoke` へ渡す（保存しない）。 */
export type AppleCodeExchangeWithToken =
  | { ok: true; idToken: string; revocationToken: AppleRevocationToken | null }
  | { ok: false; reason: 'invalid_grant' | 'unavailable' };

export function createAppleCodeExchanger(options: { fetch?: AppleFetch; log?: AppleLog } = {}) {
  const fetchFunction: AppleFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const report = (operation: 'token exchange' | 'token revoke', detail: string) =>
    (options.log ?? ((message) => console.error(message)))(`apple ${operation} failed: ${detail}`);

  /** Appleへ form を POST する。通信の失敗は null（分類を記録する）。本文が大きすぎる・読めないときは `text` が null。 */
  async function post(
    url: string,
    operation: 'token exchange' | 'token revoke',
    body: URLSearchParams,
  ): Promise<{ status: number; text: string | null } | null> {
    let response: Response;
    try {
      response = await fetchFunction(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: body.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      report(operation, 'network'); // 通信の失敗・タイムアウト。例外の中身は出さない
      return null;
    }
    try {
      const declared = Number(response.headers.get('content-length'));
      if (declared > MAX_RESPONSE_BYTES) throw new Error('too large');
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new Error('too large');
      return { status: response.status, text };
    } catch {
      return { status: response.status, text: null };
    }
  }

  function parseRecord(text: string | null): Record<string, unknown> | null {
    if (text === null) return null;
    try {
      const data: unknown = JSON.parse(text);
      return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  // 失敗の分類（`error` の名前は、許可リストにあるものだけ。外の値は `other`）。
  const errorName = (record: Record<string, unknown>) =>
    typeof record.error === 'string' && KNOWN_APPLE_ERRORS.has(record.error) ? record.error : 'other';

  /** コードを交換する共通の部分。成功は、読んだ応答（呼び出し側が、使う項目だけを取り出す）。 */
  async function requestTokens(
    config: AppleCodeExchangeConfig,
    code: string,
    now: number,
  ): Promise<{ ok: true; record: Record<string, unknown> } | { ok: false; reason: 'invalid_grant' | 'unavailable' }> {
    // 設定の不備（鍵が無い・読めない）は、ここで投げる（利用者の失敗に見せかけない）。
    const clientSecret = await createAppleClientSecret(
      { teamId: config.teamId, keyId: config.keyId, clientId: config.clientId, privateKey: config.privateKey },
      now,
    );
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    if (config.redirectUri !== undefined) body.set('redirect_uri', config.redirectUri);

    const response = await post(TOKEN_ENDPOINT, 'token exchange', body);
    if (response === null) return { ok: false, reason: 'unavailable' };
    const record = parseRecord(response.text);
    if (record === null) {
      report('token exchange', `status=${response.status} unreadable`);
      return { ok: false, reason: 'unavailable' };
    }
    if (response.status === 200) return { ok: true, record };
    // Apple は、エラーを 400 と `{"error":"invalid_grant"}` で返す。コードが無効なのは利用者側の事情で、記録しない。
    if (response.status === 400 && record.error === 'invalid_grant') return { ok: false, reason: 'invalid_grant' };
    report('token exchange', `status=${response.status} error=${errorName(record)}`);
    return { ok: false, reason: 'unavailable' };
  }

  return {
    /** ログイン用。`id_token` だけを返す（`refresh_token`・`access_token` は読まない）。 */
    async exchange(config: AppleCodeExchangeConfig, code: string, now: number): Promise<AppleCodeExchange> {
      const result = await requestTokens(config, code, now);
      if (!result.ok) return result;
      const { id_token: idToken } = result.record;
      if (typeof idToken === 'string' && idToken !== '') return { ok: true, idToken };
      report('token exchange', 'status=200 no id_token');
      return { ok: false, reason: 'unavailable' };
    },

    /**
     * アカウントの削除用。`id_token` と、失効させるトークン（`refresh_token`、無ければ `access_token`）を返す。
     * 認可コードは1回限りなので、Androidの再認証（`id_token` で本人確認して、同じ応答のトークンを失効させる）は、1回の交換で両方を得る。
     */
    async exchangeWithToken(config: AppleCodeExchangeConfig, code: string, now: number): Promise<AppleCodeExchangeWithToken> {
      const result = await requestTokens(config, code, now);
      if (!result.ok) return result;
      const { id_token: idToken, refresh_token: refresh, access_token: access } = result.record;
      if (typeof idToken !== 'string' || idToken === '') {
        report('token exchange', 'status=200 no id_token');
        return { ok: false, reason: 'unavailable' };
      }
      const revocationToken: AppleRevocationToken | null =
        typeof refresh === 'string' && refresh !== ''
          ? { value: refresh, hint: 'refresh_token' }
          : typeof access === 'string' && access !== ''
            ? { value: access, hint: 'access_token' }
            : null;
      return { ok: true, idToken, revocationToken };
    },

    /**
     * トークンを失効させる（`/auth/revoke`）。Appleとの連携が解除される。成功（200）なら true。失敗は false
     * （分類を1行記録する。呼び出し側は、削除を止めない）。鍵の設定の不備も false（`exchange` と違い、投げない:
     * アカウントの削除を、設定の不備で止めない）。
     */
    async revoke(config: AppleCodeExchangeConfig, token: AppleRevocationToken, now: number): Promise<boolean> {
      let clientSecret: string;
      try {
        clientSecret = await createAppleClientSecret(
          { teamId: config.teamId, keyId: config.keyId, clientId: config.clientId, privateKey: config.privateKey },
          now,
        );
      } catch {
        report('token revoke', 'client_secret'); // 鍵・例外の中身は出さない
        return false;
      }
      const response = await post(
        REVOKE_ENDPOINT,
        'token revoke',
        new URLSearchParams({
          client_id: config.clientId,
          client_secret: clientSecret,
          token: token.value,
          token_type_hint: token.hint,
        }),
      );
      if (response === null) return false;
      if (response.status === 200) return true;
      const record = parseRecord(response.text);
      report('token revoke', record === null ? `status=${response.status} unreadable` : `status=${response.status} error=${errorName(record)}`);
      return false;
    },
  };
}

export type AppleCodeExchanger = ReturnType<typeof createAppleCodeExchanger>;

let shared: AppleCodeExchanger | undefined;

/** Workerが使う交換器。 */
export function getAppleCodeExchanger(): AppleCodeExchanger {
  return (shared ??= createAppleCodeExchanger());
}
