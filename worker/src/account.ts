// アカウント（`users` の行とその子）の削除と、最後に使った時刻（`last_active_at`）の更新。
// 削除は、アカウントの削除（POST /auth/delete。src/deleteAccount.ts）と、Appleの `account-deleted`
// （src/appleNotification.ts）が `deleteUserAccount` を、未使用のアカウントの自動削除（src/inactiveAccounts.ts）が
// `deleteInactiveUserStatement` と `retireInactiveUsernameStatement` を使う。方針は
// docs/singfolio-publishing-backend.md §8「アカウントの削除とAppleのトークン失効」「未使用のアカウントの自動削除」。
//
// **利用者の操作（無条件の削除。`deleteUserAccount`）の順序は、「`username` を読む → R2のスナップショットを消す → D1の行を消す」。**
// R2のキーは `username`（`profiles` の行）から作られるので、行を消してからでは、消し残したスナップショットのキーが分からなくなる。
// R2を消せなかったら、D1の行を残して失敗にする（`false` を返す。呼び出し側が、やり直せる失敗として伝える）。
// D1の行を消すバッチに、`username` を `retired_usernames` へ移す文を入れる（再利用させない。ユーザーIDとは結びつけない）。
// 削除で消えるのは、`users` と、外部キーのカスケードで `identities`・`sessions`・`profiles`。Requestの削除は 7.6 で足す。
//
// **自動削除（条件つき。D1の行だけを消す）は、公開ページのあるアカウントを対象外にする**（`AUTO_DELETE_EXEMPT_SQL`）。
// R2のスナップショットを持つアカウントは、必ず印（`profiles.published_at`）が立っているので、D1の行だけを消しても、
// 公開ページだけが残ることは無い（印は、R2に書く前に立て、R2を消したあとに下ろす。src/publish.ts）。
// 対象外の条件は、候補の SELECT と条件つきの DELETE の**同じ式**（この定数）を使う。のちに「無料は公開ページも1年で消える、
// 課金していれば消えない」へ切り替えるときは、この式だけを変える（その前に、利用の記録と、ポリシーの更新・告知が要る。docs §8）。

import { snapshotKey } from './username.ts';

// 最後に使ってから、この期間を過ぎたアカウントを自動で削除する。ポリシー・ストアの申告にも書く値（変えるときは一緒に直す）。
export const INACTIVE_ACCOUNT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * 自動削除の対象外にするアカウントの条件（`users` の行に対する SQL の式）。今は「公開ページがある」: `profiles.published_at` が立っている
 * （Unpublish か削除をすれば、対象に戻る）。**候補の SELECT と、条件つきの DELETE（と、`username` を移す文）で、この同じ式を使う**
 * （消す瞬間にも見る。候補に選んだあとに Publish したアカウントを消さない）。`users` を参照する文の中で使う（テーブル名 `users` のまま）。
 */
export const AUTO_DELETE_EXEMPT_SQL =
  'EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = users.id AND p.published_at IS NOT NULL)';

/**
 * アカウントを無条件に削除する（利用者の操作・Appleの通知）。成功は `true`。R2のスナップショットを消せなかったときは、
 * D1の行を残して `false`（やり直せる。値は出さない）。`profiles` が無い（`username` を確保していない）アカウントは、R2に触れない。
 *
 * 受け入れている小さな競合: 消している最中に、別の端末が Publish すると、R2に書かれたスナップショットが残りうる
 * （アカウントの削除と Publish が数十ミリ秒の間に重なる場合。`username` は `retired_usernames` に移るので、別の人には渡らない）。
 */
export async function deleteUserAccount(
  env: Pick<Env, 'DB' | 'SNAPSHOTS'>,
  userId: string,
  now: number,
): Promise<boolean> {
  const profile = await env.DB
    .prepare('SELECT username FROM profiles WHERE user_id = ?1')
    .bind(userId)
    .first<{ username: string }>();
  if (profile !== null) {
    try {
      await env.SNAPSHOTS.delete(snapshotKey(profile.username));
    } catch {
      console.error('account deletion: snapshot delete failed');
      return false;
    }
  }
  // 1つのバッチ（トランザクション）: `username` を再利用させない表へ移し、アカウントを消す（`profiles` はカスケードで消える）。
  await env.DB.batch([
    env.DB
      .prepare('INSERT OR IGNORE INTO retired_usernames (username, retired_at) SELECT username, ?2 FROM profiles WHERE user_id = ?1')
      .bind(userId, now),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(userId),
  ]);
  return true;
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
  return db
    .prepare(`DELETE FROM users WHERE id = ?1 AND last_active_at < ?2 AND NOT ${AUTO_DELETE_EXEMPT_SQL}`)
    .bind(userId, cutoff);
}

/**
 * 自動削除で消すアカウントの `username` を、再利用させない表へ移す文。**`deleteInactiveUserStatement` と同じバッチの、その前に並べる**
 * （同じ条件を見る。バッチは1つのトランザクションなので、移したのに消えない・消えたのに移らない、は起きない）。
 * 公開ページのあるアカウント（対象外）・まだ使われているアカウントは、何も移さない。
 */
export function retireInactiveUsernameStatement(
  db: D1Database,
  userId: string,
  cutoff: number,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO retired_usernames (username, retired_at)
       SELECT p.username, ?3 FROM profiles p JOIN users ON users.id = p.user_id
       WHERE users.id = ?1 AND users.last_active_at < ?2 AND NOT ${AUTO_DELETE_EXEMPT_SQL}`,
    )
    .bind(userId, cutoff, now);
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
