// Apple の認可コードを、IDトークンに交換する（`POST https://appleid.apple.com/auth/token`）。AndroidのAppleログイン
// （Web経由）で使う。方式は docs/singfolio-publishing-backend.md §8「AndroidのAppleログイン（Web経由）」。
//
// 守ること:
// - 受け取るのは `id_token` だけ。`refresh_token`・`access_token` は、読まず、保存せず、ログにも出さない
//   （ログインには要らない。アカウントの削除（7.3.10）は、再認証であらためて得る）。
// - Apple の応答の本文・コード・IDトークンを、結果にもエラーにも載せない。返すのは、`id_token` か、失敗の分類だけ。
// - 再試行しない（認可コードは1回限りで、やり直しはアプリがする）。リダイレクトには従わない。5秒で打ち切る。
// - 失敗（`invalid_grant` 以外）は、分類だけを1行、`console.error` に出す。こちらの設定の不備（Appleの `invalid_client`。
//   Team ID・Key ID・鍵・Services ID の食い違い）も、Appleの障害も、利用者には同じ 503 になり、でたらめなコードでは
//   Appleは常に `invalid_grant` を返すので（測定）、本物のコードで試すまで設定の不備は分からない。切り分けは、この1行だけ
//   （Workers Logs は無効のままなので、`wrangler dev` の出力か `wrangler tail` で見る）。出すのは、ステータスと、許可リストにある
//   `error` の名前だけ。コード・トークン・Apple の応答の本文・例外の中身は出さない。
import { createAppleClientSecret } from './appleClientSecret.ts';

const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
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
  redirectUri: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export function createAppleCodeExchanger(options: { fetch?: AppleFetch; log?: AppleLog } = {}) {
  const fetchFunction: AppleFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const report = (detail: string) => (options.log ?? ((message) => console.error(message)))(`apple token exchange failed: ${detail}`);

  return {
    async exchange(config: AppleCodeExchangeConfig, code: string, now: number): Promise<AppleCodeExchange> {
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
        redirect_uri: config.redirectUri,
      });

      let response: Response;
      try {
        response = await fetchFunction(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: body.toString(),
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        report('network'); // 通信の失敗・タイムアウト。例外の中身は出さない
        return { ok: false, reason: 'unavailable' };
      }

      let data: unknown;
      try {
        const declared = Number(response.headers.get('content-length'));
        if (declared > MAX_RESPONSE_BYTES) throw new Error('too large');
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) throw new Error('too large');
        data = JSON.parse(text);
      } catch {
        report(`status=${response.status} unreadable`);
        return { ok: false, reason: 'unavailable' };
      }
      if (typeof data !== 'object' || data === null) {
        report(`status=${response.status} unreadable`);
        return { ok: false, reason: 'unavailable' };
      }
      const record = data as Record<string, unknown>;

      if (response.status === 200) {
        if (typeof record.id_token === 'string' && record.id_token !== '') return { ok: true, idToken: record.id_token };
        report('status=200 no id_token');
        return { ok: false, reason: 'unavailable' };
      }
      // Apple は、エラーを 400 と `{"error":"invalid_grant"}` で返す。コードが無効なのは利用者側の事情で、記録しない。
      if (response.status === 400 && record.error === 'invalid_grant') return { ok: false, reason: 'invalid_grant' };
      const name = typeof record.error === 'string' && KNOWN_APPLE_ERRORS.has(record.error) ? record.error : 'other';
      report(`status=${response.status} error=${name}`);
      return { ok: false, reason: 'unavailable' };
    },
  };
}

export type AppleCodeExchanger = ReturnType<typeof createAppleCodeExchanger>;

let shared: AppleCodeExchanger | undefined;

/** Workerが使う交換器。 */
export function getAppleCodeExchanger(): AppleCodeExchanger {
  return (shared ??= createAppleCodeExchanger());
}
