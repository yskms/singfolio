// ログイン手段（`identities`）の引き当てと作成。IDトークンの検証（src/idToken.ts）が通った `sub` から呼ぶ。
// スキーマは migrations/0001_initial.sql、方針は docs/singfolio-publishing-backend.md §8「IDトークンの検証」。
//
// 保存するのは `sub` と、どのログイン手段か（`provider`）だけ。`email`・名前などのクレームは受け取らない。
import type { IdTokenProvider } from './idToken.ts';

export interface ResolvedIdentity {
  identityId: string;
  userId: string;
  /** このログインで、ユーザー（アカウント）を新しく作ったか。 */
  created: boolean;
}

/**
 * `(provider, sub)` のログイン手段を引き、無ければユーザーごと作る。引いたとき・作ったときの両方で、
 * `last_sign_in_at` を `now` にする（Appleのサーバー間通知のうち、これより前のものを無視するため）。
 *
 * 1つのバッチ（トランザクション）で行う。「引いてから作る」を2回のクエリに分けると、同じ人の
 * 同時の初回ログインで、`identities` の一意制約に当たるか、`identities` の無いユーザーが残る。
 * 各文の条件（`NOT EXISTS`・`EXISTS`）は、バッチの中で順に評価されるので、競合しない。
 * 書き込みの行数は、既存のログインで2行（`identities.last_sign_in_at` と `users.last_active_at` の更新。どちらも索引の列ではない）、
 * 初回で2行（と索引）。
 * Provider が違えば、`sub` が同じでも別のログイン手段（別のユーザー）。自動ではつながない。
 */
export async function resolveIdentity(
  db: D1Database,
  provider: IdTokenProvider,
  sub: string,
  now: number,
): Promise<ResolvedIdentity> {
  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const [userInsert, , , , lookup] = await db.batch<{ id: string; user_id: string }>([
    // その手段がまだ無いときだけ、ユーザーを作る。最後に使った時刻（`last_active_at`。未使用のアカウントの自動削除の基準）も入れる。
    db
      .prepare(
        `INSERT INTO users (id, created_at, last_active_at)
         SELECT ?1, ?2, ?2 WHERE NOT EXISTS (SELECT 1 FROM identities WHERE provider = ?3 AND sub = ?4)`,
      )
      .bind(userId, now, provider, sub),
    // 上でユーザーを作ったときだけ（userId の行があるときだけ）、ログイン手段を作る。
    db
      .prepare(
        `INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2)`,
      )
      .bind(identityId, userId, provider, sub, now),
    // 既にあったログイン手段の、最後のサインインを進める（作ったばかりの行は、同じ時刻なので書かない。
    // 時計がずれて後戻りする値も書かない）。
    db
      .prepare('UPDATE identities SET last_sign_in_at = ?1 WHERE provider = ?2 AND sub = ?3 AND last_sign_in_at < ?1')
      .bind(now, provider, sub),
    // 既にあったアカウントの、最後に使った時刻も進める（作ったばかりのユーザーは同じ時刻なので書かない）。
    // ユーザーIDは、ログイン手段から引く（既存のログイン手段の `user_id` は、上で作った `userId` とは限らない）。
    db
      .prepare(
        `UPDATE users SET last_active_at = ?1
         WHERE id = (SELECT user_id FROM identities WHERE provider = ?2 AND sub = ?3)
           AND (last_active_at IS NULL OR last_active_at < ?1)`,
      )
      .bind(now, provider, sub),
    db.prepare('SELECT id, user_id FROM identities WHERE provider = ?1 AND sub = ?2').bind(provider, sub),
  ]);

  const row = lookup!.results[0];
  if (row === undefined) throw new Error('identity was not created');
  return { identityId: row.id, userId: row.user_id, created: userInsert!.meta.changes === 1 };
}
