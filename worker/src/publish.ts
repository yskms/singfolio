// Publish と Unpublish（POST /me/publish・POST /me/unpublish）。方針は docs/singfolio-publishing-backend.md §5・§6・§8
// 「公開ページの可用性」「実装時に決めること」「公開スナップショットの形と上限」。スキーマは migrations/0004。
//
// **順序（変えない）**
// - Publish: 版の予約（D1。`baseVersion` の照合と「公開中」の印を、1文で）→ R2にスナップショットを書く。
//   印（`published_at`）は、**R2に書く前**に立てる。自動削除（D1の行だけを消す）が、公開ページだけを残して消さないため
//   （R2にスナップショットが存在しうる間は、印が必ず立っている。docs §8）。
// - Unpublish: R2を消す → 印を下ろす（版を+1）。順序が逆だと、D1が先に「非公開」になって、R2に残ったスナップショットが
//   自動削除の対象になる。
// - 失敗のとき、どちらも印を立てたまま（安全側）にする。R2の書き込み・削除は、失敗しても書けたかが分からないことがある。
//
// 版は「公開状態の世代番号」。Publish と Unpublish のたびに+1する。別の端末が、古い版（`baseVersion`）のまま Publish すると、
// 409 になる（Unpublish のあとの自動 Publish が、公開を勝手に戻さない）。
//
// 受け入れている小さな競合: 同じアカウントの2つの端末が、数十ミリ秒の間に Publish と Unpublish をすると、
// R2に公開スナップショットがあるのに印が下りることがある。次の Publish か Unpublish（R2のキーを必ず消す）で直る。
import {
  invalidRequest,
  json,
  methodNotAllowed,
  readJsonObject,
  serviceUnavailable,
  unauthorized,
} from './http.ts';
import { getProfile, PROFILE_COLUMNS, toProfile, type ProfileRow } from './profile.ts';
import { authenticateSession, sessionTokenFromRequest } from './session.ts';
import { buildSnapshot, parseSnapshotContent, serializeSnapshot, SNAPSHOT_LIMITS } from './snapshot.ts';
import { snapshotKey } from './username.ts';

const readRow = (db: D1Database, userId: string) =>
  db.prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = ?1`).bind(userId).first<ProfileRow>();

/** 版が食い違うとき。アプリは、`profile` で、今の公開内容（別の端末が公開した、または非公開にした）を見せる。 */
const conflict = (row: ProfileRow): Response => json({ error: 'version_conflict', profile: toProfile(row) }, 409);

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * POST /me/publish。`{"baseVersion":<整数>,"profile":{"displayName","bio"},"songs":[…]}` を受け取り、公開スナップショットを差し替えて、
 * 200 `{"profile": <Profile>}`（版は +1）。`baseVersion` は、端末が最後に見た版（一度も Publish していない端末は 0）。
 * 400: 形の不備（`invalid_request`）、スナップショットの検証（`invalid_snapshot` と、固定の語彙の `reason`・曲の番号 `index`。値は載せない）。
 * 401: セッションが無い・無効。409 `username_required`: まだ `username` を確保していない。409 `version_conflict`（と `profile`）: 版が食い違う。
 * 413: 本文が大きすぎる。503: R2に書けなかった（版は元に戻す。やり直せる）。
 */
export async function handlePublish(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const parsed = await readJsonObject(request, SNAPSHOT_LIMITS.requestBytes);
  if (!parsed.ok) return parsed.response;
  const { baseVersion } = parsed.body;
  if (!isVersion(baseVersion)) return invalidRequest();
  // 許可リストの項目だけを取り出す（src/snapshot.ts）。ほかの項目は、ここで捨てる。
  const content = parseSnapshotContent({ profile: parsed.body.profile, songs: parsed.body.songs });
  if (!content.ok) return json({ error: 'invalid_snapshot', ...content.problem }, 400);

  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();

  const row = await readRow(env.DB, session.userId);
  if (row === null) return json({ error: 'username_required' }, 409);
  if (row.version !== baseVersion) return conflict(row);

  // R2 に書く本文は、**版の予約より前に**作る（版は `baseVersion + 1`、時刻は `now` で、予約の前に決まる）。CPU の上限での打ち切りは
  // 例外ではないので、下の `catch`（版の戻し）に届くとは限らない（Cloudflare の資料に、届くとは書かれていない）。予約のあとに重い処理
  // （1000曲の文字列化）を残すと、そこで打ち切られたとき、D1 の版だけが +1 になり、R2 は前の内容のままになる。D1 と R2 の書き込みの順序は変わらない。
  const version = baseVersion + 1;
  const text = serializeSnapshot(buildSnapshot(content.content, version, now));

  // 版の予約。照合と更新を1文で行うので、同じ版から同時に Publish した端末のうち、1つだけが通る（負けた端末は R2 に書かない）。
  // Display Name・Bio の控えと、「公開中」の印（R2に書く前に立てる）も、ここで書く。
  const { displayName, bio } = content.content.profile;
  const reserve = await env.DB
    .prepare(
      `UPDATE profiles SET version = ?1, published_at = ?2, display_name = ?3, bio = ?4
       WHERE user_id = ?5 AND version = ?6`,
    )
    .bind(version, now, displayName, bio, session.userId, baseVersion)
    .run();
  if (reserve.meta.changes !== 1) {
    // 読んだあとに、別の端末が Publish した（または、アカウントが消えた）。
    const latest = await readRow(env.DB, session.userId);
    return latest === null ? json({ error: 'username_required' }, 409) : conflict(latest);
  }

  try {
    await env.SNAPSHOTS.put(snapshotKey(row.username), text, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
  } catch {
    // 版と控えを元に戻す（戻さないと、端末の次の Publish が、見かけ上の衝突になる）。印は立てたままにする
    // （書けたかが分からない。非公開のまま印が立つのは、自動削除に対して安全な側。Unpublish か次の Publish で直る）。
    // 元に戻す書き込みの失敗は、握りつぶす（端末の次の Publish が、衝突の確認を通る）。値は出さない。
    await env.DB
      .prepare('UPDATE profiles SET version = ?1, display_name = ?2, bio = ?3 WHERE user_id = ?4 AND version = ?5')
      .bind(row.version, row.display_name, row.bio, session.userId, version)
      .run()
      .catch(() => {});
    console.error('publish: snapshot write failed');
    return serviceUnavailable();
  }

  return json({
    profile: toProfile({ username: row.username, version, published_at: now, display_name: displayName, bio }),
  });
}

/**
 * POST /me/unpublish。公開スナップショットを消して、非公開にする（`username` と、控えの Display Name・Bio は残す。端末内のデータにも触れない）。
 * 200 `{"profile": <Profile>}`（公開中だったなら版は +1。すでに非公開なら変わらない。何度呼んでも同じ）。`username` が無ければ `{"profile": null}`。
 * 401: セッションが無い・無効。503: R2を消せなかった（印は立てたまま。やり直せる）。
 */
export async function handleUnpublish(request: Request, env: Env, now: number): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = sessionTokenFromRequest(request);
  if (token === null) return unauthorized();
  const session = await authenticateSession(env.DB, token, now);
  if (session === null) return unauthorized();

  const row = await readRow(env.DB, session.userId);
  if (row === null) return json({ profile: null });

  // 非公開に見えるときも、R2のキーを消す（印が下りているのに残ったスナップショットを、ここで直す。無いキーの削除は成功する）。
  try {
    await env.SNAPSHOTS.delete(snapshotKey(row.username));
  } catch {
    console.error('unpublish: snapshot delete failed');
    return serviceUnavailable();
  }
  if (row.published_at === null) return json({ profile: toProfile(row) });

  await env.DB
    .prepare('UPDATE profiles SET version = version + 1, published_at = NULL WHERE user_id = ?1')
    .bind(session.userId)
    .run();
  return json({ profile: await getProfile(env.DB, session.userId) });
}
