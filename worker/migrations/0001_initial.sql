-- 認証とアカウントのテーブル。スキーマの意味は docs/singfolio-publishing-backend.md §8「認証の方式」。
--
-- 一度本番へ適用したマイグレーションは書き換えない。スキーマを変えるときは、次の番号の
-- ファイルを足す（`npm run migrations:create -- <名前>`）。
--
-- 方針
-- - 時刻は INTEGER（Unixエポックからのミリ秒。アプリのローカルDBと同じ）。
-- - 主キーは TEXT（UUIDやハッシュ）なので WITHOUT ROWID。D1のFreeは書き込みが10万行/日で、
--   索引の書き込みも数える。ROWID付きだと、TEXTの主キーの索引が別に1行増える。
-- - profiles（username など）と requests は、7.4 以降で足す。
-- - 外部キーの ON DELETE CASCADE で、users の行を消すと identities と sessions も消える
--   （アカウントの削除。D1は外部キーを常に有効にする）。
--
-- 今後のマイグレーションの注意（親テーブルを作り直さない）
-- - 外部キーが有効なとき、親テーブル（users・identities）の DROP TABLE は、暗黙の DELETE として
--   ON DELETE CASCADE を発動し、子（identities・sessions）の行を消す。ローカルのD1では、
--   `PRAGMA defer_foreign_keys` でも `PRAGMA foreign_keys = OFF` でも止まらなかった（バッチの中、
--   単独の文、`wrangler d1 migrations apply` の3経路。OFF は、実行後も値が 1 のまま。
--   worker/test/dropCascade.test.ts。本番では未確認）。
-- - そのため、users・identities は「新テーブルを作る → コピー → DROP → RENAME」で変えず、
--   `ALTER TABLE ... ADD COLUMN` などで変える。作り直しが避けられないときは、先にローカルのDBで、
--   子の行が残ることを確かめてから適用する。

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- ログイン手段。1ユーザーに複数をつなげられる。`sub` はIDトークンの `sub`。
-- email・名前などのクレームは持たない（保存しない）。
CREATE TABLE identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  sub TEXT NOT NULL CHECK (sub <> ''),
  created_at INTEGER NOT NULL,
  -- 最後のサインインの時刻。Appleのサーバー間通知のうち、これより前の `event_time` のものを無視する。
  last_sign_in_at INTEGER NOT NULL,
  UNIQUE (provider, sub)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_identities_user_id ON identities (user_id);

-- セッション。不透明なランダム値のハッシュだけを置く（値そのものは端末のSecureStoreにだけある）。
-- どのログイン手段で作ったかを持つ。Appleの `consent-revoked` は、その手段のセッションの行だけを消す
-- （identities の行は残す。`last_sign_in_at` で、重複・古い通知を見分けるため）。`account-deleted` は、
-- identities の行を消す（そのセッションも一緒に消える）。
-- ユーザーは identities を引いて得る。期限は `last_used_at` から数える（最後の利用から90日が目安）。
-- `last_used_at` は、前回の更新から24時間以上たったときだけ書く（書き込みの上限を使わないため）。
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identities (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_sessions_identity_id ON sessions (identity_id);

-- 使用済みの nonce。検証が通ったときだけ書く（発行では書かない）。主キーの一意制約で、2回目を弾く。
-- `nonce_hash` は SHA-256(T) の base64url（IDトークンの `nonce` と同じ値。T そのものは置かない）。
-- `expires_at` は T の期限。過ぎたものは、ログインの処理の中で消す（件数が少ないので、索引は付けない）。
CREATE TABLE used_nonces (
  nonce_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
