// アカウントのHTTP（POST /auth/nonce・/auth/login・/auth/apple/login・/auth/logout・/auth/logout-others・/auth/delete）。Serviceからだけ使う。画面・Serviceは、
// URLやレスポンスの形を知らない（候補検索の songCatalogRepository と同じ）。リクエスト・レスポンスの
// 形は docs/singfolio-publishing-backend.md §8「認証の方式」が正で、Worker（worker/）とはコードを共有しない。
//
// HTTPの共通の扱い（再試行しない・5xxの扱い・Cookieを送らない・タイムアウト）は `apiClient.ts`。
//
// 守ること:
// - IDトークン・nonce・セッションの値を、エラーの `message` にも、ログにも出さない（応答の本文も載せない）。
// - 再試行はしない（やり直しは利用者の操作。公開鍵の取得に失敗した503では、`T` も使い切りにならない）。
import type { AuthProvider } from '../domain/types.ts';
import { createApiClient, isOpaqueValue, isRecord, type ApiFetchLike } from './apiClient.ts';
import { AuthError } from './authError.ts';

/** `fetch` のうち、ここで使う部分（グローバルの `fetch` をそのまま渡せる形）。 */
export type AuthFetchLike = ApiFetchLike;

/**
 * アカウントの削除（`POST /auth/delete`）だけ、待つ上限を長くする。Worker は 1 回のリクエストの中で、公開鍵の取得・Appleの認可コードの交換・
 * Appleのトークンの失効を順に待つ（それぞれ最大5秒。合計15秒ほど）。アプリが先に打ち切ると、サーバーでは削除が済んでいるのに、
 * アプリは失敗（`network`）と受け取り、端末のセッションも残る（やり直すと 401）。通常は1秒以内に終わるので、長くするのは、Appleが遅いときだけ。
 * 削除は、利用者が確認して押す、まれな操作（画面は待ちの表示を出す。7.3.11）。
 */
export const DELETE_TIMEOUT_MS = 30_000;

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

/**
 * アカウントの削除の再認証の本文（`POST /auth/delete`）。再認証は、ログインと同じ手順で得た値（`T`・IDトークン、
 * AndroidのAppleは認可コードと `V`）。ユーザーIDは送らない（サーバーが、セッションから決める）。
 */
export type DeleteAccountRequest =
  /** iOSのApple。`authorizationCode` は、Appleのトークンの失効に使う（無くても削除できるが、失効はできない）。 */
  | { provider: 'apple'; nonce: string; idToken: string; authorizationCode?: string }
  /** AndroidのApple（Web経由）。 */
  | { provider: 'apple'; nonce: string; code: string; verifier: string }
  | { provider: 'google'; nonce: string; idToken: string };

export interface DeleteAccountResponse {
  /** Appleのトークンを失効できたか。Googleは `null`（失効するものが無い）。`false` でも、アカウントは消えている。 */
  appleRevoked: boolean | null;
}

export function createAuthRepository(
  fetchImpl: AuthFetchLike,
  options: { origin?: string; timeoutMs?: number; deleteTimeoutMs?: number } = {},
) {
  const client = createApiClient(fetchImpl, options);
  const deleteTimeoutMs = options.deleteTimeoutMs ?? DELETE_TIMEOUT_MS;

  /** POST して、成功（2xx）の応答を返す。失敗は `AuthError`。 */
  function post<T>(
    path: string,
    init: Parameters<typeof client.request>[2],
    read: (response: { json(): Promise<unknown> }) => Promise<T>,
  ): Promise<T> {
    return client.request('POST', path, init, read);
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

    /**
     * `POST /auth/logout-others`。「ほかの端末をすべてログアウト」: このセッション以外の、同じユーザーのセッションを、
     * サーバーが失効させる。ログアウトと違い、認証が要る: 401（セッションが無効）は `unauthorized`（Serviceが、端末の
     * セッションを捨てる）。本文は読まない。
     */
    logoutOthers(session: string): Promise<void> {
      return post('/auth/logout-others', { session }, async () => {});
    },

    /**
     * `POST /auth/delete`。アカウントを削除する（再認証つき）。成功（200）は `{ appleRevoked }`。失敗:
     * 401（セッションが無効）は `unauthorized`、403 は本文の `error` で `reauth-failed`（再認証が通らない）か
     * `account-mismatch`（別のアカウントで再認証した）。503 などは `unavailable`。
     * 再認証の値（IDトークン・認可コード・`T`・`V`）と、セッションの値を、エラーの `message` にもログにも出さない。
     * 待つ上限は `DELETE_TIMEOUT_MS`（ほかより長い）。それでも `network` になったときは、削除が済んでいる可能性がある
     * （応答が届かなかっただけ）。やり直すと、セッションが無いので 401（`unauthorized`）になる。
     */
    deleteAccount(session: string, request: DeleteAccountRequest): Promise<DeleteAccountResponse> {
      return post(
        '/auth/delete',
        {
          session,
          json: request,
          timeoutMs: deleteTimeoutMs,
          rejected: async (status, response) => {
            if (status !== 403) return undefined;
            const data = await response.json();
            if (!isRecord(data)) return undefined;
            if (data.error === 'reauth_failed') return new AuthError('reauth-failed');
            if (data.error === 'account_mismatch') return new AuthError('account-mismatch');
            return undefined;
          },
        },
        async (response) => {
          const data = await response.json();
          if (!isRecord(data) || (data.appleRevoked !== null && typeof data.appleRevoked !== 'boolean')) {
            throw new AuthError('invalid-response');
          }
          return { appleRevoked: data.appleRevoked };
        },
      );
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
