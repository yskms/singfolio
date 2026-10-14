# Singfolio v1.0 WBS

v1.0の作業（保存・管理は端末内で完結し、外部通信は候補検索だけ）を、機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。

**現在地**：6. リリース準備（6.1・6.4・6.5が残り。6.2・6.3・6.6は完了。6.1は、Androidの見た目と操作は確認済みで、読み上げとiOS実機が残り）

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

## 3. Practice

-   [x] 3.1 練習中の曲の一覧・検索（他の画面から戻ったときの読み直しは、Songs と同じ
    `ui/useFocusRefreshKey.ts` を使う。行には最終更新を出す）
-   [x] 3.2 Mark as Ready（Practice の各行のボタン。押すとすぐ Ready にして、一覧から外れる）

## 4. Show Mode

-   [x] 4.1 閲覧専用画面（アーティスト別、検索、タグ絞り込み、× で戻る。`app/show.tsx`。
    開く入口は Profile の Show My Songs（5.1）。リンク `singfolio://show` でも開く）
-   [x] 4.2 非表示項目の確認（My Key / Private Note / Want を出さない。`show` Service が管理情報を
    持たない形で返すので、画面は出せない。Serviceのテストと、iOS・Androidの画面で確認した）

## 5. Profile / Settings

-   [x] 5.1 Profile（曲数の表示、Show My Songs。件数は、他の画面から戻ったときに読み直す）
-   [x] 5.2 Settings（Appearance / Language / Suggestions / Tags管理 / About。Profileの下半分に並べる。
    Aboutには、同梱フォントのライセンス表記を含む（`assets/fonts/OFL-*.txt`））

## 6. リリース準備

-   [ ] 6.1 実機確認（iOS / Android）。Androidの見た目と操作は、Pixel 11（release ビルド、日本語）で
    確認した（Song Detail のヘッダーと削除のダイアログ、Practice のボタンの縦位置・切れ、
    Show Mode の `×`・戻るキーでの閉じ方と連打、Tags のダイアログとキーボードの重なり・全選択、
    Open source licenses の日本語・ダーク表示、About の Privacy Policy の行が公開したページを
    ブラウザで開くこと）。残りは次のとおり。
    VoiceOver・TalkBack の読み上げ: Song Detail のヘッダー（画面名を付けていない状態）、Practice の
    ボタン（曲名が添わっていること。アクセシビリティツリーでは確認済み）、Show Mode の見出し
    （「名前、N曲」になっていること。ツリーでは確認済み）と曲の行、Settings のスイッチ・Tags・About、
    Open source licenses（名前と「版 · ライセンスの種類」、展開の状態）。
    Practice の失敗のダイアログ（実機）。
    Android の Tags のダイアログは、開いた直後にソフトキーボードが出ない（入力欄を押すと出るが、
    全選択が外れる）。対応を決める。
    iOS 実機（iPhone 8。TestFlight 経由。VoiceOver を含む）。
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
-   [ ] 6.5 候補検索の提供元の利用条件の確認（ストア提出の前に済ませる。問い合わせ済みで、返事を待っている。
    返事が来るまでは、Suggestions を出したまま進める）
-   [x] 6.6 第三者ライセンス表記（npmの依存・npmの中に取り込まれたコード・アイコンフォント・ネイティブの
    ライブラリ（React Native が同梱する C++ のライブラリ、Android の Maven の依存、Maven の成果物が
    `.so` に埋め込んでいるライブラリ）のライセンスを、依存関係から生成した一覧にして、About から開く
    Open source licenses に出す。About の「Fonts」は、自前で同梱した書体だけで、この一覧とは別）
