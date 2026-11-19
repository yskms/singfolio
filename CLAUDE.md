# Singfolio

歌う人のためのレパートリー管理アプリ（React Native / Expo、端末内SQLite）。
管理するのは「歌の点数」ではなく「何を歌えるか」。

仕様・設計は `docs/` が正。実装前に該当ドキュメントを読むこと。

-   `docs/singfolio-requirements.md` --- 要件・対象外・UI/ブランド方針
-   `docs/singfolio-screen-flow.md` --- v1.0の画面設計
-   `docs/singfolio-publishing-backend.md` --- 公開機能・バックエンド方針（Cloudflareに決定。実装前に確かめることを含む）。
    アカウントを出す版のポリシーの下書きは `docs/singfolio-privacy-policy-next.md`、ストアの申告の下書きは `docs/singfolio-store-listing.md` §6
-   `docs/singfolio-data-model.md` --- ローカルDB（SQLite）のスキーマ・マイグレーション方針
-   `docs/singfolio-wbs.md` --- v1.0と、v1.0より後の公開機能の作業分解と進捗
-   `docs/Singfolio ブランドスタイルガイドとアプリ展示板.png` --- ブランドカラー・フォント（確定。
    ただしMint・Purpleはアイコンの色が正。「ブランド」節参照）、
    モックアップ（参考イメージ）
-   `assets/icon.png` --- アプリアイコンの原画（1024×1024、透過なし、iOS・ストア用）。
    Play Storeアイコン（512×512）・公開Web用のfavicon（48×48。`assets/favicon.png` と `docs/favicon.png`）・
    紹介ページ用の `docs/app-icon.png`（192×192）・`docs/apple-touch-icon.png`（180×180）・Androidの前景・
    テーマアイコン・スプラッシュ画像はここから `scripts/generate-icons.py` で生成する
    （生成物は手で編集しない。faviconは公開Webで使うもので、app.jsonからは参照しない）。
    Androidの `adaptiveIcon.backgroundColor` はこの画像の背景色に合わせている
-   `docs/index.html`・`docs/ja/index.html`（紹介ページ。英語は `/singfolio/`、日本語は `/singfolio/ja/`）---
    自前のHTML・CSS（`docs/site.css`）で、Jekyllのテーマは通さない（front matter を付けない。付けると
    Primer が描画してしまう）。`docs/privacy-policy.md` だけが、Primer で描画される。
    **`/singfolio/` と `/singfolio/privacy-policy.html` のURLは動かさない**（App Store Connect・Play Console・
    アプリ内に登録済み）。画像（`docs/images/`）は `scripts/generate-site-images.py` で `assets/` の原画から
    生成する（手で編集しない）。文面は `docs/singfolio-store-listing.md` の掲載文に揃え、書いていない機能は足さない。
    両ストア（App Store・Google Play）のバッジを載せ済みで、JSON-LD の `operatingSystem` は `"Android, iOS"`。
    App Storeのバッジ（`docs/images/app-store-badge-{en,ja}.svg`）は、Apple公式のSVGをそのまま置いたもので
    （生成物ではない。加工しない）、リンクは `https://apps.apple.com/app/id<ascAppId>`（日本語ページは `/jp/`）。
    スクリーンショットは Google Play のもの（キャプション入り、ストアの掲載と同じ）。差し替えたら、
    `generate-site-images.py` を回し直す。

**内部向けのメモは、公開リポジトリの外の `../singfolio-private`（非公開）に書く。** 詳細は「公開範囲」。

設計判断が変わったら、コードだけでなく該当のdocsも更新する。

作業の着手・完了時は、`docs/singfolio-wbs.md` のチェックと「現在地」を更新する。
WBSは公開リポジトリのため、日付やリリース目標などの時期は書かない。

PNGのモックアップは画面の参考イメージであり、機能・表示項目の確定仕様ではない。
機能仕様と食い違う場合は、要件定義・画面設計・バックエンド方針のMarkdownを優先する。
ブランドカラーなど、ブランド資料として明示された情報は除く
（ただしMint・Purpleは、PNGではなくアイコンの色が正）。

## 公開範囲

-   **内部向けのメモの置き場は、兄弟ディレクトリ `../singfolio-private`（非公開リポジトリ）の `docs/`。**
    審査で指摘されうる点の見立て、規約の懸念、Apple 等への問い合わせの下書き、コスト・ベンダー比較は、
    ここに書く。このリポジトリの `docs/` や、gitignore の `docs/_local/`（履歴もバックアップも無い）には
    書かない。書いたら、private側でコミットする（pushは指示を待つ）。このリポジトリのドキュメントは、
    private側の内容に依存しない（リンク・引用も書かない）。
-   このリポジトリはpublic。内部向けの検討（コスト・ベンダー比較・内部ロードマップ・
    審査メモなど）は書かない。確定した仕様・制約は、内部情報を除いた形でここの
    docsに書く。
-   このリポジトリのドキュメントだけで、仕様の理解と実装ができる状態を保つ。
-   pushは `git push origin main` のみ。`--mirror` は使わない（ツールが作る
    `refs/codex/...` は送らない）。

## 守ること

### スコープ

-   採点・ランキング・歌唱分析・録音・楽曲再生・SNS機能・コメント/DMは扱わない
    （要件定義 §7）。「あると便利そう」で追加しない。UIにも点数や順位を持ち込まない。
-   v1.0は、保存・管理が端末内で完結する。外部への通信は、曲名・アーティスト名の候補検索
    （入力欄に打った検索語を送るだけ）に限り、通信できなくても登録・編集はできる
    （Aboutのプライバシーポリシーのリンクを、ブラウザで開くのは、アプリの通信ではない）。
    プライバシーポリシー（`docs/privacy-policy.md`）とストアの申告は、この範囲を前提に書いてある。
    外部へ送るものを増やしたら、方針・`docs/singfolio-store-listing.md`・ストアの申告も直す。
    同期処理は先行実装しない。
-   アカウント（7.3。サインイン・サインアウト・削除）は実装済みだが、リリースのビルドでは `ACCOUNT_ENABLED` で閉じている
    （下の「アカウント（アプリ側）」）。**公開中の `docs/privacy-policy.md` は、アカウントを出す版が出るまで書き換えない**
    （main に push した時点で GitHub Pages に出る。出すと、アプリが持たない機能の説明が公開される）。アカウントを出す版のポリシーは
    `docs/singfolio-privacy-policy-next.md`（`singfolio-*.md` なので公開されない）に下書きがあり、アカウントを出す版のリリース手順（7.3.13 の確認用ビルドはリリースしない）で
    `privacy-policy.md` に反映する。ストアの申告の下書きは `docs/singfolio-store-listing.md` §6。
-   v1.0で実装しない設定項目（Dataなど）は画面に表示しない。

### 公開機能のバックエンド

-   バックエンドは Cloudflare（Workers・D1・R2・Turnstile）に決めてある。実装は v1.0 より後で、
    先行実装しない。ローカルでの技術検証は済んでいるが、デプロイとアカウントが要る確認が残っている
    （`docs/singfolio-publishing-backend.md` §8「実装前に確かめること」）。
-   公開内容は、R2 に置く「最後に正常に Publish したスナップショット」で、公開ページは D1 に触れない
    （D1 が止まっても表示できるため）。公開する曲を D1 に行として持つ形（`published_songs` など）に
    「簡略化」しない。D1 に置くのは、アカウント・セッション・プロフィール・Requests などの動的データ。
-   公開スナップショットの R2 のキーは `username` から作る。ユーザーIDに「簡略化」しない（`username` から
    引くのに D1 が要り、公開ページが D1 に触れない、が成り立たなくなる）。`username` の一意性は D1 だけが保証する。
-   Workerは `worker/` に置く独立したパッケージ（自前の `package.json`・ロックファイル・tsconfig）。npm workspaces に
    「簡略化」しない（ルートの Expo / RN の依存の固定が、hoisting で崩れうる）。ルートの `tsconfig.json` は `worker/` を
    除外している。外さない。アプリとコードを共有しない（リクエスト・レスポンスの形は docs を正として両側に書く）。
    詳細は `docs/singfolio-publishing-backend.md` §8「Workerの構成と運用」。
-   Workers Logs（`worker/wrangler.jsonc` の `observability`）は無効のまま。資料が、ヘッダーなどが記録されるかを書いて
    いないため。有効にする条件は同じ節。`worker/test/config.test.ts` が固定している。Workerのテストは `worker/` で
    `npm test`（ルートの `npm test` には含まれない）。D1の本番に適用したマイグレーションは書き換えず、次の番号を足す。
    親テーブル（`users`・`identities`）は、`DROP` で作り直さない（外部キーの `CASCADE` で、子の行が消える。
    ローカルのD1では、`PRAGMA` でも止まらないことを確認した。詳細は同じ節）。`ALTER TABLE ... ADD COLUMN` などで変える。
-   バックエンドへの HTTP は Repository に閉じ込め、画面・Service から URL やレスポンスの形に触れない
    （候補検索の `songCatalogRepository` と同じ）。公開機能は Repository / Service境界の内側に閉じ込める。
-   Requests は、所有者がアプリ内の一覧で受け取る。Web の受信箱とプッシュ通知は現時点では対象外。
-   ログイン前の経路（nonce の発行など）は D1 に書かない。nonce は無状態（HMAC 署名・期限付き）で発行し、D1 に
    書くのは、検証が通ったときの使用済みの記録だけ。「発行時に D1 へ置く」形に「簡略化」しない（Free の書き込み
    10万行/日を、認証の要らないエンドポイントで使い切られ、ログイン・Publish・Request 受付が止まる）。セッションの
    最終利用の時刻も、毎回は書かない。詳細は `docs/singfolio-publishing-backend.md` §8「認証の方式」。
-   Worker は、`fetch` の最初に、HTTPS でないリクエストを 403 で拒否する（`worker/src/https.ts`）。秘密を含みうる
    経路（`/auth/` など）では外さない。公開ページ（7.4以降）の `GET`/`HEAD` をリダイレクトにするかは、7.4 で決める
    （そのとき docs とここを直す）。
    「Always Use HTTPS」（ゾーンの設定）に「簡略化」しない（Worker より先に効くかが資料に無く、リポジトリの外の
    設定で、リダイレクトは最初の1通が平文で出たあとの話）。本番は HTTP をそのまま Worker が受ける（実測）。
    通すのはホスト名が `localhost` などの完全一致だけで、環境変数で切る口は作らない。`worker/package.json` の
    `dev` の `--infer-origin-from-routes=false` も外さない（外すと `wrangler dev` が `singfolio.app` の HTTP に
    見え、ローカルで 403 になる）。詳細は同じ節「Workerの構成と運用」の「HTTPS」。
-   IDトークンの検証（`worker/src/idToken.ts`）は、jose の `jwtVerify` に `algorithms: ['RS256']` と
    `requiredClaims: ['exp', 'sub']` を付けて呼ぶ。外さない（jose は `exp` の無いトークンを期限なしとして通す）。
    `kid` の無いトークンも通さない（jose は、合う鍵が1本だけなら `kid` 無しでも通す）。公開鍵の取得に jose の
    `createRemoteJWKSet` を使わない（取得に失敗したとき、前の鍵に落ちられない）。取得中の Promise を、リクエストを
    またいで共有しない（workerd は別のリクエストの入出力を待てない）。鍵を一度も取れていない間も、取得の冷却
    （60秒）を守る。「鍵が無いときは毎回取りに行く」に戻さない（落ちている発行元を、リクエストのたびに最大5秒
    待つ）。試みた時刻は取得の完了のあとに書く（始めに書くと、同時の初回ログインの片方が503になる）。遅れて
    終わった取得が、あとから始めた取得の鍵を上書きしないよう、取得を始めた順番で決める（`now` の時刻で比べない。
    時計が戻ったとき、新しい鍵が保存されなくなる）。結果・例外にクレームを載せない（jose の
    例外は `payload` を持つ。理由だけ取り出して捨てる）。`aud` は `T` の種別とログイン手段で1つに決め、両方を
    受け入れる形に「簡略化」しない。詳細は同じ docs の §8「IDトークンの検証」。

-   AndroidのAppleログイン（Web経由。`worker/src/appleWeb.ts`）: `web` の `T`（`C = SHA-256(V)` を含む）は `POST /auth/apple/login` だけが
    受け付ける。`/auth/login` は `native` 専用のまま（取り違えると `V` の照合が飛ばされる）。`V` の照合は、Appleを呼ぶ**前**に行い、通らなければ
    呼ばない。Appleの `refresh_token`・`access_token` は、読まず、保存せず、ログにも出さない。`client_secret` は `APPLE_PRIVATE_KEY`
    （必須の secret。`vars` に置かない）でリクエストごとに署名する。コールバックの戻り先 `singfolio://auth/apple` は固定で、パラメータから決めない
    （オープンリダイレクトにしない）。Appleを呼ぶ `/auth/apple/login` のレート制限は、WAFの1ルール（デプロイのときに利用者が作る）。Workers の
    Rate Limiting API は、Freeで使えるかが資料のどこにも無いので、設定に足さない。`appleToken.ts` が `invalid_grant` 以外の失敗の分類を
    `console.error` に1行出すのは、外さない（でたらめなコードでは、設定が違ってもAppleは常に `invalid_grant` を返すので、設定の不備
    `invalid_client` は本物のコードでしか出ず、利用者には障害と同じ 503 になる。切り分けはこの1行だけ）。出すのは、ステータスと許可リストの
    `error` 名だけ。コード・`client_secret`・IDトークン・Appleの応答の本文・例外の中身は出さず、増やさない。詳細は docs §8「AndroidのAppleログイン（Web経由）の実装」。

-   未使用のアカウントの自動削除（`worker/src/inactiveAccounts.ts`。Cron Trigger は毎日1回の1つ）: 最後に使ってから1年（`INACTIVE_ACCOUNT_TTL_MS`）で消す。
    基準は `users.last_active_at`（`sessions.last_used_at` や `identities.last_sign_in_at` に「簡略化」しない。ログアウトで消えるセッションの行だけでは、
    「11か月使って、ログアウトの1か月後に消える」穴が残る）。**消す文に条件を入れ直す**（`DELETE … WHERE id=? AND last_active_at < cutoff`。無条件の
    `deleteUserAccount` を使い回さない。候補に選んだあとにログインしたアカウントを消す）。**NULL は消さない側**（`COALESCE(…, created_at)` にしない）。
    **削除できたかは、文ごとの変更行数が 0 より大きいか**（ローカルの D1 では、`meta.changes` が外部キーのカスケードで消えた行も数えた。本番は未確認。「1 のとき」にも、合計にもしない）。
    **D1のクエリは2回だけ**（候補の SELECT と、条件つき DELETE の1バッチ。アカウントごとのクエリに分けない。Freeは1回の実行で50回まで、バッチは1回と数える）。
    Cron Trigger を足さない（Freeは5つまで）。ポリシーに書いた「1年」「90日」「30日」を変えるときは、定数・docs・ポリシーを一緒に直す。
    **端末の中だけの利用は、最後に使った時刻を進めない**（アカウントを出した版から起きる。7.3 のアプリで認証つきの通信は `signOutOthers`・`deleteAccount` だけ）。
    **公開ページのあるアカウント（`profiles.published_at` が立っている）は、自動削除の対象外**（端末の中だけで使い続ける人の公開ページが、1年後に消えないため）。
    対象外の条件は `AUTO_DELETE_EXEMPT_SQL` の1か所で、候補の SELECT・条件つきの DELETE・`username` を移す文が同じ式を使う（のちに「課金していれば消えない」へ切り替えるときは、この式を変える。
    先に利用の記録とポリシーの更新・告知が要る）。
    ログアウトは、有効なセッションのときだけ時刻を進める（`authenticateSession` と揃える）。詳細は `docs/singfolio-publishing-backend.md` §8「未使用のアカウントの自動削除」。
-   公開（Publish / Unpublish。`worker/src/publish.ts`・`snapshot.ts`・`profile.ts`）。**順序は変えない**: Publish は「版の予約（D1。`baseVersion` の照合と `published_at` を1文で）→ R2に書く」、
    Unpublish は「R2を消す → `published_at` を下ろし、版を+1」。**`published_at`（公開中の印）は、R2に書く前に立て、R2を消したあとに下ろす**（R2にスナップショットが存在しうる間は、必ず立っている。
    自動削除はD1の行だけを消すので、印が遅れると公開ページだけが残る）。失敗のときは印を立てたままにする（安全側）。Unpublish も版を上げる（別の端末の古い版の Publish が、公開を勝手に戻さない）。
    「R2を先に書き、成功したらD1の版を更新」に「簡略化」しない（同じ版からの同時の Publish が、負けた側もR2を上書きする）。
-   公開スナップショット（`snapshot.ts`）は**許可リストで新しく作る**。入力をそのまま（`{ ...song }` で）保存しない。My Key・Private Note・status は型にも入れない。
    上限（曲 **1000**・本文512KiB）は、Free の CPU 10ms に初回でも収まるよう**実測して決めた値**。上げるときは `npm run bench:snapshot` と workerd で実測し直す（3000曲は初回に10msを超えた）。
    Display Name・Bio は Publish のリクエストに載せる（単独で更新するエンドポイントを作らない。D1の `profiles` は最後にPublishした値の控え）。`username` は変更しない（R2のキーに使う）。
    予約語（`username.ts`）を外す・変えるときは、確保済みの名前を確かめる。R2の公開アクセス（r2.dev・カスタムドメイン）は有効にしない（読み書きはWorkerだけ）。
-   Appleのサーバー間通知（`worker/src/appleNotification.ts`）とセッション発行の競合: **`createSession` の INSERT にある `consent_revoked_at` の条件
    （`migrations/0002`）は外さない。** 通知の処理の最中に進んでいたログインが、取り消し後のセッションを作るのを防ぐ唯一の手段で、`last_sign_in_at` と
    `event_time` の比較だけでは吸収できない（確かめた）。通知の `aud` は、バンドルIDとServices IDの**どちらも**受け入れる（ログインの `aud` を1つに決める規則とは
    別。通知がどちらで来るか、資料に無い）。`exp` は必須にしない（資料の例に無い）。`consent-revoked` は、セッションは `created_at <= event_time` のものだけを消し
    （行単位の `last_sign_in_at` の条件に「簡略化」しない。取り消したあと、通知が届く前に別の端末でサインインし直しただけで、取り消し前の端末のセッションが残る）、
    `consent_revoked_at` の記録は `last_sign_in_at <= event_time` の行だけ。`account-deleted` は順序を見ずに処理する（`account-delete` の綴りも読む。
    ログイン手段の件数の確認と削除は1トランザクションではない。「アカウントのつなぎ方」を作るときに見直す。コードのコメント）。エンドポイントは、デプロイのあと、利用者が primary App ID に登録する。
-   アカウントの削除（`POST /auth/delete`）: **再認証のIDトークンの `sub` が、ログイン中のアカウントと一致することの確認は外さない**（別のアカウントで再認証しても通ってしまう）。
    再認証の失敗は 403 にして、401 にしない（アプリは 401 のときだけ端末のセッションを捨てる）。**Appleのトークンの失効は、D1の行を消したあとに行い、失敗しても削除を
    止めない**（失効を先にすると、D1の失敗で、Apple側だけ失効した中途半端な状態になる）。iOSの認可コードの交換は、D1を消す**前**に行う（消したあとに待つのを失効の1回にする。
    アプリが先に打ち切る・切断すると、Workerは消したあとの処理を打ち切りうる）。`refresh_token`・`access_token` を読むのは、削除（`exchangeWithToken`）だけ。
    ログインの交換（`exchange`）は読まない。`deleteUserAccount`（`worker/src/account.ts`）の順序は「`username` を読む → R2を消す → D1の行を消す」（R2の失敗なら D1 を残して失敗にする。
    行を先に消すと、消し残したスナップショットのキーが分からなくなる）。D1のバッチで `username` を `retired_usernames` に移す（再利用させない。ユーザーIDと結びつけない）。Requestの削除は 7.6。

### アカウント（アプリ側）

詳細は `docs/singfolio-publishing-backend.md` §8「アプリ側の認証の土台」。

-   **ログインを要求しない。** `account`（Service）が使えなくても（`createServices` に `auth` を注入しない、
    SecureStoreが読めない）、v1.0の機能は変わらない。ログイン状態で機能を分けない。画面が `signIn` を呼ぶまで、
    何も送らない。
-   アカウントのHTTP（`/auth/*`）は `authRepository` に閉じ込める。画面・Serviceから、URL・レスポンスの形・
    各社のSDKに触れない。セッションの値は画面に渡さない（`getSignedInProvider` はログイン手段だけ）。IDトークン・
    nonce・セッションの値を、エラーの `message` にもログにも出さない。5xx（JSONでないエラーページを含む）は
    本文を読まずに一時的な失敗（`unavailable`）にする。
-   セッションは SecureStore にだけ置く（SQLite・settings に「簡略化」しない）。読めない・壊れた値は、ログアウトの扱い
    （`SessionRead` の `unreadable`。何も無い `none` と区別する）。
-   **セッションは、ローカルDBの識別子（`settings.local_data_id`）と一緒に保存し、今のDBと合わなければ、サインイン中として扱わない。**
    iOSのKeychainが再インストールのあとも残っても、前のセッションを生かさないため。識別子を外す・消す・作り直す処理を足さない。
    **「初回起動に、保存済みのセッションを捨てる」だけに「簡略化」しない**（捨てる側の失敗に、正しさが依存する）。
-   初回起動の破棄（`runMigrations` の `onNewDatabase`。最初のマイグレーションの前）は後始末。**失敗を握りつぶして、起動を止めない**
    （「捨てられなければ起動の失敗」にしない。SecureStoreの不調で、認証を使わない利用者の v1.0 まで止まる）。
-   `sessionRepository.clear()` は、消したあとに読み戻し、残っていれば（読み戻しが失敗しても）投げる。外さない（iOSの
    `deleteItemAsync` は、失敗しても投げない）。ログアウトは、端末の値を**先に**捨てる（通信できなくても、端末はログアウトする。
    読めない値を消したときの `serverRevoked` は `false`）。サインインとログアウトは直列に実行する。
-   `account` の失敗は、すべて `AuthError`（`getSignedInProvider` を含む。それ以外は `unexpected` に包む。元の例外は載せない）。
    `getSignedInProvider` の失敗を `null` に「簡略化」しない（「ログアウト中」と「分からない」の取り違えになる）。画面は捕まえて、
    アカウントの欄を隠すなどにとどめる（ErrorBoundaryまで伝えない）。
-   各社のサインイン（`IdTokenProvider`）を待つ上限（5分。`PROVIDER_TIMEOUT_MS`。Workerの `T` の期限と同じ）は、
    `account` に1か所だけ置く。各社のRepositoryに持たせず、外さない（結果が返らないと、直列化で後ろのログアウトが待ち続ける）。
    取り消しの口（AbortSignal など）は作らない（OSの画面は取り消せず、出ている間はログアウトを呼べない。理由は docs §8
    「Appleのサインイン（iOS）」）。Appleのスコープは空のまま（名前・メールを要求しない）。Appleのネイティブのサインインは
    iOSのときだけ注入する（`services/index.ts`）。
-   `signIn` が、読めたが別のDBのセッションを上書きするときは、新しいセッションの保存のあとに、サーバーで失効させる（失敗は無視）。
    ログアウトの入口が出ないので、機会はここだけ。「上書きの前」に動かさない（各社の画面を開く前に通信を待たせる）。
-   認証が要る呼び出しを足すときは、**401 のときだけ**端末のセッションを捨てる（503・5xx・通信の失敗では捨てない）。
-   `account.signOutOthers()`・`deleteAccount()` は、サインイン中にだけ使える（`not-signed-in`）。認証が要るサーバーの呼び出しは `authorized` を通す（401 のときだけ
    端末のセッションを捨てる）。`deleteAccount` は、**ログイン中の手段で再認証する**（Apple（iOS）は `getIdTokenWithCode` で認可コードも得る）。成功したら端末のセッションを捨てる。
    端末内のレパートリーは消さない。再認証ができない利用者の逃げ道（再認証なしの削除）は作らない（決定済み。窓口はメール。運営者はメールからアカウントを引けない（メールアドレスも名前も保存しない）ので、サインインできない人は、1年の自動削除を待つ。公開の GitHub Issues は向かない。ポリシー `singfolio-privacy-policy-next.md`）。
    要求（`/auth/delete`）を送ったあとの `network` と `invalid-response` は、Service が `delete-unconfirmed` に読み替える（要求を送る前の `T` の取得の `network` は、何も消えていないので読み替えない。`unavailable` も読み替えない: Workerの 503 はD1を消す前）。
    `/auth/delete` だけ、待つ上限が30秒（`authRepository` の `DELETE_TIMEOUT_MS`。ほかは10秒）。**10秒に「揃え」ない**: Workerは、公開鍵の取得・コードの交換・失効を順に待ち
    （それぞれ最大5秒）、先に打ち切ると、サーバーで削除が済んでいるのに、アプリは `network` と受け取り、端末のセッションも残る（やり直すと 401）。
    画面は、削除の 401 を「サインアウトされた。削除済みかもしれない。残っているなら、サインインし直して削除」と扱う（`account.error.deleteSignedOut`。再試行とは限らない）。
-   Googleのサインインは、自作のExpoモジュール `modules/singfolio-google-signin`（公式SDKだけ。第三者のラッパーは使わない）。
    その `index.ts` は `requireOptionalNativeModule` で読む。`requireNativeModule` に「簡略化」しない（ネイティブ側が無い
    ビルドで、import の時点で投げ、アプリの起動ごと止まる。ログインを要求しない原則に反する）。呼んだときの失敗は
    `ERR_UNAVAILABLE` で、Repositoryが `provider-unavailable` にする。**`app.json` の `withGoogleSignIn.js` の
    `webClientId` は、Workerの `GOOGLE_WEB_CLIENT_ID` と同じ値**（IDトークンの `aud`。ずれると全ログインが 401。
    `worker/test/config.test.ts` が固定）。検証用だった古いGoogle Cloudのプロジェクトのクライアントに戻さない。
    Googleはスコープを外せず、IDトークンに `email`・`name` なども入るが、使うのは `sub` だけ。詳細は docs §8「Googleのサインイン」。
-   AndroidのAppleログインは、Custom Tab（`expo-web-browser` の `openBrowserAsync`）と Linking で、認可コードを得る。**`app/+native-intent.tsx` は
    外さない**（戻りのURL `singfolio://auth/apple?...` を expo-router に渡すと `+not-found` へ遷移する。起動時のURLには `null` ではなく `'/'` を返す: `null` だと
    ルートから始める処理が飛び、Add Song が開く）。`openAuthSessionAsync` は使わない（Androidでは、
    リダイレクトとブラウザを閉じた判定を競わせるだけで、`dismiss` が勝ちうる）。`state` が `SHA-256(T)` と違う戻りのURLは受け取らない。`V`・`T` は
    メモリにだけ置く（アプリが終了したときの再開は実装しない。決定済み。docs §8）。`openBrowserAsync` のオプション（`createTask`・`useProxyActivity`・
    `showInRecents`）は、既定と同じ値を明示して固定している（`src/services/index.ts`）。外さない: 旧来の経路は、Custom Tab を最近使ったアプリに出さず、
    アプリの外へ移ると破棄する（SMSの確認コードを別のアプリで開く経路が壊れる）。
-   **Account 画面（`app/account.tsx`・`ui/AccountSection.tsx`。7.3.11）。** 入口は Settings の `Account` で、`account.available` が真のビルドだけ。
    **`src/services/index.ts` の `ACCOUNT_ENABLED` は、7.3.12・7.3.13 が済むまで外さない**（リリースのビルドでは `auth` を注入せず、入口の行も、ルート `singfolio://account` も閉じる。
    ポリシー・申告がアカウントを前提にしていないため（Workerは 7.3.13 でデプロイした）。署名したビルドで確かめるときだけ、`eas.json` の `account-test` プロファイル
    （`EXPO_PUBLIC_SINGFOLIO_ACCOUNT=1`）でビルドし、**そのビルドを製品版・審査へ昇格させない**）。
    Settings の行に、サインイン中の手段（値）を出さない（Settings が SecureStore を読まない）。この画面の失敗は ErrorBoundary に伝えず、画面の中で出す。
    操作のあとは、成功・失敗とも、サインインの状態を読み直す。実行中は戻れない（`usePreventRemove`。削除の結果を伝えられなくなる）。iOS の Apple は
    `AppleAuthenticationButton`（`style` に背景色・角丸を入れない。App Store のガイドラインに反する）。つなぐ画面・再認証なしの削除・Googleの
    `clearCredentialState`・Androidの Apple の再開は、作らないと決めた（理由は docs §8「アカウントの画面」）。
-   **公開（アプリ側。`Services.publish`。7.4.6）。** 詳細は `docs/singfolio-publishing-backend.md` §8「アプリ側の Publish の土台」。
    認証が要る公開の呼び出しは `access.withSession`（`accountService.ts` の `SessionAccess`）を通す。**`access` を `Services.account` に含めない**
    （セッションの値を画面に渡さない。`createServices` が取り除く）。公開のHTTPは `publishRepository` に閉じ込め、共通の扱いは `apiClient.ts`（`authRepository` と共有。
    5xx・429 は `unavailable`、401 は `unauthorized`）。通信・認証の失敗は `AuthError`、サーバーが理由を返して断ったものは `PublishError`。
    公開する曲は **`show`（Show Mode の Service）から取る**（Readyの曲だけが、My Key・Private Note・ステータスを持たない形で来る）。`songs` / `Song` から作る形に「簡略化」しない。
    `publishSnapshot.ts` の `PUBLISH_LIMITS` は、Workerの `SNAPSHOT_LIMITS` と同じ数字を**別に持つ**（コードは共有しない。`publishSnapshot.test.ts` が一致と、整えた本文が
    Workerの検証を通ることを確かめる）。曲数が1000を超えるときは**断る**（切り詰めない）。長さ・文字は整えて切る（1曲の事情で全体の Publish を止めない）。
    **`publish` は、本文を送る前に、同じセッションで `GET /me/profile` を読み、端末の記録が今のアカウントのものと確かめてから `baseVersion` を決める**（「通信を1回にする」ために外さない。サインアウト・別のアカウントでのサインインは記録を消さないので、確かめずに使うと、前のアカウントの版がたまたま同じとき、別の端末の公開を確認なしに上書きする）。**`publish_state.base_version` は、`refreshProfile` や `claimUsername` のやり直しで、サーバーの今の版へ進めない**（別の端末の Publish を、確認なしに上書きする。再インストール後の
    空のローカルから公開を消す事故を、これが止める）。進めるのは、Publish・Unpublish の応答と、置き換えの確認（`replaceVersion`）だけ。曲ごとのハッシュに `sortOrder` を含めない
    （曲を足すと、あとの曲が全部「変更あり」になる）。`published_songs` を `songs` の外部キーにしない（曲を消したあとも、公開した記録を残す）。公開タグは、利用者が選んだタグだけ（下の「公開するタグの選び方」）。`publishSnapshot.ts` に正規表現の後読みを書かない（Hermes で未確認。起動の失敗になりうる。テストが検出する）。`publishSnapshot.test.ts` は `worker/src/snapshot.ts` を import する（実行時のコードは共有しない）ので、そのファイルに Workers の型や `worker/` の依存を持ち込まない。
-   **Public Profile 画面（`app/public-profile.tsx`・`ui/PublicProfileSection.tsx`。7.4.7）。** 詳細は `docs/singfolio-publishing-backend.md` §8「アプリ側の Public Profile 画面」。
    入口（Profile）もルートも `account.available` のゲートの後ろ（Account と同じ。リリースのビルドでは閉じる）。**Display Name・Bio の下書きは、この画面だけが持ち、保存しない**
    （初期値はサーバーの `PublicProfile`。端末の `publish_state` ではない）。保存先を足さない（Auto Publish は、Display Name・Bio を載せず、端末が最後に Publish した値で曲の変更だけを送ると決めた。7.4.9b）。最初の公開・Unpublish・`username` の確保・
    版の食い違いの置き換えの確認は外さない（人に見える状態になる・変更できない）。公開中と見て確認なしで送ったのにサーバーが非公開だったときは、置き換えの文言にせず、公開の確認の文言にする。`username` の形の規則は `src/services/username.ts` に、Workerと同じ値を別に持つ。日時は `Intl` を使わない
    （`src/i18n/dateTime.ts`）。失敗の文言は `src/i18n/publishErrors.ts`（Publish の `network` だけ「公開できたか分からない」）。
    **「N unpublished changes」（`publishService.countUnpublishedChanges(profile)`。7.4.9a）は、数えるのを曲だけにする**（Display Name・Bio の下書きを混ぜない）。**端末の記録が、渡された
    サーバーの `profile`（呼ぶ側が最後に読んだもの。公開中・`username` と `baseVersion` が一致）と合うときだけ数え、合わなければ `null`**（再インストール後の空の記録と比べると、全部が「追加」と数えられる。
    別の端末が Publish したあとの記録は、公開内容の基準にならない。ただし画面が読み直すまでは気づかず、表示が古くなるだけ）。Service からサーバーへ聞きに行かない（通信しない）。曲の整え方は Publish と同じ `buildPublishSongs` を使い、
    数え方だけ別に整えない（整えた値のずれが、Publish しても消えない「変更あり」になる）。詳細は同じ docs §8「未公開の変更の数え方」。
-   **Auto Publish（アプリ側。`Services.autoPublish`・`publishService.publishPendingChanges`。7.4.9b）。** 詳細は docs §8「Auto Publish（7.4.9b）」。
    **自動で送るのは、サーバーが公開中で、端末の記録（`username`・`baseVersion`）がサーバーの今の状態と一致するときだけ。** 最初の公開・非公開にしたあとの再公開・版の食い違いの置き換え
    （`replaceVersion`）は、自動では行わない（人に見える状態になる・他の端末の公開を上書きするため、確認つきの Publish Now だけ）。**Display Name・Bio は載せない**（入力の途中を公開しない。
    下書きの保存先を足さない）。設定 `auto_publish` は既定オフ（未設定・`on` 以外はオフ）で、端末の記録を別のアカウントのものと見て捨てるとき（`reconcile`・`claimUsername`）にオフへ戻す。外さない。
    **Pending は別に保存しない**（端末の記録との差が、そのまま Pending。「保留キューのテーブル」に「簡略化」しない。再起動しても、次の確認が同じ差を見つける）。差が0なら通信しない。
    **背景に移るときは送らない**（`flush` は前面に戻ったときだけ。通信の途中でアプリが止まると、サーバーでは済んだのに記録できず、次が版の食い違いになる）。
    きっかけは、`createServices` が `observeCommits` で `Database` を包んで拾う**DBへの書き込み**（`auth` を注入したビルドだけ）。各 Service に「公開内容が変わった」の通知を足して回る形に
    「簡略化」しない（足し忘れが、黙って送られない原因になる）。`stopped` は一時的な状態（次の確認でもう一度試す）で、再送のタイマーを作らない。
-   `expo-secure-store` の config plugin を `app.json` に足さない。Androidのバックアップ規則が `<include>` で、v1.0で今
    バックアップされているSQLiteを外す。

### 曲名・アーティストの候補（サジェスト）

詳細は `docs/singfolio-data-model.md`「候補検索」、`docs/singfolio-screen-flow.md`「候補（サジェスト）」。

-   外部へ送るのは、Title / Artist の入力欄に**その画面で打った検索語だけ**。My Key・Private Note・
    タグ・端末内の曲の一覧は送らない。欄を編集していない段階（フォーカスしただけ・編集画面を開いた
    ときの既存の値）では送らない。
-   HTTPは `src/repositories/songCatalogRepository.ts` に閉じ込め、`fetch` は `createServices` に
    注入する。注入しなければ外部検索は無効になる（設定の切替・提供元の表記も出さない）。画面・
    Serviceから、提供元のURLやレスポンスの形に触れない。
-   ストアは、実際に使う言語で決める（決定済み。端末の地域では決めない）。
-   候補は補助。自由入力はいつでも保存でき、外部IDは保存しない。通信の失敗は「候補が出ない」だけに
    し、失敗を0件としてキャッシュしない。
-   **曲名の候補を選んで入るのは曲名だけ**（アーティスト・読みには触れない。アーティストの候補は
    アーティストだけ）。以前は曲名の候補が曲名とアーティストの両方を置き換えていたが、やめた。
    アーティストと曲名は、ユーザーが入力して保存するもので、Apple Music やカラオケに無い組み合わせも
    登録する。候補の行にアーティストを添えるのは、見分けるため。「候補は組なので両方入れる」に戻さない。
-   外部の検索に `explicit` は指定しない。実測（2026-10。米国・日本ストア）で、指定しなくても `explicit` の曲は
    返らず、`explicit=No` を足しても結果は変わらない（`docs/singfolio-store-listing.md` の年齢指定）。
-   候補の欄には提供元（「Suggestions from Apple」）を表記する。外さない。
-   Artist・Title の入力欄は、`autoCorrect` と `spellCheck` を切る（`SongForm` の `NAME_INPUT`）。外さない。
    名前を自動修正が書き換える（`Lyren` → `Lauren`）うえ、iOS では、アーティストの候補を選んで曲名へ
    フォーカスを移した直後に、自動修正が、選んだ値を上書きする（iOS シミュレータで確認。曲名が空でない
    ときの、キーボードを閉じる経路では起きない）。
-   候補を選んだとき、その候補を入れた入力欄（曲名の候補なら Title、アーティストの候補なら Artist）を
    `key` で作り直す（`SongForm` の `titleEpoch` / `artistEpoch`）。「簡略化」して `setTitle` だけにしない（iOSの日本語の変換中の欄は、JSからの
    書き換えを無視する。詳細は `SongForm` のコメント）。

### データモデル

-   Song IDはUUID。
-   アーティストは `artists` テーブル（`songs.artist_id`）。名前と**読み**（並び替え用の名前）は、
    アーティストごとに1か所で、曲ごとに持たない（同じアーティストの曲で食い違わないため）。
    `songs.artist`（文字列）に戻さない。同じアーティストかは、DBの `UNIQUE` ではなく
    `artistNameKey`（全角半角・大文字小文字を区別しない）でServiceが判定する。曲が1つも無く
    なったアーティストは、曲の保存・削除と同じトランザクションで消す（読みだけを残さない。
    Artists 画面に削除は無い）。アーティストの作成と読みの変更は、曲の保存（`createSong` /
    `updateSong` の `artist` / `artistReading`）と同じトランザクションで行う。
-   読みは空にしない（`artists.reading` の `CHECK`）。言語ごとの規則（日本語の設定は、漢字・英字
    不可）は、データの不変条件ではなく入力の規則なので、画面（Add / Edit Song・Artists）が
    `readingProblem` で、**読みを変えたときだけ**確認する。Serviceに移さない（移すと、別の言語の
    設定で保存した読みを、開いて保存しただけで咎めてしまう）。
-   LocalデータとPublished（公開）データは別モデル。My KeyとPrivate Noteを
    公開モデルへ含めない（「Webで隠す」ではなく、最初から公開用のデータ（D1・R2）に含めない）。
-   UIとDBを密結合させない。
-   一度リリースしたマイグレーション（`src/db/migrations.ts`）は書き換えない。
    スキーマを変えるときは末尾に次の番号を追加する。
-   Published Songに `status` を持たせない（公開対象はReadyのみ）。公開内容は
    最後に正常にPublishされたスナップショットで、ローカル状態の即時の鏡ではない。
-   タグに公開/非公開などの可視性属性（`isPublic` 等）をv1.0で追加しない。
    Webへ送るタグはローカルのタグとは別に `publicTags` として扱う。
    **公開するタグの選択（7.4.8）は、`tags` に列を足さず、別の表 `public_tags`（`tag_id` だけ。`tags` への外部キーで `ON DELETE CASCADE`）に持つ。`Tag` にも `isPublic` を足さない。
    名前で持たない**（タグを消して同じ名前で作り直したタグが、黙って公開される）。既定は全部非公開で、「全タグを公開する」「Ready の曲のタグを自動で公開する」に
    「簡略化」しない（タグは、利用者が管理のために付ける情報で、人に見せるかは利用者が選ぶ）。選択は端末内だけの設定で、アカウントと結びつけず、サインアウト・別のアカウントでも
    消さない。画面は `publish` Service（`listPublicTagChoices`・`setTagPublic`）だけを使う。Publish に載せる公開タグは `publishService` の `loadSources` の1か所で作る
    （7.4.9a の未公開の変更の数え方も、これを使う）。詳細は `docs/singfolio-publishing-backend.md` §8「公開するタグの選び方」。

### Repository / Service層

詳細は `docs/singfolio-data-model.md`「Repository / Service層」。

-   UI → Service → Repository → SQLite の一方向。画面はRepository・DBに触れず、
    `getServices()` のServiceだけを使う。例外は、`src/services/` の、DBに触れない純粋な関数
    （`text.ts` の正規化・`tagInput.ts`・`suggestionRules.ts`・`readingRules.ts`・`artistReadingDictionary.ts`・
    `username.ts`・`publishSnapshot.ts` の `PUBLISH_LIMITS`）、`ServiceError`・`PublishError`、入力の型で、
    保存前の入力の確認を、Serviceと同じ判定にそろえるために画面から直接importしてよい
    （Add / Edit Songの、空の曲名の判定・新規タグの重複の判定・アーティストの候補の結合、Public Profile の入力欄の長さ）。それ以外（`createServices`・Serviceの実装・
    `repositories/`・`db/`）は、画面から使わない。
-   DBへの書き込みは、必ず `Database.transaction` の中で行う（expo-sqliteの
    `withTransactionAsync` は排他ではないため）。`Database` を読み取り専用の型に
    しているのはこのためで、`runAsync` を直接呼べるように型を緩めない。
-   `src/` のコードはNodeのテスト（`npm test`）からも直接実行する。型だけのimportは
    `import type`、enumやコンストラクタ引数プロパティは使わない（tsconfigで検出する）。
    importは `.ts` 付き（付け忘れは型チェックを通り、`npm test` の実行時にだけ失敗する）。
    テストファイルの先頭には `/// <reference types="node" />` を置く（エディタ用）。
-   アーティストの読みの辞書（`assets/artist-readings.json`）は、`scripts/build-artist-readings.mjs` の
    生成物で、手で直さない。MusicBrainz のコアデータ（CC0）から作り、**端末内だけで引く**（実行時に
    MusicBrainz の API を呼ばない。商用では有料プランが前提で、外部への送信も増える）。日本語の設定の
    読みの初期値にだけ使う（英語の設定には使わない）。誤った読みを出さないため、割れる読みは辞書に
    入れない。詳細は `docs/singfolio-data-model.md`「アーティストの読みの辞書」。
-   曲名・アーティストの並び替えは、SQLの `ORDER BY ... COLLATE NOCASE` ではなく、Serviceが
    `sortKey`（`src/services/text.ts`）で行う（五十音順。ひらがな・カタカナを混ぜ、濁点・小さい
    かな・長音を整える）。アーティストは、名前ではなく**読み**で並べる。SQLに「簡略化」しない
    （ひらがなとカタカナが分かれ、読み順にならない）。曲名の読みは持たないので、漢字の曲名は
    かなの後ろに文字コード順で並ぶ（許容している）。
-   曲の検索は、SQLの `LIKE` ではなく、Serviceが `searchKey`（`src/services/text.ts`）で
    行う。`LIKE` へ「簡略化」しない（ひらがな/カタカナ・全角半角を同一視できなくなる）。
    Repositoryは検索の条件を持たない。
-   タグ名の正規化は `normalize('NFKD').normalize('NFC')`。`normalize('NFKC')` 1回に
    「簡略化」しない（iOSのHermesは半角カナの濁点を合成しない。Nodeのテストでは検出できない）。

### 画面

-   「管理する画面」と「人に見せる画面」を分離する。Show Modeは閲覧専用で、
    My Key・Private Note・Wantなどの管理情報を出さず、編集操作も置かない。
-   Show Mode（`app/show.tsx`）は、`songs` ではなく `show` Service を使う。Show Modeの曲
    （`ShowSong`）は My Key・Private Note・ステータスを型の上でも持たず、画面が管理情報に
    触れない（タグも `id` と `name` だけ）。`ShowSong` に項目を足したり、`Song` や `Tag` を
    そのまま渡す形に「簡略化」しない。行は押せるようにしない（Song Detail は管理情報を出す）。
    タグのチップは、Songs と違い、Readyの曲に付いたものだけ（理由は screen-flow「Show Mode」）。
    並び替えは Artist / Title の2つだけ。曲名順の行は、`ShowSong` に `artist` だけを足した別の型
    （`ShowListedSong`）で、`ShowSong` 自体に `artist` を足さない。更新日・追加日の順は Show Mode に
    持ち込まない（人に見せる画面に、管理の情報を持ち込まない）。アーティストの読みも、行には持ち込まない
    （並びにだけ使う）。
-   ボトムタブはSongs / Profile / Settingsの3つ。PracticeとWantは独立タブにせず、
    Songs内のステータスとして扱う（Practiceは以前、独立タブだったが、Songsの絞り込みと重複するので
    やめた。蒸し返さない）。Songsを Practice で絞ると「→ Ready」、Want で絞ると「→ Practice」のボタンが
    行の右に出る。ProfileとSettingsも、以前は1つの画面に同居していたが、分けた（Profileは「自分の
    Singfolio」＝件数とShow Modeの入口、Settingsは設定）。
-   ログインを要求しない（v1.0）。
-   画面（ルート）は `app/`（Expo Router）に置く。`src/` はNodeのテストから直接
    実行するため、画面（RN・Expoのimport）を置かない。
-   曲の画面（`song/new`・`song/[id]/index`・`song/[id]/edit`）は、`app/_layout.tsx` で
    `dangerouslySingular` にしている。外さない。`router.push` は同じ画面でも毎回積むので、行や
    ボタンの素早い連打で同じ画面が重なる。Edit Songが重なると、下の画面は開いた時点の内容のまま
    で、上で保存した内容を、下で保存して上書きする（iOSシミュレータで確認）。曲の画面を
    足すときも同じ指定を足す。Show Mode・Tags・About も同じ指定（Profile・Settings の行の連打で重なる。
    6連打して、戻る1回で元のタブへ戻ることをiOSシミュレータで確認）。Open source licenses
    （Aboutの行の連打）も同じ。
-   言語の選択肢の名前（English / 日本語）は、文言のカタログ（`en.ts`・`ja.ts`）に入れず、
    `languageNames`（`src/i18n`）から出す（表示言語に依らず、その言語自身の名前）。
-   `app/_layout.tsx` は、DB初期化（`getServices()`）と、保存済みのAppearanceの
    端末への反映が終わるまで画面を出さない。Serviceが使えない状態で画面を描画させない。
    反映前に描くと、既定の配色が一瞬見える。
-   起動の失敗は、`app/_layout.tsx` が例外にして、`ErrorBoundary`（`ui/ErrorScreen.tsx`）に
    任せる。レイアウトが自前でエラー画面を返さない（Expo Routerは、ErrorBoundaryを描画する
    ときにスプラッシュを閉じる。自前で返すとナビゲーションが準備完了にならず、スプラッシュが
    残り続けうる）。投げる値は `Error` に包む（Expo Routerの `Try` は、falsyな値を「エラーなし」と
    見てレイアウトを描き直す実装。ソースを読んで確認したもので、実機では試していない）。アプリより新しいDB
    （`DatabaseTooNewError`）は、やり直しても開けないので「もう一度試す」を出さない。
    このErrorBoundaryは、起動後の画面の描画の失敗も拾う（再試行でレイアウトが作り直され、
    先頭の画面から始まる。詳細は screen-flow「起動時の例外」）。
-   Add / Edit Song（`ui/SongForm.tsx`）の「変更があるまま戻るときの破棄の確認」は、
    `usePreventRemove`（`expo-router/react-navigation`）で行う。`navigation.addListener(
    'beforeRemove')` を自分で購読する形に「簡略化」しない。iOSのネイティブStackは、
    `usePreventRemove` で止めると伝えない限り、戻るボタン・スワイプをネイティブ側で先に実行し、
    JS側で止められない（"was removed natively" のエラーになる。iOSシミュレータで確認）。
-   戻るボタンに `(tabs)` が出る問題は2通りある。文字は、各画面の `headerBackButtonDisplayMode:
    'minimal'` で隠す。iOSの長押しメニューは、前の画面の題を並べ、題の無い `(tabs)` はルート名が
    そのまま出る（`minimal` では隠れない。iOSシミュレータで確認）。そのため `app/_layout.tsx` の
    Stackの `screenOptions` で `headerBackButtonMenuEnabled: false` にしている。外さない。画面ごとの
    指定に「簡略化」しない（画面を足すたびに復活する）。
-   新しいタグは、Add / Edit Song で追加した時点ではなく、曲を保存するときに、Serviceが曲と
    同じトランザクションで作る（`createSong` / `updateSong` の `newTagNames`）。追加した時点で
    作ると、保存せずに戻ったとき、使われないタグが残る。画面で `getOrCreateTag` を呼んでから
    曲を保存する形にも「簡略化」しない（曲の保存が失敗したとき、タグだけが残る）。
-   Androidはエッジ・ツー・エッジで、キーボードが出ても画面（ScrollView）が縮まず、下にある入力欄が
    キーボードに隠れる（`adjustResize` は効かない。エミュレータで確認）。入力欄が下にある画面は、
    `SongForm` のように、キーボードの高さの分の余白を足してスクロールする。
-   タブの画面（Songsの一覧、Profileの件数）は、他の画面から戻ったときの読み直しを
    `ui/useFocusRefreshKey.ts` で行う。「最初のフォーカスは読み直さない」と決め打ちしない。
    リンクで Song Detail を直接開くと、下のタブは一度もフォーカスされないままマウントして読み込み、
    戻っても一覧が古いまま残る（iOSシミュレータで確認）。フォーカスされていない状態から
    フォーカスされた状態に変わったときを数える（`useIsFocused` の変化）。`useFocusEffect` の最初の
    呼び出しを飛ばす形にしない（Expo Routerの `useFocusEffect` は、マウントより遅れて最初に呼ぶので、
    マウントと同時のフォーカスを見分けるには実行の順序に頼ることになり、壊れやすい）。
-   RN・Expoに依存するUIの部品・hookは、`src/` に置けないため `ui/`（ルート直下）に置く。
-   アイコンは `import Ionicons from '@expo/vector-icons/Ionicons'` と、セットを指定して
    importする。`import { Ionicons } from '@expo/vector-icons'`（ルート）に「簡略化」しない。全20セット
    のフォントが、アプリに入る（約5MB増える。`expo export` で確認）。`npm test` が検出する。
-   装飾のアイコンは `{...decorative}`（`ui/decorative.ts`）で読み上げから外す。外さないと、
    字形（`\uf55f` など）が読み上げの対象になる（iOSのアクセシビリティツリーで確認。
    読み上げ自体と、TalkBackは未確認）。
-   色は `src/theme/colors.ts`（Nodeでも実行できる）に集約し、画面は `ui/theme.tsx` の
    `useTheme()` から取る。直書きしない。ライト/ダークは、JSの色の上書きではなく、
    `Appearance.setColorScheme()`（`applyAppearance`）でアプリ全体（ネイティブの描画を
    含む）のカラースキームごと切り替える（ステータスバー・ダイアログ・Androidの
    ウィンドウ背景も揃えるため。OS自体の設定は変えない）。
-   JSから読めない場所（app.json の `backgroundColor`・スプラッシュ、
    `plugins/withAndroidNightColors.js`）には、色を手で写している。`colors.ts` を
    変えたら、`npm test`（`src/theme/nativeConfig.test.ts`）が食い違いを検出するので、
    その箇所を同じ値に直す。
-   Purple（`#9C70FE`）は白の上で約3.4:1で、小さな文字の色には使わない（アイコン・
    大きな文字・塗りに使い、紫の面の上の文字は濃い色にする。詳細は `colors.ts`）。

### 言語

-   English First。ただし最初から日本語対応を前提とし、画面の文言は直書きせず
    多言語化の仕組みを通す。初回起動の言語は、端末設定から決めて保存する。
-   文言は `src/i18n/en.ts` が正（キーの一覧）。`ja.ts` は同じキーを型で強制される。
    画面は `ui/i18n.tsx` の `useI18n()` の `t` から取る。`t` は、文言の `{name}`（件数の
    文言は `count`）の値を型で必須にする（`en.ts` の `as const` を外さない）。
    `Intl.PluralRules` は使わない（Hermesには無い。iOS・Androidで確認）。件数の形は
    `src/i18n/translate.ts` の `pluralRules` で選ぶ。
-   言語を足すときは、`LANGUAGES`（`src/domain/types.ts`）と、app.json の
    expo-localization の `supportedLocales`（ios）の両方に足す。後者はJSから読めず
    手で写していて、`npm test` が食い違いを検出する。
-   言語の設定は `en` / `ja` だけで、`system` は無い（Appearanceと違う。読みの入力ルールが
    表示言語で変わるため、端末の言語の変更で、知らないうちにルールが変わらないようにする。
    決定済み。`system` を足し戻さない）。初回起動（未保存・旧版の `system`）は、端末の言語から
    `ensureLanguage` が決めて保存する。以後は端末の言語に追従しない。切り替える前に、確認の
    ダイアログを、どの切り替えでも出す（`ui/SettingsSection.tsx`）。
-   DBが使えない画面（起動時の失敗を出すエラー画面。`ErrorBoundary` は `app/_layout.tsx`
    の Provider の外で描画される）は、`<I18nProvider initialLanguage={deviceLanguage(...)}>` で
    包んで端末の言語で出す（`ui/ErrorScreen.tsx`）。`+not-found` は Stack の中の画面なので、
    普通に `useI18n()` が使える。
-   OS標準の部品の文言は端末の言語に従い、アプリ内の言語とずれる。`Alert.alert` のボタン
    など、文言を指定できるものは省略せず `t` で渡す（省略すると既定の「OK」が端末の言語で
    出る）。

### フォント

-   書体は表示言語で決める（English → Inter、日本語 → Noto Sans JP。`src/theme/fonts.ts`）。
    言語の設定に従い、切り替えは全画面にすぐ反映する。ユーザーが入力した
    日本語を English の画面で出すときは、Inter にその字が無いため OS のフォントで表示される。
    端末の言語に日本語が無いと、漢字が中国語の字形になりうる（未確認）が、許容している。
    内容に応じた書体の切り替えはしない（決定済み。蒸し返さない）。
-   文字は React Native の `Text` ではなく `ui/Text.tsx` の `Text` を使い、入力欄は
    `ui/TextInput.tsx` の `TextInput` を使う（直接importするとOS既定の書体になる。RNの
    `Button`・`Animated.Text` も同じ。`npm test` が検出する）。ナビゲーション（ヘッダー・
    タブのラベル）の書体は `ui/theme.tsx` が渡す。
-   `ui/Text.tsx` は Androidの `includeFontPadding: false` を既定にしている。外すと、
    Noto Sans JP の行間がInterの約1.8倍に開く（日本語だけ画面が間延びする）。ヘッダー・
    タブのラベルは React Navigation が描くので、この指定は効かない（Androidの日本語で、
    縦位置のずれ・切れは出ないことを確認済み）。
    Noto Sans JP は、`lineHeight` を指定しない行の高さも Inter より大きい（iOSで約1.2倍）。
    行の高さが要る画面は `lineHeight` を明示する。
-   `fontWeight` は '400' / '700' だけ（Regular / Bold）。同梱しない太さ（'500'・'600' など）は、
    iOSとAndroidで近い太さの選び方が違い、見た目がずれる。SemiBold(600)は、サイズのため
    同梱しない（700との違いがほとんど無く、並べて見比べて確認した）。ナビゲーションの
    テーマでは `medium` も Bold に寄るため、タブのラベルだけ `app/(tabs)/_layout.tsx` で
    '400' にしている（モックアップは細い字）。
-   フォントファイル（`assets/fonts/`）は、`useFonts` などで実行時に読み込まず、
    `expo prebuild` でネイティブに埋め込む（app.json の expo-font）。読み込みの待ち合わせが
    要らず、最初の画面から正しい書体で出る。`app/_layout.tsx` にフォントの待ち合わせは無い。
    app.json の書体名・太さは `src/theme/fonts.ts` と手で揃える（食い違いは `npm test` の
    `src/theme/fonts.test.ts` が検出する。起動はするが、OS既定の書体になる）。
-   `assets/fonts/` は `scripts/generate-fonts.py` の生成物で、手で編集しない。Noto Sans JP は
    サイズのため（1ファイル約5.7MB → 約2.5MB）サブセット化していて（Windows日本語の
    cp932 = JIS X 0208 + NEC・IBM拡張。記号（♥♡™€など）と、結合用の記号も入れている）、
    JIS X 0213 の第3・第4水準の漢字などは OS のフォントで出る。丸ごとのフォントに戻さない。
    字を足すときは、サブセットに無い文字が混ざると、同じ行で書体が混ざる（♥が赤い絵文字に
    なるなど）ことに注意する。逆に、絵文字として出したい字（Emoji_Presentation。⚽⚾）は
    入れない（入れると、色付きの絵文字がNotoの白黒の字になる。iOSで確認）。
    生成は fonttools 4.66.1 で、同じ版なら何度作っても同じバイナリになる（版が違うと変わりうる）。
-   `assets/fonts/OFL-*.txt` はフォントのライセンス（SIL OFL。再配布に付ける必要がある）。
    消さない。アプリ内のAbout（`app/about.tsx`）にも、自前で同梱したフォントのライセンスを
    表記する（アイコンフォント・npm依存の表記は、「第三者ライセンス」節の一覧で別にする）。
    JSからは読めないので、`src/legal/fontLicenses.ts` に同じ内容を写していて、食い違いは
    `npm test`（`fontLicenses.test.ts`）が検出する。フォントを入れ替えたら、ここも直す。

### 第三者ライセンス

詳細は `docs/singfolio-screen-flow.md`「Open source licenses」。

-   `src/legal/thirdPartyLicenses.ts` は生成物。手で直さず、依存（`package.json`・ロックファイル・
    ネイティブの依存）を変えたら `node scripts/generate-licenses.mjs` で作り直す。ストア提出の前に
    `--check` で、今の依存と同じことを確かめる。`npm test` が検出するのは、版の食い違いと
    `dependencies` の載せ漏れまで（バンドルに入るものが増えても気づけない）。
-   載せるものは、`dependencies` をたどらず、実際にアプリに入るもの（JSバンドルのsourcemap・
    autolinking・Gradle）から決める。「`dependencies` から機械的に作る形に簡略化」しない（ビルドにしか
    使わないパッケージが大量に入る）。
-   npm のパッケージの中に取り込まれた別のプロジェクトのコード（今は expo-router の React Navigation）は、
    パッケージの LICENSE では足りない。`BUNDLED` に足して、別の行にする（`vendor/`・`fork/` などが
    バンドルに入ると、生成が失敗する）。
-   許可していないライセンス・知らない Maven の groupId・node_modules の外から入る iOS の Pod・読めない
    Gradle の行などが入ると、生成が失敗する。黙って許可を足さず、条件を確認する。Maven の成果物が
    `.so` に埋め込むライブラリ（Fresco の libjpeg-turbo など）は `MAVEN_EMBEDDED_LIBS` に、APK の `.so`
    で確かめて足す。release のビルドでは `--check --apk <APK・AAB>` で、把握していない `.so` が
    入っていないかを確かめる。
-   Android Software Development Kit License（Google Play services・googleid）は、`ALLOWED_LICENSES` に足さない。groupId
    （`com.google.android.gms`・`com.google.android.libraries.identity.googleid`）だけを個別に許可し、全文は載せず、名前と
    規約のURLを About の別枠に出す（Androidだけ）。iOS の trunk の Pod は `IOS_TRUNK_PODS` にあるものだけを、入っている
    Pod の LICENSE の全文で載せる（`Apache-2.0 AND MIT` は Pod にだけ許し、`ALLOWED_LICENSES` には足さない）。自前の
    `modules/` は第三者ではないので載せない（package.json も無い）。Play services の AAR が持つ OSS の表記
    （`third_party_licenses`）は、`GOOGLE_AAR_NOTICES` に挙げた名前だけを全文つきで載せ、知らない名前が増えたら失敗にする。
    全部を機械的に載せる形に「簡略化」しない（J2ObjC の項目は GPL・APSL などの全文を持つが、Androidの AAR には入らない）。
-   アイコンフォント（Ionicons・Material Symbols）は、npmパッケージのLICENSEとは別のライセンスなので、
    別の行にしている。上流から写した全文は `scripts/license-texts/` にある（取得元はスクリプトの設定）。
-   About の「Fonts」（`fontLicenses.ts`）は、自前で同梱した書体だけで、この一覧とは別。

### ストア用のスクリーンショット

詳細は `docs/singfolio-store-listing.md` §4。

-   画面に出す曲名・アーティスト名は、すべて架空（`scripts/store-screenshots/seed.py`）。実在の曲・
    アーティストに「簡略化」しない（審査の5.2.1と、実在の人名を宣伝に載せないため）。名前を足すときは、
    Apple の検索 API で同名の実在が無いことを確かめる（架空のつもりの名前が実在した例が多い）。
-   候補（Suggestions）が出ている画面は撮らない（実在の曲が出るため）。Add Song は、候補をオフにして撮る。
-   `assets/store-screenshots/{ios,play}/` は `compose.sh` の生成物で、手で編集しない。撮影画像は、App Store 用が
    iOS シミュレータ（`raw/`）、Google Play 用が Android エミュレータ（`raw-android/`）。Play は長辺が短辺の2倍
    までなので、撮影画像をそのままは出せず、`compose.sh` が別のキャンバスに合成する。

### ネイティブビルド

-   `ios/`・`android/` は `expo prebuild` の生成物（gitignore）。直接直さず、
    app.json と `plugins/` で設定する。
-   `plugins/withGoogleSignIn.js` は、GoogleのクライアントID（iOSの Info.plist、Androidの文字列リソース）と、Podfile の
    modular headers（GoogleUtilities・RecaptchaInterop）を入れる。後者を外すと `pod install` が失敗する（GoogleSignIn が
    Swift の Pod に依存するため）。GoogleSignIn（10.1.0）と googleid（1.2.0）の版は固定していて、googleid の 1.2.1 は
    Kotlin 2.4 のメタデータで、Expo SDK 57 の Kotlin 2.1.0 では読めない。上げるときは、docs §8 の「実装の制約」を読む。
-   `plugins/withIosSceneDelegate.js` は、iOS 27 SDK（Xcode 27）の UIScene 必須化
    （未対応だと起動直後にクラッシュする）への対応で、削除しない。Expo SDK 58 の
    テンプレートが同じ配線を持つので、SDK 58 へ上げるときにこのプラグインと
    app.json の登録を撤去する。
-   `plugins/withAndroidR8.js`・`plugins/android-r8-rules.pro` は、AndroidのR8（難読化・最適化・縮小）を
    有効にする。Google Playが2027年2月から、DEX 10MB超のアプリに3つの率を各25%以上求めるため。
    R8無しのDEXは約46MBで該当する。pluginを入れると約9MBで10MBを下回るが、それはpluginの結果で、
    外すと46MBに戻る（「10MB未満だから対象外」とは読まない）。外さない。pluginの中の4つ（optimize版のproguardファイルとkeepルールはセット、
    `shrinkResources`は無効のまま、AGPを最新パッチに指定、`org.gradle.jvmargs`を4GBに）も「簡略化」しない。
    理由はpluginのコメント。R8の不具合は**リリースの実行時にしか出ない**（debugと`tsc`では出ない）ので、
    pluginやRN・Expoの版を変えたら、R8入りのreleaseをエミュレータで起動して確かめる。
    AGPは、RN・Expoの更新や8.12.4以降の登場のとき、`AGP_VERSION`を見直す。
    難読化の対応表（AABの`proguard.map`）は、Playへアップロードすれば取り込まれる。アップロードしていない
    AAB・検証用APKは、消すと対応表が二度と手に入らない（クラッシュログを`retrace`で戻せない）。
    AABを消すのは、Playへ上げて対応表が登録されたことを確かめてから。
-   `app.json` の `android.blockedPermissions` は、Expoの prebuild が既定で入れる、使っていない権限
    （`SYSTEM_ALERT_WINDOW`・外部ストレージの読み書き）と、`expo-secure-store` の依存（`androidx.biometric`）が
    足す `USE_BIOMETRIC`・`USE_FINGERPRINT` を外す。戻さない。保存は端末内で完結し、
    プライバシーポリシーもストアの申告も、それを前提にしている。
-   `app.json` の `ios.infoPlist.CFBundleAllowMixedLocalizations: false` は消さない。`expo-apple-authentication` の
    config plugin が、Appleのボタンの文言のために `true` を足す（`?? true` なので、`app.json` の値が残る）。`true` は
    Info.plist 全体に効き、アプリが対応していない言語の端末で、OSの部品の文言の言語選びが変わりうる（v1.0は未設定）。
    Appleのボタンは 7.3.11 で使った（iOSのサインイン前の画面）。端末の言語とずれたときの扱いは 7.3.13。`nativeConfig.test.ts` が検出する。
-   ビルド番号（iOSの buildNumber・AndroidのversionCode）は、EAS が持つ（`eas.json` の
    `appVersionSource: "remote"`、`production` の `autoIncrement`）。`app.json` に書かない
    （書いても無視される）。`app.json` の `version`（ストアの表示版）は手で上げる（EAS は上げない）。
    **公開済みの版の番号には、App Store Connect・TestFlight がビルドを受け付けない。** ストアへ上げるビルド（`account-test` を含む）の前に、
    今の番号が公開済みなら、**ユーザーに聞かずに**上げる（新機能を含む版は minor、不具合修正だけなら patch。上げた番号は報告する）。`eas init` は
    `app.json` に、プラグインの展開結果（`CFBundleLocalizations` など）まで書き込むので、
    やり直すときは `projectId` と `owner` 以外の差分を戻す。
-   `react-native-reanimated` / `react-native-gesture-handler` /
    `react-native-worklets` は画面から直接使っていないが、消さない。Expo Routerの
    依存（`react-native-drawer-layout`）がgesture-handlerとreanimatedをpeerに
    持ち（optionalではない）、reanimatedがworkletsをpeerに持つ（`0.10.x`）。
    package.jsonから消すと、`npm install` が最新版を自動で入れる（SDK 57の想定外で、
    workletsは expo-modules-core のpeer範囲外の0.13.0になり、ネイティブビルドを
    壊しうる）。バージョンは `npx expo install` が決める値のままにする。
-   `package.json` の `overrides.react-dom` は消さない。Expo Routerのpeerとして
    react-dom 19.3.0 が入り、react 19.2.3 と食い違って `npm install` が
    ERESOLVEで失敗するのを防いでいる（ネイティブでは使わない）。値は固定で、
    **reactを上げるときは同時に同じバージョンへ直す**（上げ忘れると、逆向きに食い違う）。
    `"$react"` で追従させる書き方は使えない（ロックファイルが無い新規解決で
    `Unable to resolve reference $react` になる。npm 10.9.8で確認）。

## ブランド

元データは `docs/Singfolio ブランドスタイルガイドとアプリ展示板.png`（画像のため
grepできないので、値はここに転記している）。色は定数に集約し、直書きしない。

| 用途 | 色 |
|---|---|
| Mint（Brand） | `#C9FCED` |
| Purple（Primary） | `#9C70FE` |
| Text Primary | `#17171A` |
| Text Secondary | `#71717A` |
| Surface | `#F7F7F8` |
| Background | `#FFFFFF` |

-   MintとPurpleは、`assets/icon.png` の色で確定している。PNGに書かれた
    `#CFF7E9` / `#A78BFA` は使わない（Mintはラベルの値だけがずれており、
    Purpleはラベルの値も色見本の実際の色もアイコンと一致せず、どちらも正確ではないため）。
-   フォントは英語がInter、日本語がNoto Sans JP（実装は「フォント」節）。
-   PNG上のSurfaceの文字は「#F7F778」と崩れて読めるが、色見本はほぼ白のため
    `#F7F7F8` と解釈している。
-   ダークモードの色コードはPNGに記載がなく、モックアップ（暗い背景に明るいミント/
    パープル）のみ。実装ではそこから決めた値を `src/theme/colors.ts` の `darkColors`
    に置いている（Purpleはライトと同じ）。ダークのスプラッシュのシンボルはMint
    （ブランド資料のDarkアイコンに合わせ、`scripts/generate-icons.py` が生成）。
