# Singfolio v1.0 WBS

v1.0の作業（保存・管理は端末内で完結し、外部通信は候補検索だけ）を、機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。

**現在地**：2.7（アーティストの読みの辞書）と、6. リリース準備（6.1・6.4・6.5・6.7が残り。6.2・6.3・6.6は完了。6.1は、Androidの見た目と操作は確認済みで、iOS実機が残り）

## 0. 企画・設計

-   [x] 0.1 要件定義（`singfolio-requirements.md`）
-   [x] 0.2 画面設計（`singfolio-screen-flow.md`）
-   [x] 0.3 公開機能・バックエンド方針（`singfolio-publishing-backend.md`）
-   [x] 0.4 ブランドガイド・アイコン原画
-   [x] 0.5 リポジトリ・開発ルールの整備（GitHub、CLAUDE.md）

## 1. 基盤

-   [x] 1.1 Expoプロジェクトの初期化（TypeScript）
-   [x] 1.2 SQLite導入、スキーマ・マイグレーション（Song / Tag、IDはUUID）
-   [x] 1.3 Repository / Service層
-   [x] 1.4 ナビゲーション（Songs / Practice / Profile の3タブ）
-   [x] 1.5 テーマ（System / Light / Dark、ブランドカラーの定数化、スプラッシュのダーク版）
-   [x] 1.6 多言語化の仕組み（English / 日本語）
-   [x] 1.7 起動時の例外処理（DB初期化に失敗した場合・DBがアプリより新しい場合の
    エラー画面、スプラッシュを閉じるタイミング、存在しないURLを開いたときの画面
    （`+not-found`））
-   [x] 1.8 フォント（英語はInter、日本語はNoto Sans JP。表示言語で書体を切り替える。
    ネイティブに埋め込む（実行時に読み込まないので、スプラッシュの待ち合わせは無い）。
    日本語フォントはサブセット化。太さはRegular / Boldの2つ）

## 2. Songs

-   [x] 2.1 曲一覧（件数タイル、検索、タグ・ステータスの絞り込み、並び替え）
-   [x] 2.2 曲の追加・編集（Title / Artist 必須、Status、My Key、Tags、
    Private Note、タグの注意書き。Songs画面の `＋` ボタンと、曲が1つも無いときの
    ボタンもここで行った）
-   [x] 2.3 Song Detail（ステータス変更。Songs画面の行をタップして開く配線と、Edit から
    Edit Song（`app/song/[id]/edit.tsx`。実装済み）を開く配線もここで行う。編集から戻ったとき、
    Song Detail は曲を読み直す）
-   [x] 2.4 曲の削除（Song Detail の Delete song。確認のダイアログのあと削除して前の画面へ戻る。
    Edit Song には置かない）
-   [x] 2.5 曲名・アーティストの候補（Add / Edit Songの欄の直下。登録済みのアーティストと外部の
    楽曲検索。提供元の表記、送信の制御、設定の保存。設定画面の切替は 5.2）
-   [x] 2.6 アーティストのテーブルと読み（`artists`。名前と読みを、アーティストごとに1か所で持つ。
    Add / Edit Song の「読み」（必須。初期値は自動で入る。日本語の設定は、かなだけ）、曲名・
    アーティストの五十音順（ひらがな・カタカナを混ぜる。アーティストは読みで並べる）、アーティストの
    読みでの検索）
-   [ ] 2.7 アーティストの読みの辞書（MusicBrainz の CC0 のデータから作って同梱する。実行時に通信しない。
    登録済みのアーティストが無いとき、読みの初期値を、辞書から入れる）

## 3. Practice

-   [x] 3.1 練習中の曲の一覧・検索（他の画面から戻ったときの読み直しは、Songs と同じ
    `ui/useFocusRefreshKey.ts` を使う。行には最終更新を出す）
-   [x] 3.2 Mark as Ready（Practice の各行のボタン。押すとすぐ Ready にして、一覧から外れる）

## 4. Show Mode

-   [x] 4.1 閲覧専用画面（アーティスト別、検索、タグ絞り込み、× で戻る。`app/show.tsx`。
    開く入口は Profile の Show My Songs（5.1）。リンク `singfolio://show` でも開く）
-   [x] 4.2 非表示項目の確認（My Key / Private Note / Want を出さない。`show` Service が管理情報を
    持たない形で返すので、画面は出せない。Serviceのテストと、iOS・Androidの画面で確認した）
-   [x] 4.3 並び替え（Artist / Title。ヘッダーのチップの下の右端のボタン。更新日・追加日の順は持たない）

## 5. Profile / Settings

-   [x] 5.1 Profile（曲数の表示、Show My Songs。件数は、他の画面から戻ったときに読み直す）
-   [x] 5.2 Settings（Appearance / Language / Suggestions / Tags管理 / About。Profileの下半分に並べる。
    Aboutには、同梱フォントのライセンス表記を含む（`assets/fonts/OFL-*.txt`））
-   [x] 5.3 言語の設定を English / 日本語の2つにする（`System` を外し、初回起動で端末の言語から決めて
    保存する。切り替える前に確認のダイアログを出す）
-   [x] 5.4 Artists（Settings。アーティストの名前と読みの変更。一覧は読みの五十音順）

## 6. リリース準備

-   [ ] 6.1 実機確認（iOS / Android）。Androidの見た目と操作は、Pixel 11（release ビルド、日本語）で
    確認した（Song Detail のヘッダーと削除のダイアログ、Practice のボタンの縦位置・切れ、
    Show Mode の `×`・戻るキーでの閉じ方と連打、Tags のダイアログとキーボードの重なり・全選択、
    Open source licenses の日本語・ダーク表示、About の Privacy Policy の行が公開したページを
    ブラウザで開くこと）。
    Tags のダイアログは、Androidで開いた直後にソフトキーボードが出ない（入力欄を押すと出るが、
    全選択が外れる）。許容する（直さない）。
    VoiceOver・TalkBack の読み上げは、実施せずに進める（アクセシビリティツリーでは、Practice の
    ボタンに曲名が添うことと、Show Mode の見出しが「名前、N曲」になることを確認した）。
    残りは、iOS実機（iPhone 8。TestFlight経由なので、6.4のビルドの後）と、Practice の失敗の
    ダイアログ（実機）。
-   [x] 6.2 アイコン・スプラッシュ（1024×1024への縮小、Androidの前景画像、
    Play Store用512×512、favicon）
-   [x] 6.3 プライバシーポリシー・ストア掲載情報（`docs/privacy-policy.md`・`docs/singfolio-store-listing.md`・
    `docs/index.md`は作成済み。候補検索で外部へ送る検索語の説明とプライバシー申告を含む。
    `docs/_config.yml` は、公開しないものを名前で除く（公開するページは index.md と privacy-policy.md）。
    GitHub Pages は `docs/` を公開元にして公開済みで、2つのURLが開けることと、他の docs のページが
    開けないことも確認した。フィーチャーグラフィックと、スクリーンショット（English・日本語。
    架空の曲で撮影）は `assets/` に作成済み）
-   [ ] 6.4 ビルド・ストア提出（提出の前に、`node scripts/generate-licenses.mjs --check --apk <release の
    APK・AAB>` で、第三者ライセンスの一覧が今の依存と同じことと、把握していない `.so` が入っていない
    ことを確かめる）
-   [ ] 6.5 候補検索の提供元の利用条件の確認（問い合わせ済み。返事を待たずに、v1.0を iOS・Android の
    両方へ提出する。返事が来たら、内容に応じて、更新で対応する）
-   [ ] 6.7 Add Song のスクリーンショットの撮り直し（読みの欄が増えたため。`scripts/store-screenshots/seed.py` は
    アーティストの読みに対応済み）
-   [x] 6.6 第三者ライセンス表記（npmの依存・npmの中に取り込まれたコード・アイコンフォント・ネイティブの
    ライブラリ（React Native が同梱する C++ のライブラリ、Android の Maven の依存、Maven の成果物が
    `.so` に埋め込んでいるライブラリ）のライセンスを、依存関係から生成した一覧にして、About から開く
    Open source licenses に出す。About の「Fonts」は、自前で同梱した書体だけで、この一覧とは別）
