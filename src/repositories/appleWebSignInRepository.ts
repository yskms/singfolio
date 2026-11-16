// AndroidのAppleログイン（Web経由）。Appleの認可の画面（Custom Tab）を開き、アプリのURLスキームへの戻りから、
// 認可コードを取り出す。`account` Service に `AuthCodeProvider` として注入する（`services/index.ts`。Androidだけ）。
// 画面・Serviceは、URL・ブラウザの扱いを知らない。方式は docs/singfolio-publishing-backend.md §8
// 「AndroidのAppleログイン（Web経由）」。
//
// ブラウザ（expo-web-browser）・URLの受け取り（Linking）・前面への復帰（AppState）は注入する。`src/` は
// Nodeのテストから直接実行するので、ここでは import しない（Nodeのテストは偽物で動かす）。
//
// 守ること:
// - 認可リクエストに、名前・メールのスコープを付けない（`scope` を送らない。使うのは `sub` だけ）。
//   スコープが無いので、`response_mode=query` でよい（スコープを付けると `form_post` が必須になる）。
// - `state` と `nonce` には、渡された `SHA-256(T)` をそのまま入れる。戻ってきた `state` が違うURLは、自分の
//   フローのものではない（他のアプリが押し込んだものなど）ので、受け取らず、待ち続ける。
// - 認可コード・`state` を、エラーの `message` にもログにも出さない。失敗は `code`（`AuthError`）だけで伝える。
// - 戻り先のURLスキーム（`singfolio://auth/apple`）は、Worker（`/auth/apple/callback`）が固定で持つ値と同じ。
import { AuthError } from './authError.ts';

/** Apple の Services ID（Webのサインインの `client_id`）。Workerの `APPLE_SERVICES_ID` と同じ（Return URL を登録した名前）。 */
export const APPLE_SERVICES_ID = 'com.yskms.singfolio.web';
/** Services ID の Return URL。Worker のコールバック。ここから、アプリのURLスキームへ 302 で戻る。 */
export const APPLE_CALLBACK_URL = 'https://singfolio.app/auth/apple/callback';
/** Workerのコールバックが、アプリへ戻すURL。アプリのURLスキーム（app.json の `scheme`）で始まる。 */
export const APP_RETURN_URL = 'singfolio://auth/apple';

const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';

/**
 * 認可の画面を開くURL。`state` と `nonce` は、どちらも `hashedNonce`（`SHA-256(T)`）。`scope` は付けない。
 * `hashedNonce` は URL の安全な文字（base64url）だけだが、念のためエンコードする。
 */
export function buildAuthorizeUrl(hashedNonce: string): string {
  const query = [
    ['client_id', APPLE_SERVICES_ID],
    ['redirect_uri', APPLE_CALLBACK_URL],
    ['response_type', 'code'],
    ['response_mode', 'query'],
    ['state', hashedNonce],
    ['nonce', hashedNonce],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${AUTHORIZE_URL}?${query}`;
}

export interface ReturnParams {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * アプリに渡されたURLが、Appleからの戻り（`singfolio://auth/apple?...`）なら、その `code`・`state`・`error` を返す。
 * 違うURLなら `null`。React Native の `URL` は完全ではないので、自前で読む。同じ名前が複数あれば最初のもの。
 */
export function parseReturnUrl(url: string): ReturnParams | null {
  const rest = url.startsWith(APP_RETURN_URL) ? url.slice(APP_RETURN_URL.length) : null;
  // `singfolio://auth/apple` の直後は、終わり・`?`・`#`、または末尾の `/` だけ（`.../applesauce` などは別のURL）。
  if (rest === null || !/^\/?(?:[?#][\s\S]*)?$/.test(rest)) return null;
  const queryStart = rest.indexOf('?');
  const query = queryStart < 0 ? '' : rest.slice(queryStart + 1).split('#')[0] ?? '';
  const params: ReturnParams = {};
  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    if (equals <= 0) continue;
    const key = pair.slice(0, equals);
    if (key !== 'code' && key !== 'state' && key !== 'error') continue;
    if (params[key] !== undefined) continue;
    try {
      params[key] = decodeURIComponent(pair.slice(equals + 1).replace(/\+/g, ' '));
    } catch {
      // 読めない値は、無いものとして扱う
    }
  }
  return params;
}

/** ブラウザ・URLの受け取り・前面への復帰。実機では expo-web-browser・Linking・AppState（`services/index.ts`）。 */
export interface AuthBrowser {
  /** URLをブラウザ（Custom Tab）で開く。開けたら解決する（ブラウザが閉じるのは待たない）。開けなければ失敗する。 */
  open(url: string): Promise<void>;
  /** アプリに渡されたURL（ディープリンク）を受け取る。戻り値は、受け取りをやめる関数。 */
  onUrl(listener: (url: string) => void): () => void;
  /** アプリが、いったん前面を離れたあと、前面に戻ったとき（ブラウザを閉じた・戻りのURLでアプリが開いた）。 */
  onForeground(listener: () => void): () => void;
}

export interface AuthCodeProviderLike {
  getAuthorizationCode(hashedNonce: string): Promise<string>;
}

// 前面に戻ってから、戻りのURLを待つ時間。戻りのURLでアプリが開くときは、前面への復帰とURLの到着の順番が
// 決まっていない（どちらが先でもよい）。この間にURLが来なければ、利用者がブラウザを閉じたと見る。
const FOREGROUND_GRACE_MS = 1500;
// 全体の上限。`account` の待ちの上限（5分）と同じ。過ぎたら、受け取りをやめる（結果は `account` が既に捨てている）。
const WAIT_LIMIT_MS = 5 * 60_000;

export function createAppleWebSignInRepository(
  browser: AuthBrowser,
  options: { graceMs?: number; waitLimitMs?: number } = {},
): AuthCodeProviderLike {
  const graceMs = options.graceMs ?? FOREGROUND_GRACE_MS;
  const waitLimitMs = options.waitLimitMs ?? WAIT_LIMIT_MS;

  return {
    getAuthorizationCode(hashedNonce) {
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        let graceTimer: ReturnType<typeof setTimeout> | undefined;
        const cleanups: Array<() => void> = [];

        const finish = (result: () => void) => {
          if (settled) return;
          settled = true;
          for (const cleanup of cleanups) cleanup();
          result();
        };
        const fail = (code: ConstructorParameters<typeof AuthError>[0]) => finish(() => reject(new AuthError(code)));

        // 受け取りは、ブラウザを開く前に始める（戻りのURLを取りこぼさない）。
        cleanups.push(
          browser.onUrl((url) => {
            const params = parseReturnUrl(url);
            if (params === null) return;
            // 自分のフローの `state` だけを受け取る。違う・無いものは、他のアプリが押し込んだものかもしれない。
            // 取りやめ（`error`）は、`state` が付かないことがあるので、無くてもよい（違うものは受け取らない）。
            if (params.state !== undefined && params.state !== hashedNonce) return;
            if (params.error !== undefined) {
              fail(params.error === 'user_cancelled_authorize' ? 'cancelled' : 'provider-failed');
              return;
            }
            if (params.code !== undefined && params.state === hashedNonce && params.code !== '') {
              const { code } = params;
              finish(() => resolve(code));
            }
          }),
        );
        cleanups.push(
          browser.onForeground(() => {
            // 戻りのURLが先に来ていれば、すでに終わっている。まだなら、猶予のあいだ待つ。
            graceTimer ??= setTimeout(() => fail('cancelled'), graceMs);
          }),
        );
        const limitTimer = setTimeout(() => fail('timeout'), waitLimitMs);
        cleanups.push(() => {
          clearTimeout(limitTimer);
          if (graceTimer !== undefined) clearTimeout(graceTimer);
        });

        // 開けなかった（ブラウザが無い、など）。原因を言い切らない。
        browser.open(buildAuthorizeUrl(hashedNonce)).catch(() => fail('provider-failed'));
      });
    },
  };
}
