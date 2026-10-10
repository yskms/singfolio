# Singfolio v1.0 WBS

v1.0の作業（保存・管理は端末内で完結し、外部通信は候補検索だけ）を、機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。

**現在地**：2. Songs（2.4 曲の削除から。2.5 の候補は先に実装した）

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
-   [ ] 2.4 曲の削除
-   [x] 2.5 曲名・アーティストの候補（Add / Edit Songの欄の直下。登録済みのアーティストと外部の
    楽曲検索。提供元の表記、送信の制御、設定の保存。設定画面の切替は 5.2）

## 3. Practice

-   [ ] 3.1 練習中の曲の一覧・検索
-   [ ] 3.2 Mark as Ready

## 4. Show Mode

-   [ ] 4.1 閲覧専用画面（アーティスト別、検索、タグ絞り込み、× で戻る）
-   [ ] 4.2 非表示項目の確認（My Key / Private Note / Want を出さない）

## 5. Profile / Settings

-   [ ] 5.1 Profile（曲数の表示、Show My Songs）
-   [ ] 5.2 Settings（Appearance / Language / Suggestions / Tags管理 / About。Aboutには、同梱フォントの
    ライセンス表記を含む（`assets/fonts/OFL-*.txt`））

## 6. リリース準備

-   [ ] 6.1 実機確認（iOS / Android。Song Detail のヘッダーは、Androidの見た目と、画面名を
    付けていない状態でのVoiceOver・TalkBackの読み上げも見る）
-   [x] 6.2 アイコン・スプラッシュ（1024×1024への縮小、Androidの前景画像、
    Play Store用512×512、favicon）
-   [ ] 6.3 プライバシーポリシー・ストア掲載情報（フィーチャーグラフィック、
    スクリーンショットを含む。候補検索で外部へ送る検索語の説明とプライバシー申告を含む。
    説明は、5.2 の Suggestions の切替が済んでから確定する）
-   [ ] 6.4 ビルド・ストア提出
-   [ ] 6.5 候補検索の提供元の利用条件の確認（ストア提出の前に済ませる）
