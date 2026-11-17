// 未使用のアカウントの自動削除（Cron Trigger。毎日1回。wrangler.jsonc の `triggers.crons`）。方式と理由は
// docs/singfolio-publishing-backend.md §8「未使用のアカウントの自動削除」。
//
// 最後に使ってから1年（`INACTIVE_ACCOUNT_TTL_MS`）を過ぎたアカウントを消す。消すのは `users` の行（`identities`・`sessions` は
// 外部キーのカスケード）。端末内のレパートリーには触れない。Appleのトークンは失効しない（`refresh_token` を保存していない）。
//
// 守ること:
// - **消す文に条件を入れ直す**（`deleteInactiveUserStatement`）。候補の SELECT と DELETE の間に、そのアカウントが使われる
//   ことがある。候補に選ばれたあとにログインしたアカウントは消えない。
// - `last_active_at` が NULL のアカウントは、候補に入れない（`<` は NULL で偽）。`COALESCE(…, created_at)` に「簡略化」しない
//   （埋め漏れた、使われているアカウントを消してしまう）。
// - **D1のクエリは2回だけ**（候補の SELECT と、条件つき DELETE の1バッチ）。Freeは、1回の実行で50回までで、バッチは1回と数える
//   （資料: D1 Limits）。アカウントごとに別のクエリにしない。Cron の CPU 時間は Free で10ms（待ちは数えない）。
// - 1回の実行で消す上限（`MAX_DELETIONS_PER_RUN`）。多ければ、翌日以降に続く（冪等）。Workers Logs は無効なので、失敗は
//   `wrangler tail` でしか見えない。ログに出すのは件数だけ（ユーザーIDは出さない）。
import { deleteInactiveUserStatement, INACTIVE_ACCOUNT_TTL_MS } from './account.ts';

export const MAX_DELETIONS_PER_RUN = 100;

export interface InactiveDeletionResult {
  /** 消したアカウントの数。 */
  deleted: number;
  /** 候補に選んだが、消す瞬間に条件から外れていた数（選んだあとに使われた）。 */
  skipped: number;
}

/** `now` の時点で、最後に使ってから1年を過ぎたアカウントを、最大 `MAX_DELETIONS_PER_RUN` 件消す。失敗は投げる（呼び出し側が記録する）。 */
export async function deleteInactiveAccounts(db: D1Database, now: number): Promise<InactiveDeletionResult> {
  const cutoff = now - INACTIVE_ACCOUNT_TTL_MS;
  const { results } = await db
    .prepare('SELECT id FROM users WHERE last_active_at < ?1 LIMIT ?2')
    .bind(cutoff, MAX_DELETIONS_PER_RUN)
    .all<{ id: string }>();
  if (results.length === 0) return { deleted: 0, skipped: 0 };

  // 1つのバッチ（1回のクエリ、1つのトランザクション）。各文は条件つきなので、選んだあとに使われたアカウントは消えない。
  // 消せたかは、文ごとの変更行数が 0 より大きいか（カスケードで消えた行も数えるので、合計は件数にならない）。
  const outcomes = await db.batch(results.map((row) => deleteInactiveUserStatement(db, row.id, cutoff)));
  const deleted = outcomes.filter((outcome) => outcome.meta.changes > 0).length;
  return { deleted, skipped: results.length - deleted };
}

/** Cron Trigger の入口。件数だけを `console.log`（ユーザーID・時刻は出さない）。何も無い日は出さない。 */
export async function runInactiveAccountDeletion(db: D1Database, now: number): Promise<void> {
  const { deleted, skipped } = await deleteInactiveAccounts(db, now);
  if (deleted > 0 || skipped > 0) console.log(`inactive account deletion: deleted=${deleted} skipped=${skipped}`);
}
