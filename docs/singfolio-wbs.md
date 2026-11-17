# Singfolio WBS

v1.0の作業（0〜6章。保存・管理は端末内で完結し、外部通信は候補検索だけ）と、v1.0より後の公開機能（7章）を、
機能単位に分解した進捗表。
番号は作業の順序の目安で、時期の約束ではない。

v1.0より後（公開機能・Requests）の実装順序は、
`singfolio-publishing-backend.md` §9 を参照。進捗は「7. 公開機能」に書く。

**現在地**：6. リリース準備（6.5・6.8が残り。6.1・6.2・6.3・6.4・6.6・6.7は完了。6.4は、iOS の 1.0 を審査に提出して、審査を通って公開された。Android は、6.8 の変更を含む AAB（versionCode 4）を作って、内部テストへアップロードして、Pixel 11 で確認した。Play Console の申告・掲載を入力して、製品版の審査へ送信し、審査を通って公開された。iOS も審査を通って公開され、紹介ページに両ストアのバッジを載せた。6.8は、アプリの変更・スクリーンショットの撮り直し・ストアの文の修正・両ストアへの入力・Android の実機での確認まで済んだ）。7. 公開機能（v1.0より後）は、7.1（バックエンドの技術検証と選定）が済み、7.2（実装前に確かめること）も済んだ（Appleの公開鍵の取得・`singfolio.app` の取得・認証の方式の決定・Freeプランでの放置後の再アクセス。ログイン手段はiOS・Androidとも、AppleとGoogleに決めた）。7.3 は、小さな作業（7.3.1 から 7.3.13）に分けた。7.3.1（利用者の前提の準備）は済んだ。7.3.2（Workerの土台）も済んだ（本番のD1とWorkerを作り、`singfolio.app` で404を返す状態）。7.3.3（nonce の発行・検証・使用済みの記録と HTTPS の検査）も済んだ（本番へデプロイして、HTTPが403、HTTPSが200になることを実測した。レート制限は Worker に入れない。WAFが Worker より前で効くことも実測した）。7.3.4（IDトークンの検証と、ログイン手段の引き当て）も済んだ（jose で検証し、模擬の発行元でテストした。本物のトークンでの確認は 7.3.7・7.3.8）。7.3.5（セッションとログイン・ログアウトのエンドポイント）も済んだ（模擬の発行元とローカルのD1でテストし、workerd でも動きを確かめた）。7.3.4・7.3.5 とも、本番へのデプロイはまだ。7.3.6（アプリ側の認証の土台）も済んだ（HTTP・SecureStore・初回起動での破棄・ログアウト。画面は無く、何も送らない。AndroidエミュレータとiOS Simulatorで確かめた）。7.3.7（Appleのサインイン）も済んだ（AppleのIDトークンの `nonce` の確認は、7.3.13 へ移した）。7.3.8（Googleのサインイン）も済んだ（iOS Simulatorで、取りやめ・成功・2回目のログインを確かめた。Androidの成功経路は、7.3.13 へ移した）。7.3.9（AndroidのAppleログイン。Web経由）も済んだ（Workerのコールバックと認可コードの交換、アプリのCustom Tabと戻りのURL。Androidエミュレータで、Custom Tab から Worker の302、アプリが `code` を受け取るまでを確かめた。本物のAppleでの交換は 7.3.13）。7.3.10（ほかの端末のログアウト・アカウントの削除・Appleのサーバー間通知）も済んだ（Worker: `POST /auth/logout-others`・`POST /auth/delete`・`POST /auth/apple/notifications`、アプリ: `account.signOutOthers()`・`account.deleteAccount()`。Nodeのテストと、workerd での疎通を確かめた。画面は 7.3.11、本物のAppleでの確認は 7.3.13）。次は 7.3.11

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
        ため、7.3.12 で決める（それまでは「テスト中」）。Cloudflare: アカウントの確認は済み。本番のWorkersとD1、`singfolio.app` のルート、秘密情報は
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
        本番へのデプロイはまだ
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
        要るので、7.3.13**。アプリが終了したときの再開は実装していない（7.3.11 で決める）（§8「AndroidのAppleログイン（Web経由）の実装」）
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
        `https://singfolio.app/auth/apple/notifications` を登録する。Apple Account側の資格情報が失効していて再認証できない利用者の扱いは、7.3.11 の画面設計で決める
        （再認証なしの削除の逃げ道は作っていない）
    -   [ ] 7.3.11 アカウントの画面（ログイン・ログアウト・「ほかの端末をすべてログアウト」・削除の入口）。置き場所（ProfileかSettings）は、
        画面設計で決める。サインイン済みから別のIDをつなぐ画面を、v1で用意するか決める。`provider-failed` の文言は、原因（端末の設定か、アプリ側の設定の不備か）を言い切らない（§8「Appleのサインイン（iOS）」）。`getSignedInProvider` は、判断できないとき
        `AuthError` を投げる（`null` ではない）ので、画面で捕まえて、アカウントの欄を隠すなどにとどめる（§8「アプリ側の認証の土台」の「失敗の分類」）。
        アカウントの削除は、待ちの表示を出す（最大30秒）。`network` で終わったときは、サーバーで削除が済んでいる可能性があり、やり直すと 401（`unauthorized`。
        端末のセッションは捨てられる）になる。削除の再試行の 401 は、「ログアウトされた。削除が済んでいるかもしれない」と伝える（§8「アカウントの削除とAppleのトークン失効」）
    -   [ ] 7.3.12 申告と文書。プライバシーポリシー、`docs/singfolio-store-listing.md`、App Store・Google Playの申告（SDKの
        プライバシーマニフェストを、そのときの版で読み直して決める）、Googleの同意画面（ブランド）、CLAUDE.mdの「スコープ」の節
    -   [ ] 7.3.13 確認。実機と署名したビルド（TestFlight・Playの内部テスト）で、ログイン・キャンセル・再ログイン・ログアウト・削除。
        7.3.10 の分: 削除でAppleのトークンが失効するか（iOSの認可コードを `redirect_uri` 無しで交換できるか、Appleの設定の「Appleでサインイン」の一覧からSingfolioが消えるか。
        AndroidのServices IDで得たトークンの失効が、iOS側も消すか）、Appleのサーバー間通知（エンドポイントの登録のあと、`wrangler tail` で、実際の通知の `events` の形・`event_time` の単位・`aud`・
        `account-deleted` の綴りを見る。「Appleでサインインの利用を停止」で `consent-revoked` が届き、セッションが消えるか）、「ほかの端末をすべてログアウト」（2台で）。
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
        `wrangler tail` の1行（`apple token exchange failed: ...`）で切り分ける（デプロイしたWorkerでの `wrangler tail` は未確認）。Googleは、Androidの成功経路（本番用のクライアントIDと、署名の鍵ごと
        （debug・EASのlocal build・Play App Signing）のSHA-1）、プロジェクトの所有者でもテストユーザーでもないアカウントで入れるか
        （同意画面は「テスト中」）。Androidの成功経路は、**R8 入りの release で**確かめる（結果の解析 `GoogleIdTokenCredential.createFrom` と
        トークンの返却。googleid のクラスは R8 で改名される）。実機
-   [ ] 7.4 Public ProfileとPublish（Auto Publishを含む）。アカウントの削除（`worker/src/account.ts` の `deleteUserAccount`。自己削除とAppleの `account-deleted` が使う）に、
    R2のスナップショット・`profiles`・Requestの削除を足す（順序: `username` を読む → R2を消す → D1の行を消す。R2に失敗したらD1の行を残して失敗にする。§8）
-   [ ] 7.5 公開Web（`singfolio.app/username`）。プライバシーポリシーを直す（視聴者のアクセス）
-   [ ] 7.6 Requests（所有者がアプリ内の一覧で受け取る）。プライバシーポリシー・ストアの申告を直す
    （視聴者のRequest。Turnstileとレート制限が扱う情報、ニックネーム）
