// アカウント（`users` の行とその子）の削除。アカウントの削除（POST /auth/delete。src/deleteAccount.ts）と、
// Appleの `account-deleted`（src/appleNotification.ts）が、同じ関数を使う。方針は
// docs/singfolio-publishing-backend.md §8「アカウントの削除とAppleのトークン失効」。
//
// 今消すのは `users` の行だけ（外部キーの `ON DELETE CASCADE` で、`identities`・`sessions` も消える）。
// 7.4 以降で、プロフィール（`profiles`）・Request・R2の公開スナップショットが増える。そのとき**この関数に足す**
// （呼び出し側を増やさない）。順序は、R2のキーが `username`（`profiles` の行）から作られるので、
// 「`username` を読む → R2のスナップショットを消す → D1の行を消す」。R2の削除に失敗したら、D1の行を残して失敗にする
// （行が無いと、消し残したスナップショットのキーが分からなくなる）。

export async function deleteUserAccount(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?1').bind(userId).run();
}
