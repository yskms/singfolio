# Singfolio ローカルDB設計

端末内SQLite（`expo-sqlite`、DBファイル名 `singfolio.db`）のスキーマとマイグレーションの方針。
公開用データ（Published Song等）は別モデルで、ここには含まない
（`singfolio-publishing-backend.md` §3）。

スキーマの実体は `src/db/migrations.ts`。

カラム名はsnake_case。`singfolio-publishing-backend.md` §3 の Local Song の
プロパティ（camelCase）とは機械的に対応する（`key_offset` ↔ `keyOffset`、
`private_note` ↔ `privateNote`、`created_at` ↔ `createdAt`）。
UIの表示名「My Key」は、モデル・DBでは `keyOffset` / `key_offset` と呼ぶ。

## テーブル

### songs

| カラム | 型 | 内容 |
|---|---|---|
| `id` | TEXT PK | UUID（生成はRepository側） |
| `title` | TEXT NOT NULL | 曲名（必須） |
| `artist` | TEXT NOT NULL | アーティスト（必須） |
| `status` | TEXT NOT NULL | `ready` / `practice` / `want`（CHECK制約） |
| `key_offset` | INTEGER NOT NULL DEFAULT 0 | My Key。原曲からの半音差。`0` = Original |
| `private_note` | TEXT NOT NULL DEFAULT `''` | 非公開メモ。空文字 = メモなし |
| `created_at` | INTEGER NOT NULL | 登録日時（Unixエポックのミリ秒） |
| `updated_at` | INTEGER NOT NULL | 最終更新日時（同上）。Practiceの「Last updated」に使う |

-   タイトル・アーティストの空文字チェック（前後の空白の除去を含む）は
    DBではなくService層で行う。
-   日時は端末のタイムゾーンに依存しないよう、エポックミリ秒で保存する。
    表示用の整形はUI側。
-   My Keyの「未入力」と「Original」は区別しない（どちらも `0`）。
-   `updated_at` は、ユーザーが曲に対して行った編集（Statusの変更、タグの付け外し、
    メモ・My Keyの変更を含む）で更新する。Tags管理でのタグ名の変更・タグの削除
    のように、曲を直接編集していない操作では更新しない。
-   並び替えは既存のカラム（曲名・アーティスト・登録日・更新日）から行う。
    v1.0では手動の並び順を持たないため、そのためのカラムは置かない
    （必要になった時点で、マイグレーションとして追加する）。
    日本語の曲名・アーティストの読み順は、SQLiteの照合順序では正しく並ばない
    ため、並び替えの実装時（WBS 2.1）に扱いを決める。

### tags

| カラム | 型 | 内容 |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE | タグ名。`COLLATE NOCASE` で一意 |
| `created_at` | INTEGER NOT NULL | 作成日時（エポックミリ秒） |

-   `COLLATE NOCASE` が同一視するのは**ASCIIの大文字小文字だけ**。`Rock` と `rock`
    は重複として拒否されるが、`Rock` と `Ｒock`（全角）や `Ä` と `ä` は別のタグとして
    登録できてしまう。
-   全角/半角の統一や前後の空白の除去といったタグ名の正規化は、DBでは行わない。
    方針はService層の実装時（WBS 1.3）に決め、決まったらここに追記する。
-   タグに公開/非公開などの属性は持たせない（CLAUDE.md「データモデル」）。

### song_tags

曲とタグの多対多の関連。`(song_id, tag_id)` が主キー。
曲またはタグを削除すると、該当の行が `ON DELETE CASCADE` で消える
（曲を消してもタグは残り、タグを消しても曲は残る）。
この動作には接続ごとの `PRAGMA foreign_keys = ON` が必要で、
`src/db/database.ts` でDBを開くたびに設定している。

## マイグレーション

`PRAGMA user_version` にスキーマのバージョンを記録し、`src/db/migrations.ts` の
配列を先頭から順に、未適用のものだけ実行する（実行器は `src/db/migrate.ts`）。

-   バージョンは1から連番。配列の位置と番号が合わない場合は起動時にエラーにする。
-   1つのマイグレーションは、SQLの実行と外部キーの検査、バージョンの更新を同じ
    トランザクションで行う。途中で失敗した場合、そのバージョンの変更は残らない。
-   **一度リリースしたマイグレーションは書き換えない。** スキーマを変える場合は
    末尾に次の番号を追加する。
-   アプリが知っているバージョンより新しいDBを開いた場合（ストアで古い版へ
    戻した場合など）は、スキーマを触らず起動時にエラーにする。
-   DBはアプリ起動時に `getDatabase()`（`src/db/database.ts`）を通して開き、
    マイグレーションが終わってから画面を出す。

### テーブルの作り直し

SQLiteで列の型や制約を変えるには、新テーブルを作ってコピーし、`DROP TABLE` して
`RENAME` する必要がある（SQLite公式の手順）。外部キー制約が有効なままだと、
`DROP TABLE songs` が `ON DELETE CASCADE` を発火させ、`song_tags` が全件消える。
`PRAGMA foreign_keys` はトランザクション内では変更できず、何も起きない。

そのため実行器が、マイグレーションの間だけ、トランザクションの外で外部キー制約を
無効にし、終了後に元の状態へ戻す。代わりに、各マイグレーションのコミット前に
`PRAGMA foreign_key_check` で整合性を検査し、違反が残る場合は失敗させる。
マイグレーションのSQLの中で `PRAGMA foreign_keys` を切り替えようとしないこと
（効かない）。

### テスト

`npm test` で、実行器とv1スキーマのテスト（`src/db/migrate.test.ts`）を実行する。
Node標準の `node:sqlite` で動かしており、実機の `expo-sqlite` とは別の実装のため、
通っても実機での確認の代わりにはならない。

-   TypeScriptのまま直接実行するため、Node 22.18以降が必要（`.node-version`）。
-   テストはNodeの型を使うので、型チェックは `tsconfig.test.json` で別に行う
    （`npm run typecheck` が両方を実行する）。アプリ本体の `tsconfig.json` には
    含めない。含めると、`Buffer` などNodeだけの型がアプリ側でも通ってしまう。マイグレーションを追加したときは、
実機（iOS / Android）で起動して、DBが期待のバージョンになることも確認する。
