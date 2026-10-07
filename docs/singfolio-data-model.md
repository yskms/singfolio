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
    内容が変わらない保存（編集画面を開いて何も変えずに保存、同じStatusへの変更）も、
    編集ではないため更新しない（Practiceの「Last updated」が実態とずれないように）。
-   並び替えは既存のカラム（曲名・アーティスト・登録日・更新日）から行う。
    v1.0では手動の並び順を持たないため、そのためのカラムは置かない
    （必要になった時点で、マイグレーションとして追加する）。
    日本語の曲名・アーティストの読み順は、SQLiteの照合順序では正しく並ばない
    ため、並び替えの実装時（WBS 2.1）に扱いを決める。
    Repositoryの現状の実装は、曲名・アーティストを `COLLATE NOCASE`（英字の
    大文字小文字を区別しない、日本語は文字コード順）で並べる。

### tags

| カラム | 型 | 内容 |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE | タグ名。`COLLATE NOCASE` で一意 |
| `created_at` | INTEGER NOT NULL | 作成日時（エポックミリ秒） |

-   `COLLATE NOCASE` が同一視するのは**ASCIIの大文字小文字だけ**。`Rock` と `rock`
    は重複として拒否されるが、`Rock` と `Ｒock`（全角）や `Ä` と `ä` は別のタグとして
    登録できてしまう。
-   全角/半角の統一や前後の空白の除去といったタグ名の正規化は、DBでは行わず、
    Service層で行う（「Repository / Service層」の「タグ名」参照）。
-   タグに公開/非公開などの属性は持たせない（CLAUDE.md「データモデル」）。

### song_tags

曲とタグの多対多の関連。`(song_id, tag_id)` が主キー。
曲またはタグを削除すると、該当の行が `ON DELETE CASCADE` で消える
（曲を消してもタグは残り、タグを消しても曲は残る）。
この動作には接続ごとの `PRAGMA foreign_keys = ON` が必要で、
`src/db/database.ts` でDBを開くたびに設定している。

## Repository / Service層

UI → Service → Repository → SQLite の一方向。UIはRepositoryとDBに触れず、Service
（`src/services/index.ts` の `getServices()`）だけを使う。公開機能などの将来の
同期処理も、このService境界の内側に追加する（`singfolio-publishing-backend.md` §10）。

| 層 | 場所 | 役割 |
|---|---|---|
| モデル | `src/domain/types.ts` | `Song` / `Tag` / ステータス。各層が共有する。`Song` は `tags` を持つ |
| Repository | `src/repositories/` | SQLだけを持つ。IDと時刻の生成もここ（`RepositoryEnv`。テストで差し替える）。検証・正規化はしない |
| Service | `src/services/` | 入力の検証・正規化、トランザクション、`updated_at` の規則。失敗は `ServiceError`（`code` で区別） |
| DB | `src/db/appDatabase.ts` | Repositoryが使うDBのインターフェース（expo-sqliteを包む） |

Serviceの組み立ては `createServices`（Expoに依存しない。テストもこれを使う）。
expo-sqlite と expo-crypto（UUID）に依存する配線だけが `index.ts` にある。

### トランザクション

expo-sqliteの `withTransactionAsync` は排他ではなく、トランザクションの途中で同じ接続の
他の書き込みが割り込みうる（割り込んだ書き込みは、ロールバックのときに一緒に消える）。
そのため、**書き込みは必ず `Database.transaction` の中で行い**、`transaction` 同士は
直列に実行する（`createDatabase`）。`Database` 自体は読み取り専用の型で、書き込みの
メソッド（`runAsync`）は `transaction` に渡る `tx` にしかない。Repositoryの各メソッドも、
読み取りは `ReadExecutor`、書き込みは `WriteExecutor` を先頭の引数で受け、この規則を
型で守らせている。読み取りは待たせないので、実行中のトランザクションの途中の状態を
読むことがある（UIは書き込みの完了後に読み直す）。

### Serviceの操作

-   `songs`: `getSong` / `listSongs` / `countSongsByStatus` / `createSong` /
    `updateSong`（編集画面の保存。全項目を置き換える）/ `setStatus`（Song Detail・
    Practiceの「Mark as Ready」）/ `deleteSong`
-   `tags`: `listTags` / `getOrCreateTag`（曲の編集画面の「新規タグ作成」。同じ名前の
    タグがあればそれを返す）/ `renameTag` / `deleteTag`
-   不正な入力・存在しない対象は、`ServiceError` で reject する。`code` は
    `title-required` / `artist-required` / `invalid-status` / `invalid-key-offset` /
    `song-not-found` / `tag-not-found` / `tag-name-required` / `tag-name-duplicate`。
    利用者向けの文言は、UI側で多言語化の仕組みを通して `code` から作る。
-   曲・タグの削除は、既に無い対象でも何もせず成功する（二重タップで失敗にしない）。
    タグの削除は、付いていた曲から外すだけで曲は残る。曲の削除でタグは残る。

### 曲の入力

-   Title・Artist: 前後の空白（全角空白を含む）を除く。空は `title-required` /
    `artist-required`。それ以外の加工はしない（全角半角の統一などはしない）。
-   Status: 追加でも省略できない（既定値はUI側で決める）。
-   My Key: 整数（範囲の制限はしない）。省略は `0`。
-   Private Note: 前後の空白を除く。空白だけは「メモなし」（空文字）。
-   Tags: タグIDの配列。重複は1つにし、存在しないIDは `tag-not-found`。
    `Song.tags` はタグ名の昇順（ASCIIの大文字小文字は区別しない）で返す。
-   追加・編集はすべて1つのトランザクション。検証やタグの確認で失敗したら、何も保存しない。

### タグ名

-   保存する形: Unicode正規化（NFKC）をかけ、連続する空白を半角空白1つにし、前後の
    空白を除く。`Ｒock` は `Rock`、`ﾎﾞｶﾛ` は `ボカロ`。大文字小文字は変えない
    （`rock` と入力したら `rock`）。
-   重複の判定: 上の正規化に加えて大文字小文字を同一視した形で比べる。DBの
    `COLLATE NOCASE` はASCIIしか同一視しないため、`Ä` と `ä`、`Rock` と `Ｒock` は、
    DBに任せず、Serviceが重複として扱う（DBの一意制約は最後の砦）。
    ひらがなとカタカナ（`あにめ` / `アニメ`）は別のタグ。
-   `renameTag` は、別のタグと重複する名前を `tag-name-duplicate` にする。大文字小文字
    だけの変更（`rock` → `Rock`）は重複ではない。
-   **iOSのHermesは、`normalize('NFKC')` が半角カナの濁点を合成しない**（`ﾎﾞ` が
    `ホ` + U+3099 のまま返る。Androidでは合成される）。そのため `normalize('NFKC')`
    ではなく、定義どおり `normalize('NFKD').normalize('NFC')` で行う
    （`src/services/text.ts`。iOS・Androidとも同じ結果になることを確認済み）。
    この差はNodeのテストでは検出できず、実機（iOS）でのみ確認できる。

### 曲の一覧

`listSongs` の条件はすべて満たす曲だけを返す（AND）。

-   絞り込み: `status`、`tagId`（1つだけ。複数タグの絞り込みは未対応）、`search`
    （曲名またはアーティストの部分一致。前後の空白は無視し、`% _ \` は文字として扱う）。
    一致は `LIKE` で、ASCIIの大文字小文字だけを区別しない。全角半角・ひらがな/カタカナの
    違いは吸収しない。検索の一致の扱いは、WBS 2.1で決める。
-   並び替え: `title` / `artist` / `createdAt` / `updatedAt` と昇順・降順。既定は
    `updatedAt` の降順。同順位の曲は、曲名・アーティスト・IDの昇順で、毎回同じ並びになる。
    日本語の読み順は未対応（上の「songs」の並び替えの項目を参照）。
-   曲とタグは1回のクエリで取る（別々のクエリだと、間の書き込みで食い違いうるため）。

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

マイグレーションを追加したときは、実機（iOS / Android）で起動して、DBが期待の
バージョンになることも確認する。

## テスト

`npm test` で、マイグレーション実行器・v1スキーマ（`src/db/migrate.test.ts`）と、
DBの包み（`src/db/appDatabase.test.ts`）、Repository / Service（`src/services/*.test.ts`。
Repositoryは、Service経由で実際のSQLに対して確認する）を実行する。
Node標準の `node:sqlite`（`src/testing/testDatabase.ts` が `RawDatabase` に合わせる）で
動かしており、実機の `expo-sqlite` や Hermes とは別の実装のため、通っても実機での確認の
代わりにはならない。Repository / Serviceを変えたときは、実機（iOS / Android）で、
実際のDBに対して一通り動かして確認する。

-   TypeScriptのまま直接実行するため、Node 22.18以降が必要（`package.json` の
    `engines`。`.node-version` は22系を指す）。
-   Nodeの型除去での実行のため、`src/` のコードは次のように書く（`tsconfig.json` の
    `allowImportingTsExtensions` / `verbatimModuleSyntax` / `erasableSyntaxOnly` で
    型チェック時に検出する。Metroも `.ts` 付きのimportを解決できる）。
    -   import は拡張子（`.ts`）付き。型だけのimportは `import type`。
    -   enum・クラスのコンストラクタ引数プロパティなど、型を消すだけでは実行できない
        構文は使わない。
-   テストはNodeの型を使うので、テストと `src/testing/` の型チェックは
    `tsconfig.test.json` で別に行う（`npm run typecheck` が両方を実行する）。
    アプリ本体の `tsconfig.json` には含めない。含めると、`Buffer` などNodeだけの型が
    アプリ側でも通ってしまう。
