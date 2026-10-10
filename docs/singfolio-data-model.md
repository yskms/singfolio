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
    日本語の曲名・アーティストの読み順は、SQLiteの照合順序では正しく並ばない。
    v1.0では読み順に並べず、曲名・アーティストを `COLLATE NOCASE`（英字の
    大文字小文字を区別しない、他は文字コード順）で並べる（「曲の一覧」参照）。

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

### settings

端末の設定（Appearance・Languageなど）のキーと値。曲・タグとは独立で、公開用データにも含めない。

| カラム | 型 | 内容 |
|---|---|---|
| `key` | TEXT PK | 設定の名前。現在は `appearance` / `language` / `suggestions` |
| `value` | TEXT NOT NULL | 値（文字列） |

-   値の意味・検証はService層（`settingsService`）で行う。DBには制約を置かない
    （新しい設定を足すたびにマイグレーションが要らないように、キーと値だけの表にしている）。
-   `appearance`: `system` / `light` / `dark`。未保存の場合は `system`（端末の設定に従う）。
    保存された値が上の3つ以外（将来のバージョンが書いた値など）でも、エラーにせず `system`
    として読む（起動を止めない）。
-   `language`: `system` / `en` / `ja`。未保存の場合は `system`（端末の言語に従う。決め方は
    `singfolio-screen-flow.md` のLanguage）。初回起動時に、端末の言語から決めた言語
    （`en` / `ja`）を書き込まない（書くと、System のまま端末の言語に追従できなくなる）。
    保存された値が上の3つ以外（将来のバージョンが追加した言語など）でも、エラーにせず
    `system` として読む（起動を止めない）。
-   `suggestions`: `on` / `off`。曲名・アーティストの候補を外部の楽曲検索から出すか。
    未保存、または `off` 以外の値は `on`（既定）として読む。

## Repository / Service層

UI → Service → Repository → SQLite の一方向。UIはRepositoryとDBに触れず、Service
（`src/services/index.ts` の `getServices()`）だけを使う。例外は、DBに触れない純粋な関数
（`text.ts` の正規化・`tagInput.ts`・`suggestionRules.ts`）と `ServiceError`・入力の型で、
画面が、保存前の入力の確認や候補の結合を、Serviceと同じ判定にそろえるために直接importしてよい。公開機能などの将来の
同期処理も、このService境界の内側に追加する（`singfolio-publishing-backend.md` §10）。

| 層 | 場所 | 役割 |
|---|---|---|
| モデル | `src/domain/types.ts` | `Song` / `Tag` / ステータス。各層が共有する。`Song` は `tags` を持つ |
| Repository | `src/repositories/` | SQLだけを持つ。IDと時刻の生成もここ（`RepositoryEnv`。テストで差し替える）。検証・正規化はしない。例外は `songCatalogRepository`（外部の楽曲検索のHTTP。「候補検索」） |
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
    Practiceの「Mark as Ready」）/ `deleteSong`。`createSong` / `updateSong` は、
    新しいタグの名前（`newTagNames`）も受け、曲と同じトランザクションで作る
    （「曲の入力」）
-   `settings`: `getAppearance` / `setAppearance`（`system` / `light` / `dark`）、
    `getLanguageSetting` / `setLanguageSetting`（`system` / `en` / `ja`）、
    `getSuggestionsEnabled` / `setSuggestionsEnabled`（候補の外部検索のオン / オフ。既定はオン）
-   `suggestions`: `available`（外部の検索が組み込まれているか）/ `localArtists` /
    `catalogArtists` / `catalogSongs`（「候補検索」。外部の検索は、探せなかったとき `null`）
-   `tags`: `listTags` / `getOrCreateTag`（同じ名前のタグがあればそれを返し、なければ作る。
    タグだけを作る操作で、曲の編集画面は使わない。「曲の入力」の `newTagNames`）/
    `renameTag` / `deleteTag`
-   不正な入力・存在しない対象は、`ServiceError` で reject する。`code` は
    `title-required` / `artist-required` / `invalid-status` / `invalid-key-offset` /
    `song-not-found` / `tag-not-found` / `tag-name-required` / `tag-name-duplicate` /
    `invalid-appearance` / `invalid-language`。
    利用者向けの文言は、UI側で多言語化の仕組みを通して `code` から作る
    （`src/i18n/errors.ts`。コードを足すと、文言の対応を足すまで型エラーになる）。
-   曲・タグの削除は、既に無い対象でも何もせず成功する（二重タップで失敗にしない）。
    タグの削除は、付いていた曲から外すだけで曲は残る。曲の削除でタグは残る。

### 曲の入力

-   Title・Artist: 前後の空白（全角空白を含む）を除き、濁点などが分解された形（NFD。
    macOSのファイル名からの貼り付けなど）を、普通に入力した形（NFC）にそろえる。
    見た目は変わらない。分解形のままだと、検索・並び替えで同じ文字が別の
    文字になる。データが入ってからでは、そろえ直すのにマイグレーションが必要になる
    ため、最初から行う。空は `title-required` / `artist-required`。それ以外の加工は
    しない（全角半角の統一はしない。`Ｔ.Ｍ.Revolution` は入力どおりに保存する）。
-   Status: 追加でも省略できない（既定値はUI側で決める）。
-   My Key: 整数（範囲の制限はしない。編集画面の `−` / `+` が選べるのは上下12半音までで、
    これは画面の範囲）。省略は `0`。
-   Private Note: 前後の空白を除く。空白だけは「メモなし」（空文字）。
-   Tags: タグIDの配列（`tagIds`）。重複は1つにし、存在しないIDは `tag-not-found`。
    `Song.tags` はタグ名の昇順（ASCIIの大文字小文字は区別しない）で返す。
-   新しいタグ（`newTagNames`。省略は無し）: 保存と一緒に作るタグの名前。名前は「タグ名」と
    同じ規則で正規化し、同じ名前（大文字小文字を除く）のタグが既にあれば、作らずにそのタグを
    付ける（`tagIds` と合わせて重複は1つ）。空の名前は `tag-name-required`。曲の編集画面は、
    タグを先に作ってから曲を保存せず、これで渡す（曲の保存が失敗したとき、タグだけが残らない
    ため）。`updateSong` で、内容が変わらない（名前が、既に付いているタグと同じ）場合は、
    `updatedAt` を更新せず、タグも作らない。
-   追加・編集はすべて1つのトランザクション（`newTagNames` のタグの作成を含む）。検証や
    タグの確認で失敗したら、何も保存しない（作ったタグも残らない）。

### タグ名

-   保存する形: Unicode正規化（NFKC）をかけ、連続する空白を半角空白1つにし、前後の
    空白を除く。`Ｒock` は `Rock`、`ﾎﾞｶﾛ` は `ボカロ`。大文字小文字は変えない
    （`rock` と入力したら `rock`）。
-   重複の判定: 上の正規化に加えて大文字小文字を同一視した形で比べる。DBの
    `COLLATE NOCASE` はASCIIしか同一視しないため、`Ä` と `ä`、`Rock` と `Ｒock` は、
    DBに任せず、Serviceが重複として扱う（DBの一意制約は最後の砦）。
    ひらがなとカタカナ（`あにめ` / `アニメ`）は別のタグ。
-   NFKCは全角半角だけでなく、互換文字も変換する（`①` → `1`、`™` → `TM`、`㈱` → `(株)`、
    `½` → `1⁄2`）。タグ名は、見た目の揺れをそろえる目的で、これを許容する。
    Title・Artistには、この変換をかけない（上の「曲の入力」）。
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
    （曲名またはアーティストの部分一致）。
-   検索は、SQLの `LIKE` ではなく、Serviceが、`status`・`tagId` で絞った曲を読んでから
    `searchKey`（`src/services/text.ts`）で絞り込む。`LIKE` が同一視するのはASCIIの大文字
    小文字だけで、`ちぇりー` で `チェリー` が見つからないなど、日本語の利用で困るため。
    端末内の曲数（数百曲）なら、全部読んでも問題にならない。Repositoryは検索の条件を持たない
    （`SongFilter`。`search` を渡すと型エラー）。`LIKE` に「簡略化」しない。
    -   `searchKey` が同一視するもの: 大文字小文字（ASCII以外も）、全角半角（半角カナを含む。
        互換文字も変換する）、ひらがなとカタカナ、空白の量（全角空白を含む）。
        `normalize('NFKD').normalize('NFC')` で行う（タグ名と同じ理由。「タグ名」参照）。
    -   同一視できないもの: 漢字の読み（`桜` と `さくら`。読みのデータが無い）、長音と
        ひらがなの母音（`ちぇりー` と `ちぇりい`）。
    -   検索語の前後の空白は無視し、空（空白だけを含む）の検索は絞り込まない。
        `% _ \` も普通の文字として一致する。
-   並び替え: `title` / `artist` / `createdAt` / `updatedAt` と昇順・降順。既定は
    `updatedAt` の降順。一覧にないキー・方向（型の外から来た値）は、エラーにせず既定にする。
    同順位の曲は、曲名・アーティスト・IDの昇順で、毎回同じ並びになる。
    -   曲名・アーティストは、英字の大文字小文字を区別せず、他は文字コード順。日本語は読み順に
        ならない（おおむね、記号・英字 → ひらがな → カタカナ → 漢字の順で、ひらがなとカタカナは
        混ざらない。漢字は読みではなく文字コード順。半角カナ・全角英数字は漢字より後ろ）。読み順で並べるには、読み（ふりがな）の項目を
        曲に持たせて入力させる必要があり、v1.0では行わない。必要になったら、`songs` に
        読みの列を足すマイグレーションと、編集画面の入力欄を加える（検索の `searchKey` も、
        読みを対象に足せる）。
    -   画面の選択肢は、更新が新しい順（既定）・追加が新しい順・曲名順・アーティスト順の4つで、
        向きはそれぞれ固定（`singfolio-screen-flow.md`「Songs」）。
-   曲とタグは1回のクエリで取る（別々のクエリだと、間の書き込みで食い違いうるため）。

## 候補検索

Add / Edit Song の曲名・アーティストの候補（`singfolio-screen-flow.md`「候補（サジェスト）」）。
UI → `suggestions`（Service）→ `songCatalogRepository`（外部の楽曲検索のHTTP）の一方向で、
画面は提供元のURLやレスポンスの形を知らない。

-   **gateway**（`src/repositories/songCatalogRepository.ts`）: 検索語とストアを受けて、曲
    （曲名・アーティスト・ジャンル）またはアーティスト名の一覧を返す。`fetch` は
    `createServices` に注入する（Nodeのテストは偽の `fetch` で動かす）。注入しなければ
    `suggestions.available` が `false` になり、外部へは何も送らない。失敗は
    `CatalogError`（`rate-limited` / `network` / `invalid-response`）。タイムアウトを持つ。
-   **ストア**: 実際に使う言語（`resolveLanguage` の結果）が `ja` なら `JP`、それ以外は `US`
    （`storeForLanguage`）。この2つに限る。他の国は結果が不安定で（KRは0件、存在しない国は
    HTTP 400）、`lang` は結果に影響しない。画面が言語を渡す。
-   **アーティスト名は曲の検索から取る**（`attribute=artistTerm`）。アーティスト検索
    （`entity=musicArtist`）は、日本のアーティストを英字の表記（`Kenshi Yonezu`）で返す。
    曲の検索の結果は、タグ付けされた表記（`米津玄師`）で返る。
-   **外部へ送る条件**: 提供元が組み込まれていて（`available`）、設定がオンで、検索語が
    2文字以上（`searchKey` で比べた後の長さ）のとき。それ以外は、外部へは送らず（空配列）、
    登録済みのアーティストの候補だけを返す。曲の検索に添えるアーティストは、画面が、その画面で
    入力した・選んだものだけを渡す。
-   **送信の制御**（Service）: 1分あたりの送信数の上限（予算）、同じ検索の同時リクエストの共有、
    結果のキャッシュ（キーはストア・種類・検索語。件数の上限と有効期限あり）、失敗の後の
    一時停止（回数の制限の後は長め）。値はコードの定数。**失敗はキャッシュしない**（0件の
    成功だけをキャッシュする）。予算を使い切った・一時停止中・失敗は、`null`（探せなかった）を
    返す（reject しない）。空配列（0件、または送らない条件）とは区別し、画面は `null` のときだけ
    直前の候補を残す。その間も、登録済みのアーティストの候補は返す。
-   **並べ方**（`suggestionRules.ts`の純粋な関数）: 曲の候補は、（曲名, アーティスト）の
    `searchKey` の組で重複を除き、版の表記を含むもの（Live・Cover・Karaoke・オルゴール・
    `Ver.` など。ジャンルがインストゥルメンタルのものを含む）を、削らずに後ろへ回す。
    元の並び（提供元の関連順）は保つ。アーティストの候補は、登録済み（曲数の多い順。前方一致を
    先）→ 外部の順で、`searchKey` で重複を除き、共演の表記を後ろへ回す。入力欄と同じ文字列は
    出さない。
-   登録済みの印は、（曲名, アーティスト）の `searchKey` の組が既に曲にあるかで付ける。
    重複登録は止めない。
-   選んだ候補は、普通の文字列として保存する。由来（外部の候補か）も外部IDも保存しない。

## マイグレーション

`PRAGMA user_version` にスキーマのバージョンを記録し、`src/db/migrations.ts` の
配列を先頭から順に、未適用のものだけ実行する（実行器は `src/db/migrate.ts`）。

-   バージョンは1から連番。配列の位置と番号が合わない場合は起動時にエラーにする。
-   1つのマイグレーションは、SQLの実行と外部キーの検査、バージョンの更新を同じ
    トランザクションで行う。途中で失敗した場合、そのバージョンの変更は残らない。
-   **一度リリースしたマイグレーションは書き換えない。** スキーマを変える場合は
    末尾に次の番号を追加する。
-   アプリが知っているバージョンより新しいDBを開いた場合（ストアで古い版へ
    戻した場合など）は、スキーマを触らず起動時にエラーにする（`DatabaseTooNewError`。
    他の失敗と区別するための型で、エラー画面が再試行ではなくアプリの更新を促す。
    `singfolio-screen-flow.md`「起動時の例外」）。
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
-   Nodeの型除去での実行のため、`src/` のコードは次のように書く。
    -   型だけのimportは `import type`、enum・クラスのコンストラクタ引数プロパティなど
        型を消すだけでは実行できない構文は使わない。どちらも `tsconfig.json` の
        `verbatimModuleSyntax` / `erasableSyntaxOnly` で、型チェック時に検出する。
    -   import は拡張子（`.ts`）付き（`allowImportingTsExtensions`。Metroも解決できる）。
        **付け忘れは型チェックを通る**（`moduleResolution: "bundler"` は拡張子なしも許す）。
        Nodeから読まれるファイル（テストが読むもの）では、`npm test` が実行時に
        失敗して分かる。
-   テストはNodeの型を使うので、テストと `src/testing/` の型チェックは
    `tsconfig.test.json` で別に行う（`npm run typecheck` が両方を実行する）。
    アプリ本体の `tsconfig.json` には含めない。含めると、`Buffer` などNodeだけの型が
    アプリ側でも通ってしまう。
-   エディタ（tsserver）は `tsconfig.json` しか読まず、そこから除外したテストを
    `tsconfig.test.json` では解析しない。Nodeの型が無いと、`node:test` などのimportが
    エディタでエラー表示になる（`npm run typecheck` の結果とは食い違う）。そのため、
    テストファイルと `src/testing/` のファイルは、先頭（コメントの後、importの前）に
    `/// <reference types="node" />` を書く。
