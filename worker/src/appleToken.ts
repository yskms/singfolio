// Apple の認可コードを、IDトークンに交換する（`POST https://appleid.apple.com/auth/token`）。AndroidのAppleログイン
// （Web経由）で使う。方式は docs/singfolio-publishing-backend.md §8「AndroidのAppleログイン（Web経由）」。
//
// 守ること:
// - 受け取るのは `id_token` だけ。`refresh_token`・`access_token` は、読まず、保存せず、ログにも出さない
//   （ログインには要らない。アカウントの削除（7.3.10）は、再認証であらためて得る）。
// - Apple の応答の本文・コード・IDトークンを、結果にもエラーにも載せない。返すのは、`id_token` か、失敗の分類だけ。
// - 再試行しない（認可コードは1回限りで、やり直しはアプリがする）。リダイレクトには従わない。5秒で打ち切る。
import { createAppleClientSecret } from './appleClientSecret.ts';

const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const TIMEOUT_MS = 5000;
// IDトークンは1〜2KB。応答の大きさの上限（`id_token` と、使わない `refresh_token` などが入る）。
const MAX_RESPONSE_BYTES = 64 * 1024;

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

export function createAppleCodeExchanger(options: { fetch?: AppleFetch } = {}) {
  const fetchFunction: AppleFetch = options.fetch ?? ((url, init) => fetch(url, init));

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
        return { ok: false, reason: 'unavailable' };
      }

      let data: unknown;
      try {
        const declared = Number(response.headers.get('content-length'));
        if (declared > MAX_RESPONSE_BYTES) return { ok: false, reason: 'unavailable' };
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) return { ok: false, reason: 'unavailable' };
        data = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      if (typeof data !== 'object' || data === null) return { ok: false, reason: 'unavailable' };
      const record = data as Record<string, unknown>;

      if (response.status === 200) {
        return typeof record.id_token === 'string' && record.id_token !== ''
          ? { ok: true, idToken: record.id_token }
          : { ok: false, reason: 'unavailable' };
      }
      // Apple は、エラーを 400 と `{"error":"invalid_grant"}` で返す。
      if (response.status === 400 && record.error === 'invalid_grant') return { ok: false, reason: 'invalid_grant' };
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
