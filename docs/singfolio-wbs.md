# Singfolio WBS

v1.0の作業（0〜6章。保存・管理は端末内で完結し、外部通信は候補検索だけ）と、v1.0より後の公開機能（7章）を、
機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。進捗は「7. 公開機能」に書く。

**現在地**：6. リリース準備（6.5・6.8が残り。6.1・6.2・6.3・6.4・6.6・6.7は完了。6.4は、iOS の 1.0 を審査に提出して、審査を通って公開された。Android は、6.8 の変更を含む AAB（versionCode 4）を作って、内部テストへアップロードして、Pixel 11 で確認した。Play Console の申告・掲載を入力して、製品版の審査へ送信し、審査を通って公開された。iOS も審査を通って公開され、紹介ページに両ストアのバッジを載せた。6.8は、アプリの変更・スクリーンショットの撮り直し・ストアの文の修正・両ストアへの入力・Android の実機での確認まで済んだ）。7. 公開機能（v1.0より後）は、7.1（バックエンドの技術検証と選定）が済み、7.2 を進めている（Appleの公開鍵の取得・`singfolio.app` の取得・認証の方式の決定は済み。ログイン手段はiOS・Androidとも、AppleとGoogleに決めた。Freeプランでの放置後の再アクセスだけが、放置中で残っている）。7.3 は、小さな作業（7.3.1 から 7.3.13）に分けた

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
-   [ ] 7.2 実装前に確かめること（済み: 本番のWorkersからのAppleの公開鍵の取得、`singfolio.app` の取得、
    nonce・セッションの失効・Appleのトークン失効の方式（§8「認証の方式」）、ログイン手段（iOS・Androidとも
    AppleとGoogle。AndroidのAppleはWeb経由）、Googleのサインインの `nonce`・`aud`（iOS SimulatorとAndroidエミュレータで
    確認。§8「Googleのサインイン」）。
    残り: Freeプランでの放置後の再アクセス（検証用のWorkerとD1を置いて放置中）。
    候補検索由来の曲名の公開は、6.5 の結果次第で、実際の公開の前に決着が要る）
-   [ ] 7.3 認証（Apple / Google）とアカウント（アプリ内からの削除を含む）。プライバシーポリシー・ストアの申告を直す
    （アカウント）。内容は `singfolio-publishing-backend.md` §8「認証」「認証の方式」。次の小さな作業に分ける（番号は
    目安で、順序の約束ではない。7.3.1 は、7.2 の待ちの間に進められる。7.3.2 以降の実装は、7.2 が済んでから）。
    -   [ ] 7.3.1 前提の準備（利用者の作業）。Apple: Sign in with Appleの設定（primary App ID・Services ID・鍵。サーバー間通知の
        エンドポイントは 7.3.10）。Google: クライアント（Web・iOS・Androidの署名の鍵ごと。EASのlocal build・
        Play App Signingの鍵を含む）は作成済み。同意画面の「公開」は、ホームページとプライバシーポリシーのURLが要る
        ため、7.3.12 で決める（それまでは「テスト中」）。Cloudflare: 本番のWorkersとD1、`singfolio.app` のルート、秘密情報（R2は 7.3.10 まで、Turnstileは 7.6）
    -   [ ] 7.3.2 Workerの土台。プロジェクトの構成、D1のスキーマとマイグレーション（`users`・`identities`・`sessions`・
        `used_nonces`）、開発用と本番用の設定、秘密情報の扱い、リクエストのログに認証の値を出さない設定
    -   [ ] 7.3.3 nonce。`POST /auth/nonce`（無状態。`T` の署名・期限・種別、レート制限）と、`T` の検証・使用済みの記録
    -   [ ] 7.3.4 IDトークンの検証（Apple・Google。公開鍵（JWKS）の取得とキャッシュ、`iss`・`aud`・`exp`・`nonce`）と、`sub` から
        `identities` を引く・作る処理。模擬の発行元で、拒否の条件を確かめる
    -   [ ] 7.3.5 セッション。発行（ハッシュだけをD1に置く）、最終利用の時刻の書き込み（24時間以上たったときだけ）、
        ログアウト（行の削除）
    -   [ ] 7.3.6 アプリ側の認証の土台。HTTPをRepositoryに閉じ込める、SecureStoreにセッション、初回起動でセッションを捨てる、
        失敗の扱い。ログインを要求しない（ログアウトのままでも、v1.0の機能はすべて使える）
    -   [ ] 7.3.7 Appleのサインイン（iOS。`expo-apple-authentication`）。最初に、実機で、AppleのIDトークンの `nonce` が、渡した値
        そのままかを確かめる
    -   [ ] 7.3.8 Googleのサインイン（iOS・Android）。検証済みの自作モジュール（§8「Googleのサインイン」）を、mainから切った
        新しいブランチへ取り込む（検証用の画面は持ち込まない）。ライセンス一覧の生成の対応（Android Software Development Kit
        Licenseの依存を個別に許可し、Aboutに別枠で載せる）、`blockedPermissions` への追加（CLAUDE.mdの該当の項も直す）
    -   [ ] 7.3.9 AndroidのAppleログイン（Web経由）。Custom Tab、Workerのコールバック（`/auth/apple/callback`）、`V`・`T` の
        結びつけ、レート制限、アプリのURLスキームへの戻し
    -   [ ] 7.3.10 アカウントの削除（アプリ内。再認証、Appleのトークンの失効、D1の行とR2のスナップショットの削除）と、Appleの
        サーバー間通知（`consent-revoked`・`account-deleted`）。通知のエンドポイントは、primary App IDに登録する
    -   [ ] 7.3.11 アカウントの画面（ログイン・ログアウト・削除の入口）。置き場所（ProfileかSettings）は、画面設計で決める。
        サインイン済みから別のIDをつなぐ画面を、v1で用意するか決める
    -   [ ] 7.3.12 申告と文書。プライバシーポリシー、`docs/singfolio-store-listing.md`、App Store・Google Playの申告（SDKの
        プライバシーマニフェストを、そのときの版で読み直して決める）、Googleの同意画面（ブランド）、CLAUDE.mdの「スコープ」の節
    -   [ ] 7.3.13 確認。実機と署名したビルド（TestFlight・Playの内部テスト）で、ログイン・キャンセル・再ログイン・ログアウト・削除。
        Appleの `sub` がiOSとAndroidで同じか、Services IDで得たトークンを失効させたときの連携、AndroidのWebのフロー全体、
        異常系（通信断・アカウントの切り替え・連打）
-   [ ] 7.4 Public ProfileとPublish（Auto Publishを含む）
-   [ ] 7.5 公開Web（`singfolio.app/username`）。プライバシーポリシーを直す（視聴者のアクセス）
-   [ ] 7.6 Requests（所有者がアプリ内の一覧で受け取る）。プライバシーポリシー・ストアの申告を直す
    （視聴者のRequest。Turnstileとレート制限が扱う情報、ニックネーム）
