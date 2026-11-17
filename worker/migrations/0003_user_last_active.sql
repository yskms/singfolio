-- アカウント（`users`）が最後に使われた時刻（ミリ秒）。未使用のアカウントの自動削除（1年）の基準。
-- 方式は docs/singfolio-publishing-backend.md §8「未使用のアカウントの自動削除」。
--
-- 進める操作: ログイン（`resolveIdentity`）、認証済みのリクエストでのセッションの更新（`authenticateSession`。
-- 24時間に1回）、ログアウト（`revokeSession`）。`sessions.last_used_at` や `identities.last_sign_in_at` だけでは足りない:
-- ログアウトでセッションの行が消え、「11か月使って、ログアウトの1か月後に消える」穴が残る。
--
-- NULL は「削除しない」側に倒す（`last_active_at < 基準` は NULL で偽になる）。自動削除は、判定できないアカウントを消さない。
-- 下のバックフィルで、既存のユーザーは埋める（新しく作るユーザーは `resolveIdentity` が入れる）。
--
-- users は親テーブルなので、作り直さず、ADD COLUMN で足す（0001 の注意）。索引は付けない: 付けると、
-- 更新のたびに索引の書き込みが増える（D1のFreeは書き込み10万行/日。索引も数える）。自動削除は1日1回の走査で、
-- 読み取り（Freeは500万行/日）で足りる。ユーザーが数十万人を超えたら見直す。
ALTER TABLE users ADD COLUMN last_active_at INTEGER;

UPDATE users SET last_active_at = MAX(
  created_at,
  COALESCE((SELECT MAX(i.last_sign_in_at) FROM identities i WHERE i.user_id = users.id), 0),
  COALESCE(
    (SELECT MAX(s.last_used_at) FROM sessions s JOIN identities i ON i.id = s.identity_id WHERE i.user_id = users.id),
    0
  )
);
