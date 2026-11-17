// セッションの発行・認証・失効。方式は docs/singfolio-publishing-backend.md §8「セッション」。
//
// セッションの値は、不透明なランダム値（32バイト = base64url の43字。JWTにしない）。D1の `sessions` には
// ハッシュ（SHA-256 の base64url）だけを置き、値そのものは端末のSecureStoreにだけある。値は
// `Authorization: Bearer <値>` で送る（URLに載せない）。ログにも出さない。
import type { IdTokenProvider } from './idToken.ts';
import { toBase64Url } from './nonce.ts';

// 期限は、最後の利用から90日（目安）。最後の利用の時刻（`last_used_at`）は、前回の書き込みから24時間以上
// たったときだけ書くので、期限は実際の最後の利用から、最大24時間早まる。
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// 毎回書くと、D1のFreeの書き込みの上限（10万行/日）を、認証済みのリクエストの数だけ消費する。
export const SESSION_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BEARER_PATTERN = /^bearer ([A-Za-z0-9_-]{43})$/i;

export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

// 値は256ビットの乱数なので、ソルトの無い SHA-256 でよい（総当たりで引ける短い値ではない）。
async function hashToken(token: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

/** `Authorization: Bearer <値>` から、セッションの値を取り出す。無い・形が違うなら null。 */
export function sessionTokenFromRequest(request: Request): string | null {
  return BEARER_PATTERN.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;
}

/**
 * セッションを発行して、値を返す（D1に置くのはハッシュだけ）。
 * 同じログイン手段（`identity`）の、期限を過ぎたセッションを、同じバッチで消す（Cron Triggerは使わない）。
 * 全体を掃除しない（`identity_id` の索引で引けるので、件数が増えても、ログインの費用が増えない）。
 * 二度とログインしない人の、期限を過ぎた行は残る（1行は小さく、認証には使えない）。
 *
 * **発行しないことがある（null）**: ログイン手段の行が無い（直前にAppleの `account-deleted` で消えた）、または
 * `consent_revoked_at`（Appleの `consent-revoked` の `event_time`）が、このログインの開始時刻（`now`）と同じか、それより後。
 * 同じミリ秒は、取り消しより前と見る（通知の削除の条件 `created_at <= event_time` と同じ側。通知とログインのどちらが先でも、
 * 取り消しと同じ時刻に始まったログインのセッションは、残らない）。
 * ログインは、検証を通ったあと、ここへ来るまでの間に、通知の処理が入りうる。通知を先に処理した場合のセッションを、
 * ここで作らない（通知を後に処理した場合は、通知が消す）。条件は INSERT の1文の中で見るので、通知の処理
 * （削除と記録の1バッチ）と、どちらが先でも、取り消し後のセッションは残らない（migrations/0002）。
 */
export async function createSession(db: D1Database, identityId: string, now: number): Promise<string | null> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const [, insert] = await db.batch([
    db.prepare('DELETE FROM sessions WHERE identity_id = ?1 AND last_used_at <= ?2').bind(identityId, now - SESSION_TTL_MS),
    db
      .prepare(
        `INSERT INTO sessions (token_hash, identity_id, created_at, last_used_at)
         SELECT ?1, ?2, ?3, ?3
         WHERE EXISTS (SELECT 1 FROM identities WHERE id = ?2 AND (consent_revoked_at IS NULL OR consent_revoked_at < ?3))`,
      )
      .bind(await hashToken(token), identityId, now),
  ]);
  return insert!.meta.changes === 1 ? token : null;
}

export interface AuthenticatedSession {
  userId: string;
  identityId: string;
  /** このセッションを作ったログイン手段の `sub`（アカウントの削除の再認証で、同じアカウントか確かめる）。 */
  sub: string;
  /** このセッションを作ったログイン手段。 */
  provider: IdTokenProvider;
}

/**
 * セッションの値から、ユーザーを引く。無い・期限切れ・形が違うなら null（理由は区別しない）。
 * ユーザーIDは、クライアントから受け取らず、ここで得たものだけを使う。
 * 通ったとき、`last_used_at` が24時間以上前なら、更新する（それより新しければ書かない）。
 * 期限を過ぎた行は、見つかった時点で消す。
 */
export async function authenticateSession(
  db: D1Database,
  token: string,
  now: number,
): Promise<AuthenticatedSession | null> {
  if (!isSessionToken(token)) return null;
  const hash = await hashToken(token);
  const row = await db
    .prepare(
      `SELECT s.last_used_at AS last_used_at, s.identity_id AS identity_id, i.user_id AS user_id, i.provider AS provider, i.sub AS sub
       FROM sessions s JOIN identities i ON i.id = s.identity_id
       WHERE s.token_hash = ?1`,
    )
    .bind(hash)
    .first<{ last_used_at: number; identity_id: string; user_id: string; provider: IdTokenProvider; sub: string }>();
  if (row === null) return null;

  const idle = now - row.last_used_at;
  if (idle >= SESSION_TTL_MS) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash).run();
    return null;
  }
  if (idle >= SESSION_TOUCH_INTERVAL_MS) {
    // 同時の2つのリクエストが両方書いても、同じ値になる。時計が戻る値は書かない。
    await db.prepare('UPDATE sessions SET last_used_at = ?1 WHERE token_hash = ?2 AND last_used_at < ?1').bind(now, hash).run();
  }
  return { userId: row.user_id, identityId: row.identity_id, sub: row.sub, provider: row.provider };
}

/**
 * セッションを失効させる（行の削除）。無い値でも成功にする（何度呼んでも結果が同じ。ログアウトは、
 * 値を持っている側だけが呼べる）。
 */
export async function revokeSession(db: D1Database, token: string): Promise<void> {
  if (!isSessionToken(token)) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await hashToken(token)).run();
}

/**
 * 同じユーザーの、`currentToken`（認証済みのセッションの値）以外のセッションを、すべて失効させる（行の削除）。
 * ユーザーに複数のログイン手段（AppleとGoogle）がつながっていれば、手段をまたいで消す
 * （`sessions` は `identity_id` を持つので、`identities` を `user_id` で引く）。期限を過ぎた行も、ここで消える。
 * 端末をなくしたとき、残っている端末から、なくした端末の値を失効させる手段（絶対的なセッションの期限は置かない代わり）。
 * `userId` は、`authenticateSession` で得たものを渡す（クライアントから受け取らない）。
 */
export async function revokeOtherSessions(db: D1Database, userId: string, currentToken: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM sessions
       WHERE token_hash <> ?1 AND identity_id IN (SELECT id FROM identities WHERE user_id = ?2)`,
    )
    .bind(await hashToken(currentToken), userId)
    .run();
}
