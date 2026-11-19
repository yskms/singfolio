-- 公開プロフィール（7.4.3）。方針は docs/singfolio-publishing-backend.md §3「公開用データの扱い」、§8「バックエンドが担当すること」
-- 「公開スナップショットの形と上限」。
--
-- 一度本番へ適用したマイグレーションは書き換えない。スキーマを変えるときは、次の番号のファイルを足す。
-- 親テーブル（users・identities）には触れない（0001 の注意）。ここで足すのは、users を指す子テーブルと、親を持たない表だけ。
--
-- profiles: 1ユーザーに1行。`username` を確保したときに作る（最初の Publish より前）。
-- - `username` は、小文字の英数字と `_` の3〜20字。URL（singfolio.app/<username>）と、R2のキー（public/<username>.json）に使う。
--   一意性は、この UNIQUE だけが保証する。CHECK は、アプリの検査をすり抜けた値への備え（GLOB は大文字小文字を区別する）。
--   **変更しない**（docs §8「実装時に決めること」）。
-- - `display_name`・`bio`・`version`・`published_at` は、Publish（7.4.4）が書く。`display_name`・`bio` は、最後に Publish した値の控え
--   （別の端末・再インストール後に、今の公開内容を取得して見せるため）。公開ページ（7.5）は、これを読まない（R2のスナップショットだけを読む）。
-- - `version` は、Publish のたびに +1 する整数。0 は、まだ一度も Publish していない。複数の端末の衝突の検知に使う。
-- - `published_at` は「公開中」の印と、最後に Publish した時刻（ミリ秒）。NULL なら非公開。自動削除の対象外の式（7.4.5）が、D1だけで
--   判定できるように持つ。**R2にスナップショットが存在しうる間は、必ず NULL でない**（Publish は、R2を書く前に立て、Unpublish は、R2を消したあとに下ろす）。
-- 行は、users の削除で消える（ON DELETE CASCADE）。`username` を再利用させない記録は、別の表（retired_usernames）。
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE
    CHECK (length(username) BETWEEN 3 AND 20 AND username NOT GLOB '*[^a-z0-9_]*'),
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  published_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- 削除したアカウントの username。再利用させない（配ったURLやQRコードが、別の人のページを指さないように）。
-- **users を指さない**（外部キーを持たない）。ユーザーIDと結びつけずに、名前だけを残す。アカウントの削除（7.4.5。`deleteUserAccount`）が書く。
-- 名前そのものが個人を特定しうるので、保存することをプライバシーポリシーに書く（7.4.10）。
CREATE TABLE retired_usernames (
  username TEXT PRIMARY KEY NOT NULL
    CHECK (length(username) BETWEEN 3 AND 20 AND username NOT GLOB '*[^a-z0-9_]*'),
  retired_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
