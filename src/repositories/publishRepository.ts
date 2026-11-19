// 公開プロフィール・Publish・Unpublish のHTTP（GET /me/profile・PUT /me/username・POST /me/publish・POST /me/unpublish）。
// Serviceからだけ使う。画面・Serviceは、URLやレスポンスの形を知らない（authRepository と同じ）。リクエスト・レスポンスの形は
// docs/singfolio-publishing-backend.md §8「公開プロフィールのエンドポイント」「Publish と Unpublish のエンドポイント」が正で、
// Worker（worker/）とはコードを共有しない。
//
// 認証が要る。セッションの値は、呼び出し側（`publishService`。`accountService` の `withSession` 経由）が渡す。
// 通信の失敗（`network`・`unavailable`・`unauthorized`・`invalid-response`・`invalid-request`）は `AuthError`、サーバーが理由を返して
// 断ったものは `PublishError`（`publishError.ts`）。セッションの値・曲名などの本文を、エラーの `message` にもログにも出さない。
import type { PublicProfile } from '../domain/types.ts';
import { createApiClient, isRecord, type ApiFetchLike } from './apiClient.ts';
import { AuthError } from './authError.ts';
import { PublishError } from './publishError.ts';

/**
 * Publish だけ、待つ上限を長くする。曲が多いと本文が数百KBになり、遅い回線ではアップロードに時間がかかる。アプリが先に打ち切ると、
 * サーバーでは Publish が済んでいるのに、アプリは失敗（`network`）と受け取る（やり直すと版が食い違って 409。置き換えの確認で
 * 解決できるが、利用者を迷わせる）。通常は数秒以内に終わる。
 */
export const PUBLISH_TIMEOUT_MS = 30_000;

/** サーバーの `Profile`。形が違えば `null`（呼び出し側が `invalid-response` にする）。 */
function parseProfile(value: unknown): PublicProfile | null {
  if (!isRecord(value)) return null;
  const { username, version, published, publishedAt, displayName, bio } = value;
  if (typeof username !== 'string' || username === '') return null;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) return null;
  if (typeof published !== 'boolean') return null;
  if (publishedAt !== null && (typeof publishedAt !== 'number' || !Number.isSafeInteger(publishedAt))) return null;
  if (typeof displayName !== 'string' || typeof bio !== 'string') return null;
  // 許可リストの項目だけで、新しく作る（サーバーが項目を足しても、画面に届かない）。
  return { username, version, published, publishedAt, displayName, bio };
}

function requireProfile(value: unknown): PublicProfile {
  const profile = parseProfile(value);
  if (profile === null) throw new AuthError('invalid-response');
  return profile;
}

/** 本文の `error`（サーバーの固定の語彙）。読めなければ `null`。 */
async function errorName(response: { json(): Promise<unknown> }): Promise<{ name: string | null; body: Record<string, unknown> }> {
  const body = await response.json();
  if (!isRecord(body)) return { name: null, body: {} };
  return { name: typeof body.error === 'string' ? body.error : null, body };
}

export function createPublishRepository(
  fetchImpl: ApiFetchLike,
  options: { origin?: string; timeoutMs?: number; publishTimeoutMs?: number } = {},
) {
  const client = createApiClient(fetchImpl, options);
  const publishTimeoutMs = options.publishTimeoutMs ?? PUBLISH_TIMEOUT_MS;

  return {
    /**
     * `GET /me/profile`。このアカウントの公開の状態。`null` は、まだ `username` を確保していない。
     */
    getProfile(session: string): Promise<PublicProfile | null> {
      return client.request('GET', '/me/profile', { session }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !('profile' in data)) throw new AuthError('invalid-response');
        return data.profile === null ? null : requireProfile(data.profile);
      });
    },

    /**
     * `PUT /me/username`。`username`（小文字）を確保する。同じ名前をもう一度確保しても成功。失敗: `username-invalid`
     * （規則に合わない）、`username-unavailable`（取られている・削除したアカウントの名前・予約語。区別されない）、
     * `username-already-set`（このアカウントは別の名前を確保済み。変更できない）。
     */
    claimUsername(session: string, username: string): Promise<PublicProfile> {
      return client.request(
        'PUT',
        '/me/username',
        {
          session,
          json: { username },
          rejected: async (status, response) => {
            const { name } = await errorName(response);
            if (status === 400 && name === 'username_invalid') return new PublishError('username-invalid');
            if (status === 409 && name === 'username_unavailable') return new PublishError('username-unavailable');
            if (status === 409 && name === 'username_already_set') return new PublishError('username-already-set');
            return undefined;
          },
        },
        async (response) => {
          const data = await response.json();
          if (!isRecord(data)) throw new AuthError('invalid-response');
          return requireProfile(data.profile);
        },
      );
    },

    /**
     * `POST /me/publish`。公開内容（スナップショット）を差し替える。成功は、版が+1された `Profile`。失敗: `username-required`、
     * `version-conflict`（`profile` が今の公開内容）、`invalid-snapshot`（アプリの組み立ての不具合）、`too-large`（413）。
     * 待つ上限は `PUBLISH_TIMEOUT_MS`。通信が切れた・時間内に応答が無い（`network`）ときは、サーバーで済んでいることがある
     * （同じ `baseVersion` で送り直すと、`version-conflict` になる）。
     */
    publish(session: string, body: unknown): Promise<PublicProfile> {
      return client.request(
        'POST',
        '/me/publish',
        {
          session,
          json: body,
          timeoutMs: publishTimeoutMs,
          rejected: async (status, response) => {
            if (status === 413) return new PublishError('too-large');
            const { name, body: data } = await errorName(response);
            if (status === 400 && name === 'invalid_snapshot') return new PublishError('invalid-snapshot');
            if (status === 409 && name === 'username_required') return new PublishError('username-required');
            if (status === 409 && name === 'version_conflict') {
              const profile = parseProfile(data.profile);
              // 食い違いの本文が読めなければ、置き換えの確認に進めない。応答の不備として扱う。
              return profile === null ? new AuthError('invalid-response') : new PublishError('version-conflict', { profile });
            }
            return undefined;
          },
        },
        async (response) => {
          const data = await response.json();
          if (!isRecord(data)) throw new AuthError('invalid-response');
          return requireProfile(data.profile);
        },
      );
    },

    /**
     * `POST /me/unpublish`。公開スナップショットを消して、非公開にする（`username` は残る。端末内のデータにも触れない）。
     * 何度呼んでも同じ。`username` が無ければ `null`。
     */
    unpublish(session: string): Promise<PublicProfile | null> {
      return client.request('POST', '/me/unpublish', { session }, async (response) => {
        const data = await response.json();
        if (!isRecord(data) || !('profile' in data)) throw new AuthError('invalid-response');
        return data.profile === null ? null : requireProfile(data.profile);
      });
    },
  };
}

export type PublishRepository = ReturnType<typeof createPublishRepository>;
