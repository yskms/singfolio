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
-   `T` をそのまま渡さずにハッシュを渡すのは、`T` が長いため（実測で `native` は91字、`web` は131字）。Appleの `nonce` の
    長さの上限は資料に書かれておらず、生のまま渡すと、上限に当たったときに設計を戻すことになる。
-   **`POST /auth/nonce`**（実装済み。`worker/src/auth.ts`・`worker/src/nonce.ts`）。ログインの前に呼ぶので認証は無く、D1に触れない。
    -   リクエスト: JSON。`{"kind":"native"}`、または `{"kind":"web","challenge":"<C>"}`（`C` は `SHA-256(V)` の base64url、43字）。
        `native` に `challenge` を付けたものは弾く（取り違えを見逃さないため）。本文は1KBまで。上限は、`Content-Length` の宣言を
        当てにせず、読みながら数えて、超えた時点で読むのをやめて413にする（`request.text()` は本文を全部メモリに読む。chunkedや、
        数値でない `Content-Length` では宣言が無い・でたらめで、Freeの本文の上限は100MB、Workerのメモリは128MB）。
    -   レスポンス: 200 `{"nonce":"<T>","expiresAt":<ミリ秒>}`、`Cache-Control: no-store`。期限は発行から5分。エラーは、
        400（本文の不備。`{"error":"invalid_request"}`）、405（`POST` 以外。`Allow: POST`）、413（本文が大きい）。
        HTTPSでないリクエストは403（「Workerの構成と運用」の「HTTPS」）。
    -   `T` の形は `v1.<kind>.<expiresAt>.<random>.<C>.<signature>`（`.` 区切りの6つ。`native` では `C` が空）。`random` は16バイト、
        `signature` は先頭から `C` までの HMAC-SHA256（鍵は `NONCE_HMAC_KEY`）。アプリは `T` の中身を解釈せず、不透明な値として扱う。
    -   検証（`verifyNonce`）は、署名 → 種別 → 期限の順で、D1に触れない。種別が違う `T` は、署名が正しくても拒否する。
        署名は、復号した値を再エンコードして一致しない表記も拒否する（署名の最後の字は下位2ビットが余りで、そこだけ違う
        別の表記も、同じバイト列に復号されて検証が通ってしまう。1つの `T` を1通りの文字列に保つ）。
    -   使用済みの記録（`consumeNonce`）は別の関数で、IDトークンの `nonce` が `SHA-256(T)` と一致したあとに呼ぶ。1回目は `true`、
        2回目以降は `false`。期限を過ぎた記録は、同じバッチ（トランザクション）の中で消す。
-   発行のたびにD1へ書かない理由: D1のFreeは、書き込みが10万行/日で、INSERT・UPDATE・DELETEと索引の書き込みが
    数えられ、超えるとその日（UTCの0時まで）D1へのクエリが止まる。認証の要らないエンドポイントが書き込むと、
    それが上限を使い切る経路になり、ログイン・Publish・Request受付が止まる。ログイン前の経路は、D1に書かない。
-   使用済みの記録のうち、期限を過ぎたものは、ログインの処理の中で消す（Cron Triggerは使わない。Freeでも使えるが、
    動く部品を増やさない）。
-   IDトークンの `nonce` が、渡した値（`SHA-256(T)`）そのままか（さらにハッシュされていないか）。Googleは、
    そのまま返ることを確かめた（「Googleのサインイン」）。Appleは、実機の実際のトークンで確かめる（7.3）。
    ハッシュされて返るなら、Worker側も同じ処理をして比べる。

**IDトークンの検証**（実装済み。`worker/src/idToken.ts`・`worker/src/identity.ts`）

-   検証は jose の `jwtVerify`（Workerの実行時の依存は jose だけ。依存を持たず、MIT。版は固定する）。署名・`iss`・`aud`・`exp` は
    jose に任せ、自前で持つのは、公開鍵の取得とキャッシュ、jose が既定では見ない点（下）、`nonce`、失敗の分類だけ。
-   **受け付ける条件。** どれか1つでも欠けたら拒否する。
    -   `alg` は RS256 のみ（AppleもGoogleもRS256）。`none` と、公開鍵を共通鍵として使う `HS256` を拒否する。
    -   `kid` が必須。joseは、`kid` が無いトークンを「合う鍵が1本だけ」のときに、その鍵で検証してしまう（鍵の本数で挙動が変わる）。
        鍵の取得より前に弾く。
    -   `iss`: Appleは `https://appleid.apple.com`、Googleは `https://accounts.google.com` か `accounts.google.com`。
    -   `aud`: `T` の種別とログイン手段で**1つに決める**（`audienceFor`）。Apple の `native` はバンドルID、Apple の `web` は
        Services ID、Google の `native` はサーバー用（Web）のクライアントID。Google の `web` は無い（拒否）。値は `wrangler.jsonc` の
        `vars`（秘密情報ではない）。
    -   `exp` と `sub` が必須。**jose は `exp` の無いトークンを、期限なしとして通す。** `requiredClaims` で必須にしている。`sub` は
        1〜255字の文字列（Googleは最大255字、Appleは約44字）。
    -   `nbf` は、あれば見る。時計のずれは30秒まで許す（`exp` と `nbf` の両方に効く）。
    -   `nonce` は、`SHA-256(T)` と一致する文字列（無い・文字列でない場合も拒否する。Appleの `nonce_supported` が偽のときなど）。
    -   `azp` は見ない（「Googleのサインイン」）。`email`・`name` などは使わない。
-   **結果にクレームを載せない。** 返すのは `sub` と、失敗の理由だけ。jose の `JWTClaimValidationFailed` は `payload`（クレームの全体）を
    持つので、捕まえたら理由だけを取り出して捨てる。トークンの全文もログに出さない（「認証」）。
-   **失敗の理由**（`malformed`・`signature`・`unknown_key`・`issuer`・`audience`・`expired`・`claims`・`nonce`・`unavailable`）。呼ぶ側
    （7.3.5のログイン）は、`unavailable`（公開鍵を取得できず、使える古い鍵も無い。トークンの問題ではない）だけを503にし、残りは
    同じ401にして、どの検査で落ちたかを教えない。
-   **公開鍵（JWKS）。** 取得先はAppleが `https://appleid.apple.com/auth/keys`、Googleが `https://www.googleapis.com/oauth2/v3/certs`。
    ログイン手段ごとに、Workerのisolateのメモリにキャッシュする（KV・Cache APIは使わない。取り直すのは、isolateの起動直後と
    1時間ごとだけで、ログインは頻繁ではない）。
    -   取得は GET、認証情報なし、リダイレクトには従わない（200以外は失敗）、5秒でタイムアウト。再試行はしない（アプリがやり直す）。
    -   **1時間**は取り直さない。過ぎたら、次の検証で取り直す。
    -   取り直しに失敗しても、取得から**25時間**（1時間 + 24時間）までは、前の鍵で検証を続ける（発行元の一時的な不調でログインを
        止めないため。鍵は公開情報で、入れ替わっても古い鍵はしばらく残る）。それを超えたら `unavailable`。
    -   **冷却は60秒。** 取得を試みてから60秒の間は、次の取得を試みない（失敗した試みも数える）。知らない `kid` を付けた偽のトークンや、
        落ちている発行元への連打が、外部への呼び出しを増やさないため（認証の要らない経路なので）。知らない `kid` は、冷却が済んでいれば
        1回だけ取り直す（鍵の入れ替えに追いつくため）。前の鍵が無いときだけは、冷却に関わらず取りに行く。
    -   **取得中の Promise を、リクエストをまたいで共有しない**（同時の取得を1つにまとめない）。workerd は、別のリクエストの入出力を
        待つことを許さない。共有するのは、取得し終えた鍵（データ）だけ。jose の `createRemoteJWKSet` を使わないのは、取得に失敗した
        とき前の鍵に落ちられないため。
    -   取り直しの失敗は、ログに出さない（Workers Logs は無効。失敗が続くと、鍵が古いまま気づかれずに過ぎる点は、分かって受け入れる。
        25時間を超えると、ログインが `unavailable` になって表に出る）。
-   **ログイン手段の引き当て**（`resolveIdentity(db, provider, sub, now)`）。`(provider, sub)` から `identities` を引き、無ければ
    `users` ごと作る。1つのバッチで行う（引いてから作る形を2回のクエリに分けると、同じ人の同時の初回ログインで、一意制約に当たるか、
    `identities` の無いユーザーが残る）。引いたときも作ったときも `last_sign_in_at` を進める（時計が戻る値は書かない）。
    **`provider` が違えば、`sub` が同じでも別のユーザー**（自動ではつながない。「アカウントのつなぎ方」）。保存するのは `provider` と
    `sub` だけ。
-   **ログインの処理の順序**（7.3.5）: `verifyNonce`（署名・種別・期限。D1に触れない）→ IDトークンの検証（`nonce` が `SHA-256(T)` と
    一致するところまで）→ `consumeNonce`（使用済みの記録）→ `resolveIdentity` → セッションの発行。D1に書くのは、前の2つが通ってから。
    `consumeNonce` のあとにD1が失敗しても、`T` は使い切りになる（アプリが新しい `T` で、やり直す）。
-   確かめたこと: 模擬の発行元（テスト用のRSA鍵とJWKSを返す fetch）で、上の拒否の条件とキャッシュの動きをテストした。本物のApple・Googleの
    JWKSを、Node から取得して読めることを確かめた（鍵の形は、どちらも `kty: RSA`・`alg: RS256`・`use: sig`・`kid` 付き）。workerd
    （`wrangler dev`）で、模擬のJWKSとローカルのD1に対して、検証と `resolveIdentity` が動くことを確かめた。本物のトークンでの確認は、
    7.3.7（Apple）と 7.3.8（Google）。

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
-   IDトークンの `aud` は2種類になる（iOSのネイティブはバンドルID、AndroidのWebはServices ID）。Workerは両方を受け入れるが、
    `T` の種別で1つに絞る（`native` はバンドルID、`web` はServices ID。「IDトークンの検証」の `audienceFor`）。失効は、そのトークンを
    得たときの `client_id` で行う。
-   Services IDは、アプリのApp ID（primaryのApp ID）と同じグループにし、`singfolio.app` と、コールバックのURLを、
    Services IDの設定（Website URLs）に登録する。Appleの手順は、ドメインの検証ファイルのアップロードは要らない、と
    している。実際に、Services IDの登録と設定（Website URLsの保存）で、画面は検証ファイルを求めなかった。
    サーバー間通知のエンドポイントは、primary App IDに
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
-   Googleの同意画面を「本番環境」にするには、アプリ名・サポートメールのほかに、**ホームページのURLとプライバシー
    ポリシーのURL**が要る（Google Auth Platformの画面で確認した）。Googleの資料では、ホームページは「検証済みの、
    自分が所有するドメイン」に置き、プライバシーポリシーは同じドメインに置いて、ホームページからリンクする。
    `yskms.github.io` がこの条件を満たすかは、資料に書かれていない。ロゴを付けない間は、同意画面にはアプリ名では
    なくドメインが出る（ブランドの確認を受けるまで）。「テスト中」の間は、テストユーザーだけが入れる、と画面に出る。
    基本のスコープ（`openid`・`email`・`profile`）だけなら、テストユーザーでなくても入れて警告も出ない、とGoogleの
    資料にあるが、「テスト中」に当てはまるかは読み取れておらず、未確認（7.3.13で、テストユーザーでないアカウントで確かめる）。

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
    （1か所のデータセンターから6回）では、いずれも取得できた（Googleの公開鍵も同様）。取得の失敗に備えた扱い
    （キャッシュ・前の鍵での継続・冷却）は、決めて実装した（「IDトークンの検証」）。取得に支障が出るようなら、
    鍵を自前で控える。
-   `singfolio.app` は取得済み（Cloudflare Registrar）。ドメインがCloudflareにあるので、載せ替えは要らない。
-   Googleのサインインの `nonce` と `aud`。iOS SimulatorとAndroidエミュレータで、実際のトークンを使って確かめた
    （「Googleのサインイン」）。実機と、署名したビルドでの確認は、7.3の中で行う。
-   Freeプランで12日間アクセスがない状態から、手動の操作なしで再アクセスできた。検証用のWorkerとD1を置いて
    放置し、12日後の最初のリクエストで、WorkerがHTTP 200で応答し（curlの所要は約0.7秒、うちD1のクエリは
    約350ms。直後の2回目のD1のクエリは約20ms）、置いておいた1行も残っていた。D1への書き込みも通った
    （この書き込みは、Workerを通さず、`wrangler` から直接行った）。確かめたのは、1つのWorkerと1つのD1の、
    12日間の放置だけで、それより長い放置と、複数のデータセンターでは未確認。

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
-   レート制限が何を守るか、と、そのキー（IPアドレスを使うか。使う場合も保存しない案を基本とし、プライバシーポリシーに書く）。
    先に、守るものを切り分ける。**決定（2026-11-15）: `POST /auth/nonce` には、Workerの中のレート制限を入れない。** このエンドポイントは
    D1に書かず、1回の呼び出しの費用はHMACの計算だけで、外部サービスも呼ばない（乱用で増える費用が無い）。日次のリクエスト上限は、まず残る
    リスクとして受け入れる。WAFのRate limiting rules（1ルール）は実測した（下）。
    乱用の費用が生じる経路（7.3.9 のAppleのトークン交換を呼ぶコールバックなど）で、あらためて決める。
    -   **乱用の抑止**（AndroidのAppleログインのコールバックが、Appleの `/auth/token` を呼ぶ費用など）。Workerの中で足りる
        （Workers の Rate Limiting API）。カウントは拠点ごとで、近似・結果整合のため、全世界での厳密な上限にはならない。
        `period` は10秒か60秒。キーは任意の文字列で、資料はIPアドレスを勧めていない（共有のIPがあるため）。キーが
        保存・記録されるかは書かれていない。Freeプランで使えるかも書かれていない（デプロイして確かめる）。
    -   **Freeの日次のリクエスト上限（10万件/日。UTCの0時にリセット）を使い切られるのを防ぐ。** Workerの中のレート制限では
        防げない。弾くのもWorkerの起動なので、数えられる（資料は「Workerに届いたリクエストだけが、上限と請求に数えられる」と
        書く）。超えると Error 1027 になり、ログイン・Publish・Requestの受付・公開ページが、その日は止まる。D1の書き込みの上限は
        「書かない」設計で避けられたが、リクエスト数は、どのパスへの洪水でも（存在しないパスの404でも）使い切られるので、
        `/auth/nonce` だけの対策にならない。防げるのは、Workerより前で効くもの。WAFのRate limiting rulesはFreeでも使える
        （資料: 1ルール、期間10秒、IPで数える、式はPathなどで一致）。資料は、WAFがWorkerより前に動くことも、弾いたリクエストが
        Workerに数えられないことも、明記していない（資料の段階の順序表にWorkerが無い）。
        -   **実測した（2026-11-15。「WAFはWorkerより前で効く」）。** Freeで選べる値だけで作った（条件は Path が `/auth/nonce`、
            IPで数える、3件/10秒、Block、弾く期間10秒）。同じ端末から `/auth/nonce` へHTTPSで10件を続けて送ると、1〜3件目は200、
            4〜10件目は429（本文 `error code: 1015`）だった。`wrangler tail` に出た（Workerまで届いた）のは3件だけで、弾かれた7件は
            Workerを起動していない。ルールは測定のあとで削除した。
        -   **弾いた分は、WorkerのMetricsの呼び出しに数えられない（実測。2026-11-15）。** 測定の直後に、ダッシュボードのWorkerの
            Metrics（過去1時間）で、拠点別の件数を見た。測定した端末のリクエストは大阪（KIX）に入り、KIXは5件だった。Workerまで届いた
            3件に他のアクセス2件で説明がつき、弾いた7件が加わっていれば10件以上になる。1分単位のグラフでは、測定の分が15件で、同じ
            1時間のワルシャワ（WAW）が12件だった（スキャナーの束と考えると、12 + 3 で合う）。資料の「Workerに届いたリクエストだけが
            数えられる」とも合う。残る不確かさは、Metricsの「呼び出し」が日次の上限の計数と同じかで、上限の計数そのものは画面に出ない。
            その日の合計では比べられない。ドメインには、自分の確認以外のアクセス（スキャナーなど）も来ている（ゾーンのAnalytics、
            24時間で601件・一意の訪問者122）。この量は、日次の上限（10万件）の1%未満。
        -   **効果の限界（Free）。** 弾く期間は10秒だけで、IPごと・データセンターごとに数える。1つのIPの連打は抑えられるが、
            複数のIPからの洪水は止められない。条件に使えるのはPathだけで（`starts_with` などで広く取れるかは確かめていない）、
            ルールは1つしか作れない。低いルールは自分の確認のリクエストも弾く。
        -   キーにIPを使うときは、Cloudflareが接続元のIPを一時的に扱うことを、プライバシーポリシーに書く（7.3.12）。
        もう一つの手は、Workersの有料プラン。v1の規模では、残るリスクとして受け入れる案もある。
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

### Workerの構成と運用（`worker/`）

Workerのコードは、このリポジトリの `worker/` に置く（別のリポジトリにしない。仕様のdocsとアプリ側の
Repositoryを、同じコミットで直せるため）。

-   **独立したパッケージ。** `worker/` は、自前の `package.json`・ロックファイル・tsconfigを持つ。
    npm workspacesにはしない（ルートのExpo / React Nativeの依存は、版を固定した状態を保っていて、
    hoistingで配置が変わると崩れうるため）。ルートの `tsconfig.json` は `worker/` を除外する
    （Expoの設定で型チェックしない）。アプリとコードは共有せず、リクエスト・レスポンスの形は、
    このdocsを正として、両側に書く。Metroは `worker/` も走査するが、ファイル数は約2千で、
    ルートの `node_modules`（約7万）に比べて小さく、除外の設定はしていない。
-   **環境は2つだけ。** ローカル（`wrangler dev`。D1は `worker/.wrangler/` のローカルDB）と、
    本番（`singfolio.app`）。開発用のクラウド側のWorker・D1は作らない。実機のログインの確認も、
    公開前の本番に対して行う。`workers.dev` とプレビューのURLは出さず、入口は `singfolio.app` だけ。
-   **D1のスキーマ。** `worker/migrations/NNNN_*.sql` を `wrangler d1 migrations` で適用する。
    本番へ適用したマイグレーションは書き換えず、次の番号を足す（アプリのローカルDBと同じ約束）。
    時刻はINTEGER（ミリ秒）。TEXTの主キーのテーブルは `WITHOUT ROWID` にする（ROWID付きだと、
    主キーの索引の分だけ書き込みが増え、Freeの書き込みの上限（10万行/日）に響く）。外部キーは有効で、
    `users` の行を消すと、`identities`・`sessions` も消える。Appleの `consent-revoked` は、
    `sessions` の行だけを消す（`identities` の行は残す。`last_sign_in_at` が要るため）。
    `account-deleted` は `identities` の行を消す（セッションも消える）。
    **親テーブル（`users`・`identities`）は、作り直さない。** 外部キーが有効なとき、`DROP TABLE` は
    暗黙の `DELETE` として `ON DELETE CASCADE` を発動し、子の行を消す。ローカルのD1では、
    `PRAGMA defer_foreign_keys` でも `PRAGMA foreign_keys = OFF` でも止まらなかった（バッチの中、単独の文、
    `wrangler d1 migrations apply` の3経路。OFF は、実行後も値が 1 のまま変わらない。本番では未確認）。
    「新テーブルを作る → コピー → `DROP` → `RENAME`」ではなく、`ALTER TABLE ... ADD COLUMN` などで変える。
    作り直しが避けられないときは、先にローカルのDBで、子の行が残ることを確かめてから適用する。
    テストは、同じ手順で適用したローカルDBに対して行う（`worker/` で `npm test`。ルートの
    `npm test` には含まれない）。
-   **秘密情報。** 値は、`wrangler.jsonc` にもリポジトリにも書かない。必要な名前だけを
    `secrets.required` に書く（デプロイの前に、本番に無いものを検出でき、型にも出る）。
    本番は `wrangler secret put`、ローカルは `worker/.dev.vars`（gitignore。見本は `.dev.vars.example`）。
    **最初のデプロイだけは、`wrangler deploy --secrets-file <ファイル>` で渡す。** Workerがまだ無いと、
    必須の秘密情報が足りないとして `deploy` が止まり（wranglerのソースで確認）、`secret put` は、
    空の仮のWorkerを先に作る。秘密情報のファイルは、リポジトリの外に作り、デプロイ後すぐ消す。
    形式は**JSON**（`{"NAME":"値"}`）にする。wranglerは、先にJSONとして読み、読めないときだけ `.env` 形式
    として読む（ソースで確認）。`.env` 形式だと、値の中の `$VAR` が展開され、同名の環境変数がファイルの値より
    優先される。
    2回目以降のデプロイは、設定済みの秘密情報が引き継がれる。
    `NONCE_HMAC_KEY` は32バイト以上（`openssl rand -base64 32` の44字など）。短い値や無い値は、最初の呼び出しで
    例外にする（`worker/src/nonce.ts`）。`.dev.vars.example` の見本は、置き換え忘れに気づけるよう、わざと短い。
    本番の値の長さは、デプロイ後の確認（200が返ること）で分かる。**メッセージが読めるのはローカルだけ。** `wrangler dev` は
    開発専用の仕組みで、メッセージ付きのスタックを本文に返す（500。実測）。本番は、例外がWorkerの外へ出て、クライアントには
    Cloudflareのエラーページ（Error 1101 が典型。資料は「Workerの実行時の例外で典型的に起きる」と書く）が返り、メッセージは
    応答に出ない。Workers Logs は無効なので、残りもしない。HTTPSの確認が500（1101）なら、まず鍵の長さを疑い、
    `wrangler secret put` で入れ直す。メッセージを見るなら `wrangler tail`（資料: Real-time logs は、キャッチされなかった
    例外を含み、保存はしない。Workers Logs を無効にしたままでも使えることは、実測した）を起動してから、もう一度呼ぶ
    （鍵の不足は、毎回同じように起きる）。
-   **ログ。** Workers Logs は無効にしている（`observability.enabled: false`）。Cloudflareの資料は、
    記録に含まれるヘッダー（`Authorization` など）と、`invocation_logs` を無効にしたときの
    `console.log` のメタデータを書いていない。セッションの値をヘッダーで送るため、確かめずに有効にしない。
    有効にするときは、実際に記録された内容を見て、認証の値（セッション、nonce、Appleのコールバックの
    `code`・`state`、IDトークン）が含まれないことを確かめる。`redact_query_string: true` は、有効にされた
    ときの安全弁（クエリを記録から外す）。自前のコードも、認証の値をログに出さない。方針は
    `worker/test/config.test.ts` が固定している（`worker/` で `npm test`。ルートの `npm test` には含まれない）。
-   **HTTPS。** Workerは、HTTPSでないリクエストを、本文を見る前に403で拒否する（リダイレクトしない。
    `worker/src/https.ts`。`fetch` の最初で呼ぶ）。「Always Use HTTPS」（ゾーンの設定）には頼らない。理由：
    -   Workerが404しか返さない状態の本番で実測した（2026-11-14）。`http://singfolio.app/` は、Workerにそのまま届いて、
        平文で404を返した（リダイレクトも `Strict-Transport-Security` も無い）。
    -   Cloudflareの資料は、Always Use HTTPS がWorkerより先に効くかを書いていない。ゾーンの設定はリポジトリの外にあり、
        コードとテストで固定できない。
    -   リダイレクトは、最初の1通（`Authorization` や、クエリの `code` を含みうる）が平文で出たあとの話で、秘密を守れない。
        拒否なら、Workerは中身を処理せず、呼んだ側も気づく。
    -   アプリの側は、リリースビルドでHTTPを出せない（確かめた）。iOSのATSは、URLローディングシステム（典型的には
        `URLSession`）のHTTP接続にHTTPSを要求する（Appleの資料。生成された `Info.plist` は `NSAllowsArbitraryLoads` が
        `false`）。Androidは、API 28以上を対象にしたアプリの既定が平文通信の禁止（Androidの資料）で、main manifestに許可は無く、
        許すのはdebug用のmanifest（Metro用）だけ。`.app` は、Chromiumのpreloadリストで `force-https`・
        `include_subdomains: true`（ブラウザの話で、アプリのAPI呼び出しは守らない。ほかのブラウザのリストは確かめていない）。
        そのため、HTTPで届くのは、アプリ以外のクライアントか、設定ミスのときだけで、この検査は多層の防御にあたる。
        HSTSヘッダーは付けない（`.app` のpreloadで足り、APIの呼び出し元は使わない）。
    -   判定は、`request.url` のスキームと、見えたときの `X-Forwarded-Proto`（どちらも「`http` なら拒否」の向きにだけ使う）。
        **エッジで、`request.url` がクライアントの接続を反映するかは、資料に書かれていない。** 本番にデプロイして実測した
        （2026-11-15。`wrangler tail` で、Workerが受けたリクエストを見た）: `http://singfolio.app/...` は、`request.url` が
        `http:`、`X-Forwarded-Proto: http`、`CF-Visitor: {"scheme":"http"}` で届き、403になった。`https://` は、順に `https:`・
        `https`・`{"scheme":"https"}` で、200になった。3つの信号は一致し、HTTPSに `http` が入ることは無い。資料に無いので、
        この挙動が変わる可能性は残る。変わったときに気づけるよう、デプロイ後の確認（下）を、手順として残す。
    -   **デプロイ後の確認（HTTPSまで403になる逆向きの失敗を含む）。** 資料の `X-Forwarded-Proto` の節には、「既定は `https`。
        訪問者が別の暗号化モードを選んだときを除く」とも書かれていて、オリジン側の暗号化モードの値と読める余地があった
        （実測では、HTTPSのリクエストは `https` で届いた）。HTTPSのリクエストにも `http` が入ると、本番のすべてのリクエストが
        403になり、HTTPが403になる確認では見つからない。そのため、`curl -i -X POST http://singfolio.app/auth/nonce` が403、
        `curl -i -X POST https://singfolio.app/auth/nonce -d '{"kind":"native"}'` が200、の両方を確かめる。HTTPSが403なら、
        `wrangler rollback` で戻し、`X-Forwarded-Proto` の判定を外して（`request.url` だけにして）出し直す。ただし、403が自前の
        拒否とは限らない（WAFなど、Cloudflare側の403もありうる）。**本文が `HTTPS required` なら自前の拒否**で、上の手順に進む。
        それ以外の403は別の原因なので、戻す前に、本文とヘッダーを見る。500（1101）は、Workerの例外で、HTTPSの検査ではない
        （まず `NONCE_HMAC_KEY` の長さを疑う）。
    -   `wrangler tail` は、Workers Logs を無効にしたまま使える（実測。リクエストのURL・ヘッダー・`exceptions` の欄が出る。
        例外が実際に出ることは、本番では試していない）。出力にはリクエストのヘッダー（接続元のIPなど）が含まれ、認証の値
        （`Authorization` など）が付くリクエストが流れる段階では、それも出うる。端末に出すだけで保存はされないが、出力を
        共有・保存しない。
    -   ローカルの開発だけ、ホスト名が `localhost`・`127.0.0.1`・`[::1]` のものを通す（完全一致）。エッジでは、Custom Domainは
        `singfolio.app` に一致するリクエストだけを受けるので、`localhost` のHostは届かない（資料）。環境変数などで検査を切る口は
        作らない。`wrangler dev` は、既定で `routes` のホスト（`singfolio.app`）を `request.url` に入れ、`localhost` が見えず403に
        なる。`npm run dev` が `--infer-origin-from-routes=false` を付けて、実際のオリジンを保つ（`config.test.ts` が固定）。
    -   公開ページ（7.4以降）では、`GET`/`HEAD` をリダイレクトにする余地がある。いまは、`/auth/` しか無いので、一律に拒否している。
-   **ローカルのD1の置き場所。** `wrangler.jsonc` に `database_id` を足したので、ローカルのD1のファイル名（ハッシュ）が変わる
    （足す前後の設定で `wrangler d1 migrations apply --local` を比べて確かめた）。`migrations apply` とテスト（`getPlatformProxy`）は
    同じ設定を読むので一貫する。`wrangler dev` 自身がD1を使う経路は、まだ無い（D1に触れるエンドポイントを足すときに確かめる）。

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
