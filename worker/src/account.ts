// アカウント（`users` の行とその子）の削除と、最後に使った時刻（`last_active_at`）の更新。
// 削除は、アカウントの削除（POST /auth/delete。src/deleteAccount.ts）と、Appleの `account-deleted`
// （src/appleNotification.ts）が `deleteUserAccount` を、未使用のアカウントの自動削除（src/inactiveAccounts.ts）が
// `deleteInactiveUserStatement` を使う。方針は
// docs/singfolio-publishing-backend.md §8「アカウントの削除とAppleのトークン失効」「未使用のアカウントの自動削除」。
//
// 今消すのは `users` の行だけ（外部キーの `ON DELETE CASCADE` で、`identities`・`sessions` も消える）。
// 7.4 以降で、プロフィール（`profiles`）・Request・R2の公開スナップショットが増える。そのとき**この関数に足す**
// （呼び出し側を増やさない）。順序は、R2のキーが `username`（`profiles` の行）から作られるので、
// 「`username` を読む → R2のスナップショットを消す → D1の行を消す」。R2の削除に失敗したら、D1の行を残して失敗にする
// （行が無いと、消し残したスナップショットのキーが分からなくなる）。
//
// **自動削除（条件つき）に同じ順序を当てはめるときの注意（7.4）**: 「R2を消す → 条件つきの DELETE」だと、DELETE が
// 条件に外れた（候補に選ばれたあとに、利用者が使った）アカウントの R2 だけが消える。7.4 で「公開ページのあるアカウントは
// 自動削除しない」と決めれば、この問題ごと無くなる（決めずに公開機能を出さない。WBS の 7.4）。

// 最後に使ってから、この期間を過ぎたアカウントを自動で削除する。ポリシー・ストアの申告にも書く値（変えるときは一緒に直す）。
export const INACTIVE_ACCOUNT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** アカウントを無条件に削除する（利用者の操作・Appleの通知）。 */
export async function deleteUserAccount(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?1').bind(userId).run();
}

/**
 * 未使用のアカウントを消す文。**消す文に条件を入れ直す**: 候補を選んだあとに、そのアカウントが使われる（ログイン・
 * セッションの更新・ログアウトで `last_active_at` が進む）ことがある。`deleteUserAccount`（無条件）を使うと、
 * 選んだあとにログインしたアカウントを消してしまう。この文は、消す瞬間に `last_active_at < cutoff` を見る
 * （1文なので、見るのと消すのの間に他の書き込みが入らない）。**削除できたかは、変更行数が 0 より大きいか**で見る
 * （条件に外れれば 0）。「1 のとき」にしない: D1 の `meta.changes` は、外部キーのカスケードで消えた `identities`・`sessions` の
 * 行も数えた（ローカルの D1 で、ユーザー1・ログイン手段1・セッション1で 3。本番は未確認）ので、件数を足し上げる用途には使えない。
 * 0 より大きいかで見れば、本番が 1 を返しても動く。
 * `last_active_at` が NULL のアカウントは消さない（`<` は NULL で偽）。
 */
export function deleteInactiveUserStatement(db: D1Database, userId: string, cutoff: number): D1PreparedStatement {
  return db.prepare('DELETE FROM users WHERE id = ?1 AND last_active_at < ?2').bind(userId, cutoff);
}

/**
 * アカウントの最後に使った時刻を進める文。時計が戻る値は書かない。NULL（0003 より前の行で埋め漏れたもの）は埋める。
 * 書き込みを増やしすぎないよう、呼び出し側が、すでに書く操作（ログイン・24時間に1回のセッションの更新・ログアウト）に
 * 付ける（これだけのために毎回書かない。D1のFreeは書き込み10万行/日）。
 */
export function markUserActiveStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  return db
    .prepare('UPDATE users SET last_active_at = ?1 WHERE id = ?2 AND (last_active_at IS NULL OR last_active_at < ?1)')
    .bind(now, userId);
}
