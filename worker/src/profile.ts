// 公開プロフィール（GET /me/profile・PUT /me/username）。スキーマは migrations/0004、方針は
// docs/singfolio-publishing-backend.md §8「バックエンドが担当すること」「公開スナップショットの形と上限」。
//
// Display Name・Bio は、ここでは更新しない（Publish のリクエストに載せる。7.4.4）。`profiles` の値は、最後に Publish した値の控え。
// このエンドポイントは、認証が要る（`Authorization: Bearer <セッションの値>`）。ユーザーIDは、セッションから決める。
import { invalidRequest, json, methodNotAllowed, readJsonObject, unauthorized } from './http.ts';
import { authenticateSession, sessionTokenFromRequest } from './session.ts';
import { checkUsername } from './username.ts';

const MAX_BODY_BYTES = 1024;

/** アプリに返すプロフィール。 */
export interface Profile {
  username: string;
  /** Publish のたびに +1。0 は、まだ一度も Publish していない。 */
  version: number;
  /** 公開中か（`published_at` が NULL でない）。 */
  published: boolean;
  /** 最後に Publish した時刻（ミリ秒）。非公開なら null。 */
  publishedAt: number | null;
  /** 最後に Publish した Display Name・Bio の控え（まだなら空）。 */
  displayName: string;
  bio: string;
}

interface ProfileRow {
  username: string;
  version: number;
  published_at: number | null;
  display_name: string;
  bio: string;
}

const PROFILE_COLUMNS = 'username, version, published_at, display_name, bio';

const toProfile = (row: ProfileRow): Profile => ({
  username: row.username,
  version: row.version,
  published: row.published_at !== null,
  publishedAt: row.published_at,
  displayName: row.display_name,
  bio: row.bio,
});

export async function getProfile(db: D1Database, userId: string): Promise<Profile | null> {
  const row = await db
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = ?1`)
    .bind(userId)
    .first<ProfileRow>();
  return row === null ? null : toProfile(row);
}

export type ClaimResult =
  | { ok: true; profile: Profile }
  // 取られている・削除されたアカウントの名前・予約語は、区別しない（どれも「使えない」）。
  | { ok: false; reason: 'unavailable' }
  // このアカウントは、すでに別の名前を確保している（`username` は変更しない）。
  | { ok: false; reason: 'already_set' };

/**
 * `username` を確保する（規則の検査は呼び出し側。`checkUsername`）。同じアカウントが同じ名前をもう一度確保しても成功する（何度呼んでも同じ）。
 *
 * 競合は、一意制約に任せる: `INSERT OR IGNORE` は、名前が取られている（`username` の UNIQUE）、このアカウントがすでに確保している
 * （`user_id` の主キー）、のどちらでも黙って何も入れない。そのあと同じバッチで、このアカウントの行を読んで、どちらかを見分ける。
 * 同時の確保（別のアカウントが同じ名前、同じアカウントの連打）でも、勝つのは1つだけで、エラーの文言には頼らない。
 * 削除したアカウントの名前（`retired_usernames`）は、入れる文の条件で弾く。
 */
export async function claimUsername(db: D1Database, userId: string, username: string, now: number): Promise<ClaimResult> {
  const [, read] = await db.batch<ProfileRow>([
    db
      .prepare(
        `INSERT OR IGNORE INTO profiles (user_id, username, created_at)
         SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM retired_usernames WHERE username = ?2)`,
      )
      .bind(userId, username, now),
    db.prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = ?1`).bind(userId),
  ]);
  const row = read!.results[0];
  if (row === undefined) return { ok: false, reason: 'unavailable' };
  if (row.username !== username) return { ok: false, reason: 'already_set' };
  return { ok: true, profile: toProfile(row) };
}

/**
 * GET /me/profile。200 `{"profile": <Profile>|null}`（`null` は、まだ `username` を確保していない）。
 * 401: セッションが無い・無効。
 */
export async function handleGetProfile(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();
  return json({ profile: await getProfile(env.DB, session.userId) });
}

/**
 * PUT /me/username。`{"username":"…"}` を確保して、200 `{"profile": <Profile>}`。
 * 400 `username_invalid`: 規則に合わない（形の不備を含む）。409 `username_unavailable`: 取られている・削除されたアカウントの名前・予約語。
 * 409 `username_already_set`: このアカウントは、すでに別の名前を確保している（変更はできない）。401: セッションが無い・無効。
 */
export async function handleClaimUsername(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'PUT') return methodNotAllowed('PUT');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const parsed = await readJsonObject(request, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { username } = parsed.body;
  if (typeof username !== 'string') return invalidRequest();

  // 形の不備と予約語は、認証の前に断る（D1に触れない。`/auth/delete` と同じく、形の不備は認証の有無に関わらず 400）。
  const check = checkUsername(username);
  if (check === 'invalid') return json({ error: 'username_invalid' }, 400);

  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();
  if (check === 'reserved') return json({ error: 'username_unavailable' }, 409);

  const result = await claimUsername(env.DB, session.userId, username, now);
  if (result.ok) return json({ profile: result.profile });
  return json({ error: result.reason === 'already_set' ? 'username_already_set' : 'username_unavailable' }, 409);
}
