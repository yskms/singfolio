# Singfolio WBS

v1.0の作業（0〜6章。保存・管理は端末内で完結し、外部通信は候補検索だけ）と、v1.0より後の公開機能（7章）を、
機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。進捗は「7. 公開機能」に書く。

**現在地**：6. リリース準備（6.5・6.8が残り。6.1・6.2・6.3・6.4・6.6・6.7は完了。6.4は、iOS の 1.0 を審査に提出して、審査を通って公開された。Android は、6.8 の変更を含む AAB（versionCode 4）を作って、内部テストへアップロードして、Pixel 11 で確認した。Play Console の申告・掲載を入力して、製品版の審査へ送信し、審査を通って公開された。iOS も審査を通って公開され、紹介ページに両ストアのバッジを載せた。6.8は、アプリの変更・スクリーンショットの撮り直し・ストアの文の修正・両ストアへの入力・Android の実機での確認まで済んだ）。7. 公開機能（v1.0より後）は、7.1（バックエンドの技術検証と選定）が済み、7.2（実装前に確かめること）も済んだ（Appleの公開鍵の取得・`singfolio.app` の取得・認証の方式の決定・Freeプランでの放置後の再アクセス。ログイン手段はiOS・Androidとも、AppleとGoogleに決めた）。7.3 は、小さな作業（7.3.1 から 7.3.13）に分けた。7.3.1（利用者の前提の準備）は済んだ。7.3.2（Workerの土台）も済んだ（本番のD1とWorkerを作り、`singfolio.app` で404を返す状態）。7.3.3（nonce の発行・検証・使用済みの記録と HTTPS の検査）も済んだ（本番へデプロイして、HTTPが403、HTTPSが200になることを実測した。レート制限は Worker に入れない。WAFが Worker より前で効くことも実測した）。7.3.4（IDトークンの検証と、ログイン手段の引き当て）も済んだ（jose で検証し、模擬の発行元でテストした。本物のトークンでの確認は 7.3.7・7.3.8）。7.3.5（セッションとログイン・ログアウトのエンドポイント）も済んだ（模擬の発行元とローカルのD1でテストし、workerd でも動きを確かめた）。7.3.4 以降の Worker は、7.3.13 で本番へデプロイした。7.3.6（アプリ側の認証の土台）も済んだ（HTTP・SecureStore・初回起動での破棄・ログアウト。画面は無く、何も送らない。AndroidエミュレータとiOS Simulatorで確かめた）。7.3.7（Appleのサインイン）も済んだ（AppleのIDトークンの `nonce` の確認は、7.3.13 へ移した）。7.3.8（Googleのサインイン）も済んだ（iOS Simulatorで、取りやめ・成功・2回目のログインを確かめた。Androidの成功経路は、7.3.13 へ移した）。7.3.9（AndroidのAppleログイン。Web経由）も済んだ（Workerのコールバックと認可コードの交換、アプリのCustom Tabと戻りのURL。Androidエミュレータで、Custom Tab から Worker の302、アプリが `code` を受け取るまでを確かめた。本物のAppleでの交換は 7.3.13）。7.3.10（ほかの端末のログアウト・アカウントの削除・Appleのサーバー間通知）も済んだ（Worker: `POST /auth/logout-others`・`POST /auth/delete`・`POST /auth/apple/notifications`、アプリ: `account.signOutOthers()`・`account.deleteAccount()`。Nodeのテストと、workerd での疎通を確かめた。画面は 7.3.11、本物のAppleでの確認は 7.3.13）。7.3.11（アカウントの画面）も済んだ（Settings の `Account`。サインイン・サインアウト・ほかの端末のサインアウト・削除。iOS Simulator で、サインアウト中・サインイン中・各確認・取りやめ・失敗の表示を確かめた。リリースのビルドでは 7.3.13 まで出さない）。7.3.12（申告と文書。未使用のアカウントの自動削除、ポリシーとストアの申告の下書き）も済んだ。7.3.13（実機と署名したビルドでの確認。本番のWorkerへデプロイして、主要な経路を確かめた）も済み、7.3 は完了した。7.4 は、小さな作業（7.4.1 から 7.4.11）に分けた。7.4.1（準備と決定。R2 のバケット `singfolio-snapshots` を作成済み。公開アクセスは無効）から 7.4.5（Worker）までと、7.4.6（アプリの Publish の土台。Service まで）と 7.4.7（Public Profile の画面。Profile から開く。`account.available` のビルドだけ）と、7.4.8（公開するタグの選び方。Public Profile から開く Public Tags 画面）と、7.4.9a（未公開の変更の数え方。Public Profile に「N unpublished changes」を出す）と、7.4.9b（Auto Publish。Public Profile のスイッチ。既定オフ）と、7.4.10（文書。ポリシーとストアの申告の下書き）と、7.4.11（確認。本番へ migration 0004 を適用して Worker をデプロイし、iOS Simulator から本物のサーバーで確かめた。Android・実機でしか確かめられないことは、アカウントを出す版のリリース前に回した）は済んだ。7.5 は、小さな作業（7.5.1 から 7.5.4）に分けた。7.5.1（公開ページの Worker。`singfolio.app/<username>`。R2 だけから表示。ローカルの workerd とヘッドレスの Chrome で確かめた）と 7.5.2（文書）は済んだ。次は 7.5.3（アプリの Preview・Copy Link）と 7.5.4（本番での確認。デプロイは、利用者の確認のあと）

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
-   [x] 2.7 アーティストの読みの辞書（MusicBrainz の CC0 のデータから作って同梱する。実行時に通信しない。
    日本語の設定で、登録済みのアーティストが無いとき、読みの初期値を、辞書から入れる。
    `scripts/build-artist-readings.mjs`・`assets/artist-readings.json`。約4.2万キー、1.5MB）

## 3. Practice

-   [x] 3.1 練習中の曲の一覧・検索（Practice タブ。のちに 6.8 でやめた）
-   [x] 3.2 Mark as Ready（Practice の各行のボタン。のちに 6.8 で、Songs を Practice で絞ったときの
    行のボタン（→ Ready）に移した。Want で絞ったときの「→ Practice」も同じ）

## 4. Show Mode

-   [x] 4.1 閲覧専用画面（アーティスト別、検索、タグ絞り込み、× で戻る。`app/show.tsx`。
    開く入口は Profile の Show My Songs（5.1）。リンク `singfolio://show` でも開く）
-   [x] 4.2 非表示項目の確認（My Key / Private Note / Want を出さない。`show` Service が管理情報を
    持たない形で返すので、画面は出せない。Serviceのテストと、iOS・Androidの画面で確認した）
-   [x] 4.3 並び替え（Artist / Title。ヘッダーのチップの下の右端のボタン。更新日・追加日の順は持たない）

## 5. Profile / Settings

-   [x] 5.1 Profile（曲数の表示、Show My Songs。件数は、他の画面から戻ったときに読み直す）
-   [x] 5.2 Settings（Appearance / Language / Suggestions / Tags管理 / About。以前は Profile の下半分に
    並べていたが、6.8 で Settings タブに分けた。Aboutには、同梱フォントのライセンス表記を含む
    （`assets/fonts/OFL-*.txt`））
-   [x] 5.3 言語の設定を English / 日本語の2つにする（`System` を外し、初回起動で端末の言語から決めて
    保存する。切り替える前に確認のダイアログを出す）
-   [x] 5.4 Artists（Settings。アーティストの名前と読みの変更。一覧は読みの五十音順）

## 6. リリース準備

-   [x] 6.1 実機確認（iOS / Android）。Androidの見た目と操作は、Pixel 11（release ビルド、日本語）で
    確認した（Song Detail のヘッダーと削除のダイアログ、Practice のボタンの縦位置・切れ、
    Show Mode の `×`・戻るキーでの閉じ方と連打、Tags のダイアログとキーボードの重なり・全選択、
    Open source licenses の日本語・ダーク表示、About の Privacy Policy の行が公開したページを
    ブラウザで開くこと）。
    Tags のダイアログは、Androidで開いた直後にソフトキーボードが出ない（入力欄を押すと出るが、
    全選択が外れる）。許容する（直さない）。
    VoiceOver・TalkBack の読み上げは、実施せずに進める（アクセシビリティツリーでは、Practice の
    ボタンに曲名が添うことと、Show Mode の見出しが「名前、N曲」になることを確認した）。
    iOS実機（iPhone 8。TestFlight のビルド番号2、iOS 16.7）は、確認して問題なしだった（利用者の報告）。
    6.8 の変更（タブの再編・行のボタン・My Key・入力順）は、Android はエミュレータと iOS シミュレータで
    確認し、実機は iPhone 8 で確認した。Android の実機（Pixel 11）は、6.8 の変更を含む AAB
    （内部テストの versionCode 4）で確認した（利用者の報告）。Songs の行のボタンが失敗したときのダイアログ（実機）は、
    確認していない（許容する。失敗の経路は、サービスのテストにある）。
-   [x] 6.2 アイコン・スプラッシュ（1024×1024への縮小、Androidの前景画像、
    Play Store用512×512、favicon）
-   [x] 6.3 プライバシーポリシー・ストア掲載情報（`docs/privacy-policy.md`・`docs/singfolio-store-listing.md`・
    `docs/index.html`は作成済み（紹介ページ。のちに自前のHTMLにした）。候補検索で外部へ送る検索語の説明とプライバシー申告を含む。
    `docs/_config.yml` は、公開しないものを名前で除く（公開するページは index.html・ja/index.html と privacy-policy.md）。
    GitHub Pages は `docs/` を公開元にして公開済みで、2つのURLが開けることと、他の docs のページが
    開けないことも確認した。フィーチャーグラフィックと、スクリーンショット（English・日本語。
    架空の曲で撮影）は `assets/` に作成済み）
-   [x] 6.4 ビルド・ストア提出（`eas.json`・EASのプロジェクトは作成済み。ビルド番号はEASが持つ。App Store Connect のアプリは作成済み
    （バンドルID `com.yskms.singfolio`。`eas submit` 用に、`eas.json` の `submit.production.ios.ascAppId` に Apple ID を入れた）。
    iOS は、`eas build --platform ios --profile production --local` で `.ipa` を作り（Apple の配布証明書・プロファイルは EAS が
    作成・保管する。Apple ID の対話ログインが要るので、手元の端末で実行）、`eas submit --path <.ipa>` で TestFlight へ
    アップロードした（ビルド番号2。署名・バージョン・暗号化の申告は、`.ipa` の中身で確認した）。
    App Store Connect に、アプリ情報（カテゴリ・年齢指定・コンテンツ配信権）・アプリのプライバシー（検索履歴
    1項目）・価格（無料）・1.0のバージョン画面（English・日本語の掲載文、スクリーンショット、App Review のメモ。
    内容は `docs/singfolio-store-listing.md`）を入れて、**iOS の 1.0（ビルド番号2）を審査に提出した**。
    審査を通って、公開された。AndroidはR8を有効にした
    （`plugins/withAndroidR8.js`。Google Playが2027年2月から求める難読化・最適化・縮小の率のため）。
    Androidは、`eas build --local --platform android --profile production` で、全アーキテクチャのAABを作れることを
    確認した（署名鍵（upload key）は、EASが初回のビルドで自動作成して保管する）。
    そのAABを内部テストへアップロードし、Play Consoleで、DEXコードの最適化（3つの率とも81%、評価は高）・
    権限（INTERNET・VIBRATEなど。外した権限が出ていないこと）・難読化の対応表の登録を確認した。提出の前に、`node scripts/generate-licenses.mjs --check --apk <release の
    APK・AAB>` で、第三者ライセンスの一覧が今の依存と同じことと、把握していない `.so` が入っていない
    ことを確かめる）。
    6.8 の変更（タブの再編・My Key・行のボタン）を含む AAB（versionCode 4）を作り直した。AGP 8.12.3・全アーキテクチャ・
    権限はアプリが使う INTERNET・VIBRATE と、ライブラリ由来の2つ（`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`・
    コンポーネントの保護に付く `DUMP`）の計4つで、Play Console も「4個」と表示した・難読化の対応表（`proguard.map`）入りで、`--check --apk` は、一覧が今の依存と同じ
    （112 件）で、`.so` 22 種はすべて把握しているものだった。これを内部テストへアップロードし、Play Console で、署名鍵が受け入れられたこと・DEX コードの最適化（3つの率とも81%、評価は高）・
    権限が4個であることを確認した（versionCode 3 は 6.8 の変更を含まない）。
    Android の製品版は、審査を通って公開された（紹介ページには Google Play のバッジを載せ済み）。
    iOS の 1.0 も審査を通って公開された。紹介ページ（`docs/index.html`・`docs/ja/index.html`）に、
    App Store のバッジとリンクを足し、「iOS version coming soon.」（en）・「iOS版は準備中です。」（ja）の
    一文を外し、JSON-LD の `operatingSystem` を `"Android, iOS"` にした（済み）。GitHub Pages に反映された後、
    公開後のURLで、2つのバッジのリンクがそれぞれのストアの掲載ページへ飛ぶことを確かめる
-   [ ] 6.5 候補検索の提供元の利用条件の確認（問い合わせ済み。返事を待たずに、v1.0を iOS・Android の
    両方へ提出する。返事が来たら、内容に応じて、更新で対応する）
-   [x] 6.7 スクリーンショットの撮り直し（読みの欄が増えた Add Song、並び替えのボタンが増えた Show Mode、
    Artists の行が増えた Profile。English・日本語、iOS・Android の12枚。ほかの3画面は、見た目が変わらないので、
    そのまま。`scripts/store-screenshots/seed.py` はアーティストの読みに対応済み）
-   [x] 6.6 第三者ライセンス表記（npmの依存・npmの中に取り込まれたコード・アイコンフォント・ネイティブの
    ライブラリ（React Native が同梱する C++ のライブラリ、Android の Maven の依存、Maven の成果物が
    `.so` に埋め込んでいるライブラリ）のライセンスを、依存関係から生成した一覧にして、About から開く
    Open source licenses に出す。About の「Fonts」は、自前で同梱した書体だけで、この一覧とは別）
-   [ ] 6.8 実機で触って出た違和感の反映。Add Song の入力順を Artist → 読み → Title にした（済み）。Songs の
    行の右に My Key を出した（済み。原曲のままは `-`）。Songs を Practice で絞ると「→ Ready」、Want で
    絞ると「→ Practice」のボタンを行の右に出した（済み）。ボトムタブを Songs / Profile / Settings にして、
    Practice タブをやめ、Profile と設定を分けた（済み）。ストア用スクリーンショット（Songs・Add Song・
    Practice の画面・Settings。iOS・Android、English・日本語の16枚）は撮り直して、`compose.sh` で作り直した
    （済み。`06-profile` は `06-settings` に改名）。ストアの説明文は、`docs/singfolio-store-listing.md` の
    「Practice タブ」の記述を直した（済み。App Store Connect・Play Console への入力は、利用者の作業）。
    iOS シミュレータ（release、English）で確かめた: Add Song の入力順・Enter の移動・曲名の欄へのスクロール、
    曲名の候補を選んでも曲名だけが入ること、アーティストの候補を選んで曲名へ移ること（自動修正を切った）、
    行のボタン（Practice で絞って → Ready）、My Key の表示、3つのタブ。シミュレータはハードウェア
    キーボードが接続されていてソフトキーボードが出ないので、実機（TestFlight のビルド）で、曲名の候補
    （最大5件）がキーボードに隠れないこと、日本語入力中の欄の挙動、Songs の行のボタン（Want で絞ったとき）を
    確かめる

## 7. 公開機能（v1.0より後）

実装の前に、7.2 を済ませる。内容は `singfolio-publishing-backend.md` §8。

公開機能は、扱うデータが増えるたびに、プライバシーポリシー（`docs/privacy-policy.md`）・
`docs/singfolio-store-listing.md`・ストアの申告を直す（7.3・7.5・7.6）。

-   [x] 7.1 バックエンドの技術検証と選定（Cloudflare Workers + D1 + R2 + Turnstile。ローカルの実行環境で、
    Publish・公開ページ・所有者以外の更新の拒否・Requestの受付・D1停止中の公開ページ表示・IDトークンの検証を確認した）
-   [x] 7.2 実装前に確かめること（本番のWorkersからのAppleの公開鍵の取得、`singfolio.app` の取得、
    nonce・セッションの失効・Appleのトークン失効の方式（§8「認証の方式」）、ログイン手段（iOS・Androidとも
    AppleとGoogle。AndroidのAppleはWeb経由）、Googleのサインインの `nonce`・`aud`（iOS SimulatorとAndroidエミュレータで
    確認。§8「Googleのサインイン」）、Freeプランでの12日間の放置後の再アクセス（手動の操作なしで、読み書きできた。
    §8）。
    なお、候補検索由来の曲名の公開は、6.5 の結果次第で、実際の公開の前に決着が要る）
-   [ ] 7.3 認証（Apple / Google）とアカウント（アプリ内からの削除を含む）。プライバシーポリシー・ストアの申告を直す
    （アカウント）。内容は `singfolio-publishing-backend.md` §8「認証」「認証の方式」。次の小さな作業に分ける（番号は
    目安で、順序の約束ではない。7.3.1 は、7.2 の待ちの間に進めた。7.3.2 以降の実装は、7.2 が済んだので始められる）。
    -   [x] 7.3.1 前提の準備（利用者の作業）。Apple: Sign in with Appleの設定（primary App ID・Services ID・鍵）は済み
        （サーバー間通知のエンドポイントは 7.3.10）。Google: クライアント（Web・iOS・Androidの署名の鍵ごと。EASのlocal build・
        Play App Signingの鍵を含む）は作成済み。同意画面の「公開」は、ホームページとプライバシーポリシーのURLが要る
        ため、7.3.13 のリリースの前に決める（7.3.12 の項。それまでは「テスト中」）。Cloudflare: アカウントの確認は済み。本番のWorkersとD1、`singfolio.app` のルート、秘密情報は
        7.3.2 で作る（R2は 7.4。スナップショットを置くときに作る。7.3.10 の削除には、消すものが無い。Turnstileは 7.6）
    -   [x] 7.3.2 Workerの土台。プロジェクトの構成（`worker/`。独立したパッケージ。§8「Workerの構成と運用」）、D1のスキーマと
        マイグレーション（`users`・`identities`・`sessions`・`used_nonces`。`migrations/0001_initial.sql`）、開発用と本番用の設定、
        秘密情報の扱い、リクエストのログに認証の値を出さない設定（Workers Logs を無効にする）。テストは `worker/` で `npm test`。
        本番は、D1（`singfolio`）の作成とマイグレーションの適用、初回のデプロイ（JSONの `--secrets-file` で `NONCE_HMAC_KEY` を渡した）まで
        済み。`singfolio.app` は404を返し、`workers.dev` には出ていない。本番の外部キーが有効なことは、読み取りと、存在しないユーザーを
        指す `identities` の INSERT が拒否されることで確かめた
    -   [x] 7.3.3 nonce。`POST /auth/nonce`（無状態。`T` の署名・期限・種別）と、`T` の検証・使用済みの記録。
        HTTPSでないリクエストの拒否（§8「Workerの構成と運用」の「HTTPS」）を含む。`worker/` の `npm test` が通り、本番へデプロイして
        確かめた（HTTPが403、HTTPSが200、エッジの `request.url`・`X-Forwarded-Proto` がHTTPを反映する）。レート制限は、このエンドポイント
        には入れない（乱用の費用が無い。§8「実装時に決めること」）。WAFのRate limiting rules（1ルール）は、Workerより前で効くことを実測した
        （弾いた分はWorkerを起動せず、Metricsの呼び出しにも数えられない。§8「実装時に決めること」）。日次の上限への手当て（ルールを残すか、有料プランか）は、7.3.9 で決めた（Appleを呼ぶ `/auth/apple/login` に、WAFの1ルール。§8「実装時に決めること」）
    -   [x] 7.3.4 IDトークンの検証（Apple・Google。公開鍵（JWKS）の取得とキャッシュ、`iss`・`aud`・`exp`・`nonce`）と、`sub` から
        `identities` を引く・作る処理。模擬の発行元で、拒否の条件を確かめる。jose（`jwtVerify`）で検証し、`alg` はRS256のみ、`kid`・`exp`・`sub`
        を必須にした。公開鍵はisolateのメモリにキャッシュし、取得に失敗しても25時間までは前の鍵で続ける（冷却60秒）。`aud` は、`T` の種別と
        ログイン手段で1つに決める。`resolveIdentity` は1バッチで、同時の初回ログインでも孤立したユーザーを残さない。本物のApple・GoogleのJWKSを
        読めること、workerd（`wrangler dev`）で動くことも確かめた（§8「IDトークンの検証」）。ログインのエンドポイント（`T` の検証から
        セッションの発行まで）は 7.3.5
    -   [x] 7.3.5 セッション。発行（ハッシュだけをD1に置く）、認証（最終利用の時刻は24時間以上たったときだけ書く）、
        ログアウト（行の削除）と、ログインのエンドポイント（`POST /auth/login`・`POST /auth/logout`。§8「ログインとログアウト」）。
        `T` の検証 → IDトークンの検証 → 使用済みの記録 → ログイン手段の引き当て → セッションの発行の順で、D1に書くのは検証に通ったあと。
        つなぐときに決めた2点: 公開鍵を一度も取れていない間も冷却を守る（失敗した試みを記録し、60秒は取りに行かず、すぐ `unavailable`）、
        `audienceFor` が null の組み合わせ（Googleの `web`）は、公開鍵を取りに行く前に拒否する。`web` の `T` は、`V` の照合
        を 7.3.9 で足して、`POST /auth/apple/login` だけが受け付ける。セッションの認証（`authenticateSession`）を使うエンドポイントは、7.3.10 で足した（`/auth/logout-others`・`/auth/delete`）。
        本番へは 7.3.13 でデプロイした（マイグレーション 0002・0003 を含む）。
    -   [x] 7.3.6 アプリ側の認証の土台。HTTPをRepositoryに閉じ込める、SecureStoreにセッション、初回起動でセッションを捨てる、
        失敗の扱い。ログインを要求しない（ログアウトのままでも、v1.0の機能はすべて使える）。`authRepository`（`/auth/nonce`・
        `/auth/login`・`/auth/logout`）、`sessionRepository`（SecureStore）、`account` Service（`signIn(provider)`・`signOut`。各社の
        サインインは `IdTokenProvider` として 7.3.7 以降が注入する）。セッションは、ローカルDBの識別子（`settings.local_data_id`）と一緒に保存し、
        今のDBと合わなければ、サインイン中として扱わない（再インストール後にKeychainに残ったセッションを生かさない）。初回起動の破棄
        （`runMigrations` の `onNewDatabase`。最初のマイグレーションの前）は後始末で、失敗しても起動を止めない。ログアウトは端末の値を先に
        捨て、通信できなくても端末はログアウトする。
        `expo-secure-store` を足し、config plugin は足さず（Androidのバックアップ規則がSQLiteを外すため）、`androidx.biometric` が足す
        `USE_BIOMETRIC`・`USE_FINGERPRINT` を `blockedPermissions` に足した。Androidエミュレータ（R8入りのrelease）とiOS Simulatorで確かめた
        （§8「アプリ側の認証の土台」）
    -   [x] 7.3.7 Appleのサインイン（iOS。`expo-apple-authentication`）。`IdTokenProvider` として注入した（`appleSignInRepository`。
        iOSだけ。スコープは空）。config plugin（エンタイトルメント）、失敗の分類（`provider-failed`・`timeout` を足した）。
        時間の上限と取り消しは決めた（`account` で5分。取り消しの口は作らない。Googleの7.3.8も同じ場所で効く。§8「Appleのサインイン（iOS）」）。
        Nodeのテストと、iOS Simulator（Release。Xcode 27）でのビルド・起動を確かめた（Appleアカウント無しの端末で、OSのサインインのシートが出る
        ことと、`provider-failed` になることまで。シートの「閉じる」は `cancelled` にならず `provider-failed`。§8）。**AppleのIDトークンの `nonce` が、渡した値そのままかは未確認で、
        7.3.13 へ移した**（端末にAppleアカウントでサインインしている必要がある。iOS Simulator の iPhone 18 Pro は、サインインしていない）。
        そのままでないと分かったら、Worker側の比べ方（`worker/src/idToken.ts`）を、§8「nonce」の方針どおり直す。それまで、AppleのログインがWorkerを
        通るかは分からない（Appleの `nonce` の比較が 401 になりうる）
    -   [x] 7.3.8 Googleのサインイン（iOS・Android）。検証済みの自作モジュール（§8「Googleのサインイン」）を取り込んだ（検証用の
        画面は持ち込まない）。`googleSignInRepository`（失敗の分類）を `IdTokenProvider` として、両OSに注入した。モジュールは、
        ネイティブ側が無いビルドでも、importでは落ちない。クライアントIDは本番用のプロジェクトのものにして、Workerの
        `GOOGLE_WEB_CLIENT_ID` との一致をテストで固定した。ライセンス一覧の生成を拡張した（iOSのPod 9個を全文つきで、Android Software
        Development Kit Licenseの依存は、groupIdを個別に許可して、Aboutの別枠に名前と規約のURLだけ。Play services の AAR が持つ OSS の表記は、
        載せると決めた20件を全文つきで。自前の `modules/` は除く）。
        iOS Simulator（Release）とAndroidエミュレータ（R8入りのrelease）で確かめた。iOSは、取りやめ・成功（`nonce`・`aud`）・2回目の
        ログイン、Androidは、シートと取りやめまで。**Androidの成功経路（エミュレータにGoogleアカウントが無い）は、7.3.13 へ移した**。
        `blockedPermissions` の `USE_BIOMETRIC`・`USE_FINGERPRINT` は 7.3.6 で入れてある
    -   [x] 7.3.9 AndroidのAppleログイン（Web経由）。Worker: コールバック（`GET /auth/apple/callback`。アプリのURLスキームへの302）、
        `POST /auth/apple/login`（`V` の照合 → Appleの認可コードの交換 → IDトークンの検証 → セッション。`client_secret` はES256のJWTを秘密鍵
        `APPLE_PRIVATE_KEY` で署名）。アプリ: Custom Tab（`expo-web-browser`）、認可コードの経路（`authCodeProviders`）、戻りのURLの扱い
        （`state` の照合・猶予つきの取りやめの判定・`app/+native-intent.tsx`）。レート制限は、WAFの1ルールに決めた（Workers の Rate Limiting API は、
        Freeで使えるかが資料に無いので足さない）。Nodeのテストと、workerd・Androidエミュレータ（R8入りのrelease。Chrome の Custom Tab）で確かめた
        （Custom Tab → Worker の302 → アプリが `code` を受け取る、本物のAppleの認可の画面が出る、取りやめ、起動時の戻りのURL。起動時は `null` を返すと
        Add Song が開くのを直した）。**本物のAppleでの確認（コードの交換・IDトークンの `nonce`・`sub`）は、デプロイと利用者のAppleアカウントが
        要るので、7.3.13**。アプリが終了したときの再開は実装しない（7.3.11 で決めた）（§8「AndroidのAppleログイン（Web経由）の実装」）
    -   [x] 7.3.10 アカウントの削除・Appleのサーバー間通知・「ほかの端末をすべてログアウト」。
        Worker: `POST /auth/logout-others`（認証済みのセッション以外の、同じユーザーの全セッションを削除。204）。`POST /auth/delete`（セッション +
        再認証。IDトークンの `sub` が、ログイン中のアカウントと一致しなければ 403 `account_mismatch`。再認証の失敗は 403 `reauth_failed`、セッションの無効は 401 と分ける。
        D1の行を消してから、Appleのトークンを失効させる（失効の失敗は削除を止めず、`appleRevoked: false` で伝える。`refresh_token` はメモリの中だけ。iOSの認可コードの交換は、
        消す前に行い、消したあとに待つのを失効の1回にした。アプリは、`/auth/delete` だけ待つ上限を30秒にした）。Appleの失効は
        `appleToken.ts` に `exchangeWithToken`・`revoke` を足した（ログインの `exchange` は、これまでどおり `id_token` だけを読む））。`POST /auth/apple/notifications`
        （JWSを `iss`・`aud`（バンドルIDとServices IDのどちらも）・署名で検証。`exp` は必須にしない。`consent-revoked` はセッションを消して `consent_revoked_at` を記録、
        `account-deleted` は行（最後の手段ならアカウントごと）を消す。再送・遅れて届く古い通知・`event_time` の単位の揺れに備えた。`consent-revoked` のセッションの削除は、
        セッションの単位（`created_at <= event_time`）。
        **通知とログインの競合は、`last_sign_in_at` と `event_time` の比較だけでは吸収できなかった**ので、`identities.consent_revoked_at`（`migrations/0002`）を足し、
        `createSession` が、取り消しより前に始まったログインのセッションを作らない形にした（§8「Appleのサーバー間通知」）。
        アプリ: `authRepository`（`logoutOthers`・`deleteAccount`。403 を `reauth-failed`・`account-mismatch` に分ける）、`appleSignInRepository.getIdTokenWithCode`
        （再認証で認可コードも返す）、`account`（`signOutOthers`・`deleteAccount`。ログイン中の手段で再認証。401 のときだけ端末のセッションを捨てる。成功したら捨てる）。
        Apple の公式資料で、通知の種類は `account-deleted`（`account-delete` も読む）、payload に `exp` が無いことを確かめた。
        **R2のスナップショット・`profiles`・Requestの削除は、消すものが無いので、7.4 以降に回した**（`deleteUserAccount` に足す。順序は §8）。
        **利用者の作業（デプロイのあと）**: Apple Developer の primary App ID の Sign in with Apple の設定に、通知のエンドポイント
        `https://singfolio.app/auth/apple/notifications` を登録する。Apple Account側の資格情報が失効していて再認証できない利用者の依頼先は、7.3.12 でメールに決めた（運営者はメールからアカウントを引けず、1年の自動削除を待つ）
        （再認証なしの削除の逃げ道は作らない。公開の GitHub Issues は向かない。詳細は §8「アカウントの削除とAppleのトークン失効」）
    -   [x] 7.3.11 アカウントの画面（サインイン・サインアウト・「ほかの端末をすべてサインアウト」・削除）。`app/account.tsx`・`ui/AccountSection.tsx`・
        `src/i18n/authErrors.ts`（失敗 → 操作ごとの文言）。**置き場所は Settings の `Account`**（Profile ではない。行は値を出さず、Settings が SecureStore を読まない）。
        サインイン中でない: Apple（iOSはシステムのボタン `AppleAuthenticationButton`）・Googleのボタンと、「アカウントなしで使える」の説明。サインイン中: 手段の名前、
        サインアウト・ほかの端末・削除（確認のダイアログつき。削除は再認証のあと、最大30秒の待ちを出す）。実行中は戻れない（`usePreventRemove`）。失敗は
        ErrorBoundary に伝えず画面の中で出し、操作のあとは必ずサインインの状態を読み直す。`getSignedInProvider` が投げたら「確認できませんでした」と「もう一度試す」。
        **リリースのビルドでは 7.3.13 まで出さない**（`src/services/index.ts` の `ACCOUNT_ENABLED`。`__DEV__` か `EXPO_PUBLIC_SINGFOLIO_ACCOUNT=1` のとき
        だけ `auth` を注入し、`account.available` が真になる。入口の行も、ルート `singfolio://account` も閉じる）。7.3.13 のビルドは、`eas.json` の
        `account-test` プロファイルで作り、**製品版・審査へ昇格させない**。7.3.12・7.3.13 が済んだら、ゲートとプロファイルを外す。
        **決めたこと**: サインイン済みから別のログイン手段をつなぐ画面は作らない（Worker にエンドポイントが無い。手段が違えば別のアカウント）。再認証なしの削除は作らない
        （再認証できない利用者の依頼先は、7.3.12 でメールに決めた）。Androidの Apple のサインインの再開は実装しない。Googleの `clearCredentialState` は呼ばない（§8「アカウントの画面」）。
        iOS Simulator（iPhone 18 Pro。Release。日本語・ライト・ダーク）で確かめた: Settings の行、サインアウト中の画面、Apple のシートを閉じたときの `provider-failed`
        （1行の文言。ボタンは押せる状態に戻る）、Google の確認ダイアログのキャンセル（何も出ない）、実行中の表示、偽のセッションでのサインイン中の画面（Apple・Google）、
        削除の確認 → 再認証の失敗（サインイン中のまま）、ほかの端末のサインアウト（本番Workerが未対応で `invalid-request` → 汎用の文言。セッションは捨てない）、サインアウト
        （サーバー側を終了できなかった旨の1行）。**未確認**: 英語の表示、Android、本物のサインインの成功・削除の成功・`appleRevoked: false` の表示、実行中に戻る操作が止まること、
        VoiceOver・TalkBack、文字を大きくした端末（7.3.13）
    -   [x] 7.3.12 申告と文書、未使用のアカウントの自動削除。
        **自動削除（Worker）**: 最後に使ってから1年で消す（Cron Trigger は毎日1回。`worker/src/inactiveAccounts.ts`・`migrations/0003`）。
        `users.last_active_at` を、ログイン・セッションの更新（24時間に1回）・ログアウトで進める。消す文に条件を入れ直し（候補に選んだあとにログインしたアカウントは消えない）、
        NULL は消さない側。D1のクエリは2回だけ（Freeは1回の実行で50回まで）。**D1の `meta.changes` は、外部キーのカスケードで消えた行も数える**（ローカルのD1で実測。本番は未確認。「1のとき成功」ではなく
        「0より大きいとき」）。Node のテストと、`wrangler dev --test-scheduled`（workerd）で確かめた。本番へは次のデプロイで登録される（§8「未使用のアカウントの自動削除」）。
        **削除の窓口（決定）**: メール（`yskms.studio@gmail.com`）。運営者はメールからアカウントを引けないので、サインインできない人は1年の自動削除を待つ。ポリシーにそのまま書いた。
        **文書**: `docs/singfolio-privacy-policy-next.md`（英日。アカウントを出す版のポリシー。公開しない。アカウントを出す版のリリース手順で `privacy-policy.md` に反映する。7.3.13 の確認用ビルドはリリースしない）、
        `docs/singfolio-store-listing.md` §6（App プライバシー・データ セーフティ・App Review のメモ・Googleの同意画面・SDK のマニフェストの読み直し）、CLAUDE.md。
        **ユーザーの判断・作業が要る点（アカウントを出す版のリリースの前）**: (1) iOS の App プライバシー: GoogleSignIn 10.1.0 のマニフェストが、名前・メール・電話番号・位置情報などの収集を宣言している。
        (A) 2項目だけ、(B) マニフェストの種別も申告、(C) iOS は Apple のみ、のどれにするか（§6）。(2) Google の同意画面（本番環境。ホームページ・ポリシーのURLが
        検証済みのドメインに置けるか。`yskms.github.io` で足りるか不明。足りないなら `singfolio.app` にポリシーを置く）。(3) Play Console の申告
        （データ セーフティ、アカウントの削除のURL・保存期間）と App Store Connect の申告・App Review のメモ。メールの窓口がPlayの審査で通るかは未確認。
        (4) ポリシーの施行日と、公開後のアンカー（`#delete-account`）の確認。(5) `ACCOUNT_ENABLED` とプロファイル `account-test` を外すのは、7.3.13 のあと。
    -   [x] 7.3.13 確認。実機と署名したビルド（TestFlight・Playの内部テスト。`eas build --local --profile account-test` で作る。`env` が `--local` のビルドに埋め込まれるかも、入口が出ることで確かめる。このビルドは製品版・審査へ昇格させない。TestFlight は内部テスターだけに配る。Android の versionCode も `production` と同じ番号列を使う）で、ログイン・キャンセル・再ログイン・ログアウト・削除。
        **デプロイの確認**（利用者が `APPLE_PRIVATE_KEY` を登録したあと。§8「デプロイ後の確認」に足す）: マイグレーション（0002・0003。`ADD COLUMN` と `UPDATE` だけで、`wrangler rollback` で 7.3.3 のコードに戻しても整合する）の直前に
        `wrangler d1 time-travel info` で bookmark を控える。デプロイの出力で schedule（`17 3 * * *`）を確かめる（登録の確認。実行の確認は UTC 03:17 に tail を開き、`scheduled` が Ok になるのを見る。ユーザーが居ないので件数の行は出ない）。
        HTTP が 403、HTTPS が 200 のあと、**偽の `code` で `/auth/apple/login` を呼ぶ**（`kind: web` の `T` と、合う `V` を付ける）: 401 なら鍵を読めて署名もできている（D1 には何も書かれない）。鍵が無い・壊れていると、
        例外が Worker の外へ出て 1101（500）になる（503 ではない）。503 は Apple に届かない・想定外の応答で、tail の1行で切り分ける。この確認で分かるのは鍵の形式までで、Key ID・Team ID の正しさは本物のコードまで分からない。
        `wrangler tail` の出力は、ヘッダーとクエリ（`code`・`state` が付く）を除いて見る（`--format json` を jq で絞る。出力を共有・保存しない）。
        **進捗**: Worker のデプロイまで済んだ（`APPLE_PRIVATE_KEY` の登録、マイグレーション 0002・0003、デプロイ、HTTP 403、HTTPS 200、偽の `code` で 401。偽の `code` の確認は、`V` が合う呼び出し（約0.8秒）と合わない呼び出し（約0.07秒）の所要時間の差で、Apple まで届いたことを確かめた）。
        WAF のレート制限ルール（Path が `/auth/apple/login`、IP、5件/10秒、Block）も作って確かめた（本文が空の呼び出しを10件続けると、1〜5件目は 400、6件目以降は 429 `error code: 1015`。`/auth/nonce` は 200 のまま、10秒余り待つと 400 に戻る）。
        **実機の確認の結果**（iPhone 8: TestFlight。公開済みの 1.0.0 の番号には TestFlight が受け付けないため、`app.json` の `version` を上げた 1.1.0 で上げた。Android 実機: Play の内部テスト。R8 入りで全アーキの AAB）:
        -   iOS の Apple（ネイティブ）: `nonce` が一致（`/auth/login` 200）。シートの外をタップする取りやめは何も出ず、シートを出したまま画面を消灯・復帰すると `provider-failed` の文言（「サインインが完了しませんでした」）。
            サインアウトはサーバー側で消せたときは文言なし（端末だけのときだけ1行出す設計どおり）。取り消しのあとの再サインインも成功。
        -   Android の Google: Play App Signing の鍵で、R8 入りの release で成功。プロジェクトの所有者でもテストユーザーでもない2つのアカウントで、同意画面が「テスト中」のまま入れた。同じアカウントの再サインインは同じユーザー。
        -   Android の Apple（Web 経由）: 認可コードの交換が通った（`client_secret`・`redirect_uri` をAppleが受け付けた）。`nonce` が一致。Chrome の確認ダイアログは出ず（出たのは Apple のページの確認だけ）、そのままアプリに戻った。
            取りやめは2通りで、どちらも静かに元の画面へ戻る（Apple のページのキャンセルはコールバック経由、ブラウザを閉じるとコールバックを通らない）。
        -   Apple の `sub` は iOS と Android で同じ（同じユーザーに結び付く）。
        -   ほかの端末をすべてサインアウト（2台）: 操作した側は 204、もう片方は次の呼び出しで 401 になり、端末のセッションを捨てて「サインアウトされました。もう一度サインインしてください。」を赤字で出した。
        -   Apple のサーバー間通知: 「Apple ID の使用を停止する」で `consent-revoked` が届き、200 でセッションが消え、`consent_revoked_at` が入った（1分未満）。取り消しのあとの再サインインも成功。
            通知の中身は tail では見えないので、結果で確かめた（拒否の `reason=` が出ず、セッションが消えた）。
        -   アカウントの削除: iOS の Apple（認可コードを `redirect_uri` 無しで交換）・Android の Apple（Web）・Google の3経路とも 200。Apple は、設定の「Appleでサインイン」の一覧から Singfolio が消えた
            （Android の Services ID の経路でも、iOS 側の一覧から消えた）。削除の直後に、`/auth/apple/notifications` へ通知が届く（失効に伴うものと推測。中身は見えない）。
        -   全体: tail にログ・例外・`ok` 以外の結果は無かった。テストのあと、本番の D1 は全件を削除して空に戻した。
        **アカウントを出す版のリリース前に見る**（主要な経路が済んだので、7.3.13 はここで区切った）: 英語表示、VoiceOver・TalkBack、文字を大きくした端末、実行中に戻れないこと、SMS の確認コードを別のアプリで開く経路、`account-deleted` の綴り（Apple Account を実際に消さない限り確かめられない）、
        Cron の実行（UTC 03:17 に tail で `scheduled` が Ok になるのを見る）、Apple が取りやめに `state` を付けるか（tail のクエリを除いているので見えない）。
        7.3.11 の画面の未確認（英語、Android、実行中に戻れないこと、VoiceOver・TalkBack、文字を大きくした端末、削除の成功と `appleRevoked: false`・`sessionCleared: false` の文言）も、ここで見る。
        7.3.10 の分: 削除でAppleのトークンが失効するか（iOSの認可コードを `redirect_uri` 無しで交換できるか、Appleの設定の「Appleでサインイン」の一覧からSingfolioが消えるか。
        AndroidのServices IDで得たトークンの失効が、iOS側も消すか）、Appleのサーバー間通知（エンドポイントの登録のあと、「Appleでサインインの利用を停止」で `consent-revoked` が届き、セッションが消えるか。
        **通知の中身は `wrangler tail` では見えない**（`appleNotification.ts` の方針で本文を出さず、tail にも本文は出ない）。結果だけを見る: 拒否なら tail に `reason=`（固定の語彙）が1行出る。
        成功なら 200 で、D1 のセッションが消え、`identities.consent_revoked_at` に正規化後の `event_time` が入る（実時刻と合うか見る。`event_time` は秒でもミリ秒でも読めるので、元の単位は分からなくてよい）。
        `account-deleted` の綴りは、Apple Account を実際に消さない限り確かめられないので、未確認のまま残す（コードは両方の綴りを読む）。中身を出す一時的なコードは入れない）、「ほかの端末をすべてログアウト」（2台で）。
        最初に、AppleのIDトークンの `nonce` が、渡した値（`SHA-256(T)` の base64url）そのままか（7.3.7 から移した。違うなら、Workerを直してから
        ほかを確かめる）。サインインの成功・取りやめ・失敗の、実際のエラーコード（`appleSignInRepository` の分類）。
        Appleの `sub` がiOSとAndroidで同じか、Services IDで得たトークンを失効させたときの連携、AndroidのWebのフロー全体、
        異常系（通信断・アカウントの切り替え・連打）。**AndroidのApple（Web経由。7.3.9）は、デプロイのあとで**: 先に、利用者が
        `wrangler secret put APPLE_PRIVATE_KEY`（`.p8` の中身）と、WAFのルール（Path が `/auth/apple/login`、IPで数える、5件/10秒 目安、Block）を
        作る。そのうえで、Appleの認可コードの交換が通るか（Appleが `client_secret` と `redirect_uri` を受け付けるか）、IDトークンの `nonce` が `SHA-256(T)`
        そのままか、`sub` がiOSと同じか、Return URL からの 302 が実機の Custom Tab でアプリを開くか（Chrome が「Continue to Singfolio?」を出して、利用者に押させる
        場合がある。エミュレータの測定は §8「Chrome の Custom Tab での戻り方」。Appleの実際のページからの戻りが、確認なし・確認ありのどちらになるか）、
        取りやめ（`user_cancelled_authorize`）と、Appleが取りやめに `state` を付けるか、SMSの確認コードを別のアプリで開いて入力して戻る経路（Custom Tab に戻れるか）を確かめる。
        設定の不備（`invalid_client`）は、本物のコードの交換で初めて出る（でたらめなコードでは常に `invalid_grant`）。503 が続いたら、`wrangler dev` の出力か
        `wrangler tail` の1行（`apple token exchange failed: ...`）で切り分ける（デプロイしたWorkerでの `wrangler tail` は未確認）。鍵の不備（無い・形式が違う）は 503 ではなく 1101（500）になる。Googleは、Androidの成功経路（本番用のクライアントIDと、署名の鍵ごと
        （debug・EASのlocal build・Play App Signing）のSHA-1）、プロジェクトの所有者でもテストユーザーでもないアカウントで入れるか
        （同意画面は「テスト中」）。Androidの成功経路は、**R8 入りの release で**確かめる（結果の解析 `GoogleIdTokenCredential.createFrom` と
        トークンの返却。googleid のクラスは R8 で改名される）。
        **Android の経路は、Play の内部テスト1本**（`account-test` の AAB。全アーキ入り。出荷と同じ Play App Signing の鍵で、R8 入りを確かめる）。署名の鍵ごとのSHA-1は、Google Cloud の Android クライアントに登録済み
        （debug・EASのlocal build・Play App Signing）。成功経路で通らなければ、まず疑う。確認用のアカウントは、プロジェクトの所有者でもテストユーザーでもないものを使う（同意画面が「テスト中」でも入れるか。
        先にテストユーザーへ登録しない: 確かめられなくなる）。
-   [ ] 7.4 Public ProfileとPublish（Auto Publishを含む）。内容は `singfolio-publishing-backend.md` §3〜§6・§8。公開ページ（7.5）とRequests（7.6）は入れない。
    アプリの画面は、7.3 と同じ `ACCOUNT_ENABLED` のゲートの後ろに置く。Worker（7.4.1〜7.4.5）を先に完成させ、アプリ（7.4.6〜7.4.9b）へ進む。
    アカウントの削除（`worker/src/account.ts` の `deleteUserAccount`。自己削除とAppleの `account-deleted` が使う）に、
    R2のスナップショット・`profiles` の削除を足す（順序: `username` を読む → R2を消す → D1の行を消す。R2に失敗したらD1の行を残して失敗にする。§8）。Requestの削除は 7.6。
    **未使用のアカウントの自動削除（1年）の見直し**（決めずに公開機能を出さない）: 公開ページが載ると、端末の中だけで使い続ける人は、サーバーとの通信が無く、
    1年後に公開ページごと消える。**既定の判断は「Publish済み（公開ページのあるアカウント）を対象外にする」**（Unpublish か削除をすれば対象に戻る。対案の「Publish を
    利用の記録に数える」は、Auto Publish が変更の無いときに通信しないので足りない。対象外にすれば、条件つきの削除とR2の順序の問題も無くなる。§8）。
    **対象外の条件は、1か所（候補の SELECT と、条件つきの DELETE が同じ式を使う）に置く。** のちに「無料は公開ページも1年で消える、課金していれば消えない」へ切り替えるときに、
    その式だけを変えればよいようにするため。今は課金の仕組み（購読の状態の保存など）を作らない。切り替えるときは、先に利用の記録（認証つきの通信を、アプリが定期的に行う）を足し、
    ポリシーを直して、利用者に知らせてから行う（今の「公開ページのあるアカウントは自動では消えない」を前提に使い始めた人の約束を変えるため）。
    **7.4 の既定の判断**（7.4.1 で §8 の「実装時に決めること」に記録する）:
    -   `username` は変更を許さない。アカウントの削除後も再利用させない（名前だけを、ユーザーIDと結びつけずに残す。ポリシーに書く。再利用を許すと、配ったURLが別の人のページを指しうる）。
    -   スナップショットの版は整数。Publish のリクエストに `baseVersion` を入れ、サーバーの版と違えば 409。アプリは「別の端末から公開した内容があります。置き換えますか」を出す。
        複数の端末の衝突と、再インストール後の空のローカルからの Publish の保護を、これ1つで兼ねる。
    -   端末側の Publish の状態は、最後に Publish した曲ごとのハッシュを端末に持ち、今の公開対象と比べて「N unpublished changes」を数える。
    -   大文字・末尾のスラッシュ付きのURL、公開ページのキャッシュ、`noindex` は 7.5。Unpublish 後の Request の扱いは 7.6。
    -   [x] 7.4.1 準備と決定。利用者の作業: Cloudflare で R2 を有効にし、バケットを作る（有効化には、R2 のサブスクリプションの追加が要る。無料枠内は $0 で、登録済みの支払い方法を確認する画面が出る）。`worker/wrangler.jsonc` に binding を足す。
        上の既定の判断を §8 に記録する
    -   [x] 7.4.2 スナップショットの形と検証（Worker の純粋な関数。`worker/src/snapshot.ts`）。プロフィール（Display Name・Bio）と曲（`id`・`title`・`artist`・`publicTags`・`sortOrder`）、
        形の版・版・時刻。許可リストで作り、My Key・Private Note・status は型にも入れず、送られてきても保存しない。長さ・件数・本文の上限は、Free の CPU 10ms に初回でも収まるよう
        実測して決めた（曲 **1000**・本文 512KiB。3000曲は初回に10msを超えた。`npm run bench:snapshot` と workerd。§8「公開スナップショットの形と上限」）。
        **本番（7.4.11）では、1000曲の Publish が 8〜19ms で、10ms を超えた回があった。上限を保つかは未決（7.7）**
    -   [x] 7.4.3 プロフィールと `username`（`migrations/0004` の `profiles`）。`username` の確保（`[a-z0-9_]` の3〜20字、予約語、UNIQUE、同時の確保の競合）。
        自分のプロフィールの取得（`username`・版・公開中か・最後にPublishした Display Name・Bio の控え）。最初の Publish より前に確保する。
        Display Name・Bio は、Publish のリクエストに載せる（Publishしたときに公開内容になる。単独で更新するエンドポイントは作らない。§8「公開スナップショットの形と上限」）。
        削除後に再利用させない `username` を残す表（`retired_usernames`）も、ここで作った（書き込みは 7.4.5）。`GET /me/profile`・`PUT /me/username`（競合は一意制約に任せる。同時の確保でも勝つのは1つ）。
        Node のテストと、`wrangler dev`（workerd）で確かめた（§8「公開プロフィールのエンドポイント」）
    -   [x] 7.4.4 Publish と Unpublish（Worker。`POST /me/publish`・`POST /me/unpublish`。`worker/src/publish.ts`）。版の予約（`baseVersion` の照合と「公開中」の印を1文で。食い違いは 409 と今の `profile`）→
        R2 に書く。印は R2 に書く前に立てる。Unpublish は R2 を消してから印を下ろし、版を +1 する（`username` と控えは残す）。失敗のときは印を立てたまま（安全側）。
        公開の状態は `GET /me/profile`（7.4.3）。D1 の書き込みは Publish・Unpublish とも1回。Node のテストと、`wrangler dev`（workerd。1000曲の Publish）で確かめた
        （§8「Publish と Unpublish のエンドポイント」）
    -   [x] 7.4.5 アカウントの削除と自動削除の見直し。`deleteUserAccount` に「`username` を読む → R2 を消す → D1 を消す」を足した（R2 の失敗なら D1 の行を残して失敗にする。
        自己削除は 503、`account-deleted` も 503。D1 のバッチで `username` を `retired_usernames` に移す）。自己削除と Apple の `account-deleted` の両方が使う。
        自動削除の対象外（Publish済み）を、1か所の式（`AUTO_DELETE_EXEMPT_SQL`）として実装した（候補の SELECT・条件つきの DELETE・`username` を移す文が共有。「消す瞬間にも見る」をテストで固定）。
        公開ページの無いアカウントは、これまでどおり1年で消え、`username` は再利用されない。ポリシーの「1年」の説明を直すのは 7.4.10。ここまでで Worker は完成（Node のテストと workerd）
    -   [x] 7.4.6 アプリ: スナップショットの組み立てと Repository / Service。Ready の曲から作る純粋な関数（`src/services/publishSnapshot.ts`。Show Mode の `ShowSong` から取り、
        My Key・Private Note を型の上でも持たない。Workerと同じ数字・文字の規則を別に持ち、整えて切り詰める。曲が1000を超えるときは断る）。`publishRepository`（`GET /me/profile`・
        `PUT /me/username`・`POST /me/publish`・`POST /me/unpublish`。HTTPの共通部分は `apiClient.ts` に出して `authRepository` と共有）。認証が要る呼び出しは、`account` の
        `access.withSession`（401 のときだけ端末のセッションを捨てる。`Services.account` には含めない）を通す。端末側の状態はアプリのDBの migration 4（`publish_state`・`published_songs`）。
        `Services.publish`（`getState`・`refreshProfile`・`claimUsername`・`publish`・`unpublish`）。公開タグは 7.4.8 で入れた。Nodeのテスト（偽のHTTP・実際のSQL）で確かめた
        （§8「アプリ側の Publish の土台」）
    -   [x] 7.4.7 アプリ: Public Profile の画面（Display Name・Bio・`username` の確保・Publish Now・Unpublish・状態の表示）。入口は Profile タブ。`account.available` でゲート。
        en / ja の文言。`singfolio-screen-flow.md` を更新した。Preview・Copy Link は公開ページ（7.5）ができてから。Display Name・Bio は、この画面だけが持つ保存しない下書き
        （初期値はサーバーの最後に Publish した値。Auto Publish との関係は 7.4.9b で決める）。最初の公開・Unpublish・版の食い違いの置き換えは確認つき。
        iOS Simulator で、偽の Service を差し込んで主要な流れを確かめた（§8「アプリ側の Public Profile 画面」）。本物のサーバーでの確認と Android は 7.4.11
    -   [x] 7.4.8 アプリ: 公開するタグ（`publicTags`）の選び方。ローカルのタグに `isPublic` を足さず、別の表 `public_tags`（`tag_id` だけ。migration 5。タグのIDで持つ。タグを消すと選択も消える）に持つ。
        **決定: タグごとに選ぶ。既定は全部非公開。** `publishService` の `listPublicTagChoices`・`setTagPublic`（端末内だけ。通信・サインイン不要）、`loadSources`（曲のタグのうち、選んだものだけを `publicTags` に入れる。
        7.4.9a・7.4.9b は、これで今の公開内容を作る）。画面は Public Tags（`app/public-tags.tsx`。入口は Public Profile の `Public Tags` の行。`account.available` でゲート。押すたびに保存）。
        確認の文言に「公開タグ」を足した。Nodeのテストと、iOS Simulator（Release のJSだけ差し込み。通信は偽、タグの選択とDBは本物）で確かめた（§8「公開するタグの選び方」）
    -   [x] 7.4.9a アプリ: 未公開の変更の数え方（「N unpublished changes」）。**7.4.9 を、数え方（a）と Auto Publish（b）に分けた**（Auto Publish は、Display Name・Bio の保存先、設定の置き場、
        通信の再送・Pending の保持など、決めることが多く、数え方と別に決めたほうが確かめやすい）。`publishService.countUnpublishedChanges(profile)`（通信しない。端末の `published_songs` のハッシュと、
        `loadSources` の今の公開内容を比べる。曲ごとに1つ: 追加・変更・取り下げ）。Publish と同じ整え方（`buildPublishSongs`）を使う。数えるのは曲だけで、Display Name・Bio の下書きは数えない。
        端末の記録が今の公開内容と合うとき（公開中で、`username` と `baseVersion` が一致）だけ数える。画面は Public Profile の Publish Now の上の1行（公開中のときだけ）。
        Nodeのテストと、iOS Simulator（通信は偽、DBは本物）で確かめた（§8「未公開の変更の数え方」）
    -   [x] 7.4.9b アプリ: Auto Publish（debounce、Pending の保持、再送）。**決定**: 設定は `settings` の `auto_publish`（既定オフ。別のアカウントの記録を捨てるときにオフへ戻す）、
        Display Name・Bio は載せない（端末が最後に Publish した値で、曲の変更だけ送る。下書きの保存先は足さない）、最初の公開・再公開・置き換えは自動でしない
        （サーバーが公開中で、記録の版が合うときだけ送る）。`createServices` が `observeCommits` でDBへの書き込みを拾い（`auth` を注入したビルドだけ）、`autoPublishService`
        が30秒の debounce・起動後5秒の確認・前面への復帰での確認・通信の失敗の再送（30秒から10分）・状態（`idle`/`retrying`/`stopped`）を持つ。送る中身の判断は `publishService.publishPendingChanges`
        （差が0なら通信しない。Pending は端末の記録との差で、別に保存しない）。背景では確認を始めない（タイマーが背景で発火しても `isForeground` で止める）。設定は公開中だけ使う
        （Unpublish・公開していないと分かったときにオフへ戻し、公開前はオンにできない）。画面は Public Profile のスイッチと状態の行。Nodeのテストと、iOS Simulator（偽のService）で確かめた
        （§8「Auto Publish（7.4.9b）」）。既知の限界: 応答を受け取れなかった自動の Publish のあとは、`stopped(version-conflict)` になり、Publish Now の置き換えで解決する（冪等キーは未実装）
    -   [x] 7.4.10 文書。`singfolio-privacy-policy-next.md` に「Public profile」の節（英語・日本語。公開される内容・されない内容・Publish と Auto Publish・Unpublish・削除後に残る `username`・
        サインインできない人の公開ページ）を足し、要約・保存するもの・自動削除（公開ページのあるアカウントは対象外。「使った」に公開機能の通信を含める）の説明を直した。
        `singfolio-store-listing.md` §6 に、App プライバシー（その他のユーザーコンテンツ・username をユーザーIDに含める）・Play のデータ セーフティ・App Review のメモ・
        年齢指定と IARC の見直し・削除後に残るものを足した。公開中の `privacy-policy.md` は、アカウントを出す版が出るまで書き換えない。
        **決めていないこと**: Display Name を Apple の「名前」に当てるか（提出の画面で）、サインインできない人の公開ページの取り下げの窓口（7.5。ポリシーは暫定の文）、
        年齢指定・IARC の答え（提出の画面で）、候補由来の曲名の公開の扱い（§8「外部の楽曲検索の結果を公開する際の扱い」）。7.5・7.6 で、視聴者のアクセス・Requests を足す
    -   [x] 7.4.11 確認。マイグレーション 0004 を本番のD1へ適用し、Worker をデプロイした（R2 のバケットは 7.4.1 で作成済み）。**iOS Simulator から、本物のサーバー（本番）で確かめた**
        （Release のJSだけ差し込み、Google でサインイン。テスト用のアカウントは、最後にアプリから削除し、D1 の各表が0行・R2 が空になったことを `--remote` で確認した）。
        結果の詳細は §8「7.4.11 の本番での確認の結果」。確かめたこと: R2 のオブジェクトのキーが許可リストと完全に一致し、My Key・Private Note・Practice と Want の曲・選んでいないタグが入らないこと、
        公開タグが選んだものだけであること、「N unpublished changes」の数、Auto Publish（版が食い違うと送らず止まる）、版の食い違いと置き換えの確認、空のローカルの保護、1000曲を超えたときの拒否、Unpublish で R2 が消えること、
        アカウントの削除で R2・D1・端末のセッションが消えること、200文字目に絵文字がくる曲名の切り詰め（Hermes）。**本番の R2 は `--remote` を付けて読む**（付けないと local を読み、誤って合格に見える）。
        **判断が要ること（7.7 で決める）**: (1) 1000曲の Publish の CPU 時間が本番で 8〜19ms（手元は約5ms）で、Free の上限（10ms）を超えた回がある（`exceededCpu` は出ていない。Cloudflare の資料は、
        「継続的に超えると打ち切る」と書き、「継続的」の基準は書いていない）。曲数の上限を保つか・下げるか・有料プランにするか。(2) Auto Publish の停止の文言が、400 のとき出ない理由を案内している
        （400 の汎用の文言は設計どおり）。(3) 変更0件の Publish Now が版を +1 する扱い（決めたものではなく現状）。(4) 冪等キーの要否。
        **アカウントを出す版のリリース前に、Android・実機で見る**: 機内モードでの Pending と復帰後の再送、実機で背景から前面へ戻ったときの Auto Publish の確認、応答を受け取れなかった自動の Publish と冪等キーの要否（`stopped(version-conflict)` になり、
        Publish Now で解決できることは、版を +1 して再現して確かめた。要否は、置き換えの確認と停止の行が、利用者にどれだけ出て困るかで決まる。§8）、本物の2台での衝突、Android（Public Profile の Bio のキーボードの余白、Public Tags のスイッチのつまみの色）、ダークモード、
        VoiceOver・TalkBack、英語の表示、保存失敗・読み込み失敗の見た目、タグが多いときの操作、1000曲の所要時間の実機での値、しばらく使っていない状態の CPU 時間。
        対になっていないサロゲートを含む曲名は、iOS では SQLite 経由で再現できない（不正な UTF-8 は、JS に渡る前に U+FFFD になる）ので、Node のテストだけで確かめている
-   [ ] 7.5 公開Web（`singfolio.app/username`）。プライバシーポリシーを直す（視聴者のアクセス）。内容は `singfolio-publishing-backend.md` §4・§8「公開ページ（7.5）」。
    Requests（7.6）は入れない（曲のIDは、まだ HTML に出さない）。
    -   [x] 7.5.1 公開ページの Worker（`worker/src/publicPage.ts`・`publicPageRender.ts`）。`GET|HEAD /<username>` を、R2 のスナップショットだけから表示する（D1に触れない）。
        **決定**: 小文字の正規のURLへ 301（大文字・末尾のスラッシュ）、キャッシュしない（`private, no-cache` と ETag。Unpublish・削除は次のリクエストから 404）、`noindex`、
        存在しない・未公開・取り下げは同じ 404、R2 の失敗・読めない本文は 503、CSP はハッシュ方式（`'unsafe-inline'` なし。外へ何も読みに行かない）、
        公開ページの `GET`・`HEAD` だけ HTTP を HTTPS へ 308、`Accept-Language` で日本語・英語、通報のリンク（`mailto:`）。内容は、表示名・自己紹介・曲数・検索・タグ（1つ）・アーティスト別の見出し。
        Nodeのテスト（ページのスクリプトは、描画したHTMLから作った最小のDOMで実行）、`wrangler dev`（workerd）、ヘッドレスの Chrome（幅390px。ライト・ダーク・CSP違反なし）で確かめた。
        1000曲の CPU は、Node で初回約3ms・温まったあと約1.1ms（本番は未確認。§8）
    -   [x] 7.5.2 文書。`singfolio-privacy-policy-next.md` に「Visitors to a public profile」（視聴者のアクセス。Cloudflare が扱う情報・Cookie と解析が無いこと・`noindex`・取り下げの反映）を足し、
        サインインできない持ち主の取り下げの窓口を「Report this page」のリンクとメールに直した。公開ページが出さない項目（Publish の時刻・版）を「公開されるもの」から外した。
        `singfolio-store-listing.md` §6 を直した。公開中の `privacy-policy.md` は、アカウントを出す版が出るまで書き換えない
    -   [ ] 7.5.3 アプリ: Public Profile に、公開ページを開く（Preview）とリンクのコピー（Copy Link）。**判断が要る**: コピーには新しいネイティブの依存（`expo-clipboard`）が要り、
        ネイティブの再ビルド・第三者ライセンスの再生成・R8入りの確認が付いてくる。依存を入れずに、OSの共有シート（RN の `Share`）にする案もある（コピーも、そこから選べる）。
        公開ページを開くのは、既存の `expo-web-browser`・`Linking`（依存の追加なし）。ストアの「制限のないWebアクセス」の答えは、アプリ内にブラウザを持たないので変わらない
        （外部のブラウザで開く。アプリ内で開くなら見直す）
    -   [ ] 7.5.4 本番での確認。Worker のデプロイ（利用者の確認のあと）、公開した本物のスナップショットでの表示、`http://` の 308、Unpublish で 404、Workers の Metrics での CPU 時間（1000曲のページ。10ms を超えて打ち切られると Error 1102 で、503 にならない）、
        `If-None-Match` を付けた `curl` で 304 が返ること（Cloudflare が ETag を `W/` に変えても一致すること）。
        **確かめていないこと**: Safari・iOS・Android のブラウザ、日本語IMEでの入力、スクリーンリーダー、リンクのプレビュー（`og:image`）、長い曲名・多数のタグでの見た目（§8「公開ページ（7.5）」）
-   [ ] 7.6 Requests（所有者がアプリ内の一覧で受け取る）。プライバシーポリシー・ストアの申告を直す
    （視聴者のRequest。Turnstileとレート制限が扱う情報、ニックネーム）
-   [ ] 7.7 アカウントを出す版のリリース（7.3〜7.6 を含む版）。**ここまでに残した未決・未確認を拾う場所。** 次を、リリースの前に済ませる。
    -   7.3.12 の「ユーザーの判断・作業が要る点」（iOS の App プライバシー・Google の同意画面の本番化・Play Console の申告・ポリシーの施行日）と、ポリシー・ストアの申告の反映
        （`singfolio-privacy-policy-next.md` を `privacy-policy.md` に。`singfolio-store-listing.md` §6）。
    -   リリースの手順: `ACCOUNT_ENABLED`（`src/services/index.ts`）と `eas.json` の `account-test` を外す。7.3.13 の確認用ビルドはリリースしない（CLAUDE.md「アカウント（アプリ側）」）。
    -   7.3.13 の「アカウントを出す版のリリース前に見る」と、7.4.11 の「アカウントを出す版のリリース前に、Android・実機で見る」（Android は実機で。Google のサインインは Play 署名のビルドが要る）。
    -   **判断（7.4.11 の所見。§8「7.4.11 の本番での確認の結果」）**: (1) 1000曲の Publish の CPU 時間（保つ・下げる・有料プラン）。**基準は、打ち切りが起きるかどうかの1点（案）**: **しばらく放置したあとの1回目から、続けて20回程度**、
        1000曲の Publish を送り（冷えた状態と連続を1回の測定にまとめる。繰り越しがあるなら、最も厳しい条件で、実際の使い方より重い）、`exceededCpu`・Error 1102 が1回でも出たら、下げるか有料プランにする。
        出なければ保つ。(2) Auto Publish の停止の文言。(3) 変更0件の Publish Now の扱い。(4) 冪等キーの要否。
        （CPU の打ち切りが予約のあとに起きたときの不整合を防ぐ、`serializeSnapshot` を予約の前に移す変更は、コードとテストが済んでいる。§8）
    -   **公開ページの取り下げの実行手順（7.5 の所見）**: 公開ページに「Report this page」（メール）を置いた。届いたあとに行う手順が未決。R2 のスナップショットを消すだけでは、持ち主の次の Publish で戻る。
        運営者は、`username` から `profiles` を引いてアカウントを特定でき、アカウントの削除（`deleteUserAccount` と同じ順序: R2 → D1。`username` は `retired_usernames` へ）で、再公開もできなくなる。
        ただし、依頼者が持ち主とは限らない。手順書は `../singfolio-private` に置く。あわせて、7.5 の公開ページの CPU 時間（Workers の Metrics。1000曲で Free の上限に近い）を見る。
    -   **リリース後の見張り**: ダッシュボードの Workers の Metrics（Errors の Invocation Statuses の `Exceeded CPU Time Limits`、CPU Time per execution の分位）。Workers Logs が無効でも見られるかは、
        資料に前提として書かれていないが、確かめていない（デプロイした Worker で確かめる）。Error 1102 に付く HTTP ステータスは資料に無く、アプリが 5xx（`unavailable`）として受け取るかは未確認
        （利用者の報告では気づけない前提で、Metrics を見る）。
