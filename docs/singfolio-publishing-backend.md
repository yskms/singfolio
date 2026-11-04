# Singfolio 公開機能・バックエンド方針

## 1. 基本方針

Singfolioは **Local First** とする。

通常のレパートリー管理は端末内のSQLiteで完結し、公開機能を利用するユーザーのみアカウントを作成して公開用データをサーバーへ送信する。

例外は、曲名・アーティスト名の候補検索（Add / Edit Song）だけで、入力欄に打った検索語を外部の楽曲検索へ送る
（送る範囲は §11。通信できなくても登録・編集はできる）。これは公開機能とは別で、アカウントも
Singfolioのバックエンドも使わない。

v1.0ではバックエンドを導入せず、将来の公開機能追加を前提としたデータ構造のみ考慮する。

バックエンドは **Cloudflare（Workers・D1・R2・Turnstile）** とする（§8）。公開機能の実装はv1.0より後で、
v1.0には含めない。

## 2. 構成

``` text
Singfolio App (React Native / Expo)
  └─ SQLite
       │
       │ Publish / Auto Publish
       ↓
Cloudflare Workers（API）
  ├─ D1 ── アカウント・セッション・プロフィール・Requests
  └─ R2 ── 公開スナップショット（最後に正常にPublishした内容）
       │
       │ 公開ページはR2だけから表示する（D1に触れない）
       ↓
Public Web (Cloudflare Workers)
  └─ singfolio.app/username
       ↑
     Viewer（Requestは匿名。Turnstileで確認して、D1へ保存する。将来）
```

## 3. ローカルデータと公開データ

端末内のSongをそのままサーバーへ同期しない。

公開可能な情報だけを明示的に抽出して、別のPublished Songとして送信する。

### Local Song

-   title
-   artist
-   status
-   keyOffset
-   tags
-   privateNote
-   createdAt
-   updatedAt

### Published Song

-   id（Local Songと同じSong ID。Requestが対象の曲を指すために使う）
-   title
-   artist
-   publicTags
-   sortOrder

Published Songは、サーバーのDB（D1）に曲ごとの行として持たない。プロフィール（Display Name・Bio）と
Readyの曲の一覧を **1つのスナップショット（JSON）** にまとめて、R2に保存する。Publishは、このスナップショットを
丸ごと差し替える操作で、Publishの時点の内容がそのまま公開される。

以下の情報は原則としてサーバーへ送信しない。

-   My Key
-   Private Note
-   その他の個人用管理情報

「Webで非表示にする」のではなく、Privateな情報は
**最初から公開用のデータ（D1・R2）に含めない** ことを原則とする。

### 公開用データの扱い

公開内容は、ローカル状態のリアルタイムな鏡ではなく、
**最後に正常にPublishされたスナップショット** である。

-   公開用データには、最後に正常にPublishされた時点でReadyだった曲だけを保持する。
    次回のPublish時にReadyではなくなっている曲は、公開用データから取り下げる。
    取り下げは次回のPublishが正常に完了した時点で反映され、Auto Publish OFF・
    オフライン・Pending中は公開内容が変わらない。
-   `status` は公開用データに持たせない。Practice / WantのWeb公開は現在の要件に
    含まず、必要になった時点で追加する。
-   v1.0では、タグはShow Modeに表示可能な情報として扱う。Web公開時には、
    公開ルールに基づいて選択されたタグだけを `publicTags` として公開用データへ
    含める。公開対象の選択方法とタグ単位の可視性設定は、公開機能の実装時に
    決定する。
-   公開用データの実体は、R2のスナップショット。Publishが正常に完了するまでは、前のスナップショットが
    公開され続ける（Publishの途中の失敗や、D1の状態に左右されない）。

## 4. Public Profile

公開機能を利用する場合のみアカウントを作成する。

アプリの通常利用ではログインを要求しない。

公開URL例：

``` text
singfolio.app/yskms
```

視聴者はSingfolioアプリのインストールやログインを必要とせず、ブラウザから閲覧できる。

公開ページでは以下を提供する。

-   Display Name
-   Bio
-   Readyの曲一覧
-   曲名・アーティスト検索
-   公開タグによる絞り込み
-   Requests（将来）

## 5. Publish

公開方法は2種類用意する。

### Auto Publish ON

公開対象データの変更を自動的にWebへ反映する。

編集操作のたびに即時通信するのではなく、一定時間のdebounce後に変更をまとめて送信する。

通信に失敗した場合は変更をPendingとして保持し、ネットワーク復旧後に再送する。

### Auto Publish OFF

変更はローカルに保持する。

未公開変更が存在する場合：

``` text
3 unpublished changes

[ Publish Now ]
```

と表示し、ユーザーが明示的に公開する。

## 6. Public Profile設定

想定UI：

``` text
Public Profile

● Published

singfolio.app/yskms

Automatically publish changes
                              [ ON ]

Last published
Today, 14:12

[ Preview Profile ]
[ Copy Link ]
[ Unpublish Profile ]
```

Unpublishしても端末内のレパートリーデータは削除しない。

Unpublishは、R2の公開スナップショットを削除する操作。公開ページは表示されなくなり、Requestの受付
（スナップショットにある曲だけを受け付ける。§7）も止まる。`username` は所有者のものとして確保したまま
（D1のプロフィールは残す）にして、受信済みのRequestは、アプリで読める状態のまま残す（案。§8「実装時に
決めること」）。アカウントを削除したときは、D1の行もR2のスナップショットも、すべて消す。

## 7. Requests

Requestsは将来追加する。

データの方向はPublishとは逆になる。

``` text
                   Publish
Singfolio App ───────────────→ Backend
      ↑                            │
      │ Requests                   ↓
      └──────────────────── Public Web
                                    ↑
                                  Viewer
```

視聴者は公開ページからReadyの曲をRequestできる。

将来的には未登録曲へのRequestにも対応する。現時点では、下の「公開済みスナップショットにある曲だけ」
という条件を置いていて、未登録曲に対応するときに見直す。

Requestは匿名の視聴者からの書き込みになるため、スパム対策を前提に設計する。

-   視聴者のログインは要らない。Cloudflare Turnstileで人間かどうかを確認し、レート制限を掛ける。
-   受け付ける曲は、公開済みスナップショットにあるものだけ（曲IDで確認する。曲名などを視聴者に自由に
    書かせない）。
-   ニックネームは、視聴者が任意で入れる自由入力の文字列（30字までのプレーンテキスト）。所有者のアプリにだけ
    表示し、公開ページには出さない。
-   入力の長さと、1人の受信箱の件数に上限を置く。
-   所有者は、Singfolioアプリの中のRequests一覧で受け取る（曲ごとの件数順）。Webの受信箱とプッシュ通知
    （FCM / APNs）は、現時点では対象外。
-   Requestはアカウントに紐づく動的データなので、D1に保存する。曲名・アーティスト名は、Requestの時点の
    値を一緒に保存する（再Publishで曲が変わっても、Requestを読めるように）。

## 8. バックエンド

### 採用する構成

**Cloudflare Workers（API・公開ページ）+ D1（動的データ）+ R2（公開スナップショット）+
Turnstile（匿名Requestの確認）** とする。

v1.0では導入しない。公開機能の実装に着手する段階で導入する。

### 公開ページの可用性

公開ページは、単なるHTTPキャッシュだけに依存せず、Publish時に
**公開スナップショットをR2へ保存** して、Cloudflare側から配信する。

``` text
Local SQLite
    ↓ Publish
Workers（認証・入力の確認）
    ↓
R2: 公開スナップショット（ユーザーごとに1オブジェクト）
    ↓
singfolio.app/username
```

-   PublishはR2のスナップショットを先に書き、成功したらD1のプロフィールの版（スナップショットの世代番号）を
    更新する。R2が成功してD1が失敗しても、公開されるのは新しいスナップショットで、版は次のPublishで揃う
    （スナップショット全体を差し替えるので、やり直しても結果は同じ）。版の用途は、実装時に決める。
-   公開ページは、R2のスナップショットだけから表示し、D1に触れない。D1の障害・日次上限・メンテナンス中でも、
    最後に正常にPublishした状態を表示できる。

ただし、D1が使えない間は、新規ログイン・Publish・Request受付が止まる。
この仕組みが守るのは公開閲覧のみで、バックエンド全体の可用性を保証するもの
ではない。Cloudflare自体の障害には対応しない。

### 認証

Apple / Googleのネイティブのサインイン（`expo-apple-authentication`・Googleのネイティブサインイン）が返す
IDトークンを、Workersで検証する（各社の公開鍵（JWKS）で、署名・発行者・対象・期限を確認する）。
確認できたら、Singfolio独自のセッションを発行する。

-   ユーザーIDは、クライアントから受け取らない。更新はすべて、セッションが指すユーザーに対してだけ行う。
-   セッションはD1に持ち、失効できる（ログアウト・アカウント削除）。方式は次の節。
-   アカウントの削除は、アプリの中から行える。D1の行とR2のスナップショットを消し、Sign in with Appleの
    ユーザーはAppleのトークンも失効させる。
-   IDトークンの全文と、そのクレームの値（`email`・`name`・`picture` など）は、ログにも保存にも出さない。
    保存するのは、アカウントの識別に使う `sub`（と、どのログイン手段か）と、検証が通ったときの使用済みの
    記録だけ。Googleのトークンには、`email` などが入っている（「Googleのサインイン」）。

### 認証の方式

AppleとGoogleの仕様は、各社の公式資料で確かめた（Appleは、IDトークンの検証・トークンの取得と失効・
`client_secret`・サーバー間通知・アカウント削除の案内）。

**nonce（リプレイ対策）**

-   nonceの元になる値 `T` は、Workerが発行する、期限付きの1回限りの値。**発行は無状態で、D1に書かない。**
    `POST /auth/nonce` が、乱数・期限・種別（`native` か `web`）と、`web`（Androidのウェブのフロー）のときだけ、
    検証用の値のハッシュ `C` を、Workerの秘密鍵でHMAC署名した文字列 `T` を返す（期限は数分）。
-   アプリは、`T` のハッシュ `SHA-256(T)`（base64url。43字）を、Apple・Googleのサインインの `nonce` に渡し、`T` を
    IDトークンと一緒にWorkerへ送る。Workerは、`T` の署名・期限、IDトークンの `nonce` が `SHA-256(T)` と一致する
    ことを確かめ、そのあとで使用済みとして記録する（`used_nonces`。一意制約で2回目を弾く）。D1に書くのは、
    これらが正しかったときだけ。
-   `T` をそのまま渡さずにハッシュを渡すのは、`T` が100字を超えるため。Appleの `nonce` の長さの上限は資料に書かれて
    おらず、生のまま渡すと、上限に当たったときに設計を戻すことになる。
-   発行のたびにD1へ書かない理由: D1のFreeは、書き込みが10万行/日で、INSERT・UPDATE・DELETEと索引の書き込みが
    数えられ、超えるとその日（UTCの0時まで）D1へのクエリが止まる。認証の要らないエンドポイントが書き込むと、
    それが上限を使い切る経路になり、ログイン・Publish・Request受付が止まる。ログイン前の経路は、D1に書かない。
-   使用済みの記録のうち、期限を過ぎたものは、ログインの処理の中で消す（Cron Triggerは使わない。Freeでも使えるが、
    動く部品を増やさない）。
-   IDトークンの `nonce` が、渡した値（`SHA-256(T)`）そのままか（さらにハッシュされていないか）。Googleは、
    そのまま返ることを確かめた（「Googleのサインイン」）。Appleは、実機の実際のトークンで確かめる（7.3）。
    ハッシュされて返るなら、Worker側も同じ処理をして比べる。

**セッション**

-   不透明なランダム値（JWTにしない）。D1の `sessions` にはハッシュだけを置き、端末は SecureStore に持つ。
-   期限は、最後の利用から90日（目安）。最後の利用の時刻は、前回の更新から24時間以上たったときだけ書く
    （毎回書くと、書き込みの上限を消費する）。
-   ログアウトは、そのセッションの行の削除。アカウントの削除は、そのユーザーの全セッションの削除。
-   iOSのSecureStore（Keychain）は、アプリを削除しても残りうる（保証はされない。Androidは消える）。再インストール
    すると、ローカルDBは空なのに、セッションだけ生きている状態になる。そこで、ローカルDBを新しく作ったとき
    （初回起動）に、保存済みのセッションを捨てる。これだけでは、空のローカルからのPublishで公開内容が空に
    置き換わるのは防げない（再インストール後の正規のログインでも起きる）ので、Publish側の保護を「実装時に決めること」に置く。

**アカウントの削除とAppleのトークン失効**

-   削除は、アプリでの再認証を挟む。本人確認と、取り返しのつかない操作の確認を兼ねる。
-   Sign in with Appleのユーザーは、再認証で得たauthorization code（1回限り・5分有効）を、削除のAPIの中で
    同期して `/auth/token` で交換し、得たトークンを `/auth/revoke` で失効させる。リフレッシュトークンはD1に保存しない。
-   **再認証のIDトークンの `sub` が、削除するアカウントの `identities` の行と一致することを、必ず確かめる。**
    確かめないと、別のAppleアカウントで再認証しても削除が通る。
-   Appleの資格情報が失効していて再認証できないときは、失効を省いて削除を進められる（Appleの案内は、失効を
    「すべき」とするもので、削除を難しくしないことが優先）。ユーザーが再認証を取りやめた場合は、削除しない。
-   `client_secret`（ES256のJWT）は、Workerがリクエストごとに、Sign in with Appleの秘密鍵（`.p8`。Workerのsecret）
    で署名する。`exp` は最大6か月先までなので、短く取り、定期的な再生成は要らない。

**Appleのサーバー間通知**

-   `consent-revoked`（アプリとの連携の解除）と `account-deleted`（Appleアカウントの削除）を受けるエンドポイントを
    持つ（Appleが使うよう案内している。7.3）。署名（JWS）・`iss`・`aud` を確かめてから処理する。
-   単位は、そのApple IDの `identities` の行。`consent-revoked` は、その行から作ったセッションを失効させる。
    `account-deleted` は、その行とそのセッションを消し、ほかのIDが残っていなければ、アカウントごと（R2の
    スナップショットも）削除する。
-   同じ通知が2回届いても、結果は変わらない。その行の最後のサインインより前の `event_time` の通知は無視する。

**AndroidのAppleログイン（Web経由）**

AndroidにはAppleのネイティブのサインインが無いので、Appleの認可のWebのフロー（`appleid.apple.com/auth/authorize`）を
ブラウザで開く。

-   アプリは、まず乱数の検証用の値 `V` を作り、そのハッシュ `C = SHA-256(V)` を `POST /auth/nonce` に送って、
    署名つきの値 `T`（乱数・期限・種別 `web`・`C` をWorkerの秘密鍵でHMAC署名したもの。D1に書かない）を受け取る。`V` と `T` は、
    フローが終わるまで SecureStore に置く（ブラウザを開いている間にアプリが終了しても続けられるように）。
-   アプリは、`client_id` にServices ID、`redirect_uri` にWorkerのコールバック
    （`https://singfolio.app/auth/apple/callback`。`auth` は予約語なので、`username` のURLと衝突しない）、
    `response_type=code`、`state` と `nonce` に `SHA-256(T)`（同じ値）を付けて開く。名前とメールは要求しない
    （スコープなし）ので、`response_mode=query` でよい（スコープを要求すると `form_post` が必須になる）。
-   Appleは、コールバックへ `code` と `state` を付けて戻す（取りやめたときは `error=user_cancelled_authorize`）。
    コールバックは、アプリのURLスキームへリダイレクトして、アプリに戻す（Androidはこの形で戻すよう、Appleが案内
    している）。**戻り先のURLスキームは、Workerに固定で持ち、リクエストのパラメータからは決めない**（オープン
    リダイレクトにしない）。渡す `code`・`state`・`error` はURLエンコードする。保存せず、自前のコードではログに出さない。
    Cloudflareのリクエストのログ（Workers Logs・Logpush）は、有効にするとき、クエリが記録されるかを確かめる
    （記録されても、`V` が無いと使えないので、実害は小さい）。
-   アプリは、戻ってきた `state` が、自分が置いた `SHA-256(T)` と同じかを確かめてから、`code`・`T`・`V` をWorkerへ
    送る（他のアプリがリダイレクトで押し込んだ `code` を送らないため）。Workerは、`T` の署名と期限を確かめ、
    `SHA-256(V)` が `T` の中の `C` と一致することを確かめてから、`/auth/token` で交換し（`client_id` はServices ID、
    `redirect_uri` が必須）、得たIDトークンを検証する（`aud` はServices ID、`nonce` が `SHA-256(T)` と一致）。
    以降はiOSと同じ。交換で得るリフレッシュトークンは保存しない。Workerは `state` を見ない（`T` から決まるので）。
-   削除のときの再認証も、同じフロー（同じ `V`・`T` の結びつけ）で `code` を得て、交換し、失効させる。
-   **横取りの対策。** Androidでは、同じカスタムURLスキームを登録した別のアプリも、リダイレクトを受け取れる
    （RFC 8252 §8.1）。横取りされた `code` と `state` だけでは、`T` も `V` も無い（`state` は `T` のハッシュ）ので、
    Workerは受け付けない。AppleのAPIにはPKCEのパラメータが無いので、`T` に結びつけた `V` で、PKCEと同じ役割を
    持たせる。`code` がブラウザの履歴などに残っても、使えない。横取りした側が、自分の `T'`・`V'` を付けて、横取りした
    `code` を送ると、最初の照合は通り、`code` が交換で使われてから、IDトークンの `nonce`（本来の `T` のハッシュ）が
    合わずに弾かれる。乗っ取りにはならないが、本来のログインは失敗する（やり直せば済む。IDトークンは交換の後でしか
    手に入らないので、構造上、避けられない）。検証済みのApp Links（`assetlinks.json`）で戻す形は、追加の強化として検討できるが、これだけには
    頼らない（RFC 8252 は、httpsの戻りも「横取りされにくい」にとどめ、PKCEの併用を勧めている。Custom Tabの
    リダイレクトからアプリが開くかは未確認）。
-   Appleの資料は、アプリに戻す前に、サーバーへ保存すると書いているが、ここでは保存しない。`V` の結びつけで、横取りされた
    `code` が使えないので、保存して守る必要がない。コールバックで `code` を交換する形にすると、アプリへ渡すための
    一時保管（D1への書き込み）が、認証の要らない経路に要る。
-   採った形でも、`code` を受け取るエンドポイントは、認証なしで呼べる。`/auth/nonce` で誰でも `T` を得られるので、
    でたらめな `code` を付けて、Appleの `/auth/token` を呼ばせられる（Appleのスロットルの条件は資料に書かれていない）。
    そこで、このエンドポイントにも、`/auth/nonce` と同じレート制限を掛ける。iOSのネイティブとGoogleは、ログインで
    Appleへ問い合わせない（公開鍵の取得だけ）ので、これはAndroidのAppleログインに固有の費用。
-   `T` には種別（`native` と `web`）を入れて署名する。`web` の `T` は `C` を含み、`native` の `T` は含まない。
    Android用のエンドポイントは `web` の `T` だけ、iOSのネイティブとGoogleのエンドポイントは `native` の `T` だけを
    受け付ける。`C` の無い `T` では `V` の照合が飛ばされるので、取り違えを許さない。
-   IDトークンの `aud` は2種類になる（iOSのネイティブはバンドルID、AndroidのWebはServices ID）。Workerは両方を受け入れ、
    失効は、そのトークンを得たときの `client_id` で行う。
-   Services IDは、アプリのApp ID（primaryのApp ID）と同じグループにし、`singfolio.app` と、コールバックのURLを、
    Services IDの設定（Website URLs）に登録する。Appleの手順は、ドメインの検証ファイルのアップロードは要らない、と
    している。画面で検証を求められるかは、7.3の最初に確かめる。サーバー間通知のエンドポイントは、primary App IDに
    登録し、このグループで1つ（TLS 1.2が要る）。
-   `sub` が、iOS（バンドルID）とAndroid（Services ID）で同じになるか。同じグループなら資格情報は共有される
    （Appleの資料）が、実際のトークンで確かめる（7.3）。違うと、Appleでの、OSをまたぐ引き継ぎはできない。

**Googleのサインイン（iOS・Android）**

Googleの公式SDKだけを使う、自作の薄いExpoモジュールで実装する。モジュールの口は `signInWithGoogle(nonce)` の
1つで、IDトークンの文字列を返す（キャンセルや失敗は、コードの付いたエラーにする）。第三者のラッパーのライブラリは
使わない。Androidでは、アカウント選択のシートを、アプリの上にそのまま出せる（Credential Manager）。画面・Service
から、SDKの呼び出しやレスポンスの形に触れないよう、Repository / Service境界の内側に閉じ込める。

-   iOS: GoogleSignIn。`signIn(withPresenting:hint:additionalScopes:nonce:)` に `nonce` を渡す。Info.plistに、
    iOSのクライアントID（`GIDClientID`）、サーバー用（Web）のクライアントID（`GIDServerClientID`。IDトークンの
    `aud` になる）、反転したiOSのクライアントIDのURL schemeを置く。IDトークンを取ったら、すぐに `signOut()` を呼び、
    Googleの状態を端末に残さない。
-   Android: Credential Managerの `GetSignInWithGoogleOption`（サーバー用のクライアントIDを指定し、`setNonce`）。
    AndroidのクライアントIDはコードに現れず、パッケージ名と署名のSHA-1で、Google側が照合する（鍵ごとに登録が要る:
    ローカルのビルド、EASのlocal build、Play App Signing）。
-   クライアントIDは3つ（Web・iOS・Android）。秘密情報ではない（アプリに埋め込まれる）。Webクライアントの
    `client_secret` は使わない（Workerは、IDトークンをGoogleのJWKSで検証するだけ）。
-   確かめたこと（iOS SimulatorとAndroidエミュレータで、実際のトークンを使った）:
    -   IDトークンの `nonce` は、渡した値（`SHA-256(T)` の43字）そのまま。
    -   `aud` は、iOSもAndroidも、Web（サーバー用）のクライアントID。Workerは、これを `aud` として受け入れる。
    -   `azp` は、OSごとに違う（iOSはiOSのクライアント、AndroidはAndroidのクライアント）。Workerは、`azp` を
        `aud` と同じかどうかでは見ない。
    -   IDトークンに、`email`・`name`・`given_name`・`picture` も入る。SDKの側で、減らす手段は見つからなかった
        （iOSのSDKは、基本のプロフィールのスコープを常に要求し、追加できるクレームは `auth_time` と `amr` だけ。
        Androidの `setClaims` も、追加の指定と見ているが、効き方は未確認）。アプリは、これらを使わず、`sub` だけを
        使う。Workerは、受け取ることは避けられないので、ログにも保存にも出さない（「認証」）。
    -   ログイン中のログ（iOSのアプリのプロセス、Androidのlogcat）に、トークンらしい文字列は、検証した範囲では
        見つからなかった。iOSは、ログイン後に、Googleの状態が端末のキーチェーンに残らない。
    -   キャンセルは、Androidと、iOS（GoogleSignIn 9.2.0）で、キャンセルを表すエラーになる。iOSの10.1.0での
        キャンセルと2回目のログインは、まだ確認していない。
-   実装の制約:
    -   iOSは、GoogleSignInの版を固定する（確認したのは10.1.0）。Swiftの依存（AppCheckCore）のために、Podfileで
        GoogleUtilitiesとRecaptchaInteropにmodular headersを指定する（外すと `pod install` が失敗する。config pluginで入れる）。
    -   Androidは、googleidを1.2.0に固定する。最新の1.2.1は、Kotlin 2.4のメタデータで、Expo SDK 57のKotlin 2.1.0
        ではコンパイルできない。依存に、Play services（alpha版を含む）が入る。
    -   Androidの依存が足す `USE_BIOMETRIC` と `USE_FINGERPRINT` は、`blockedPermissions` で外す（外してもログインは動く）。
    -   Androidは、2回目以降のログインでも、アカウント選択と確認の画面が出る。ログアウトで `clearCredentialState` を
        呼ぶかは、7.3で決める。
-   7.3で決着が要ること: Googleの同意画面（OAuthの公開状態とブランド）、ストアの申告とプライバシーポリシー
    （SDKのプライバシーマニフェストが、利用状況などの収集を宣言している。そのときの版のマニフェストを読み直して決める）、
    Androidの依存（Android Software Development Kit Licenseで配布される）の、ライセンス一覧への載せ方。

**アカウントのつなぎ方**

-   ログイン手段は、**iOS・Androidとも、AppleとGoogle**。OSをまたいで移る人が、どちらのOSでも同じ手段で入り、
    アカウントと配ったURLを引き継げる（iOSは、App Store Review Guidelines 4.8により、Appleを同等に並べる）。
    ローカルのレパートリーは端末内で、OSをまたいで移らない。
-   `identities` で、ログイン済みの状態から、別のIDをつなげられる。**すでに別々に作った2つのアカウントを、1つに
    まとめることはできない**（`username`・スナップショット・Requestが2つあり、別の機能になる）。

### 技術検証と残課題

ローカルの実行環境（デプロイなし）で、次を確かめた。

-   Publish API。スナップショットの差し替えと、公開しない項目（My Key・Private Noteなど）が、送られてきても
    保存されないこと
-   公開ページ（`/username`）を、R2のスナップショットだけから表示すること
-   所有者以外による更新の拒否。usernameの横取り、他人のRequest一覧の閲覧、未ログインと改ざんされた
    セッションを拒否すること
-   Requestの受付。Turnstile・レート制限・未公開の曲IDの拒否と、所有者がアプリから一覧を取れること
-   D1が使えない状態でも、公開ページが最後のPublishのまま表示できること
-   Apple / GoogleのIDトークンの検証。模擬の発行元で、署名・発行者・対象・期限の拒否を確認し、Googleの
    公開鍵は本物で取得できること

実装前に確かめること（デプロイとアカウントが要る）。次は確かめ済み：

-   本番のWorkersから、Appleの公開鍵（JWKS）を取得できる。ローカルの実行環境では拒否されたが、本番のWorkers
    （1か所のデータセンターから6回）では、いずれも取得できた（Googleの公開鍵も同様）。実装時は、取得の失敗に
    備えた扱い（キャッシュ・再試行）を決める。取得に支障が出るようなら、鍵を自前で控える。
-   `singfolio.app` は取得済み（Cloudflare Registrar）。ドメインがCloudflareにあるので、載せ替えは要らない。
-   Googleのサインインの `nonce` と `aud`。iOS SimulatorとAndroidエミュレータで、実際のトークンを使って確かめた
    （「Googleのサインイン」）。実機と、署名したビルドでの確認は、7.3の中で行う。

残り：

-   Freeプランで一定期間アクセスがない状態から、手動の操作なしで再アクセスできるか（D1はscale-to-zeroとして
    提供されているが、実環境での確認は未実施）。検証用のWorkerとD1をデプロイして、放置している。

nonce・セッションの失効・Appleのトークン失効の方式は、「認証の方式」に決めた。次は、7.3の最初に、実機・実際の
トークンで確かめる：

-   AppleのIDトークンの `nonce` が、渡した値そのままか。
-   AppleのIDトークンの `sub` が、iOS（バンドルID）とAndroid（Services ID）で同じになるか（「AndroidのAppleログイン」）。
-   Services IDで得たトークンを失効させたとき、同じグループのiOS（バンドルID）側の連携も取り消されるか（Appleの設定画面に
    連携が残って見えないか）。残るなら、削除の要件は満たせるが、ユーザーに案内を出すか決める。
-   AndroidのWebのフロー全体。Custom Tabからコールバック、アプリのURLスキームへのリダイレクトが続くか。
    `nonce`・`state`（43字）が、Appleにそのまま受け付けられ、返るか。

実装時に決めること：

-   端末側のPublishの状態（「3 unpublished changes」の数え方のために、何を端末に持つか）。
-   D1の版の用途。端末の「公開済み」の判定に使うか、複数の端末のPublishの衝突の検知に使うか。
-   複数の端末から同じアカウントでPublishしたときの扱い（端末ごとのローカルDBなので、後勝ちで全体が
    差し替わる。版で衝突を検知するか）。再インストール後・別の端末で、空のローカルから最初にPublishして、
    公開内容を空で置き換えない保護（Publish前に確認を出す、版が合わなければ止める、など）も同じ問題。
-   サインイン済みの状態から、もう一方のID（AppleにGoogleを、GoogleにAppleを）をつなぐ画面を、v1で用意するか。
    OSをまたぐ引き継ぎには要らない（どちらのOSでも、AppleとGoogleのどちらでも入れる）。両方で入りたい人のため。
-   `username` の変更の可否（§8「バックエンドが担当すること」）。
-   アカウント削除後の `username` の再利用。削除でD1の行を消すと名前が解放され、配ったURLやQRコードが
    別の人のページを指しうる。再利用させない案では、名前だけを、ユーザーIDと結びつけずに残す
    （プライバシーポリシーに書く）。
-   大文字や末尾のスラッシュ付きのURL（`/Yskms` など）の扱い。R2のキーは大文字と小文字を区別するので、
    そのままでは404になる。小文字の正規のURLへリダイレクトする案。
-   削除・Unpublishの反映の遅れ。公開ページにキャッシュを掛けると、R2から消してもしばらく表示が残る。
    キャッシュを掛けるなら、削除時にパージする。許容する遅れの長さも決める。
-   検索エンジンへのインデックスの可否（`noindex` にするか）。削除したページが検索結果に残るのは、
    パージできる範囲の外。
-   Unpublish後の、受信済みのRequestの扱い（残す案。§6）。
-   所有者がRequestを削除・拒否する手段（不適切なニックネームへの対応を含む）。
-   レート制限のキー（IPアドレスを使うか。使う場合も保存しない案を基本とし、プライバシーポリシーに書く）。
-   公開対象のタグの選び方（§3）。

### 外部の楽曲検索の結果を公開する際の扱い

候補検索の結果から入力した曲名・アーティスト名を、公開プロフィールに載せる際の扱いは、
公開機能の着手時に確認する（候補を選んだ曲かどうかは保存していないため、Publishの
仕組みには影響しない）。

### バックエンドが担当すること

以下を担当する。

-   Authentication
-   Database（D1）
-   Public Profile
-   Published Songs（R2のスナップショット）
-   Requests
-   API

想定するデータ：

``` text
D1
  users        アカウント
  identities   ログイン手段（Apple / Google。1ユーザーに複数をつなげられる）
  sessions     セッション（トークンのハッシュ。失効できる）
  used_nonces  使用済みのnonce（リプレイを弾く。期限を過ぎたものは消す）
  profiles     username・Display Name・Bio・スナップショットの版
  requests     Request（曲ID・曲名・アーティスト名・ニックネーム・日時）

R2
  public/{username}.json   公開スナップショット（プロフィール + Readyの曲の一覧）。ユーザーごとに1オブジェクト
```

曲ごとの行（`published_songs` など）はD1に作らない。Requestを受けるときの曲の確認も、スナップショットを引いて行う。

R2のキーは `username`（小文字の英数字と `_`、3〜20字）から作る。公開ページとRequestの受付は、`username` から
R2のキーを直接引き、D1に触れない。キーをユーザーIDにすると、`username` からの検索にD1が要り、「公開ページは
D1に触れない」が成り立たない。

`username` の一意性は、D1の `profiles.username`（UNIQUE）だけが保証する。`username` は、最初のPublishより
前に、D1で確保する。予約語（`api`・`auth`・`me` などのAPIのパスと、紹介ページの最上位のパス（`images` など））は
取れないようにする。紹介ページの最上位のパスが効くのは、紹介ページを `singfolio.app` の最上位へ移す場合だけ
（今は別のURLにある）。

`username` を変更できるようにするなら、R2のオブジェクトの付け替え（新しいキーへ書き、古いキーを消す）と、
旧URLの扱いが要る。検証では、変更を許さない形で確かめた。変更の可否は未定。

v1.0では導入しない。公開プロフィール機能を実装する段階で導入する。

### Cloudflare

API（Workers）・公開Webのホスティング・公開スナップショット（R2）の配信に利用する。

``` text
singfolio.app/username
```

Webは公開情報のみを取得して表示する。

## 9. 実装順序

版番号は実装順序の目安であり、時期の約束ではない。

### v1.0

-   React Native / Expo
-   SQLite
-   Songs（Practice・Want はそのステータス）
-   Show Mode
-   Profile / Settings
-   Light / Dark Mode
-   English / Japanese
-   曲名・アーティスト名の候補検索

保存・管理は端末内で完結する。外部への通信は候補検索だけで、通信できなくても全機能を使える。

### v1.x

-   バックエンド選定（技術検証。済み。§8）
-   実装前に確かめること（§8）
-   認証（Apple / Google）
-   Public Profile
-   Auto Publish
-   Public Web
-   Cloudflare（Workers・D1・R2）

### v2.0

-   Requests（所有者は、アプリ内の一覧で受け取る。Webの受信箱とプッシュ通知は対象外）
-   未登録曲へのRequest
-   Request → Want / Practice

## 10. v1.0で準備しておくこと

公開機能そのものは実装しないが、後から追加しやすい構造にする。

-   Song IDはUUIDを使用
-   LocalデータとPublicデータを分離できる設計
-   Private Note等を公開モデルへ含めない
-   UIとDBを密結合させない
-   将来の同期処理を追加できるRepository / Service構造を意識する
-   バックエンドへの通信（HTTP）はRepositoryに閉じ込め、画面・ServiceからURLやレスポンスの形に
    触れない（公開機能はService境界の内側に閉じ込められる構造にする）

ただし、将来機能のためのバックエンド導入・認証・同期処理などをv1.0へ先行実装しない
（候補検索の外部通信は、これらとは別。Repository / Service境界の内側に閉じ込める）。

## 11. 原則

**Local First** --- アプリ本体はネットワークなしでも利用可能にする。

**Private by Default** ---
外部へ送信するのは、次の2つだけ。

-   公開対象として明示された情報（公開機能。サーバーへ送信する）
-   曲名・アーティスト名の候補検索のために、入力欄に打った検索語（外部の楽曲検索へ送る。
    設定でオフにでき、提供元を候補の欄に表記する）

My Key・Private Note・タグ・端末内の曲の一覧は、どちらにも含めない。

**No App Required for Viewers** ---
公開Singfolioを見る人にはアプリのインストールやアカウント登録を要求しない。

**Simple Publishing** --- 公開する本人だけがアカウントを必要とし、Auto
Publishを利用すれば普段は公開操作を意識しなくてよい。
