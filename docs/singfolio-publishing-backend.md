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
    含める。**決定（7.4.8）: 利用者が、タグごとに公開するかを選ぶ**（既定は全部非公開）。選択は、
    タグ自体の属性ではなく、別の設定として端末に持つ（§8「公開するタグの選び方」）。
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
実装・決定は §8「Auto Publish（7.4.9b）」。

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

-   Publishは、D1で版を予約し（`baseVersion` の照合と、「公開中」の印の設定を1文で。7.4.4）、そのあとR2にスナップショットを書く。
    R2に書けなかったときは、版を元に戻して失敗にする（前のスナップショットが公開され続ける）。順序の理由と、失敗のときの扱いは、
    「Publish と Unpublish のエンドポイント」。
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
-   使用済みの記録のうち、期限を過ぎたものは、ログインの処理の中で消す（この掃除にはCron Triggerを使わない。動く部品を
    増やさない。Cron Trigger は、未使用のアカウントの自動削除だけに使う。「未使用のアカウントの自動削除」）。
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
    （ログイン。下）は、`unavailable`（公開鍵を取得できず、使える古い鍵も無い。トークンの問題ではない）だけを503にし、残りは
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
        1回だけ取り直す（鍵の入れ替えに追いつくため）。**鍵を一度も取れていない間（isolateの起動直後に発行元が落ちている）も同じ。**
        冷却の間は取りに行かず、すぐ `unavailable` を返す（取りに行くと、落ちている発行元を、リクエストのたびに最大5秒待つ。冷却は
        そのための仕組みで、鍵が無い間だけ外すと目的に合わない）。冷却が済めば、また1回試す。代わりに、起動直後に取得が1回失敗すると、
        発行元が戻っても、最大60秒は `unavailable`（503）になる。アプリがやり直せば済む。
        試みた時刻は、取得の**完了のあと**に書く（始めに書くと、取得の最中に来た別のリクエストが、冷却の中として弾かれる。
        起動直後の同時のログインが、片方 503 になる）。取得中の Promise は、共有しない（下）。
        **残るリスク（受け入れる）。** 鍵がまだ無いisolateでは、最初の取得が終わるまで（最大5秒）冷却が効かず、その間に来たリクエストは、
        それぞれ自分で取りに行く（上限なし）。`T` は `/auth/nonce` から誰でも得られるので、`kid` 付きの偽のトークンでも、この経路に入れる。
        ただし、起きるのは、isolateの起動直後に発行元が遅い・落ちているときの、その数秒だけ。冷却はisolateごとで、全体の厳密な上限には
        もともとならない。取得中の数を数えて1〜2本に絞る案は、同時の正規の初回ログインを 503 にするため採らない。実際に問題になったら見直す。
        **遅れて終わった取得は、あとから始めた取得の鍵を上書きしない**（取得を始めた順番で決める。`now` で比べない: 時計が戻ったとき、
        新しい鍵がいつまでも保存されなくなる）。失敗した取得は順番を進めず、先に始めた取得の成功は捨てない。試みた時刻だけは後勝ちで、
        冷却が数秒ずれうる。
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
-   **ログインの処理の順序**（実装済み。`worker/src/login.ts` の `signIn`）: `verifyNonce`（署名・種別・期限。D1に触れない）→
    `audienceFor`（`null` ＝ Googleの `web` は、ここで拒否する。公開鍵を取りに行く前）→ IDトークンの検証（`nonce` が `SHA-256(T)` と
    一致するところまで）→ `consumeNonce`（使用済みの記録）→ `resolveIdentity` → セッションの発行。D1に書くのは、前の2つが通ってから
    （検証に通らなかった `T` は、使い切りにならない）。`consumeNonce` のあとにD1が失敗しても、`T` は使い切りになる（アプリが新しい
    `T` で、やり直す）。D1が使えないときは、例外のまま（Cloudflareのエラーページ。JSONではない）。アプリは、JSONでない5xxも、
    一時的な失敗として扱う（日次の上限を超えたときの Error 1027 も同じ）。
    `web` の `T`（`C` を含む）は、`signIn` の `web` の入力（認可コードと `V`）でだけ受け付ける。`V` の照合（`SHA-256(V)` が `T` の中の
    `C` と一致する）が、Appleを呼ぶ前にあり、通らなければ呼ばない。通ったら、コードをAppleで交換してIDトークンを得て、以降は同じ
    （「AndroidのAppleログイン（Web経由）」）。`/auth/login`（`native` 専用）は、`web` の `T` を受け付けない。
-   確かめたこと: 模擬の発行元（テスト用のRSA鍵とJWKSを返す fetch）で、上の拒否の条件とキャッシュの動きをテストした。本物のApple・Googleの
    JWKSを、Node から取得して読めることを確かめた（鍵の形は、どちらも `kty: RSA`・`alg: RS256`・`use: sig`・`kid` 付き）。workerd
    （`wrangler dev`）で、模擬のJWKSとローカルのD1に対して、検証と `resolveIdentity` が動くことを確かめた。本物のトークンでの確認は、
    7.3.7（Apple）と 7.3.8（Google）。

**ログインとログアウト**（実装済み。`worker/src/auth.ts`）。どちらも、HTTPSでないリクエストは403（「Workerの構成と運用」の「HTTPS」）。

-   **`POST /auth/login`**
    -   リクエスト: JSON。`{"provider":"apple"|"google","idToken":"<IDトークン>","nonce":"<T>"}`。`T` は `POST /auth/nonce` の
        `native` のもの。本文は10KBまで（上限の扱いは `/auth/nonce` と同じ）。`web` の `T` は受け付けない（AndroidのAppleログインは
        別のエンドポイント `POST /auth/apple/login`。「AndroidのAppleログイン（Web経由）」）。ユーザーIDは受け取らない。
    -   レスポンス: 200 `{"session":"<値>"}`、`Cache-Control: no-store`。値はセッションの不透明な値で、中身を解釈しない。
        期限は返さない（最後の利用から数えて延びるため。端末は期限を知らなくてよく、切れていたら401で分かる）。
    -   エラー: 400（本文の不備。`{"error":"invalid_request"}`）、401（検証に通らない。`{"error":"unauthorized"}`。`T` の不備・
        IDトークンの不備・リプレイを区別せず、どの検査で落ちたかを教えない）、405（`POST` 以外。`Allow: POST`）、413、
        503（公開鍵を取得できず、使える古い鍵も無い。`{"error":"service_unavailable"}`。トークンの問題ではなく、`T` も使い切りに
        ならないので、アプリはそのままやり直せる）。D1に書くのは、検証に通ったあとだけ（上の「ログインの処理の順序」）。
    -   乱用の抑止（レート制限）は入れない。D1に書く経路だが、書くのは、Workerが発行した `T` と、AppleまたはGoogleが署名した有効な
        IDトークンを揃えたときだけで、1回のログインの書き込みは数行（`used_nonces`・`identities`・`sessions` と索引）。書き込みの上限
        （10万行/日）を使い切るには、実在のアカウントで、桁違いの回数のサインインを通す必要がある。7.3.9 のコールバックのように、
        認証なしで外部（Apple）を呼ばせる経路とは違う。
-   **`POST /auth/logout`**: `Authorization: Bearer <セッションの値>` のセッションの行を削除して、204（本文なし）。行が無い（すでに
    失効している）値でも204（何度呼んでも同じ。ログアウトは、値を持っている側だけが呼べる）。ヘッダーが無い・形が違うときだけ401
    （何も消さない）。405（`POST` 以外）。アプリは、204でも401でも、端末の値を捨てる。通信できないときの扱いは「アプリ側の認証の土台」。
-   確かめたこと: 模擬の発行元とローカルのD1で、成功・各検査での拒否（D1に何も書かない）・リプレイ・503・形の不備をテストした
    （`worker/test/login.test.ts`・`session.test.ts`）。workerd（`wrangler dev`）で、本物のGoogleのJWKSを取得して知らない `kid` を
    401にすること、Appleの公開鍵がローカルからは取得できない（既知。本番からは取得できる）ときの503と、直後の2回目が冷却で
    すぐ（約14ms）503になることを確かめた。本物のトークンでの確認は、7.3.7・7.3.8。

**セッション**（実装済み。`worker/src/session.ts`）

-   不透明なランダム値（JWTにしない）。32バイトの乱数で、base64urlの43字。D1の `sessions` には、SHA-256のハッシュ（base64url）だけを
    置き、端末は SecureStore に持つ。ソルトや遅いハッシュは使わない（256ビットの乱数なので、総当たりで引けない）。
    値は `Authorization: Bearer <値>` で送る（URLに載せない）。ログにも出さない。
-   期限は、最後の利用から90日（目安）。最後の利用の時刻（`last_used_at`）は、前回の書き込みから24時間以上たったときだけ書く
    （毎回書くと、書き込みの上限を消費する）。そのため、期限は実際の最後の利用から、最大24時間早まる。
-   **絶対的な期限は置かない（決定）。** 90日以内に使い続ける限り、同じ値が生き続ける。置いても、紛失した端末の値は、その期限まで
    使えるので紛失の対策にならず、よく使う人に再ログインの負担が増えるだけになる。紛失・漏えいには、失効の手段で備える
    （ログアウト・「ほかの端末をすべてログアウト」・アカウントの削除・Appleの `consent-revoked`）。
-   **認証**（`authenticateSession`）: 値から `sessions` と `identities` を1つのクエリで引き、ユーザーID・ログイン手段・
    手段の種類（`apple`・`google`）を返す。無い・期限切れ・形が違うは、区別せず null。期限切れの行は、見つかった時点で消す。
    通ったときだけ、`last_used_at` を進める（時計が戻る値は書かない）。ユーザーIDは、これで得たものだけを使う。使うのは、
    「ほかの端末をすべてログアウト」・アカウントの削除（7.3.10）・Publish（7.4）以降。セッションを作ったログイン手段の `sub` も返す
    （アカウントの削除の再認証で、同じアカウントかを確かめる）。`last_used_at` を進めるときは、同じバッチで `users.last_active_at` も進める
    （未使用のアカウントの自動削除の基準。「未使用のアカウントの自動削除」）。
-   **発行**（`createSession`）は、同じログイン手段の、期限を過ぎたセッションを、同じバッチで消す（この掃除にはCron Triggerを使わない。
    `identity_id` の索引で引くので、件数が増えても費用が増えない）。全体の掃除はしない。二度とログインしない人の、期限を
    過ぎた行は残る（1行は小さく、認証には使えない）。1つのログイン手段に、端末ごとに複数のセッションを持てる。
    **発行しないことがある**（`null`。ログインは 401 になる）: ログイン手段の行が無い（直前に `account-deleted` で消えた）、または
    `identities.consent_revoked_at`（Appleの `consent-revoked` の `event_time`）が、このログインの開始時刻（`now`）と同じか、それより後。
    理由と使い方は「Appleのサーバー間通知」。
-   ログアウトは、そのセッションの行の削除（消す前に、同じバッチで、そのアカウントの `users.last_active_at` を進める。期限切れのセッションでは進めない:
    `authenticateSession` が、期限切れでは進めないのと揃える）。
    アカウントの削除は、そのユーザーの全セッションの削除。
-   **「ほかの端末をすべてログアウト」**（実装済み。7.3.10。`POST /auth/logout-others`。`worker/src/auth.ts` の `handleLogoutOthers`、
    `session.ts` の `revokeOtherSessions`）: 認証済みのセッションを除く、同じユーザーの全セッションの行を削除して、204（本文なし）。
    ユーザーに複数のログイン手段（AppleとGoogle）がつながっていれば、手段をまたいで消す（`sessions` は `identity_id` を持つので、
    `identities` を `user_id` で引く）。ログアウトと違い、セッションの認証（`authenticateSession`）が要る: ヘッダーが無い・形が違う・
    無効（無い・期限切れ）は 401 で、何も消さない。消すものが無くても204（何度呼んでも同じ）。405（`POST` 以外）。
    アプリは、401 のとき端末のセッションを捨てる（`account.signOutOthers()`）。端末をなくしたとき、残っている端末から、なくした端末の値を
    失効させる手段（絶対的な期限を置かない代わり）。期限を過ぎた行も、ここで消える。
-   iOSのSecureStore（Keychain）は、アプリを削除しても残りうる（保証はされない。Androidは消える）。再インストール
    すると、ローカルDBは空なのに、セッションだけ生きている状態になる。そこで、ローカルDBを新しく作ったとき
    （初回起動）に、保存済みのセッションを捨てる。これだけでは、空のローカルからのPublishで公開内容が空に
    置き換わるのは防げない（再インストール後の正規のログインでも起きる）ので、Publish側の保護を「実装時に決めること」に置く。
    アプリ側の実装は、次の「アプリ側の認証の土台」。

**アプリ側の認証の土台**（実装済み。7.3.6。`src/repositories/authRepository.ts`・`sessionRepository.ts`・`authError.ts`、`src/services/accountService.ts`）

ログイン手段そのもの（Apple・Googleのサインインの画面）は 7.3.7 以降。ここは、その下の、通信・保存・状態の土台。
**ログインを要求しない**: サインインしていなくても、使えなくても（SecureStoreが読めない・消せない、`account` を注入しない）、v1.0の機能は
何も変わらない。SecureStoreの不調で、起動を止めない。画面がサインインを呼ぶまで、何も送らない。

-   **構成。** UI → `account`（Service。`getSignedInProvider`・`signIn(provider)`・`signOut`）→ `authRepository`（HTTP）・
    `sessionRepository`（SecureStore）。各社のサインインは `IdTokenProvider`（`getIdToken(hashedNonce)`）として、7.3.7 以降の
    Repository が実装し、`createServices` の `auth.idTokenProviders` に注入する。組み込んでいない手段の `signIn` は
    `provider-unavailable`。画面・Serviceは、URL・レスポンスの形・SDKの呼び出しを知らない（候補検索の `songCatalogRepository` と同じ）。
    `fetch`・`SecureStorage`・SHA-256 は注入する（Nodeのテストは偽物で動かす）。画面には、セッションの値を渡さない
    （`getSignedInProvider` はログイン手段だけを返す）。
-   **`signIn` の流れ。** `POST /auth/nonce`（`native`）で `T` を得る → `SHA-256(T)` の base64url（43字）を各社のサインインの
    `nonce` に渡す → IDトークンを `T` と一緒に `POST /auth/login` へ → 返ったセッションを SecureStore に保存する。今のローカルDBの
    サインイン中のセッションがあれば `already-signed-in`（先にログアウトする。別の手段は別のアカウントになるため、黙って置き換えない）。
    保存に失敗したら、サーバーのセッションを失効させて（失敗は無視）`storage-failed`。取りやめは `cancelled`（各社のRepositoryが
    投げる。何も保存せず、`T` は使い切りにならない）。各社の画面を5分以上開いたままにすると `T` が切れて 401 になる（やり直す）。
    **読めない値・別のローカルDBのセッションが残っていても、サインインは進めて、上書きする。** 読めないだけで止めると、壊れた値や、
    Androidで復元されて復号できない値が残る端末は、二度とサインインできない（ログアウトの入口は、サインイン中にしか出ない）。
    **読めた別のローカルDBのセッションは、上書きしたあと（新しいセッションの保存が済んだあと）に、サーバーで失効させる**（失敗は無視して、
    サインインは成功のまま）。別のDBのものは `getSignedInProvider` が `null` を返し、ログアウトの入口が出ないので、失効させる機会はここだけ。
    保存のあとにするのは、各社の画面を開く前に通信を待たせない（応答が無いと最大10秒）ため、かつ、直前のログインで通信できると分かっているため。
    この失効は待つので、通信が無応答のときは、ログインが成功していても `signIn` が返るまで最大10秒かかり、その間は直列化の列も止まる
    （続くログアウトも待つ）。起こるのは、再インストール後の最初のサインインだけ。7.3.11 の画面は、その間「サインインしています…」を出す。待たない形
    （失効の完了を待たずに返す）には見直さなかった（まれで、最大10秒）。保存と失効の間でアプリが終わると、その別のDBのセッションは失効させる機会を失い、90日で切れるまで残る。
    取りやめ・失敗で保存まで進まなかったときは、値が端末に残り、次のサインインで失効させる。読めない値は、失効させるものを特定できず、
    サーバーに残る（最後の利用から90日で切れる。ログアウトで失効を確認できない場合と同じ扱い）。
-   **保存。** SecureStore（iOSはKeychain、Androidは Keystore で暗号化）の1つのキー `singfolio.session` に、JSON
    `{"v":1,"session":"<値>","provider":"apple"|"google","localDataId":"<UUID>"}`。SQLite・settings・ログには置かない。ユーザーID・メール・
    名前は端末に持たない。`provider` を持つのは、アカウントの削除（7.3.10。`account.deleteAccount()`）が、どの手段で再認証するかを知るため。iOSは
    `WHEN_UNLOCKED_THIS_DEVICE_ONLY`（ロックが解けている間だけ読める。バックアップ・端末の引っ越しで別の端末へ移らない。移った先は
    ログアウトから始まる）。読み取りの結果は3通り（`SessionRead`）: `none`（項目が無い）、`unreadable`（読み取りの失敗・壊れた値・知らない版。
    値は消さない。投げない）、`found`。`none` と `unreadable` は、どちらもサインインしていない扱いだが、区別する（ログアウトの結果に出る）。
-   **セッションは、ローカルDBの識別子と一緒に保存し、今のDBと合わなければ、サインインしていない扱いにする。** 識別子は
    `settings.local_data_id`（UUID。`settings.ensureLocalDataId()`。DBを新しく作ったあとの最初の呼び出しで作る。同時に呼んでも1つに決まる。
    画面に出さず、公開用データにも含めない。バックアップでDBが戻れば、同じ値も戻る）。iOSのKeychainは、アプリを削除しても残りうる
    （保証はされない）ので、再インストールのあと、ローカルは空なのにセッションだけが生きている状態が起こりうる。それを、**DBを新しく
    作った瞬間に捨てる**（次の項目）のではなく、**使うたびに、DBとの結びつきで確かめる**ことで防ぐ。起動の成否・SecureStoreの削除の成否に
    依存しない。別のDBのセッションは、サーバー側には実在するので、ログアウトでは失効させる。
-   **初回起動の破棄（後始末）。** DBを新しく作るとき（`user_version` が 0。初回起動・再インストール）、`runMigrations` の `onNewDatabase` が、
    **最初のマイグレーションの前に**、保存済みのセッションを消す（`services/index.ts` が `sessionRepository.clear()` を渡す）。**後始末なので、
    失敗しても起動を止めない**（握りつぶす）。残ったセッションは、上の結びつきで、サインイン中として扱われない。以前は「捨てられなければ起動の
    失敗」にしていたが、やめた: 削除の失敗（Androidの `DeleteException`、iOSの読み戻しの失敗）が端末側で続くと、「もう一度試す」を押しても同じ
    失敗になり、認証を使わない新規インストールの利用者まで、v1.0の機能を一切使えなくなるため（「ログインを要求しない」と食い違う）。マイグレーションの
    前に呼ぶのは、後に呼ぶと、間でアプリが終わったとき、次の起動は「新しくない」DBで、二度と呼ばれないため。通常の起動（DBがある）では呼ばない。
    なお、Androidは、アンインストールでアプリのデータ（SecureStoreのファイルを含む）は消えるが、Auto Backup の復元で、SQLite と一緒に戻りうる。
    このときDBは `user_version > 0` なので、`onNewDatabase` は呼ばれない。それでもログアウトの扱いになるのは、Keystoreの鍵が移らず、復号に
    失敗するため（expo-secure-store は、`BadPaddingException` なら値を消して `null`、それ以外は `DecryptException`。どちらも `unreadable`）。
    復元は確かめていない。
-   **`clear()` は、消したあとに読み戻して、残っていれば投げる。読み戻しの失敗も投げる。** iOSの `deleteItemAsync` は、Keychainの削除の結果を
    捨てて、失敗しても投げない（expo-secure-store のソース）。ログアウトが、端末の値が消えたことを保証するため（初回起動の後始末は、投げても
    握りつぶす）。残るリスク: 後始末の削除がiOSで黙って失敗しても、握りつぶすので、前のセッションの値はKeychainに残る。サインイン中の扱いには
    ならない（結びつきが合わない）が、値そのものは次のサインインまで残る。
-   **ログアウト。** 端末の値を**先に**捨て（捨てられなければ `storage-failed`。このときサーバーへは送らない）、そのあとサーバーのセッションを
    失効させる（`POST /auth/logout`）。サーバーへの要求の途中でアプリが終わっても、端末はログアウトした状態になる。通信できない・サーバーが
    使えない（5xx）ときも、端末はログアウトする。結果の `serverRevoked` は、失効を確認できたか: `false` は、通信できなかった・サーバーが使えなかった、
    または**端末の値を読めず（`unreadable`）、失効させるものを特定できなかった**。端末に値が無かった（`none`）ときは、失効させるものが無いので
    `true`。サーバーに残ったセッションは、値を持つ端末が無く使えない。最後の利用から90日で切れ、気になるときは別の端末から「ほかの端末を
    すべてログアウト」（7.3.10）で消せる。401（ヘッダーの形が違うときだけ）は、失効するものが無いので、失効できた扱い。読めない値が残っていても消す。
-   **直列化。** サインインとログアウトは、1本ずつ順に実行する。サインインの途中（各社の画面を開いている間）にログアウトが走ると、
    ログアウトの後にセッションが保存されて、ログアウトできていないことになるため。**各社のサインインが終わらないと（結果が返らない）、後ろの
    ログアウトも待ち続ける**ので、待ちには上限を置く（次の「Appleのサインイン」の「時間の上限と取り消し」）。
-   **失敗の分類**（`AuthError.code`。`message` はログ用の英語で、トークン・応答の本文・例外の内容は載せない）。`getSignedInProvider`・
    `signIn`・`signOut` の失敗は、すべて `AuthError`（`AuthError` 以外の失敗は、`unexpected` に包んで、元の例外は載せない。画面が `code` で
    分類できる）。`getSignedInProvider` は、ローカルDBの識別子を読めないとき（セッションが保存されているときだけ読む）に投げ、`null` にはしない
    （「ログアウト中」と「分からない」を、画面が取り違えないため）。**画面（7.3.11。`AccountSection`）は、これを捕まえて**、Account 画面の中に「サインインの状態を確認できませんでした」と「もう一度試す」だけを出す。
    ErrorBoundaryまで伝えない（ログインを要求しないので、v1.0の機能を巻き込まない）。

    | `code` | 起きるとき | 利用者に |
    |---|---|---|
    | `cancelled` | 各社のサインインを取りやめた | 何も出さない |
    | `network` | 通信できない・10秒で応答が無い（アカウントの削除の要求は30秒）。削除では、要求を送る前（`T` の取得）の失敗だけがこれ。何も消えていない | やり直せる |
    | `delete-unconfirmed` | アカウントの削除の要求（`/auth/delete`）を送ったあとの `network` と `invalid-response`（`accountService` が読み替える。Workerは 200 を、D1を消したあとに返す）。**サーバーで削除が済んでいるかもしれない**。`unavailable` は読み替えない（Workerの 503 は、すべてD1を消す前）。やり直すと 401 | 「削除されたか分からない」。やり直せる（7.3.11） |
    | `unavailable` | 5xx（JSONでないCloudflareのエラーページ 1101 を含む）、429（WAFの回数の制限 1015、日次の上限 1027） | やり直せる。トークンの問題ではない |
    | `unauthorized` | 401（`T` の不備・期限切れ・使用済み、IDトークンの不備。理由は区別されない） | サインインに失敗した。やり直す |
    | `invalid-request` | 400・403・405・413 など | アプリの不具合 |
    | `invalid-response` | 200 なのに値が無い・形が違う、本文がJSONでない、各社のサインインが空のIDトークンを返した | アプリかサーバーの不具合 |
    | `storage-failed` | 端末のセッションの保存先に書けなかった（サーバー側は失効させた）、または消せなかった（ログアウト。やり直せる） | やり直せる |
    | `provider-failed` | 各社のサインインが、取りやめ以外で終わらなかった（Appleは、端末にAppleアカウントでサインインしていないときなど。アプリ側の設定の不備でも同じになりうる） | やり直せる。原因を言い切らない文言（7.3.11） |
    | `timeout` | 各社のサインインが5分で終わらなかった（下の「時間の上限と取り消し」） | やり直せる |
    | `provider-unavailable`・`already-signed-in` | 上のとおり | |
    | `not-signed-in` | 「ほかの端末をすべてログアウト」・アカウントの削除を、サインインしていないときに呼んだ（別のローカルDBのセッション・読めない値も、していない扱い） | 画面は、サインイン中にだけ入口を出す |
    | `reauth-failed` | アカウントの削除の再認証が通らない（403 `reauth_failed`。`T`・IDトークン・認可コードの不備、リプレイ）。サインインは保たれる | やり直せる |
    | `account-mismatch` | 再認証は通ったが、ログイン中のアカウントとは別のアカウント（403 `account_mismatch`）。何も消えていない。サインインは保たれる | 「サインインしているアカウントと違う。同じアカウントを選ぶ」（7.3.11） |
    | `unexpected` | 各社のサインインが契約に反して投げた、ハッシュの計算・DBの失敗など | アプリの不具合 |

    5xx は本文を読まずに `unavailable` にする。再試行はしない（やり直しは利用者の操作）。`network`・`unavailable`・`timeout` が
    一時的な失敗（`isTemporaryAuthError`。`provider-failed` は、設定の確認が要るので含めない）。利用者向けの文言への対応は `src/i18n/authErrors.ts`（7.3.11。操作ごと）。
-   **認証が要る呼び出しを足すとき（7.4 以降）の規則。** 401 を受けたら、端末のセッションを捨てる（サーバーが認めない値は、
    二度と通らない）。503・5xx・通信の失敗では捨てない（一時的な失敗。セッションは生きている）。7.3.10 の `signOutOthers`・
    `deleteAccount` は、この規則どおり（`accountService` の `authorized`）。**アカウントの削除は、再認証の失敗を 401 にしない（403）**:
    別のAppleアカウントで再認証しただけで、サインアウトさせないため。
-   **`expo-secure-store` の config plugin を `app.json` に足さない。** plugin は、Androidのバックアップ規則（`fullBackupContent`・
    `dataExtractionRules`）に `<include domain="sharedpref" path=".">` を入れる。Androidの資料では、`<include>` が1つでもあると、
    その指定だけがバックアップされ、既定の対象は外れる。入れると、v1.0で今バックアップされているSQLite（レパートリー）が、
    Androidのバックアップと端末の引っ越しから外れる。plugin 無しでも、autolinking でネイティブは入る。plugin はほかに、使っていない
    `NSFaceIDUsageDescription` をiOSに足す。SecureStoreのAndroidのファイルをバックアップから外したいときは、既定の対象を残したまま、
    そのファイルだけを `<exclude>` する規則を自前で書く（今は不要と見ている。復元されても、Keystoreの鍵は移らないので読めない値になり、
    ログアウトの扱いになる、はずだが、復元は確かめていない）。
-   **Androidの権限。** `expo-secure-store` の依存（`androidx.biometric`）が `USE_BIOMETRIC`・`USE_FINGERPRINT` を足す。生体認証は
    使わない（`requireAuthentication` は使わない）ので、`blockedPermissions` に足した。`nativeConfig.test.ts` が固定するのは、`app.json` の
    `blockedPermissions` の一覧だけ。**マージ後のマニフェストは、テストでは固定していない**（依存が別の権限を足しても、`npm test` は気づけない）。
    release のビルドを作るたびに、成果物のマニフェストで確かめる（例: `aapt2 dump permissions <APK>`）。確認した時点（2026-11-15。エミュレータに
    入れた release の APK）は、`INTERNET`・`VIBRATE` だけ（Gradle の `processReleaseMainManifest` のマージ結果は、これにアプリ内部用の1つ）。
-   確かめたこと（Androidエミュレータ（R8入りのrelease）と、iOS Simulator（iPhone 18 Pro。Release）。実際の `expo-secure-store`・
    `expo-crypto`・RNの `fetch`。検証用の一時画面は、確認後に消した）: 保存と読み戻し、通常の再起動で値が残ること、DBを作り直した
    あとの起動で捨てられること（その後の起動でも空のまま）、`expo-crypto` の SHA-256（base64）から作る base64url がWorkerと同じ形（既知の
    入力 `abc` で一致）、本番の `POST /auth/nonce` が RN の `fetch` で通り、`T` が `v1.native.` で始まる91字であること、`signIn` が組み込み前に
    `provider-unavailable` になること、Androidで `FATAL EXCEPTION`・R8のエラーが無く、権限が `INTERNET`・`VIBRATE` だけであること。
    これらは、ローカルDBの識別子との結びつきを入れる**前**の実装での確認（結びつきと後始末の握りつぶしは、実機では再確認していない）。
    Node のテストは、通信・保存の形、各失敗の分類、`AuthError` への包み込み（`getSignedInProvider` を含む）、直列化、`onNewDatabase` の順序、
    結びつき（別のDBのセッションをサインイン中として扱わない、再インストールの再現、上書きしたあとの失効とその失敗・取りやめ・保存失敗のときの扱い）、
    `local_data_id` の作成（同時に呼んでも1つ）。
    **iOS Simulatorで、署名なしのビルド（`CODE_SIGNING_ALLOWED=NO`）は、Keychainへの保存が `errSecMissingEntitlement`（必要なエンタイトルメントが
    存在しません）で失敗する。** アプリの不具合ではなく、検証のビルドの作り方の問題（署名あり（ad hoc）のビルドでは通る）。
-   未確認: 実機（Pixel 11・iPhone 8）、TestFlight・Playの署名したビルド、iOSで、再インストールのあとにKeychainの値が残ること（Simulatorでは、
    アンインストールで消えたのか、破棄で消えたのかを区別できていない。Appleは保証していない、という前提で、結びつきと後始末を入れた）、
    Androidの Auto Backup の復元、`POST /auth/login`・`/auth/logout` を本物のWorkerへ送ること（本番のWorkerは 7.3.3 のままで、7.3.4・
    7.3.5 はデプロイしていない）、各社のサインインとの結合（7.3.7 以降）。

**Appleのサインイン（iOS）**（実装済み。7.3.7。`src/repositories/appleSignInRepository.ts`。実際のトークンでの確認は未了で、7.3.13 で行う。下の「未確認」）

-   `expo-apple-authentication`（`ASAuthorizationController`）で、IDトークンを得るところまで。`IdTokenProvider` として、`services/index.ts` が
    **iOSのときだけ**注入する（`Platform.OS === 'ios'`。AndroidのAppleは Web 経由で、7.3.9）。SDKはRepositoryに注入する（`src/` はNodeのテストで
    直接動かすため、ここでimportしない）。このモジュールはAndroidに実装が無いが、JSをimportしても落ちない（`requireOptionalNativeModule`）。
-   `nonce` には、渡された `SHA-256(T)` の base64url をそのまま入れる（変換しない）。**スコープは空**（`requestedScopes: []`）。名前もメールも要求しない
    （使うのは `sub` だけ。Googleは、スコープを外せない（「Googleのサインイン」））。`authorizationCode` は、サインイン
    （`getIdToken`）では受け取っても使わず、返さない。アカウントの削除の再認証（`getIdTokenWithCode`。同じSDKの呼び出しで、IDトークンと
    一緒に得る）でだけ返し、Workerがトークンの失効に使う（次の「アカウントの削除とAppleのトークン失効」）。
-   **config plugin**（`app.json` の `expo-apple-authentication`）は、iOSのエンタイトルメント `com.apple.developer.applesignin` を足し、
    `CFBundleAllowMixedLocalizations` を `true` にする（Appleのボタンの文言のため。今はボタンを使っていない）。**後者は Info.plist 全体に効き、
    アプリが対応していない言語の端末で、OSの部品の文言の言語選びが変わりうる**（Appleの資料の記述は「フレームワークのローカライズ文字列を取得できるか」だけ
    で、既定値の記載は無い。端末の言語で実際にどう変わるかは測っていない）ので、`app.json` の `ios.infoPlist.CFBundleAllowMixedLocalizations` を
    `false` にして、v1.0（未設定）に近い状態を保つ。plugin は `?? true` なので、`app.json` の値が残る（`expo prebuild` で、Info.plist が `false` に
    なることを確かめた）。`nativeConfig.test.ts` が固定している。Appleのボタン（`AppleAuthenticationButton`）は 7.3.11 で使った（iOSのサインイン前の画面。文言はOSが決める）。端末の言語とアプリの言語がずれたときの扱いは、7.3.13 で見る。
    署名には、プロビジョニングプロファイルに Sign in with Apple が入っている必要がある（primary App ID には設定済み。EASが、次の本番ビルドで
    プロファイルを作り直す）。署名の失敗は、ストアに出すビルド（7.3.13）で初めて分かる。
-   **失敗の分類。** 取りやめ（`ERR_REQUEST_CANCELED`）は `cancelled`。SDKのそのほかの失敗（`ERR_REQUEST_UNKNOWN`・`FAILED`・`NOT_HANDLED`・
    `NOT_INTERACTIVE`、`ERR_INVALID_RESPONSE`、`ERR_REQUEST_MATCHED_EXCLUDED_CREDENTIAL`）は `provider-failed`（端末にAppleアカウントが無いときの
    `unknown` を含む）。端末が対応していなければ `provider-unavailable`、それ以外は `unexpected`。**`provider-failed` は、端末の状態が原因とは限らない**:
    エンタイトルメントやプロファイルの不備も、同じ `ERR_REQUEST_UNKNOWN`（`ASAuthorizationError.unknown`）になりうる。`ERR_INVALID_RESPONSE`・
    `ERR_REQUEST_NOT_HANDLED` も、利用者の設定の問題とは限らない。利用者向けの文言（7.3.11）は、「設定を確認して」と言い切らない（`account.error.providerFailed`）。
    IDトークンが無いときは、SDKのJSが、`identityToken`・`authorizationCode`・`user` のどれかが欠けると自分で `ERR_REQUEST_FAILED` を投げる
    ので、`provider-failed` になる（Repositoryの `invalid-response` の分岐は、SDKが変わったときのための防御で、実際には届かない）。
    コードは、Expo Modules の例外のクラス名から決まる（ソースで確認。`InvalidResponseException` だけ `Request` が付かない）。
    SDKの例外の内容・トークンは、エラーに載せない。
-   **時間の上限と取り消し**（`account` Service。各社のRepositoryには持たせない: Googleの7.3.8も同じ場所で効く）。各社のサインインを待つ上限は
    **5分**（`PROVIDER_TIMEOUT_MS`）で、Workerの `T` の期限（発行から5分）と同じ。これを過ぎて返ったIDトークンは `T` が切れていて、どのみち
    401 になる。タイマーは `T` を得たあと（ハッシュの計算のあと）に始まるので、実際の上限は、`T` の期限より、`POST /auth/nonce` にかかった時間
    （最大10秒）だけ後ろにずれる（実害は無い: その間に返ったIDトークンは、401 で落ちる）。超えたら `timeout` で失敗にして、直列化の列を進める（後ろのログアウトが待ち続けない）。あとで返った結果・失敗は捨てる（login も保存もしない）。
    **取り消しの口（AbortSignal など）は作らない。** Apple・GoogleのSDKに、出ているOSの画面を取り消す手段が無く、サインインの画面が出ている間は
    アプリの操作が止まっていて、ログアウトを呼べる入口も無い（上限が要るのは、画面が閉じない・結果が返らない不具合への備え）。上限で待つのをやめても、
    OSの画面が出たままのことはある（閉じられない）。その状態で次のサインインを始めたときの、OS側の振る舞いは確かめていない。
-   確かめたこと: Node のテスト（偽のSDKで、`nonce` の受け渡し・スコープが空・各失敗の分類・内容を載せないこと、上限・あとから返った結果の破棄・
    未処理の拒否が出ないこと）。`expo prebuild` で、エンタイトルメントが生成されることと、`pod install` が通ること。
    **iOS Simulator（iPhone 18 Pro。Release。Xcode 27）で、ビルドして起動した**: `ExpoAppleAuthentication` がビルドできる（Swift の警告は出る:
    Xcode 27 の SDK で `ASAuthorizationError` に増えたケース（`.credentialImport` など）を `switch` が網羅していない。SDK の `@unknown default` が
    `ERR_REQUEST_UNKNOWN` にする）、エンタイトルメント `com.apple.developer.applesignin` がバイナリに入る、`Info.plist` の
    `CFBundleAllowMixedLocalizations` が `false`、`isAvailableAsync()` が `true`。**Appleアカウントでサインインしていない端末で**
    `signInAsync` を呼ぶと、OSの「Apple Account にサインインしてください」のシートが出る（エンタイトルメントが通っている証拠）。そのシートの
    「閉じる」を押すと、SDKは **`ERR_REQUEST_CANCELED` ではなく `ERR_REQUEST_UNKNOWN`** を返し、`account.signIn('apple')` は `provider-failed` で
    失敗した（本番の `POST /auth/nonce` までは通っている）。**「閉じる」は、利用者の目には取りやめに見えるが、取りやめ扱い（`cancelled`）にならない。**
    利用者向けの文言（7.3.11）は、`provider-failed` を、エラーとして強く出さない（再試行できる、程度。`account.error.providerFailed`）。
-   未確認（7.3.13 で確かめる）: **実際のAppleのIDトークンの `nonce` が、渡した値そのままか**（端末にAppleアカウントでサインインしていないと
    試せない。iOS Simulator の iPhone 18 Pro は、サインインしていない）。そのままでなければ、Worker側の比べ方を直す必要がある（上の「nonce」）。
    それまでは、Appleのログインが `POST /auth/login` を通るかは分からない。サインインに成功したときの動き、Appleアカウントでサインインした
    端末での取りやめ（`ERR_REQUEST_CANCELED` になるか）、実機（iPhone 8）、署名したビルド（プロビジョニングプロファイルに Sign in with Apple が
    入っているか。EASのビルドで初めて分かる）。

**アカウントの削除とAppleのトークン失効**（実装済み。7.3.10。Worker: `worker/src/deleteAccount.ts`・`account.ts`・`appleToken.ts`。
アプリ: `account.deleteAccount()`・`authRepository.deleteAccount`。画面は 7.3.11（下の「アカウントの画面」）。本物のAppleでの確認は 7.3.13）

-   削除は、アプリでの再認証を挟む。本人確認と、取り返しのつかない操作の確認を兼ねる。再認証は、**ログイン中の手段**（セッションを作った
    手段）で、ログインと同じ手順（Workerが発行した `T`、各社のIDトークン。AndroidのAppleは認可コードと `V`）を踏む。端末内のレパートリーは消えない。
-   **`POST /auth/delete`**。`Authorization: Bearer <セッションの値>` と、再認証の本文（10KBまで）。ユーザーIDは受け取らない（セッションから決める）。
    -   Apple（iOS）: `{"provider":"apple","nonce":"<T（native）>","idToken":"…","authorizationCode":"…"}`（`authorizationCode` は省略できる。
        省略すると、Appleのトークンは失効できず、`appleRevoked: false`）
    -   Apple（Android）: `{"provider":"apple","nonce":"<T（web）>","code":"…","verifier":"<V>"}`（IDトークンは、Workerが認可コードの交換で得る）
    -   Google: `{"provider":"google","nonce":"<T（native）>","idToken":"…"}`
    -   レスポンス: 200 `{"appleRevoked":true|false|null}`（`null` はGoogle。失効するものが無い。`false` でも、アカウントは消えている）。
        エラー: 400（本文の不備。再認証の手段が、ログイン中の手段と違う場合を含む）、**401**（セッションが無効。アプリは端末のセッションを捨てる）、
        **403**（再認証が通らない。`{"error":"reauth_failed"}`: `T`・IDトークン・認可コードの不備、リプレイ、`V` の不一致。
        `{"error":"account_mismatch"}`: 再認証は通ったが、`sub` が、ログイン中のアカウントと違う）、405、413、503（公開鍵・Appleが使えない。何も消えていない）。
        401 と 403 を分けるのは、アプリが 401 のときだけ端末のセッションを捨てるため。
-   **再認証のIDトークンの `sub` が、ログイン中のアカウント（セッションを作った `identities` の行）の `sub` と一致することを、必ず確かめる。**
    確かめないと、別のAppleアカウントで再認証しても削除が通る。外さない（`worker/test/deleteAccount.test.ts` が、外すと落ちる）。手段が違うもの
    （Appleのセッションに、Googleの再認証）は 400。
-   **処理の順序**: セッションの認証（D1の読み取り。本文の形の検査のあと）→ `T` の署名・種別・期限 → IDトークンの検証（AndroidのAppleは、`V` の照合 →
    認可コードの交換 → 検証。`V` の照合が先で、通らなければAppleを呼ばない）→ `sub` の一致 → `T` を使用済みに → （iOSのApple: 認可コードの交換）→
    **D1の行を消す** → Appleのトークンの失効。書き込みは、すべての確認が通ったあと。`T` を使い切りにするのは、`sub` の一致のあと
    （別のアカウントで再認証したときは、使い切りにしない。使い切りにしたあとなので、リプレイでは、Appleを呼ばない）。
-   **外部への待ちは、消す前に済ませる（失効の1回を除く）。待つ上限は、アプリ側で長くしている。** Workerは、1回のリクエストの中で、公開鍵の取得・認可コードの交換・
    失効を順に待つ（それぞれ最大5秒）。通常は1秒以内に終わるが、Appleが遅いと15秒ほどになりうる。アプリが先に打ち切る（切断する）と、(a) サーバーでは削除が済んでいるのに、
    アプリは `network` で失敗と受け取り、端末のセッションも残る（やり直すと 401）、(b) Workers は、クライアントの切断で、実行中の処理を打ち切ることがある
    （[Request.signal の changelog](https://developers.cloudflare.com/changelog/2025-05-22-handle-request-cancellation/)。切断で打ち切られる、`waitUntil` で延ばせる、という報告は
    コミュニティの投稿で、公式の資料では確認していない）ので、消したあとの失効が行われず、ログも残らない。そのため、(1) iOSの認可コードの交換を、D1を消す**前**に移した
    （消す前に打ち切られても、何も消えず、やり直せる。消したあとに待つのは、失効の1回だけ）、(2) アプリは、`/auth/delete` だけ待つ上限を30秒にした
    （`authRepository` の `DELETE_TIMEOUT_MS`。ほかの呼び出しは10秒のまま。Worker の最悪の合計に足りる）。**10秒に戻さない**: 短くすると、(a) が起きる。
    `ctx.waitUntil` に失効を回して先に応答する形は採らない（`appleRevoked` を返せなくなり、アプリが、Appleの設定から連携を解除できると案内できない）。
    それでも `network` になったとき（応答が届かなかった、アプリが中断された）は、削除が済んでいる可能性がある。やり直すと 401 になり、そこで端末のセッションが捨てられる。
    画面（7.3.11）は、削除の 401 を、「サインアウトされた。削除済みかもしれない。残っているなら、サインインし直して削除」と扱う（`account.error.deleteSignedOut`）。
    401 は、再試行に限らない（別の端末の「ほかの端末をすべてサインアウト」や、90日使わない失効のあとでも、再認証を済ませてから返る）ので、両方の場合に合う文言にしてある。
-   **Appleのトークンの失効は、削除を止めない（D1を消したあとに行う）。** Appleの案内は、失効を「すべき」とするもので、削除を難しくしないことが優先。
    失効の失敗（Appleの不調・コードの無効・鍵の設定の不備・`authorizationCode` が無い）は、`appleRevoked: false` で伝える。アプリは、利用者に、
    Appleの設定（Apple Account の「Appleでサインイン」）から連携を解除できると案内する（7.3.11。`account.deletedAppleNotRevoked`）。D1が先なのは、失敗しうる書き込みを、止められる前に
    済ませ（失敗したら何も消えず、やり直せる）、あとに残るのを、失敗しても削除を損なわない処理だけにするため。
    -   iOS: 認可コードを、バンドルIDの `client_id` で交換し（`redirect_uri` は付けない。**ネイティブのコードの交換が `redirect_uri` 無しで通るかは未確認。7.3.13**。
        D1を消す前に行い、失敗しても削除は止めない）、得た `refresh_token`（無ければ `access_token`）を、D1を消したあとに、
        `POST /auth/revoke`（`token_type_hint` 付き）で失効させる。
    -   Android: 再認証の本人確認のための交換（Services IDの `client_id`・`redirect_uri`）で、同じ応答のトークンも得る（認可コードは1回限り）。
        そのトークンを、Services IDの `client_id` で失効させる。
    -   **`refresh_token`・`access_token` は、メモリの中で、交換から失効に渡して終わる**（D1にも、ログにも、応答にも出さない）。ログインの交換
        （`exchange`）は、これまでどおり `id_token` だけを読む（`exchangeWithToken` と `revoke` だけが、トークンを扱う）。失敗は、
        `apple token revoke failed: ...`（ステータスと許可リストの `error` 名だけ）を1行 `console.error` に出す。iOSの交換の失敗は、`apple token exchange failed: ...`（`appleToken.ts` と同じ。
        鍵の設定の不備による例外は `unexpected`）で、失効の失敗と区別する。
-   Apple Account側の資格情報が失効していて再認証できないとき（端末にAppleアカウントが無い、など）の逃げ道は、**作らない（7.3.11 で決めた）**。
    再認証なしでは削除できない（セッションを盗まれた端末から、再認証なしにアカウントが消えるのを防ぐ）。
    **依頼先は、メール（`yskms.studio@gmail.com`。ストアで公開済みの連絡先）にした（7.3.12 で決めた。公開の GitHub Issues は、本人・アカウントを
    特定する情報を公開の場に書かせることになるので、削除の依頼には使わない）。** Google Play は、アカウントを作れるアプリに、アプリ内の削除とは別に、Web上の
    削除依頼の窓口（アプリ名か開発者名と削除の手順が目立つこと、保存期間の明示）を求める（Play Console ヘルプ「Understand app account deletion requirements」。
    メールでよい、フォームは不要）。窓口の置き場は、プライバシーポリシーの「アカウントの削除」の節（アンカーリンク）。
    **ただし、運営者は、メールの依頼からアカウントを引けない**（メールアドレスも名前も保存しない。`sub` は、利用者が知らない）。そのため、ポリシーには、
    そのまま書く: サインインできるなら、アプリ内で削除する（再認証が通る）。サインインできないなら、最後に使ってから1年で自動削除される
    （「未使用のアカウントの自動削除」）。メールの依頼を受けても、運営者が行えるのは、手順の案内までで、アカウントを引いて消す手順は無い
    （本人確認の手段が無い。作らない）。アプリの画面には、依頼先を出さない（連絡先が変わっても、アプリの更新が要らないように）。
-   **R2のスナップショット・`profiles`・`username` の退避は、7.4.5 で足した（実装済み）。Requestの削除は 7.6。** `deleteUserAccount`（`worker/src/account.ts`）が行う（自己削除と `account-deleted` の両方が、この関数を使う）。
    順序は、「`username` を読む → R2のスナップショットを消す → D1の行を消す」。R2の削除に失敗したら、D1の行を残して失敗にする（行が無いと、消し残した
    スナップショットのキーが分からなくなる）。失敗は、自己削除では 503 `service_unavailable`（何も消えていない。`T` は使用済みなので、再認証からやり直す）、`account-deleted` では 503
    （Appleが再送するかは分からない。再送されなければ、公開ページのあるアカウントは、自動削除の対象外のまま残る）。D1の行を消すバッチに、`username` を `retired_usernames` へ移す文を入れる
    （再利用させない。ユーザーIDとは結びつけない。「実装時に決めること」）。`username` を確保していない（`profiles` が無い）アカウントは、R2に触れない（R2が使えなくても消せる）。
    受け入れている小さな競合: 消している最中に、別の端末が Publish すると、スナップショットが残りうる（数十ミリ秒の重なり）。`username` は移るので、別の人には渡らない。
-   `client_secret`（ES256のJWT）は、Workerがリクエストごとに、Sign in with Appleの秘密鍵（`.p8`。Workerのsecret）
    で署名する。`exp` は最大6か月先までなので、短く取り、定期的な再生成は要らない。
-   複数のログイン手段がつながったアカウント（「アカウントのつなぎ方」。つなぐ画面は、7.3.11 では作らなかった）では、削除は、ログイン中の手段で再認証するだけで、
    すべてのログイン手段と、全セッションを消す。つながった別のAppleのログイン手段のトークンは、失効しない（再認証していないため）。つなぐ画面を作るなら、
    そのときに、削除の再認証をどうするか決める。**Appleの `account-deleted` の処理（`worker/src/appleNotification.ts` の `deleteAppleIdentity`）は、ログイン手段の件数の確認と削除が
    1つのトランザクションに入っていない**（今は、既存のユーザーにログイン手段を足す処理が無いので、確認と削除の間に件数が増えない）。つなぐ処理を作るときは、確認のあとに
    つながった手段ごとアカウントが消える、または、最後の手段だけが消えて `users` の行が残る、を避けるために、確認と削除を1文か1バッチにする（7.4 のR2の削除の順序と合わせて決める）。

**未使用のアカウントの自動削除**（実装済み。7.3.12。Worker: `worker/src/inactiveAccounts.ts`・`account.ts`・`index.ts` の `scheduled`、`migrations/0003`）

-   **方針（決定）。** 最後に使ってから**1年**（`INACTIVE_ACCOUNT_TTL_MS`）を過ぎたアカウントを、毎日1回の Cron Trigger（`wrangler.jsonc` の
    `triggers.crons`。UTC 03:17）で消す。理由: 運営者はメールからアカウントを引けず（上の「依頼先」）、サインインできない利用者のデータが、
    いつまでも残らないようにするため。保存期間の上限として、ポリシー・ストアの申告にも書く。消すのは `users` の行（`identities`・`sessions` は
    外部キーのカスケード）。**端末内のレパートリーには触れない。**
-   **最後に使った時刻 `users.last_active_at`（0003、ミリ秒）。** `sessions.last_used_at` だけでは足りない（ログアウトでセッションの行が消える）。
    `identities.last_sign_in_at` との最大でも、「11か月使って、ログアウトの1か月後に消える」穴が残る。アカウント単位の列で持ち、次の操作で進める
    （時計が戻る値は書かない）。**どれも、すでに書く操作に相乗りする**（これだけのために毎回書かない。D1のFreeは書き込み10万行/日）:
    ログイン（`resolveIdentity`。ユーザーを作るときは作成時刻を入れる）、認証済みのリクエストでのセッションの更新（`authenticateSession`。24時間に1回）、
    ログアウト（`revokeSession`。消す前に進める。**有効なセッションのときだけ**: 期限切れの値でのログアウトでは進めない。最後に使った時刻は、有効なセッションか、
    サインインの成功でだけ進む）。ほかの端末のログアウト・削除・Publish（7.4）は `authenticateSession` を通るので、そこで進む。
    Appleの通知は進めない（利用者の操作ではない）。**端末の中だけでアプリを使い続け、サーバーとの通信が無い間は進まない**: 7.3 のアプリで、認証つきの通信をするのは
    `signOutOthers` と `deleteAccount` だけなので、曲の管理を毎日続けても、Account 画面を開いても（サインイン状態の表示は `getSignedInProvider` で、SecureStore を読むだけ。サーバーに通信しない）、
    サインイン・サインアウト・ほかの端末のサインアウトのどれかをしなければ、1年でアカウントが消える
    （サインアウトは、通信できずサーバーに届かなかったときは数えない。端末の値だけが消える）。サーバーで消えたあとも、アプリは
    SecureStore のセッションを見て「サインイン中」と出し続け、次の認証つきの操作（401）で、端末のセッションを捨てる（7.3.11）。アカウントを出した版から起きる。
    今のアプリでは、アカウントが無くても失うものは無い（曲は端末の中。再度サインインすればよい）。ポリシーの「使った」の説明は、これに合わせてある
    （端末の中だけの利用は数えない）。7.4 で影響が大きくなる（下の7.4の宿題）。
    索引は付けない（更新のたびに索引の書き込みが増える。1日1回の走査で足りる。数十万人を超えたら見直す）。
-   **NULL は削除しない側に倒す。** 0003 で、既存のユーザーを `MAX(created_at, 最後のサインイン, セッションの最後の利用)` で埋める（本番はログインが無く、
    ユーザーは居ない）。それでも NULL の行は、`last_active_at < 基準` が偽になり、消えない。**`COALESCE(last_active_at, created_at)` に「簡略化」しない**
    （埋め漏れた、使われているアカウントを消す）。
-   **消す文に条件を入れ直す（`deleteInactiveUserStatement`）。** 候補の SELECT と DELETE の間に、そのアカウントが使われる（ログインなど）ことがある。
    `DELETE FROM users WHERE id = ?1 AND last_active_at < ?2` を1文で行う。無条件の `deleteUserAccount` を使い回さない（選んだあとにログインしたアカウントを
    消す）。「候補に選ばれたあとに使われたアカウントは消えない」は、テストで固定している。
-   **削除できたかは、変更行数が 0 より大きいか。「1 のとき」にしない。** ローカルの D1(`getPlatformProxy`・`wrangler dev`)では、`meta.changes` が、外部キーのカスケードで
    消えた `identities`・`sessions` の行も数えた（ユーザー1・ログイン手段1・セッション1で 3）。**本番のD1では未確認**（デプロイのあと、確かめる）。0 より大きいかで見れば、
    本番が 1 を返しても動く。件数を足し上げる用途には使えない（文ごとに見る）。
-   **D1のクエリは2回だけ。** 候補の SELECT（最大100件）と、条件つきの DELETE を並べた1回の `db.batch()`。Freeは、1回の実行で D1 のクエリが50回までで、
    バッチは1回と数える（[D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)）。アカウントごとにクエリを分けると、100件の上限が50回で止まる。
    Cron の CPU 時間は Free で10ms（待ちは数えない。[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)）。Free の Cron Trigger は1アカウントに5つまで。
-   **1回の実行で消すのは最大100件**（`MAX_DELETIONS_PER_RUN`）。多ければ翌日以降に続く（冪等）。`scheduled` は `await` で待ち、失敗は実行の失敗として記録される。
    Workers Logs は無効なので、見えるのは `wrangler tail`（またはダッシュボードの実行の結果）だけ。ログに出すのは件数の1行（`inactive account deletion: deleted=… skipped=…`）で、
    ユーザーIDは出さない。何も無い日は出さない。`skipped` は、候補に選んだが、消す瞬間に条件から外れた数。
-   **Appleのトークンは失効できない。** `refresh_token` を保存していないため、自動削除では失効しない。利用者の Apple Account の「Appleでサインイン」に、Singfolio が
    残る（利用者が、そこから解除できる）。ポリシーに書く。Googleは失効するものが無い。
-   **Cron Trigger は、7.3.13 のデプロイで登録した**（デプロイの出力に schedule `17 3 * * *`）。実行は、UTC 03:17 に `wrangler tail` を開いて、
    `scheduled` が Ok になるのを見る（未確認。ユーザーが居ないので、件数の行は出ない。ローカルは `wrangler dev --test-scheduled` で `/cdn-cgi/handler/scheduled` を呼べる。workerd で、古いユーザーが消え、
    新しいユーザーと NULL が残ることを確かめた）。
-   **決定（7.4）: 公開ページのあるアカウント（Publish済み）を、自動削除の対象外にする。** 上の「端末の中だけの利用は数えない」は、アカウントを出した版から起きる
    （7.3 の機能だけでも）。公開ページが載ると、失うものが増える: 端末の中だけで使い続ける人は、サーバーとの通信が無く、1年後に公開ページごと消える。
    対案の「Publishを利用の記録に数える」は、Auto Publish が変更の無いときに通信しないので足りない。対象外にすれば、`deleteUserAccount` の順序（R2を消す → D1を消す）を、
    条件つきの削除に当てはめるときの問題（R2だけが消え、D1の条件に外れる）も無くなる（`worker/src/account.ts` のコメント）。Unpublish か削除をすれば、対象に戻る。
    -   **対象外の条件は、1か所に置く**（実装済み。7.4.5。`worker/src/account.ts` の `AUTO_DELETE_EXEMPT_SQL`）。候補の SELECT と、条件つきの DELETE と、`username` を移す文が、同じ式を使う
        （消す瞬間にも見る。選んだあとにPublishしたアカウントを消さない）。今の式は `EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = users.id AND p.published_at IS NOT NULL)`。
        のちに「無料は公開ページも1年で消える、課金していれば消えない」へ切り替えるとき、その式だけを変えればよいようにするため。今は課金の仕組み（購読の状態の保存など）を作らない。
    -   **対象外にならないアカウント**: `username` だけ確保して Publish していない・Unpublish した・一度も `username` を確保していない。1年で消える。消すアカウントの `username` は、同じバッチで
        `retired_usernames` に移す（`retireInactiveUsernameStatement`）。D1のクエリは、これまでどおり2回（候補の SELECT と、文の組を並べた1バッチ）。R2には触れない
        （印が立っていない＝R2にスナップショットが無い、が前提。印は R2 に書く前に立て、R2を消したあとに下ろす）。
    -   **切り替えるときの前提。** (1) 利用の記録を先に足す（認証つきの通信を、アプリが定期的に行う。`authenticateSession` が `last_active_at` を進める）。切り替えると、
        Auto Publish が通信しない間も使っている人が、1年で消えるため。(2) ポリシーを直し、利用者に知らせてから行う（「公開ページのあるアカウントは自動では消えない」を前提に使い始めた人の約束を変えるため）。
    -   **残るリスク。** アプリを消した、再認証できなくなったなどで、本人が取り下げられない公開ページが残り続ける。運営者はメールからアカウントを引けないが、公開ページは `username` で特定できる。
        取り下げの窓口は 7.5 で決める。

**Appleのサーバー間通知**（実装済み。7.3.10。`worker/src/appleNotification.ts`・`idToken.ts` の `verifyAppleNotification`。本物のAppleでの確認は 7.3.13）

-   **`POST /auth/apple/notifications`**。本文は `{"payload":"<JWS>"}`（16KBまで）。デプロイのあと、利用者が、Apple Developer の primary App ID の
    Sign in with Apple の設定に、`https://singfolio.app/auth/apple/notifications` を登録する（グループで1つ。TLS 1.2 以上が要る。Cloudflareは満たす）。
    登録するまで、通知は届かない。
-   **検証**（IDトークンと同じ公開鍵のキャッシュ。`alg` は RS256 のみ、`kid` 必須、`iss` は `https://appleid.apple.com`）。`aud` は、**バンドルIDとServices IDの
    どちらでもよい**（ログインの `aud` は1つに決めるが、通知がどちらの `client_id` で来るかは、資料に書かれていない。どちらも自分のIDで、署名が、Appleが
    自分宛てに送ったことを示す。7.3.13 で、本物の通知（「Apple ID の使用を停止する」）がこの検証を通り、200 でセッションが消えた。`aud` がどちらだったかは、tail に中身が出ないので分からない）。**`exp`・`iat` は必須にしない**（資料の例は `iss`・`aud`・`iat`・`jti`・`events` で、`exp` が無い。
    `exp` が付いていれば jose が見る）。通らなければ D1に何も書かない: 401（どの検査かは教えない）、公開鍵が取れなければ 503、本文の形の不備は 400、413、405。
    検証に通らなかったときは、理由の分類だけを `apple notification rejected: reason=...` と1行 `console.error` に出す（`aud` の食い違いなどの設定の不備は、
    これでしか切り分けられない。通知の中身・トークンは出さない）。
-   **`events`** は、資料の例ではJSONのオブジェクト。文字列（JSON）で送られる、という報告もあるので、どちらも読む。`type`・`sub`・`event_time` の3つを必須にする。
    `event_time` は、資料の例は秒、実際はミリ秒という報告があるので、1e11 未満なら秒として1000倍し、受け取った時刻を超える値は、受け取った時刻に丸める
    （巨大な値を記録して、そのあとのログインが止まらないように）。数字の文字列も読む。**種類の綴り**: 資料（確認: 2026-11-17）は `account-deleted`。
    古い資料・フォーラムには `account-delete` の記述があるので、両方を読む。`email-enabled`・`email-disabled`・知らない種類は、200で何もしない。
-   単位は、その Apple の `sub` の `identities` の行（`provider = 'apple'`）。
-   **`consent-revoked`**（アプリとの連携の解除）: その行の、取り消しの時点であったセッションを消し、`identities.consent_revoked_at`（migrations/0002）に `event_time` を記録する。1つのバッチで行う。
    -   **削除は、セッションの単位**: `sessions.created_at <= event_time` のものだけ（`created_at` はログインの開始時刻）。通知が届く前にサインインし直した
        （連携が戻った）端末のセッションは残り、取り消しの前から生きていたほかの端末のセッション（盗まれた端末のものなど）は、サインインし直した行があっても消える。
        同じ通知の再送・遅れて届く古い通知は、あとのセッションを消さない。行の単位（`last_sign_in_at <= event_time` の行だけ処理する形）にしない:
        取り消したあと、通知が届く前に、別の端末でサインインし直しただけで、取り消し前の端末のセッションが残る。
    -   **記録は、行の単位**: ① `last_sign_in_at <= event_time`（通知のあとにサインインし直した行には、記録しない）、② `consent_revoked_at` が無い、または
        `event_time` より前（同じ通知の再送は、何もしない）。行は消さない。
-   **`account-deleted`**（Apple Account の削除）: その行を消す（セッションも、外部キーで消える）。ほかのログイン手段が無ければ、アカウントごと消す
    （`deleteUserAccount`。R2のスナップショットなどは、7.4 以降）。**順序は見ずに処理する**（消えたApple Accountは戻らない）。同じ通知が2回届いても、2回目は行が無く、何も起きない。
-   **ログインとの競合（7.3.10 で確かめた）。** 通知を処理した最中に、その前に検証を通っていたログインがセッションを作ると、取り消し後のセッションが1つ残りうる。
    **`last_sign_in_at` と `event_time` の比較だけでは、吸収できない**（ログインの開始が `event_time` より後だと、通知が「サインインし直した」と見て無視する）ので、
    `consent_revoked_at` を足した。`createSession` は、INSERT の1文の中で、`consent_revoked_at` がそのログインの開始時刻（`now`）と同じか後なら、セッションを作らない（同じミリ秒は、取り消しより前と見る。通知の削除の条件 `created_at <= event_time` と同じ側なので、どちらが先でも残らない）
    （ログインは 401。やり直せば通る）。通知の処理（削除と記録）も1バッチなので、どちらが先でも、取り消し後のセッションは残らない: ログインのINSERTが先なら、通知の
    DELETE が消し、通知が先なら、INSERT が条件で止まる（`worker/test/appleNotification.test.ts`）。
    **残るリスク（受け入れる）**: ログインの開始が `event_time` より後で、IDトークンが取り消しの前に発行されたもの（取り消しの直前に得たトークンを、取り消しの
    あとに送る）。トークンは、サインインの直後にアプリが送るので、取り消しを、別の端末で、数秒のうちに行ったときだけ。IDトークンの `iat` と比べれば吸収できるが、
    検証の結果にクレームを載せない方針（「IDトークンの検証」）を崩し、通知の `event_time` の単位（秒かミリ秒か）への依存も増えるので、採らない。
    **同じ種類の穴**（どれも、取り消しの前後の1秒ほどに、サインインが重なったときだけ。受け入れる）: (a) `event_time` が秒で来ると、記録する値は、実際の取り消しより最大1秒前
    （切り捨て）で、`createSession` の `now`・`created_at`（Workerの時計）と比べるAppleの時計のずれも、同じ向きに効く。その間に始まったログインのセッションは、
    取り消しのあとのものと見なされ、通知が消さない。時刻の比べ方に余裕（`+ 数秒`）を持たせても、取り消しの直後に、あらためてサインインした利用者のセッションを消す
    のと引き換えなので、採らない。丸めの向き・時計のずれは、実際の単位が分かる 7.3.13 で見直す。(b) 取り消しのあとにサインインし直した行（`last_sign_in_at > event_time`）には、
    `consent_revoked_at` を記録しないので、そのとき、取り消しの前に始まった別のログインが、まだ進んでいると（2つのログインが、取り消しの前後で重なったとき）、そのセッションが残る。
    `account-deleted` との競合: ログインの `resolveIdentity` のあとに行が消えたなら、`createSession` が、行が無いので条件で止まり、401（例外にしない）。
    `resolveIdentity` のまえに消えたなら、その `sub` の新しい（空の）アカウントができる。消えたApple Accountの `sub` で、削除の前に発行されたIDトークンを
    送ったときだけで、空のアカウントは何も持たない（受け入れる）。
-   確かめたこと: Nodeのテスト（模擬の発行元・ローカルD1。`worker/test/appleNotification.test.ts`）で、各検査の拒否（`aud`・`iss`・署名・`kid`・`alg: none`・`HS256`・`exp`・`events` の形）、
    `consent-revoked` の処理・再送・遅れて届く通知・時刻の単位・競合、`account-deleted` の処理（唯一のログイン手段・ほかが残る場合）。workerd（`wrangler dev`）で、
    エンドポイントが届くこと（400・401・405・理由の1行）。**未確認（7.3.13）**: 実際のAppleの通知の形（`events` が文字列かオブジェクトか、`event_time` の単位、`aud`、
    `account-deleted` の綴り）、登録（primary App IDで、Services IDのグループを含む）、通知が届くまでの遅れ、Appleが同じ通知を再送するか。

**AndroidのAppleログイン（Web経由）**（実装済み。7.3.9。実際のAppleでの確認は未了で、7.3.13。最後の「実装」の節）

AndroidにはAppleのネイティブのサインインが無いので、Appleの認可のWebのフロー（`appleid.apple.com/auth/authorize`）を
ブラウザで開く。

-   アプリは、まず乱数の検証用の値 `V` を作り、そのハッシュ `C = SHA-256(V)` を `POST /auth/nonce` に送って、
    署名つきの値 `T`（乱数・期限・種別 `web`・`C` をWorkerの秘密鍵でHMAC署名したもの。D1に書かない）を受け取る。`V` と `T` は、
    アプリのメモリにだけ置く（SecureStore には置かない。ブラウザを開いている間にアプリが終了したときの再開は、実装していない。
    「実装」の節）。
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
-   削除のときの再認証も、同じフロー（同じ `V`・`T` の結びつけ）で `code` を得て、交換し、失効させる（`POST /auth/delete`。「アカウントの削除とAppleのトークン失効」）。
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
-   IDトークンの `aud` の値は、ログイン経路によって2種類ある（iOSのネイティブはバンドルID、AndroidのWebはServices ID）。
    Workerが1回の検証で受け入れるのは、`T` の種別に合う1つだけ（`native` はバンドルID、`web` はServices ID。「IDトークンの検証」の
    `audienceFor`）。もう一方の `aud` のトークンは拒否する。失効は、そのトークンを得たときの `client_id` で行う。
-   Services IDは、アプリのApp ID（primaryのApp ID）と同じグループにし、`singfolio.app` と、コールバックのURLを、
    Services IDの設定（Website URLs）に登録する。Appleの手順は、ドメインの検証ファイルのアップロードは要らない、と
    している。実際に、Services IDの登録と設定（Website URLsの保存）で、画面は検証ファイルを求めなかった。
    サーバー間通知のエンドポイントは、primary App IDに
    登録し、このグループで1つ（TLS 1.2が要る）。
-   `sub` が、iOS（バンドルID）とAndroid（Services ID）で同じになるか。同じグループなら資格情報は共有される
    （Appleの資料）が、実際のトークンで確かめる（7.3）。違うと、Appleでの、OSをまたぐ引き継ぎはできない。

**AndroidのAppleログイン（Web経由）の実装**（7.3.9。Worker: `worker/src/appleWeb.ts`・`appleToken.ts`・`appleClientSecret.ts`、アプリ:
`src/repositories/appleWebSignInRepository.ts`・`src/services/accountService.ts`・`app/+native-intent.tsx`）

-   **`GET /auth/apple/callback`**（Services ID の Return URL）。`?code=…&state=…`、または取りやめの `?error=…&state=…` を、アプリのURL
    スキームへの 302 で戻す（`Location: singfolio://auth/apple?code=…&state=…`）。何も保存せず、Appleを呼ばず、D1に触れない。戻り先は
    コードに固定で、リクエストのパラメータからは決めない。渡すのは、形を確かめた `code`（印字できるASCII 1〜1024字）・`state`（`SHA-256(T)` の
    43字）・`error`（小文字と `_` の64字まで）だけで、URLエンコードして付ける。`code` か `error` のどちらか1つが無い、形が違う、は 400
    （Appleのリダイレクトではない）。HEAD は本文なしの 302、`GET`・`HEAD` 以外は 405。`Cache-Control: no-store`・`Referrer-Policy: no-referrer`。
    本文には、リダイレクトに従わないクライアント用のリンクを添える（ブラウザには描画されない。逃げ道ではない。下の「Chrome の Custom Tab での戻り方」）。
-   **`POST /auth/apple/login`**。JSON `{"code":"<認可コード>","nonce":"<T（web）>","verifier":"<V>"}`（本文は4KBまで）。200 `{"session":"<値>"}`。
    失敗は `/auth/login` と同じ形: 400（形の不備。`verifier` は43字の base64url）、401（検証に通らない。理由は教えない）、503（Appleが使えない）、
    405、413。順序: `T` の署名・種別（`web`）・期限 → **`SHA-256(V)` が `T` の中の `C` と一致するか（Appleを呼ぶ前。通らなければ呼ばない）** →
    Appleの `POST https://appleid.apple.com/auth/token` で認可コードを交換 → IDトークンの検証（`aud` は Services ID、`nonce` は `SHA-256(T)`）→
    `consumeNonce` → `resolveIdentity` → セッションの発行。D1に書くのは、IDトークンの検証が通ったあとだけ。
-   **Appleとの通信**（`appleToken.ts`）。form で `client_id`（Services ID）・`client_secret`・`code`・`grant_type=authorization_code`・`redirect_uri`
    （Return URL と同じ）を送る。リダイレクトには従わない、5秒で打ち切る、再試行しない（認可コードは1回限りで5分有効）。応答は、`id_token` だけを
    使う。**ログインでは、`refresh_token`・`access_token` は、読まず、保存せず、ログにも出さない**（ログインには要らない。アカウントの削除（7.3.10）だけが、
    失効のために、メモリの中で読む。「アカウントの削除とAppleのトークン失効」）。Appleの応答の本文・コード・IDトークンを、エラーにも結果にも載せない。**400 `invalid_grant`**（無効・期限切れ・
    使用済みのコード）**は 401**。それ以外（通信の失敗・5xx・`invalid_client`（こちらの設定の不備）・`invalid_request` など）は 503
    （どれも利用者にできることが無い。コードの問題と区別しても同じ）。
    **設定の不備は、本物のコードで試すまで分からない。** でたらめなコードでAppleのトークンのエンドポイントを呼ぶと、Team ID・Key ID・鍵・Services ID・
    `redirect_uri` が合っていなくても、Appleは常に 400 `invalid_grant`（"The code has expired or has been revoked."）を返す（使い捨ての鍵・存在しない
    Services ID・違う Team ID・違う Key ID・未登録の `redirect_uri` で測定した）。つまり、でたらめなコードで設定を事前に確かめる手は使えない
    （「`invalid_grant` なら設定は正しい」とは言えない）。設定の不備（`invalid_client`）は、7.3.13 の最初の本物のコードの交換で初めて出て、利用者には
    Appleの障害と同じ 503 になる。切り分けのため、`invalid_grant` 以外の失敗は、分類だけを1行、`console.error` に出す
    （`apple token exchange failed: status=400 error=invalid_client`・`...: network`・`...: status=502 unreadable`・`...: status=200 no id_token`）。
    出すのは、ステータスと、許可リストにある `error` の名前（RFC 6749 の語彙。外の値は `other`）だけで、コード・`client_secret`・IDトークン・Appleの応答の
    本文（`error_description` を含む）・例外の中身は出さない。Workers Logs は無効のままなので、`wrangler dev` の出力か `wrangler tail` で見る
    （`wrangler tail` は、Workers Logs が無効でも出ると理解しているが、デプロイしたWorkerでは未確認。7.3.13 で確かめる）。
-   **`client_secret`**（`appleClientSecret.ts`）。ES256のJWT（`kid` = Key ID、`iss` = Team ID、`sub` = Services ID、`aud` =
    `https://appleid.apple.com`、`exp` は5分先）を、秘密鍵（`.p8`）でリクエストごとに署名する。Team ID・Key ID は `wrangler.jsonc` の `vars`
    （秘密情報ではない）、**秘密鍵は `APPLE_PRIVATE_KEY`（必須の秘密情報。`wrangler secret put APPLE_PRIVATE_KEY`）**。鍵が無い・PKCS#8のEC鍵として
    読めないのは設定の不備なので、利用者の失敗にせず投げる（Cloudflareのエラーページ。`NONCE_HMAC_KEY` と同じ扱い）。鍵・JWTは、エラーにもログにも
    出さない。改行が `\n` の2文字で渡された値も読む（`.dev.vars` の1行表記）。workerd（`wrangler dev`）で作ったJWTが、公開鍵で検証できることを確かめた。
-   **アプリ**。`account.signIn('apple')` は、Androidでは、IDトークンの経路ではなく、**認可コードの経路**（`authCodeProviders`）を使う（iOSは
    IDトークンの経路）: `V`（32バイトの乱数の base64url）を作る → `C = SHA-256(V)` を入れた `web` の `T` を得る（`POST /auth/nonce`）→
    `SHA-256(T)` を `state` と `nonce` にして、Custom Tab（`expo-web-browser` の `openBrowserAsync`）で認可の画面を開く → 戻りのURL
    （`singfolio://auth/apple?...`）を Linking で受け取り、`code` を取り出す → `code`・`T`・`V` を `POST /auth/apple/login` へ。Appleには、`scope` を送らない
    （名前もメールも要求しない。スコープが無いので `response_mode=query` でよい）。
    -   **戻りのURLの扱い。** `state` が `SHA-256(T)` と違う・無い `code` のURLは、自分のフローのものではない（他のアプリが押し込んだものなど）ので、
        受け取らず、待ち続ける。取りやめ（`error=user_cancelled_authorize`）は `cancelled`、ほかの `error` は `provider-failed`。ブラウザを開けなければ
        `provider-failed`。上限は、`account` の5分（待つのをやめるだけで、Custom Tab は閉じられない）。
    -   **ブラウザを閉じた（取りやめ）の判定。** Android には、Custom Tab が閉じたことを知らせる手段が無い。アプリが前面を離れたあとに前面
        （`AppState` が `active`）へ戻ったとき、戻りのURLを待つ猶予（1.5秒）を置き、来なければ `cancelled` にする。戻りのURLでアプリが開くときは、前面への
        復帰とURLの到着の順番が決まっていないため、猶予が要る（`expo-web-browser` の `openAuthSessionAsync` は、Androidでは、この2つを競わせるだけで、
        リダイレクトで戻っても `dismiss` が勝ちうる、とソースを読んで判断した。実測はしていない。使わない）。
    -   **`app/+native-intent.tsx` は外さない。** 戻りのURLを expo-router に渡すと「画面が見つかりません」（`+not-found`）へ遷移する。`redirectSystemPath` で、
        このURLには、**起動中なら `null`（遷移しない）、起動時のURLなら `'/'`（ルートから始める）**を返す（判定は、サインインの処理と同じ `parseReturnUrl`。
        `src/repositories/appleWebSignInRepository.ts` の `redirectSystemPath`）。**起動時に `null` を返してはいけない**: expo-router は、ディープリンクが
        無い起動を、ルートのURLに直して Songs から始めるが、`null` はその処理を飛ばし、Stack の既定の先頭（`song/new`、Add Song）が開く
        （Androidで確認して直した）。ほかのURLは、そのまま渡す。
    -   **アプリが終了したときの再開は実装していない。** Custom Tab を開いている間にAndroidがアプリのプロセスを終了すると、戻りのURLで、アプリは新しく
        起動し、`V` と `T`（メモリにだけある）は失われる。サインインは完了せず、先頭の画面が出る（戻りのURLは無視される）。利用者がやり直す。
        SecureStore に置いて再開するには、起動時に戻りのURLを拾って完了させる処理と、その結果を伝える画面が要る。**7.3.11 では実装しないと決めた**: 起きるのは、Custom Tab を開いている間にOSがプロセスを終了したときだけで、失うのは「やり直す」1回の操作。`V` を端末に置く危険（`V` の秘匿が `C` の照合の根拠）のほうが大きい。
-   **確かめたこと**: Nodeのテスト（Worker: コールバックの形と拒否、`client_secret` のJWT、コードの交換の成功・各失敗の分類と、`refresh_token` を
    載せないこと、`POST /auth/apple/login` の成功・各拒否（`V` の不一致・`native` の `T`・期限切れ・署名違い・`invalid_grant`・Appleの不調・リプレイ・形の不備）で、
    Appleを呼ぶ前に落ちるものはAppleを呼ばず、D1に何も書かないこと。アプリ: 認可のURL・戻りのURLの読み取り・`state` の照合・猶予・取りやめ・上限、
    `account` の認可コードの経路）。workerd（`wrangler dev`）で、コールバックの 302、`T`（web）が131字、`V` の不一致が 401、形の不備が 400。
    **Androidエミュレータ（R8入りのrelease。Chrome の Custom Tab）で確かめた**: ① Custom Tab で、ローカルの Worker のコールバック
    （`http://localhost:8787/auth/apple/callback?...`。`adb reverse`）を開くと、Worker の 302（`singfolio://auth/apple?...`）でアプリが開き、
    アプリが `code` を受け取る（画面は `+not-found` に遷移しない）。② 本物のAppleの認可の画面（`appleid.apple.com`。`client_id` に Services ID、
    `redirect_uri` に Return URL、`response_type=code`、`response_mode=query`、スコープ無し）が、エラーなしで出る（「Use your Apple Account to sign in
    to Singfolio.」。Services ID と Return URL の登録、スコープ無しの `query` を、Appleが受け付けた。資格情報は入れていない）。③ 戻りのURLを `adb` で
    送ると `code` を受け取る。`state` が違うURL・`state` の無い `code` は受け取らない（偽のURLでは `code` は得られず、前面への復帰から1.5秒で
    `cancelled`）。④ Custom Tab で戻ると `cancelled`。⑤ 実際の `account.signIn('apple')` が、本番の `POST /auth/nonce`（web）から Custom Tab の表示まで通る。
    ⑥ 起動時（アプリが終了している状態）に戻りのURLが届くと、Songs が開く（直す前は Add Song）。FATAL なし、R8 の問題なし。DEX は 9,445,884 バイト。
    権限は変わらない（`INTERNET`・`VIBRATE` のみ）。Androidのシステムのログ（`WindowManagerShell` の verbose）に、Custom Tab のURL
    （コード・`state` を含む）が出うる（adb でだけ読める。コードは1回限りで5分有効、`V` が無いと使えないので、この設計で受け入れる）。
    **本物のAppleでの確認（コードの交換、IDトークンの `nonce`、`sub` がiOSと同じか、`client_secret` をAppleが受け付けるか、Return URL からの 302 が実機の
    Custom Tab でアプリを開くか）は、デプロイと、利用者のAppleアカウントでのサインインが要るので、7.3.13。**
-   **Chrome の Custom Tab での戻り方**（エミュレータ API 36、Chrome 154 で測った。テスト用のページ（`127.0.0.1`）から、別のオリジン（`localhost`）のコールバックへ
    スクリプトで遷移し、302 でアプリのURLスキームへ戻す形。Appleのページそのものは再現できないので、最後の遷移が「利用者の操作から、どれだけ離れているか」
    だけを変えた）。(a) 操作なし（開いたまま、8秒後にスクリプトが遷移）は、**確認なしで**アプリが開く。(b) ボタンを押し、`fetch` のあと1秒以内に遷移も、
    確認なしで開く。(c) ボタンを押して**7秒後**に遷移（ユーザー操作の有効期間（約5秒）を過ぎる）は、Chrome が「Continue to Singfolio?」（「This site wants to open
    the Singfolio app」）を出し、**押すとアプリが開く**（自動では開かない。表示は数秒で消え、押さずに Custom Tab を閉じると、猶予のあと `cancelled`）。302 の
    本文（リンク）は、どの場合も描画されない。200 のページにリンクを置く形にしない理由は、(a)(b) でも毎回1回押させることになり、JSでの遷移がより厳しく
    扱われるかも測っていないため。Appleの実際のページからの戻りが(a)(b)(c)のどれになるかは、7.3.13 で確かめる。(c) になるなら、利用者への見え方（確認を押す
    必要）を踏まえて、戻し方を見直す。
-   **Custom Tab のタスクと、アプリの外へ移る経路**（確認コードをSMSで受け取るなど）。`openBrowserAsync` には、`createTask: true`・`useProxyActivity: true`・
    `showInRecents: true` を**明示して渡す**（`src/services/index.ts`。expo-web-browser 57.0.3 の既定と同じ値だが、固定する。外さない）。`useProxyActivity` が真だと、
    Custom Tab を、別のタスク（`taskAffinity` が `.webContainer`）の透過Activityから開く。このタスクは最近使ったアプリに出て、Home・ほかのアプリへ移っても破棄されない。
    偽（旧来の経路）は、`showInRecents` が偽のとき `EXCLUDE_FROM_RECENTS` と `NO_HISTORY` を付け、最近使ったアプリに出ず、離れると破棄される（レビューは、この経路の
    ソースを読んで、「戻る手段が無い」と推した。既定では、この経路は使われない）。エミュレータで、Home → 設定アプリ → 最近使ったアプリ から Custom Tab のカードを選ぶと、
    Appleのページに戻り、アプリには何も起きない（サインインは続く）ことを確かめた（固定したオプションでも同じ）。**アプリのほう**（ランチャーのアイコン・アプリのカード）を
    開くと、前面への復帰から1.5秒で `cancelled` になる。Custom Tab が残っているかは、アプリから分からないので、見分けられない（利用者がやり直す。Custom Tab は
    最近使ったアプリに残る）。実機で、SMSの確認コードを別のアプリで開いて入力する経路は、7.3.13。
-   **`state` の無い `error` のURL。** `singfolio://auth/apple?error=x` は、ほかのアプリやWebのリンクからも送れ、届くと進行中のサインインが `cancelled`（または
    `provider-failed`）で終わる。やり直しが要るだけで、乗っ取りにはならない。`error` にも `state` の一致を求める形にしないのは、アプリを前面に出すだけで（ランチャーの
    アイコンなど）、同じ取りやめが猶予のあとに起きるため（エミュレータで確認）。守れる範囲が増えない。Appleが取りやめに `state` を付けるかは、7.3.13 で確かめる。

**Googleのサインイン（iOS・Android）**（実装済み。7.3.8。`modules/singfolio-google-signin`・`plugins/withGoogleSignIn.js`・`src/repositories/googleSignInRepository.ts`）

Googleの公式SDKだけを使う、自作の薄いExpoモジュールで実装する。モジュールの口は `signInWithGoogle(nonce)` の
1つで、IDトークンの文字列を返す（キャンセルや失敗は、コードの付いたエラーにする）。第三者のラッパーのライブラリは
使わない。Androidでは、アカウント選択のシートを、アプリの上にそのまま出せる（Credential Manager）。画面・Service
から、SDKの呼び出しやレスポンスの形に触れないよう、Repository / Service境界の内側に閉じ込める。

-   **構成。** `googleSignInRepository`（`IdTokenProvider`）にモジュールを注入し、`services/index.ts` が**両OS**に
    組み込む（Appleは iOS だけ）。`nonce` は、渡された `SHA-256(T)` の base64url をそのまま渡す。スコープは指定しない
    （指定できない。下）。トークンの中身は読まない。
-   **ネイティブ側が無くても、importでは落ちない。** モジュールの `index.ts` は `requireOptionalNativeModule` で読む
    （`requireNativeModule` は、無いと import の時点で投げ、アプリの起動ごと止める）。ログインを要求しないので、
    v1.0の機能を巻き込まない。無ければ `signInWithGoogle` が `ERR_UNAVAILABLE` で失敗し、`provider-unavailable` になる。
-   **失敗の分類**（モジュールのコード → `AuthError.code`。SDKの例外の内容・トークンは載せない）:

    | モジュールのコード | 起きるとき | `AuthError.code` |
    |---|---|---|
    | `ERR_CANCELED` | 利用者が取りやめた（両OSで確認） | `cancelled` |
    | `ERR_NO_ACCOUNT` | Androidで、端末にGoogleアカウントが無い（`NoCredentialException`） | `provider-failed` |
    | `ERR_FAILED` | 取りやめ以外のSDKの失敗すべて（Play services が使えない、通信できない、など） | `provider-failed` |
    | `ERR_NO_PRESENTER` | 画面を出す先（Activity・ViewController）が無い | `provider-failed` |
    | `ERR_NO_ID_TOKEN`、IDトークンが空・文字列でない | SDKは成功したのに、IDトークンを取り出せなかった | `invalid-response` |
    | `ERR_UNAVAILABLE` | ネイティブ側が組み込まれていないビルド | `provider-unavailable` |
    | `ERR_NOT_CONFIGURED`、知らないコード、コードの無い例外 | クライアントIDがビルドに入っていない（アプリの不具合）、想定外 | `unexpected` |

    `provider-failed` は、Appleと同じく、原因を言い切らない文言にする（7.3.11。`account.error.providerFailed`）。Androidのアカウント無しも、端末の設定とは
    限らない（Play services の状態、アプリの設定の不備でも同じ `ERR_FAILED` になりうる）。

-   iOS: GoogleSignIn。`signIn(withPresenting:hint:additionalScopes:nonce:)` に `nonce` を渡す。Info.plistに、
    iOSのクライアントID（`GIDClientID`）、サーバー用（Web）のクライアントID（`GIDServerClientID`。IDトークンの
    `aud` になる）、反転したiOSのクライアントIDのURL schemeを置く。IDトークンを取ったら、すぐに `signOut()` を呼び、
    Googleの状態を端末に残さない。
-   Android: Credential Managerの `GetSignInWithGoogleOption`（サーバー用のクライアントIDを指定し、`setNonce`）。
    AndroidのクライアントIDはコードに現れず、パッケージ名と署名のSHA-1で、Google側が照合する（鍵ごとに登録が要る:
    ローカルのビルド、EASのlocal build、Play App Signing）。
-   クライアントIDは3種類（Web・iOS・Android）。秘密情報ではない（アプリに埋め込まれる）。Webクライアントの
    `client_secret` は使わない（Workerは、IDトークンをGoogleのJWKSで検証するだけ）。**Web と iOS のIDは、`app.json` の
    `./plugins/withGoogleSignIn.js` の設定（`webClientId`・`iosClientId`）に書く。AndroidのクライアントのIDはコードに
    現れない**（署名の鍵ごとに別のクライアント。debug・EASのlocal build・Play App Signing）。**`webClientId` は、Workerの
    `GOOGLE_WEB_CLIENT_ID`（`worker/wrangler.jsonc`）と同じ値でなければならない**（IDトークンの `aud` になるため。ずれると、
    すべてのGoogleログインが 401 になる）。`worker/test/config.test.ts` が、この一致と、iOSのクライアントが同じ
    Google Cloudのプロジェクトのものであること（IDの数字の部分）を固定している。検証のために作った別のプロジェクトの
    クライアントIDは使わない（`aud` が合わず、すべてのログインが失敗する）。
-   確かめたこと（検証のための別のクライアントIDで、iOS SimulatorとAndroidエミュレータで、実際のトークンを使った。
    7.3.8 で本番用のクライアントIDに直したあとの再確認は、下の「7.3.8 で確かめたこと」）:
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
    -   キャンセルは、Androidと、iOS（GoogleSignIn 9.2.0）で、キャンセルを表すエラーになる（iOSの10.1.0でも
        確認した。下の「7.3.8 で確かめたこと」）。
-   **7.3.8 で確かめたこと**（本番用のクライアントID。実際のモジュール・SDKを、`googleSignInRepository` 経由で動かした。
    確認用の一時画面は、IDトークンを復号して、`aud`・`azp`・`nonce` の一致・クレームの名前だけを出した。メール・名前の値は出していない。画面は消した）:
    -   **iOS**（Simulator。iPhone 18 Pro。Release。Xcode 27。GoogleSignIn 10.1.0）: ビルドと起動ができる。Info.plist に
        `GIDClientID`・`GIDServerClientID`・反転したクライアントIDのURL schemeが入る。OSの確認ダイアログ（「Singfolio が
        accounts.google.com をサインインに使用しようとしています」）で「キャンセル」を押すと、`cancelled`。「続ける」を押すと、
        Googleのアカウント選択（「Singfolio に移動」。`invalid_client` ではない）。アカウントを選んで同意すると成功し、IDトークンの
        `nonce` は渡した値と一致、`aud` は Workerの `GOOGLE_WEB_CLIENT_ID` と一致、`azp` はiOSのクライアント、`sub` は21字、
        `at_hash` あり。2回目のログインも成功した（iOS 10.1.0の2回目は、これまで未確認だった）。ログインしたのは、
        Google Cloudのプロジェクトの所有者のアカウント。
    -   **Googleの同意画面の文言（iOSのWebシート。初めて見えたもの）**: 初回は「Singfolio にログイン」と、名前とプロフィール写真・
        メールアドレスの許可を求める（スコープの `profile`・`email`）。「Singfolio のプライバシー ポリシーと利用規約をご確認ください」
        という一般の文も出る。2回目以降は、同意は求めず、「Singfolio に再ログインしようとしています」の確認が、毎回出る。
        ストアの申告・同意画面の設定（7.3.12）で、この文言を前提にする。
    -   **Android**（エミュレータ。arm64。R8入りの release。debug 署名）: ビルドと起動ができる。アカウント選択のシート
        （「Choose an account to continue to Singfolio」）が出て、戻るで取りやめると `cancelled`。`FATAL EXCEPTION` は無く、
        logcat にトークン様の文字列も無い。DEX は 9,422,152 バイト（10,000,000 未満）。マージ後のマニフェストの権限は
        `INTERNET`・`VIBRATE` と、アプリ内部用の1つだけ（`USE_BIOMETRIC`・`USE_FINGERPRINT` は外れている）。
        `lib/` の `.so` は22種、すべて把握しているもの。`generate-licenses.mjs --check --apk` が通る。**このエミュレータには
        Googleアカウントが無く、Androidの成功経路は確かめていない。**
    -   **Open source licenses の画面**: iOSは、Pod 9個を全文つきで出す。Androidは、「Google libraries」の別枠に、2行（Google Identity・
        Google Play services）を出し、開くと含まれる成果物と「View terms」の行が出る（ブラウザで規約を開く行は、押していない）。
    -   **R8 とAndroidの成功経路について**: R8 入りの release で動かしたのは、リクエストの組み立てとシートの表示、取りやめまで。
        `credentials-play-services-auth` の consumer rules が `CredentialProviderPlayServicesImpl` を keep していて
        （mapping でも元の名前で残る）、シートが出た。googleid のクラスは R8 で改名される（`GoogleIdTokenCredential` は別名になる）が、
        コードは `credential.type` の文字列と、Bundle の文字列のキーで読むので、名前には依らないはず。ただし、**結果を受け取って
        `GoogleIdTokenCredential.createFrom` で解析し、トークンを返すところは、R8 を通した状態で動かしていない**。
    -   **未確認（7.3.13）**: Androidの成功経路（R8 入りの release で、結果の解析とトークンの返却まで。本番用のクライアントIDと、
        署名の鍵ごとのSHA-1（debug・EASのlocal build・Play App Signing）を含む）、実機、TestFlight・Playの署名したビルド、プロジェクトの所有者でも、テストユーザーでもないアカウントで
        入れるか（同意画面は「テスト中」）、異常系（通信断・アカウントの切り替え・連打）。
-   実装の制約:
    -   iOSは、GoogleSignInの版を固定する（確認したのは10.1.0）。Swiftの依存（AppCheckCore）のために、Podfileで
        GoogleUtilitiesとRecaptchaInteropにmodular headersを指定する（外すと `pod install` が失敗する。config pluginで入れる）。
    -   Androidは、googleidを1.2.0に固定する。最新の1.2.1は、Kotlin 2.4のメタデータで、Expo SDK 57のKotlin 2.1.0
        ではコンパイルできない。依存に、Play services（alpha版を含む）が入る。
    -   Androidの依存が足す `USE_BIOMETRIC` と `USE_FINGERPRINT` は、`blockedPermissions` で外す（外してもログインは動く）。
    -   iOSの `application(_:open:options:)` の購読者（`SingfolioGoogleSignInAppDelegateSubscriber`）は、SDK の説明どおり、
        URL を `GIDSignIn.handle` に渡し、その結果を返す。ただし、**普段はここに URL は来ない**（AppAuth は
        ASWebAuthenticationSession でリダイレクトを直接受け取る。`handleURL` が要るのは、iOS 10 の SFSafariViewController と、
        Google Device Policy アプリのときだけ）。**戻り値は、配送を変えない**: `ExpoAppDelegateSubscriberManager` は戻り値に関わらず
        すべての購読者を呼び、UIScene 採用後は、`SceneEventForwarder` が AppDelegate の戻り値を捨てて、RCTLinkingManager にも
        通知する。`true` にして JS の Linking への到達を止める、という期待はしない。**実測（iOS Simulator）**: Googleの
        リダイレクト用のスキームの URL（`com.googleusercontent.apps.<番号>-<ID>:/oauthredirect?...`）をアプリに開かせると、
        expo-router は「画面が見つかりません」（`+not-found`）に遷移する（「曲の一覧へ」で戻れる。データには影響しない）。
        届くのは EMM など特殊なときだけと見て、今は対応していない（対応するなら、`app/+native-intent.tsx` の
        `redirectSystemPath` で、このスキームを無視する形が候補。未検証）。
    -   Androidは、2回目以降のログインでも、アカウント選択と確認の画面が出る（自動でログインはされない）。ログアウトで
        `clearCredentialState` は呼ばない（7.3.11 で決めた）: 自動でサインインされないので、ログアウトで消す状態が無く、ネイティブの口を足す理由がない。
-   **ライセンス一覧への載せ方（決定。7.3.8）。** Androidの依存（Google Play services 9個と googleid。POMのライセンスは
    Android Software Development Kit License）は、オープンソースではない。`ALLOWED_LICENSES` には**足さず**、対象の
    groupId（`com.google.android.gms`・`com.google.android.libraries.identity.googleid`）だけを個別に許可する（その
    groupId の成果物のPOMが別のライセンスなら、生成が失敗する）。規約（2021-07-27 版）に、アプリへの表示・帰属表示の
    義務は書かれていないので、全文は載せず、ライセンスの名前と規約のURL（`https://developer.android.com/studio/terms`）を、
    About の Open source licenses の別枠（見出し「Google libraries」）に載せる（Androidだけ。画面は screen-flow
    「Open source licenses」）。`androidx.credentials` は Apache-2.0 で、AndroidX の行に入る。iOSの GoogleSignIn と
    その依存の Pod 9個は、Apache-2.0（GoogleUtilities だけ、Apache-2.0 に MIT が続く。この複合の種類は、Pod にだけ許す）で、
    入っている Pod の LICENSE の全文を載せる。
-   **Play services の AAR が持つ OSS の表記（決定。7.3.8 のレビューで追加）。** 上の「表示義務は規約に無い」は、Android
    Software Development Kit License そのものについて。別に、Play services の AAR は、直下に `third_party_licenses.json`・
    `.txt` を持つ（Google の oss-licenses plugin の入力）。Googleの資料（Include open source notices）は、Play services が
    OSS を含む、または依存することがあり、アプリが使う OSS の表記の責任は開発者にある、plugin の一覧には、Play services の
    各ライブラリを作るのに使った OSS の全文も含まれる、としている。この一覧は、実際の同梱より広い（J2ObjC の項目は、iOS 向けの
    runtime の GPL・APSL・ICU などの全文を持ち、Android の AAR には入らない）。classes.jar には、Guava 由来
    （`com.google.common.base.Strings`）と protobuf-lite 由来のコードが、難読化名（`zz*`）で入っていることを確かめた（ほかは、
    難読化名のため、同梱を確認できていない）。そこで、**名前ごとに決める**: AndroidX・Kotlin・kotlinx・JSpecify・Error Prone は、
    すでに別の行がある（covered）。J2ObjC と、Android SDK License の全文そのもの（Android SDK Platforms）は載せない（skipped）。
    残りの20件（Animal Sniffer・apksig・Checker Framework・chrome_sync・Dagger・Google Auto・Guava・gsfclient・HighwayHash・
    JSR 250/305/330・JsInterop・mobiledatadownload・Protocol Buffers・SafeParcelable・Tink など）は、AAR の全文を、
    「<名前> (Google Play services)」として、普通の一覧に載せる（Apache-2.0・MIT・BSD-3-Clause。種類は全文で確かめる）。
    知らない名前が増えたら、生成が失敗する。載せすぎの側に倒した（同梱を確認できていないものも含む）。
-   7.3で決着が要ること: Googleの同意画面（OAuthの公開状態とブランド）、ストアの申告とプライバシーポリシー
    （SDKのプライバシーマニフェストが、利用状況などの収集を宣言している。そのときの版のマニフェストを読み直して決める。
    7.3.12）。
-   Googleの同意画面を「本番環境」にするには、アプリ名・サポートメールのほかに、**ホームページのURLとプライバシー
    ポリシーのURL**が要る（Google Auth Platformの画面で確認した）。Googleの資料では、ホームページは「検証済みの、
    自分が所有するドメイン」に置き、プライバシーポリシーは同じドメインに置いて、ホームページからリンクする。
    `yskms.github.io` がこの条件を満たすかは、資料に書かれていない。ロゴを付けない間は、同意画面にはアプリ名では
    なくドメインが出る（ブランドの確認を受けるまで）。「テスト中」の間は、テストユーザーだけが入れる、と画面に出る。
    基本のスコープ（`openid`・`email`・`profile`）だけなら、テストユーザーでなくても入れて警告も出ない、とGoogleの
    資料にあるが、「テスト中」に当てはまるかは読み取れておらず、未確認（7.3.13で、テストユーザーでないアカウントで確かめる）。

**アカウントの画面**（実装済み。7.3.11。`app/account.tsx`・`ui/AccountSection.tsx`・`src/i18n/authErrors.ts`。仕様は screen-flow §9「Account」。
本物のApple・Googleでの確認は 7.3.13）

-   **置き場所は Settings の `Account`**（Profile ではない）。Settings の行には、サインイン中の手段を出さない: Settings がSecureStoreを読まず、
    `getSignedInProvider` の失敗を考えなくて済むようにするため（状態は Account 画面だけが読む）。行は、`account.available`（`auth` を注入したビルド）が
    真のときだけ出す。
-   **リリースのビルドでは、7.3.13 まで出さない。** `src/services/index.ts` の `ACCOUNT_ENABLED`（`__DEV__ || process.env.EXPO_PUBLIC_SINGFOLIO_ACCOUNT === '1'`）が偽なら、
    `auth` を注入せず（`account.available` が偽。`signIn` は `provider-unavailable`）、入口も出ない。理由: Workerが未デプロイで（本番は nonce と HTTPS の検査だけ）、
    プライバシーポリシー・ストアの申告が、アカウントを前提にしていない（7.3.12）。署名したビルドで確かめるとき（7.3.13）は、
    **`eas.json` のプロファイル `account-test`**（`production` を継承し、`env` に `EXPO_PUBLIC_SINGFOLIO_ACCOUNT=1`）でビルドする
    （`eas build --local --profile account-test`。手でシェルの変数を付ける運用はしない。`eas config` で、プロファイルの `env` が読み込まれることは確かめた。
    `--local` のビルドに実際に埋め込まれるかは、7.3.13 で、入口が出ることで確かめる）。**このビルドは、App Store の審査・Play の製品版へ昇格させない**:
    `production` と同じ `autoIncrement` の番号列で、TestFlight・内部テストで見分けがつかない（Worker 未デプロイ・ポリシー未更新のまま出ないように、
    昇格の前に、どちらのプロファイルで作ったかを確かめる）。7.3.12・7.3.13 が済んだら、この条件とプロファイルを外す。
-   **ルート（`app/account.tsx`）も、`account.available` が偽なら開かない**（先頭の画面へ `Redirect`）。入口の行を出さないだけでは、`singfolio://account` で
    開けてしまう（実測。リリース既定のビルドで、サインアウト中の表示が出た）。
-   **この画面の失敗は、ErrorBoundary に伝えない。** ログインを要求しないので、`getSignedInProvider` の失敗も含め、画面の中で伝えて、やり直せるようにする。
    終わった操作（成功・失敗とも）のあとは、必ずサインインの状態を読み直す（401 で端末のセッションが捨てられている、削除で消えた、など）。
-   **実行中は戻れない**（`usePreventRemove`）。アカウントの削除の結果（成功・Appleの失効の可否・失敗の理由）は、この画面でしか伝えられないため。
    待ちは、削除で最大30秒、サインインは各社のOSの画面が前面にある間（上限は5分。`PROVIDER_TIMEOUT_MS`）。AndroidのAppleは、Custom Tab を閉じて
    アプリが前面に戻ったとき、戻りのURLが来なければ、猶予（1.5秒）のあとに取りやめとして終わる（`appleWebSignInRepository`。7.3.9）。
-   **サインインのボタン。** iOSの Apple は、Apple のシステムのボタン（`AppleAuthenticationButton`。`buttonType` は `SIGN_IN`、ライトは黒・ダークは白、角丸は
    専用のプロパティ。`style` に背景色・角丸を入れない）。それ以外（Android の Apple、Google）は、アプリのボタンで、ロゴは使わない（Googleは、公式のロゴ付きの
    ボタンの規約に踏み込まない。Googleの同意画面のブランドの確認（7.3.12）で、ボタンが問われたら、そこで決める）。
-   **削除の確認は二段**: アプリのダイアログ（元に戻せない・端末内の曲は消えない）→ 各社の再認証。待ちは「最大30秒」と出す。成功の文言は、`appleRevoked === false` のとき
    Apple Account の設定から連携を解除できる旨を、`sessionCleared === false`（削除は成功したが、端末のセッションを捨てられなかった。まれ）のとき
    「この端末はまだサインイン中。サインアウトを押して完了」を、それぞれ足す（サインイン中の表示と「削除しました」が、案内なしで並ばないように）。
-   **作らなかったもの（決めた）**: (a) サインイン済みから別のログイン手段をつなぐ画面（Worker に、つなぐエンドポイントが無い。手段が違えば別のアカウント）。
    「アカウントのつなぎ方」の項は、データ側の方針（`identities` で複数つなげられる）のまま。画面とエンドポイントは、必要になったときに足す。
    (b) 再認証なしの削除（上の項）。(c) Androidの Apple のサインインの再開（上の項）。(d) Googleの `clearCredentialState`（上の項）。
-   **文言の方針**: 失敗は `AuthError.code` → 操作ごとの文言（`accountErrorMessageKey`）。取りやめは何も出さない。`provider-failed` は原因を言い切らない。削除の
    `delete-unconfirmed`（要求を送ったあとの通信の失敗）は「削除されたか分からない」、削除の 401 は「サインアウトされた。削除済みかもしれない。残っているなら、
    サインインし直して削除」、`reauth-failed`・`account-mismatch`・再認証の画面が終わらなかった・時間切れは「削除されていない」と伝える。説明文の「曲はこの端末に保存される」は、7.4（Publish）で、公開の説明と食い違わないか読み直す。

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

nonce・セッションの失効・Appleのトークン失効の方式は、「認証の方式」に決めた。次は、7.3の中で（7.3.13。Appleの
`nonce` は、実装（7.3.7）のあとに試すつもりだったが、Appleアカウントでサインインした端末が無く、7.3.13へ移した）、実機・実際の
トークンで確かめる：

-   AppleのIDトークンの `nonce` が、渡した値そのままか。
-   AppleのIDトークンの `sub` が、iOS（バンドルID）とAndroid（Services ID）で同じになるか（「AndroidのAppleログイン」）。
-   Services IDで得たトークンを失効させたとき、同じグループのiOS（バンドルID）側の連携も取り消されるか（Appleの設定画面に
    連携が残って見えないか）。残るなら、削除の要件は満たせるが、ユーザーに案内を出すか決める。
-   AndroidのWebのフロー全体。Custom Tabからコールバック、アプリのURLスキームへのリダイレクトが続くか。
    `nonce`・`state`（43字）が、Appleにそのまま受け付けられ、返るか。
-   アカウントの削除（7.3.10）: iOSの認可コードを、バンドルIDの `client_id` で、`redirect_uri` 無しで交換できるか。得た `refresh_token` の失効で、Appleの設定の
    「Appleでサインイン」の一覧から、Singfolio が消えるか。Androidで、Services IDで得たトークンの失効が、iOS（バンドルID）側の連携も消すか（上と同じ）。
-   Appleのサーバー間通知（7.3.10）: primary App ID にエンドポイントを登録して、実際の通知の形（`events` が文字列かオブジェクトか、`event_time` の単位、`aud`、
    `account-deleted` の綴り）を `wrangler tail` で見る。Apple Account の設定の「Appleでサインインの利用を停止」で、`consent-revoked` が届き、セッションが消えるか。

実装時に決めること：

-   端末側のPublishの状態（「3 unpublished changes」の数え方のために、何を端末に持つか）。
    **決定（7.4）: 最後にPublishした曲ごとのハッシュを端末に持ち、今の公開対象（Readyの曲と公開タグ）と比べて数える。** Display Name・Bio は数えない
    （保存しない下書きで、画面が変更の有無を持つ。7.4.9a。§8「未公開の変更の数え方」）。
-   D1の版の用途。端末の「公開済み」の判定に使うか、複数の端末のPublishの衝突の検知に使うか。
-   複数の端末から同じアカウントでPublishしたときの扱い（端末ごとのローカルDBなので、後勝ちで全体が
    差し替わる。版で衝突を検知するか）。再インストール後・別の端末で、空のローカルから最初にPublishして、
    公開内容を空で置き換えない保護（Publish前に確認を出す、版が合わなければ止める、など）も同じ問題。
    **決定（7.4）: 版は整数（`profiles` に持つ。PublishとUnpublishのたびに+1）。Publishのリクエストに `baseVersion`（端末が最後に見た版。
    一度もPublishしていない端末は0）を入れ、サーバーの版と違えば 409 を返す。** アプリは「別の端末から公開した内容があります。
    置き換えますか」を出し、置き換えるなら、サーバーの最新の版を `baseVersion` にして送り直す。複数の端末の衝突と、再インストール後の
    空のローカルからのPublishの保護（その端末の `baseVersion` は0で、サーバーの版は1以上なので、必ず確認を通る）を、これ1つで兼ねる。
    版は、端末の「公開済み」の判定には使わない（公開ページの表示は、R2のスナップショットだけで決まる）。
    **ただし、D1にも「公開中」の印（`profiles.published_at`。NULL なら非公開）を持つ**: 自動削除の対象外の式（下）が、D1だけで判定できるように。
    **この印は、R2にスナップショットが存在しうる間は、必ず真にする**（Publishは、R2を書く前に立て、Unpublishは、R2を消したあとに下ろす）。
    R2を書いたあとにD1の印が遅れると、自動削除（D1の行だけを消す）が、公開ページだけを残して消すため（7.4.4 で順序を詰める）。
-   サインイン済みの状態から、もう一方のID（AppleにGoogleを、GoogleにAppleを）をつなぐ画面を、v1で用意するか。
    OSをまたぐ引き継ぎには要らない（どちらのOSでも、AppleとGoogleのどちらでも入れる）。両方で入りたい人のため。
-   `username` の変更の可否（§8「バックエンドが担当すること」）。**決定（7.4）: 変更を許さない。** 変えられると、配ったURLが
    切れ、R2のオブジェクトの付け替えと旧URLの扱いが要る。名前を間違えた人は、アカウントを削除して作り直す。
-   アカウント削除後の `username` の再利用。削除でD1の行を消すと名前が解放され、配ったURLやQRコードが
    別の人のページを指しうる。再利用させない案では、名前だけを、ユーザーIDと結びつけずに残す
    （プライバシーポリシーに書く）。**決定（7.4）: 再利用させない。** アカウントの削除（`deleteUserAccount`）で、`username` だけを
    別の表（ユーザーIDとの外部キーを持たない）に残し、`username` の確保の対象外にする（7.4.3・7.4.5）。名前そのものが
    個人を特定しうる場合もあるので、この保存はポリシー（7.4.10）に書く。
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
    乱用の費用が生じる経路（7.3.9 のAppleのトークン交換を呼ぶエンドポイントなど）で、あらためて決める。
    **決定（2026-11-17。7.3.9）: `POST /auth/apple/login`（Appleの `/auth/token` を呼ぶ、唯一の経路）に、WAFのRate limiting rulesの1ルールを
    使う。** 条件は Path が `/auth/apple/login`（完全一致。`/auth/nonce` の実測と同じ形）、IPで数える、少ない件数（目安は5件/10秒）、
    Block。ルールはリポジトリの外（Cloudflareのダッシュボード）にあり、デプロイのときに作る（利用者の作業）。Freeは1ルールなので、
    ほかの経路（`/auth/nonce`・コールバックなど）の洪水には使わない（日次の上限のリスクは、上の判断のまま受け入れる）。**Workers の Rate
    Limiting API は、設定に足さない:** Freeで使えるかが、資料（Rate Limiting の資料、Workersの料金・制限の資料）のどこにも書かれておらず、
    Cloudflareのコミュニティにも、同じ質問の答えが無い（2026-11-17に確認）。宣言した設定でデプロイが失敗するかもしれない機能に、設定を
    依存させない。使えると分かったら（デプロイして確かめる）、足すかを決める。Appleを呼ぶ前の検査（`T` の署名・種別・期限、`V` の照合）は、
    D1にも外部にも触れず、でたらめな値は Apple に届かない。ただし、`T`（`V` の `C` を入れたもの）は `/auth/nonce` から誰でも作れるので、
    それだけでは、Appleを呼ばせる乱用は防げない（WAFのルールが担う）。
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
  profiles     username・Display Name と Bio の控え・スナップショットの版・公開中の印（0004）
  retired_usernames  削除したアカウントの username（再利用させない。ユーザーIDと結びつけない。0004）
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

`username` は変更を許さない（決定。7.4。「実装時に決めること」）。変更できるようにするなら、R2のオブジェクトの付け替え
（新しいキーへ書き、古いキーを消す）と、旧URLの扱いが要る。

v1.0では導入しない。公開プロフィール機能を実装する段階で導入する。

### 公開プロフィールのエンドポイント（7.4.3）

実装は `worker/src/profile.ts`（エンドポイントと D1 の操作）・`worker/src/username.ts`（規則と予約語）、スキーマは `worker/migrations/0004_profiles.sql`。
どちらも認証が要る（`Authorization: Bearer <セッションの値>`。ユーザーIDは、セッションから決める）。ヘッダーが無い・形が違う・セッションが無効は 401。

-   **`GET /me/profile`**。200 `{"profile": <Profile>|null}`。`null` は、まだ `username` を確保していない。`Profile` は
    `{"username","version","published","publishedAt","displayName","bio"}`: `version` は Publish のたびに+1する整数（0 は一度もPublishしていない）、
    `published` は公開中か、`publishedAt` は最後にPublishした時刻（ミリ秒。非公開なら `null`）、`displayName`・`bio` は最後にPublishした値の控え
    （まだなら空）。端末は、別の端末・再インストール後に、これで今の公開内容を知る（`baseVersion`。7.4.4）。
-   **`PUT /me/username`**。`{"username":"…"}` を確保して、200 `{"profile": <Profile>}`。同じアカウントが同じ名前をもう一度確保しても200（何度呼んでも同じ。連打でも）。
    -   400 `username_invalid`: 規則に合わない（小文字の英数字と `_` の3〜20字。大文字は受け付けない。黙って小文字にしない。アプリが小文字にして送る）。本文の形の不備も400。
    -   409 `username_unavailable`: 取られている、削除したアカウントの名前（`retired_usernames`）、予約語。**区別しない**（どれも「使えない」）。
    -   409 `username_already_set`: このアカウントは、すでに別の名前を確保している（変更しない）。
    -   形の不備（400）は、認証の前に断る。予約語は、認証のあとに 409（未認証の呼び出しには教えない）。
-   **競合は一意制約に任せる。** `INSERT OR IGNORE`（名前が取られている・このアカウントがすでに確保している、のどちらでも黙って何も入れない）と、このアカウントの行の `SELECT` を
    1つの `db.batch()` で行い、読んだ行で見分ける。同時の確保（別のアカウントが同じ名前、同じアカウントの連打）でも、勝つのは1つだけで、エラーの文言（`UNIQUE constraint failed: …`）には頼らない。
    削除したアカウントの名前は、入れる文の条件（`NOT EXISTS (SELECT 1 FROM retired_usernames …)`）で弾く。
-   **スキーマの CHECK**（`length(username) BETWEEN 3 AND 20 AND username NOT GLOB '*[^a-z0-9_]*'`）は、アプリの検査をすり抜けた値への備え。`retired_usernames` も同じ。
-   **予約語**（`RESERVED_USERNAMES`）は、Workerのパス（`api`・`auth`・`me`・`oauth` など）、サイトのパス（`images`・`privacy` など）、運営・公式と取り違えやすい名前（`singfolio`・`admin`・
    `support` など）。足すのはよい。**外す・変えるときは、すでに確保された名前を確かめる**（確保済みの名前が予約語になると、公開ページがそのパスのものに食われる）。
-   Display Name・Bio は、このエンドポイントでは更新しない（Publish のリクエストに載せる。「公開スナップショットの形と上限」）。
-   `wrangler dev` で確かめた（`--persist-to` に `migrations apply` で適用したDBを渡し、セッションの行は `wrangler d1 execute --local` で入れた）: 認証なし 401、確保前 `{"profile":null}`、
    確保 200、同じ名前の再確保 200、別の名前 409 `username_already_set`。

### Publish と Unpublish のエンドポイント（7.4.4）

実装は `worker/src/publish.ts`、テストは `worker/test/publish.test.ts`。どちらも認証が要る（`Authorization: Bearer <セッションの値>`）。

-   **`POST /me/publish`**。`{"baseVersion":<整数>,"profile":{"displayName","bio"},"songs":[…]}`（形と上限は「公開スナップショットの形と上限」）。
    200 `{"profile": <Profile>}`（版は +1）。
    -   `baseVersion` は、端末が最後に見た版（一度も Publish していない端末は 0）。サーバーの版と違えば **409 `version_conflict`**。本文に `profile`（今の公開内容。別の端末が公開した、または非公開にした）を載せる。
        アプリは「別の端末から公開した内容があります。置き換えますか」を出し、置き換えるなら、`profile.version` を `baseVersion` にして送り直す。
    -   400 `invalid_request`（`baseVersion` が整数でない、本文がJSONでない）、400 `invalid_snapshot`（`reason`・曲の番号 `index`。値は載せない）、401、409 `username_required`、413（本文が512KiBを超える）、
        503（R2に書けなかった。やり直せる）。
-   **`POST /me/unpublish`**。R2のスナップショットを消して非公開にする。`username` と、控えの Display Name・Bio は残る。端末内のデータには触れない。200 `{"profile": <Profile>}`
    （公開中だったなら版は +1。すでに非公開なら変わらない。何度呼んでも同じ）。`username` が無ければ `{"profile": null}`。401、503（R2を消せなかった。やり直せる）。
-   **順序（変えない）。**
    -   Publish: ① 認証と検証（D1にもR2にも書く前） ② 版の予約: `UPDATE profiles SET version = base+1, published_at = now, display_name, bio WHERE user_id = ? AND version = base`
        （1文。同じ版から同時に Publish した端末のうち、1つだけが通る。負けた端末は R2 に書かない） ③ R2に書く。
        **「公開中」の印（`published_at`）は、R2に書く前に立てる。** 自動削除（D1の行だけを消す。7.4.5）が、公開ページだけを残して消さないため。
    -   Unpublish: ① R2を消す（印が下りていても、キーは必ず消す。印が下りているのに残ったスナップショットを直す） ② 印を下ろし、版を +1。**逆にしない**
        （D1が先に「非公開」になると、R2に残ったスナップショットが、自動削除の対象になる）。
-   **失敗のときは、印を立てたままにする（安全側）。** R2の書き込み・削除は、失敗しても、書けた・消せたかが分からないことがある。
    -   Publish で R2に書けなかった: 版と控え（Display Name・Bio）は元に戻す（戻さないと、端末の次の Publish が、見かけ上の衝突になる）。印は戻さない。最初の Publish の失敗では、
        印が立ったまま R2にスナップショットが無い状態になりうる（公開中と表示され、公開ページは出ない。自動削除の対象外のまま）。次の Publish か Unpublish で直る。
        元に戻す書き込みが失敗しても握りつぶす（端末の次の Publish が、衝突の確認を通る）。
    -   Unpublish で R2を消せなかった: D1は変えない。やり直す。
-   **Unpublish も版を上げる**（版は「公開状態の世代番号」）。別の端末が、古い版のまま自動 Publish して、非公開にした公開を勝手に戻さないため（409 になり、確認を出す）。
-   **応答を受け取れなかった Publish**（通信が切れた）は、サーバーでは成功していることがある。端末が同じ `baseVersion` で再送すると 409 になる（自分の Publish と、別の端末の Publish を区別できない）。
    置き換えの確認で解決する（同じ内容を送り直す）。サーバーに最後の内容のハッシュを持たせて見分ける案は、必要になるまで作らない。
-   **受け入れている小さな競合。** 同じアカウントの2つの端末が、数十ミリ秒の間に Publish と Unpublish をすると、R2に公開スナップショットがあるのに印が下りることがある。次の Publish か
    Unpublish（R2のキーを必ず消す）で直る。防ぐには、印の更新と R2 の書き込みを組にする仕組みが要り、見合わない。
-   **D1の書き込み**は、Publish が1回（版の予約。`display_name`・`bio` も同じ文）、Unpublish が1回。Free の上限（10万行/日）に対して小さい。
-   Display Name・Bio は、`display_name`・`bio` に控えとして残るだけで、公開ページ（7.5）は読まない（R2のスナップショットだけを読む）。
-   `wrangler dev`（workerd。R2はローカルの代用）で確かめた: username 未確保の Publish は 409、確保、1000曲（約200KB）の Publish が 200、古い版は 409、2回目の Publish、
    R2のオブジェクトに My Key・Private Note が無いこと（`wrangler r2 object get --local`）、Unpublish が 200 で、R2のオブジェクトが消えること。
    本番のR2での確認は 7.4.11。

### 公開スナップショットの形と上限（7.4.2）

実装は `worker/src/snapshot.ts`（R2にもD1にも触れない純粋な関数）、テストは `worker/test/snapshot.test.ts`。Publishのエンドポイントは 7.4.4。

R2の `public/{username}.json` に置く形:

``` json
{
  "schema": 1,
  "version": 3,
  "publishedAt": 1700000000000,
  "profile": { "displayName": "...", "bio": "..." },
  "songs": [{ "id": "...", "title": "...", "artist": "...", "publicTags": ["..."], "sortOrder": 0 }]
}
```

Publishのリクエストの本文は、`baseVersion`（7.4.4）に、`profile` と `songs` を足したもの。`schema` は形の版（公開ページ（7.5）が読めない版を見分ける）。
`version` はD1の版、`publishedAt` はPublishした時刻。

-   **許可リストで作る。** 入力から公開してよい項目だけを取り出して新しいオブジェクトを作り、余分な項目（My Key・Private Note・ステータス・端末のタグなど、
    送られてきても）は、検証も保存もしない。入力のオブジェクトをそのまま保存する形に「簡略化」しない。`PublishedSong` に My Key・Private Note・status を足さない。
-   **Display Name・Bio は、Publishのリクエストに載せる。** 端末（Public Profile の画面。保存しない下書き。7.4.7）が持つ値で、Publishしたときに公開内容になる（公開内容は「最後に正常にPublishした
    スナップショット」で、設定の即時の鏡ではない）。D1の `profiles` には、最後にPublishした値の控えを持つ（別の端末・再インストール後に、現在の公開内容を取得して
    表示するため。7.4.3）。Display Name・Bio だけを更新するエンドポイントは作らない。
-   **項目の規則。** 文字列は前後の空白を落とす。表示名・曲名・アーティスト・タグは、1行（制御文字・行区切り・文字の向きを強制する制御を含まない）で、空にしない。
    自己紹介は改行（`\n`）だけを許し、空でもよい。対になっていないサロゲートは拒否する。長さはコードポイントで数える。曲のIDは小文字のUUID（アプリの `randomUUID`）で、重複を拒否する。
    公開タグは曲ごとに重複なし。`sortOrder` は0以上の整数で、`sortOrder` の昇順（同じ値は送られた順）に並べ、**0から振り直して保存する**（公開ページの既定の並び。
    アプリは、Show Mode のアーティスト順で付ける）。
-   **検証の失敗は、固定の語彙（`reason`）と、曲の番号（`index`）だけで返す。** 入力の値（曲名など）は、結果にもエラーにも載せない。
-   **上限（`SNAPSHOT_LIMITS`）。** 曲 **1000**、本文 **512KiB**、表示名50字、自己紹介500字、曲名200字、アーティスト200字、1曲の公開タグ10個、タグ50字。
    アプリには、長さの上限が無い（曲名・タグ・アーティスト）。**アプリのスナップショットの組み立て（7.4.6）が、同じ数字を別に持ち**、超える分は、曲名・アーティスト・タグを
    切り詰める（1曲の長さで、全体のPublishを止めない）。曲数が上限を超えるときは、Publishを断り、理由を出す（7.4.7）。
-   **曲数の上限は、Free の CPU 時間（1リクエスト10ms）から決めた。** 3000曲は、初回に10msを超えた。実測（曲名は日本語15字、アーティスト10字、タグ2つの、ふつうの曲）:

    | 曲数 | 本文 | Node（Apple M4。parse + 検証 + 文字列化）初回 / 温まったあと | workerd（`wrangler dev`。中継の約3msを引いた、壁時計）初回 / 温まったあと |
    |---|---|---|---|
    | 1000 | 約200KB | 3.6ms / 1.4ms | 約5ms / 約2ms |
    | 1500 | 約300KB | （未測定） | 約6.5ms / 約3.5ms |
    | 3000 | 約610KB | 7.7〜8.3ms / 4.2〜4.6ms | 約16ms / 約6ms |

    Publishはまれなので、初回（JITが温まっていない状態）を基準にする。Cloudflare のエッジのCPUは、この手元のMacより遅いかもしれない（未確認）ので、**手元の初回が5ms以下
    （余裕2倍）になる1000曲**にした。D1・R2の待ちはCPU時間に数えない。認証（セッションのハッシュ）と本文の読み取りが、これに加わる。曲数の上限を上げたくなったら
    （Workersの有料プランにすれば、CPU時間は大きく取れる）、`npm run bench:snapshot -- <曲数>` と、使い捨てのWorker（`snapshot.ts` を呼ぶだけ。`wrangler dev` に本文を `curl` で送り、
    `time_total` から `GET` の所要を引く）で測り直す。本番の確認は、`wrangler tail` の `outcome` が `exceededCpu` にならないこと（7.4.11）。

### アプリ側の Publish の土台（7.4.6）

この節は Service まで（Nodeのテスト。偽のHTTP・実際のSQL）。画面は 7.4.7（次の節）。本物のWorkerでの確認は 7.4.11。

-   **構成。** `publishSnapshot.ts`（Publish のリクエストの組み立て。純粋な関数）、`publishRepository.ts`（HTTP）、`publishStateRepository.ts`（端末側の状態。
    `publish_state`・`published_songs`。`singfolio-data-model.md`）、`publishService.ts`（`Services.publish`）。HTTPの共通の扱い（再試行しない・5xx と 429 は
    `unavailable`・Cookie を送らない・タイムアウト）は `apiClient.ts` に1か所だけ置き、`authRepository` と共有する。
-   **認証が要る呼び出しは `access.withSession` を通す**（`accountService.ts` の `SessionAccess`）。サインイン中のセッションを渡して `task` を実行し、`task` が
    `AuthError('unauthorized')`（401）を投げたときだけ、端末のセッションを捨てる（503・5xx・通信の失敗では捨てない。`signOutOthers`・`deleteAccount` と同じ）。
    `access` は `createServices` が公開の Service だけに渡し、`Services.account`（画面の型）には含めない（セッションの値を画面に渡さない）。サインイン・ログアウトの
    直列化には入れない（公開の通信を、各社のサインインの待ちに巻き込まない）。
-   **失敗の型。** 通信・認証の失敗（`network`・`unavailable`・`unauthorized`・`invalid-response`・`invalid-request`・`not-signed-in`）は `AuthError`。サーバーが理由を返して
    断ったもの（`username-invalid`・`username-unavailable`・`username-already-set`・`username-required`・`version-conflict`・`invalid-snapshot`・`too-large`）と、アプリ側の前提の
    不備（`display-name-required`・`too-many-songs`）は `PublishError`（`code`。`version-conflict` は `profile`、`too-many-songs` は `songCount` を持つ）。それ以外は
    `AuthError('unexpected')` に包む（元の例外は載せない）。
-   **組み立て（`buildPublishBody`）。** 公開する曲は `show.getShowView({ sort: 'artist' })` から取る（Ready の曲だけが、My Key・Private Note・ステータスを持たない形で来る）。
    並びが公開ページの既定の並び（`sortOrder` は0から連番）。Workerと**同じ数字・同じ文字の規則を別に持つ**（`PUBLISH_LIMITS`。コードは共有しない。`publishSnapshot.test.ts` が、数字の一致と、
    整えた本文がWorkerの検証をそのまま通ることを確かめる）。Workerは1つでも規則に合わない値があると Publish 全体を 400 にするので、アプリが先に整える:
    使えない文字（制御文字・改行・向きの制御）は空白にし、対になっていないサロゲートは取り除き、前後の空白を落とし、長すぎる曲名・アーティスト・タグは切り詰める
    （サロゲートペアの途中では切らない）。タグは空・重複を落として1曲10個まで。曲名かアーティストが空になる曲は外す（普通は起きない）。**曲数が1000を超えるときだけは切り詰めず、
    Publishを断る**（`too-many-songs`。どの曲を落とすかを勝手に決めない）。Display Name が空なら `display-name-required`。どちらも通信の前に断る。
-   **公開タグは、利用者が選んだタグだけ**（7.4.8。`loadSources` が、曲のタグのうち `public_tags` にあるものだけを `publicTags` に入れる。選んでいなければ、どのタグも公開しない）。
-   **「最後に合意した版」（`publish_state.base_version`）。** Publish のリクエストの `baseVersion` に使う。進めるのは、この端末が Publish した（応答の版）、非公開にした（応答の版）、
    置き換えを確認した（`replaceVersion`）ときだけ。`refreshProfile`（サーバーの今の状態を読む）では**進めない**: 進めると、別の端末の Publish を確認なしに上書きする。
    `claimUsername` も、すでに同じ `username` の記録があれば触れない（同じ名前の確保のやり直しで進めない）。サーバーに公開がある状態で、端末の記録が無い（再インストール後）と、
    `baseVersion` は 0 になり、Publish は 409（`version-conflict`）で止まる。画面（7.4.7）は「別の端末から公開した内容があります。置き換えますか」を出し、確認を受けたら
    `replaceVersion` に `profile.version` を渡して送り直す。
-   **端末の記録は、サーバーのアカウントと合わなければ捨てる**（サーバーに `username` が無い、別の `username`。別のアカウントでサインインし直した、アカウントを
    削除した）。この確認は、`refreshProfile` だけでなく **`publish` も、本文を送る前に行う**: 同じセッションで `GET /me/profile` を読み、記録を合わせてから `baseVersion` を決める。
    確かめずに記録の `baseVersion` を使うと、前のアカウントの版が、たまたま今のアカウントの版と同じとき、確認なしに別の端末の公開を上書きする（レビューで指摘。
    サインアウト・削除・別のアカウントでのサインインは、記録を消さない。Serviceが保証し、画面の約束事に頼らない）。サーバーに `username` が無ければ `username-required`、
    版が食い違えば `version-conflict`（今の `profile` つき）を、本文を送らずに返す（大きな本文を無駄に送らない）。読んだあとに別の端末が Publish しても、サーバーの照合が 409 にする。
    代償は、Publish ごとに読み取りが1回増えること（D1の読み取りは小さい）。
    **「N unpublished changes」の数え方（7.4.9a）は、サーバーの今の状態（`refreshProfile` などが返す `profile`）を受け取り、記録が今のアカウントの、今の公開内容のものと確かめられたときだけ数える**
    （確かめる前の `getState`・`published_songs` は、前のアカウントのものでありうる。§8「未公開の変更の数え方」）。
-   **記録に失敗しても、サーバーで済んだ操作は成功として返す**（`publish`・`unpublish`）。記録できなければ、次の Publish が版の食い違いの確認を通る。
-   **`publish`・`unpublish`・`claimUsername` は1本ずつ順に実行する。** 同じ端末の Publish が重なると、2つ目が1つ目の版を知らずに送って、自分自身と食い違う。
-   **応答を受け取れなかった Publish**（`network`。Publish だけ待つ上限は30秒）は、サーバーで済んでいることがある。送り直すと `version-conflict` になり、置き換えの確認で解決する
    （「Publish と Unpublish のエンドポイント」）。
-   **`refreshProfile` も、`publish`・`unpublish`・`claimUsername` と直列に実行する**（記録を捨てる処理を持つ。`claimUsername` が書いた直後の記録を、確保の前に読んだ状態で消さない）。
-   **曲のIDは小文字のUUIDでなければならない**（Workerは、それ以外が1つでもあると Publish 全体を 400 にする）。アプリは確かめない: 今は `expo-crypto` の `randomUUID`（小文字）だけが曲のIDを作る。
    インポートなど、曲のIDを別の経路で作る機能を足すときは、注意する。
-   **アプリのテストが `worker/src/snapshot.ts` を import する**（`publishSnapshot.test.ts`。数字と、整えた本文がWorkerの検証を通ることの確認）。実行時のコードの共有ではない。
    ルートの `tsc` と `npm test` がそのファイルを読むので、`snapshot.ts` に Workers の型や `worker/` の依存を持ち込まない（ファイルの先頭のコメントにも書いてある）。
-   **正規表現の後読み（`(?<!…)`）を使わない**（`publishSnapshot.ts`）。Hermes で解釈できるかを確かめていない。解釈できないと、ファイルを読み込んだ時点でアプリの起動が失敗する
    （Nodeのテストでは検出できない）。対になっていないサロゲートは、1文字ずつ見て取り除く。`publishSnapshot.test.ts` が、ソースに後読みが無いことを確かめる。
-   **曲ごとのハッシュ**（`songContentHash`。cyrb53。暗号ではなく、変更の検出用）は曲名・アーティスト・公開タグから作り、`sortOrder` を含めない（曲を足すと、あとの曲の番号がずれて、
    全部が「変更あり」になる）。Publish の成功のとき、送った内容（整えたあと）から作って、`published_songs` を丸ごと差し替える。「N unpublished changes」の数え方は 7.4.9a（§8「未公開の変更の数え方」）。

### アプリ側の Public Profile 画面（7.4.7）

画面は `app/public-profile.tsx`（ゲートとヘッダー）と `ui/PublicProfileSection.tsx`（中身）。入口は Profile タブ。画面の仕様は `singfolio-screen-flow.md` §7「Public Profile」。
画面は `account`・`publish`（Service）の返す値だけを使い、URL・レスポンスの形・セッションの値に触れない（Account 画面と同じ）。

-   **ゲート。** 入口（Profile の行）も、ルート `singfolio://public-profile` も、`account.available` が真のビルドだけ（偽なら先頭の画面へ戻す）。`ACCOUNT_ENABLED` と同じ条件で、
    リリースのビルドでは 7.3.13 まで閉じている。
-   **Display Name・Bio の下書きは、この画面だけが持ち、保存しない。** 初期値は `refreshProfile` が返すサーバーの「最後に Publish した値」（端末の `publish_state` ではない。
    再インストール後・別の端末でも、公開中の内容が出る）。変更の有無は、この値との比較で決める。変更があるまま戻るときは、破棄の確認を出す（`usePreventRemove`）。
    **Auto Publish（7.4.9b）は、曲の変更を、端末の `publish_state` の Display Name・Bio（最後に Publish した値）で送る**（画面の下書きを待たない。決定の理由は「Auto Publish（7.4.9b）」）。
    下書きの保存先は足さない（Display Name・Bio の編集は Publish Now で送る）。
-   **確認を出す操作**: `username` の確保（変更できない）、最初の公開と非公開にしたあとの公開（人に見える状態になる）、Unpublish、版の食い違いの置き換え、変更を捨てて戻る。
    公開中の更新（Publish Now）は、確認なしで送る。
-   **版の食い違い（`version-conflict`）。** 画面の状態（公開中か・最終公開）を、`PublishError.profile`（サーバーの今の内容）に合わせ、入力中の下書きはそのままにして、
    「置き換えますか」を出す。置き換えるなら、`replaceVersion` に `profile.version` を渡して送り直す。応答を受け取れなかった Publish のあとの送り直しも、ここを通る。
    **公開の確認（人に見える状態になる）を済ませていない Publish**（公開中と見て確認なしで送ったもの）が、非公開のサーバーに当たったときは、置き換えの文言を使わず、「もう一度公開しますか」
    （公開の確認と同じ内容）を出す（レビューで指摘。置き換えの文言は、公開ページが再び人に見えることを伝えない）。`confirmReplace` の `visibleConfirmed` が、その区別
    （公開の確認を出したあとの Publish は真。置き換えの確認から送り直すときは、「もう一度公開」の確認を出したか、元から真だったときだけ引き継ぐ。置き換えの文言だけでは、人に見える状態になることを伝えていないため、
    送り直しがさらに非公開のサーバーに当たれば、もう一度公開の確認になる）。
-   **Unpublish が `null`（サーバーに `username` が無い）を返したときは、`username-required` の失敗として扱う**（文言を出し、サーバーの状態を読み直す。何も伝えずに画面が変わらないように）。
-   **戻る操作を止める `usePreventRemove` は、`busy` の間も有効**で、実行が終わった直後の1描画は、まだ有効なまま。そのため、コールバックは、変更が無ければ（`isDirty` が偽）、確認を出さずに
    戻す（実行中は、何も出さずに止める）。
-   **失敗の文言は `src/i18n/publishErrors.ts`**（`publicProfileErrorMessageKey`。Nodeのテストで、全コード・全操作が英語・日本語の文言に決まることを確かめる）。**Publish の `network` だけは
    「公開できたか分からない」と伝える**（サーバーで済んでいることがある）。`needsProfileReload`（401・`username-required`・`username-already-set`）のときは、失敗の文言を出したうえで、
    サーバーの状態を読み直す。
-   **`username` の形の確認は `src/services/username.ts`**（Worker の `USERNAME_PATTERN` と同じ値を別に持つ。`username.test.ts` が一致を確かめる）。確認は形だけで、小文字にして送る
    （`publishService.claimUsername` も同じ `normalizeUsernameInput` を通す）。入力欄は自動修正・自動大文字を切り、iOS は `ascii-capable` のキーボードにする。
-   **入力欄の長さ・Bio のカウンタは UTF-16 の単位**（`maxLength` の数え方）。送る側（`publishSnapshot.ts`。コードポイント）より厳しい側で、超えることは無い（絵文字などは、上限の半分で止まる）。
    入力欄に入る値は、この画面の入力か、そこから送った公開済みの値だけなので、`maxLength` を超えた値が入ることは無い。確保前の `username` の入力は、破棄の確認の対象にしない（確認は Display Name・Bio だけ）。
-   **日時は `Intl` を使わず `YYYY-MM-DD HH:mm`**（`src/i18n/dateTime.ts`。Hermes の `Intl` が機種で揃うかを確かめていない）。
-   **Android のキーボード**: `ui/useKeyboardHeight.ts`（`SongForm` と同じ理由・同じやり方。Bio にフォーカスが入ったら、末尾までスクロールする）。
-   **確かめたこと / 確かめていないこと。** iOS Simulator で、メモリ上の偽の Service（一時的なもの。コミットしていない）を差し込み、`username` の入力（形のエラー・小文字化・確認）→ 確保 →
    最初の公開の確認 → 版の食い違いと置き換え → 公開中の表示 → 通信が切れた文言 → 変更があるまま戻る確認 → Unpublish（下書きが残る）を確かめた。本物の Service では、
    サインインしていない画面と、Account への導線・戻ったあとの表示を確かめた。**未確認**: 本物のサーバーとの通信（7.4.11）、読み込み失敗の画面の見た目、Android（キーボードの余白）、
    VoiceOver・TalkBack、ダークモード。

### 公開するタグの選び方（7.4.8）

画面は `app/public-tags.tsx`（ゲートとヘッダー）と `ui/PublicTagsSection.tsx`（中身）。入口は Public Profile の `Public Tags` の行。画面の仕様は `singfolio-screen-flow.md` §7「Public Tags」。

-   **決定: タグごとに、公開するかを選ぶ。既定は全部非公開。** 選んだタグは、Ready の曲のそのタグが付いたところに出る。曲ごとに選ぶ形・全タグを自動で公開する形にしない
    （タグは、利用者が個人の管理のために付けるもので、人に見せる情報に含めるかを、利用者が選んで決める）。
-   **選択は、`tags` に列を足さず、別の表 `public_tags`（`tag_id` だけ。migration 5）に持つ。** `Tag` の型にも `isPublic` を足さない。タグは、Show Mode にも出せる管理用の情報のままで、
    公開の可否は公開機能の設定。行があるタグだけが公開される。`tag_id` は `tags` への外部キー（`ON DELETE CASCADE`）。**IDで持ち、名前では持たない**:
    ① タグを消すと選択も消える（同じ名前で作り直したタグが、黙って公開されない）。② 名前を変えても、選択がついてくる（公開される名前は、次の Publish で変わる）。
    アカウントとは結びつけない（端末のタグの設定。サインアウト・別のアカウントでのサインインでも消さない。`publish_state` と違い、`refreshProfile` の「記録を捨てる」の対象外）。
-   **端末内だけの設定で、通信しない・サインインも要らない。** `publishService` の `listPublicTagChoices()`（すべてのタグ・選択の有無・付いている Ready の曲の数）と
    `setTagPublic(tagId, isPublic)`（同じ値の再設定は成功。存在しないタグを選ぶと `tag-not-found`、外すときは何もしない）。`publish`・`unpublish` の直列化には入れない
    （サーバーの操作を、端末内の設定の保存と待ち合わせない。`publish` は、始めに選択を1回読む）。**画面は `publish` Service だけを使い、`publicTagRepository` に触れない。**
-   **Publish への反映は `loadSources`**（`publishService.ts`）。曲のタグを、選んだタグのIDで絞り、名前を `publicTags` に入れる。1曲10個・名前50字の上限と整形は、これまでどおり
    `buildPublishBody`（`publishSnapshot.ts`）。**曲ごとのハッシュは公開タグを含む**ので、選択を変えると、そのタグが付いた曲だけが「変更あり」になる（7.4.9a の
    「N unpublished changes」が、選択の変更も数える）。数え方も Auto Publish（7.4.9b）も、`loadSources` で今の公開内容を作る（公開用の曲の組み立てを2か所に書かない）。
-   **1曲の公開タグが10個を超えるとき**は、名前の昇順（ASCIIの大文字小文字を区別しない。`song.tags` の順は `ORDER BY t.name, t.id`）の先頭の10個だけが出て、名前が後ろのタグは、黙って落ちる。
    どの曲で何が落ちたかを伝える画面も、どれを落とすかを選ばせる画面も作らない（通常は起きない。上限は画面の注記に書く）。
-   **Public Profile の行の値**（`countPublicTags`）は、**オンにしたタグの数**で、Public Tags 画面のオンのスイッチの数と同じ。公開ページに実際に出るタグの数ではない
    （Ready の曲に付いていないタグも数える。画面は、行ごとに付いている Ready の曲の数を出して、この違いを伝える）。**「N unpublished changes」（7.4.9a）は、この数とは別**
    （曲ごとのハッシュの違いを数えるので、選択の変更も、その曲の変更として数えられる）。値は `public_tags` の `COUNT` だけで読む（Ready の曲は読まない）。
    **行の値は補助の情報**: 画面を開くときの読み込み（`load`）では、読めなくても Display Name・Bio・Publish を使えなくせず（値を出さない。「サーバーの状態を読めなかった」の表示にも混ぜない）、
    戻ったときの読み直しに失敗したときは、前の数のまま。実行中（Publish など）は、行を押せない（見た目・読み上げにも出す。`SettingsRow` の `disabled`）。
-   **確かめたこと / 確かめていないこと。** Nodeのテスト（実際のSQL）で、選んだタグだけが `publicTags` に入ること・Ready でない曲のタグが出ないこと・タグの削除で選択が消えること・
    名前の変更がついてくること・選択でハッシュが変わること・通信しないことを確かめた。iOS Simulator（Release のJSだけ差し込み。サインインと公開の通信は偽、タグの選択とDBは本物）で、
    行の値（なし→2個）・オンオフの保存・戻ったあとの値の更新・Tags でタグを削除すると `public_tags` の行が消えること（expo-sqlite）を確かめた。**未確認**: Android（スイッチのつまみの色）、
    ダークモード、VoiceOver・TalkBack（行は `switch` として1つにまとめ、中のスイッチは隠している）、英語の表示、保存失敗の見た目、タグが多いとき（FlatList）の操作、本物のサーバーへの Publish（7.4.11）。

### 未公開の変更の数え方（7.4.9a）

Public Profile（`ui/PublicProfileSection.tsx`）の、Publish Now の上の1行。「3 unpublished changes」。0 のときは「No unpublished changes」。公開中で、数えられるときだけ出す
（出さないとき: 非公開・まだ公開していない、数えられない、読めなかった）。補助の情報なので、数えられなくても、Display Name・Bio・Publish は使える。

-   **数えるのは `publishService.countUnpublishedChanges(profile)`。通信しない。** 端末の `published_songs`（最後に Publish した曲のハッシュ）と、今の公開内容
    （`loadSources` → `buildPublishSongs`）を比べる。結果は `added`（公開の対象になった曲）・`changed`（曲名・アーティスト・公開タグが変わった曲）・`removed`（公開の対象でなくなった曲。
    Ready でなくなった、削除）と、その合計 `total`。**曲ごとに1つ**（曲名とアーティストを同時に変えても1つ）。表示は合計だけ。
-   **Publish と同じ整え方を使う**（`buildPublishSongs`。`buildPublishBody` もこれを使う）。数え方だけ別に整えると、整えたあとの値のずれ（前後の空白、使えない文字、切り詰め）が、
    Publish しても消えない「変更あり」になる。曲数の上限は見ない（1000曲を超えていても数える。Publish を断るのは Publish の側）。
-   **数えるもの**: 曲名・アーティスト・公開タグ。公開タグは、選択の変更も数える（そのタグが付いた Ready の曲だけが「変更あり」になる。ハッシュが公開タグを含むため）。
    **数えないもの**: 並び（`sortOrder` を含めないハッシュ。曲を足しても、あとの曲が全部「変更あり」にならない）、Practice・Want の曲の追加や変更、My Key・Private Note の変更
    （公開内容ではない）、Display Name・Bio（保存しない下書き。変更の有無は、この画面が持つ下書きと基準の比較で、戻るときの確認に使う。数に混ぜない）。
-   **数えられるのは、端末の記録が、渡された `profile` の公開内容そのもののときだけ**: 公開中で、記録の `username` と `baseVersion` が、`profile`（呼ぶ側が最後に読んだ、サーバーの状態:
    `refreshProfile`・Publish の応答・版の食い違いの `profile`）と一致する。そうでなければ `null`（出さない）。記録が無い（再インストール後）、前のアカウントのもの（サインアウトでは消さない）、
    別の端末が Publish した（記録の版より新しい）ときの記録は、公開内容と比べる基準にならない（比べると、再インストール後は全部が「追加」と数えられる）。
    そのときの Publish は、版の食い違いの確認を通る。**Service が自分でサーバーに聞かない**（`profile` を渡す。通信しないので、オフラインでも数えられる）。
    **「別の端末が Publish したとき `null`」になるのは、画面がそれを読んだあと**（読み込み・版の食い違いを受け取ったとき）。画面を開いたまま別の端末が Publish しても、次に読み込むまでは
    古い `profile` と照合するので、数は出続ける（Public Tags から戻ったときの数え直しも、サーバーを読み直さない。通信を増やさないため）。上書きの事故にはならない（Publish は版の食い違いの確認を通る。
    表示が古くなるだけ）。
-   `publish`・`unpublish`・`claimUsername`・`refreshProfile` と直列に実行する（Publish の途中の、一部だけ新しい記録を読まない）。
-   **画面が数え直す場所**: 読み込み（`load`）、Publish の応答のあと、版の食い違いで画面の状態をサーバーに合わせたとき（記録の版と合わないので、普通は出さなくなる）、Unpublish のあと（出さない）、
    Public Tags から戻ったとき。**後から始めた数え直し・読み込みがあれば、先の結果は捨てる**（`changesIdRef`）。数えられなかった・失敗したときは、古い数を出し続けず、出さない。
    **応答を受け取れなかった Publish（`network`）のあとは、数を隠さない**（記録は前の版のまま。数は「この端末が最後に確認できた Publish からの変更」で、その下に「公開できたか分からない」が出る。
    サーバーでは済んでいても、次の Publish が版の食い違いの確認で解決する）。隠しても、Public Tags から戻ったときの数え直しが、同じ古い `profile` で出し直す。Auto Publish（7.4.9b）の
    Pending（送れていない変更の保持）も、同じ意味の数を使う想定。
-   **確かめたこと / 確かめていないこと。** Nodeのテスト（実際のSQL）で、追加・変更・取り下げ・Ready でなくす・削除・公開タグの選択・並びが影響しないこと・記録が無い／別のアカウント／
    別の端末が Publish したときの `null`・非公開のとき `null`・1000曲超・Publish との直列化を確かめた。
    iOS Simulator（Release のJSだけ差し込み。サインインと公開の通信は偽、曲・タグ・`publish_state`・`published_songs` のDBは本物）で、非公開のときは出ないこと・最初の公開のあと
    「未公開の変更はありません」・Public Tags で `ballad`（Ready の曲2つに付く）をオンにして戻ると「2件」・オフに戻すと 0・曲の追加と曲名の変更と Ready でなくしたあとに画面を開き直すと「3件」
    （追加・変更・取り下げが1つずつ）・「今すぐ公開」で 0・「公開をやめる」で行が消えることを確かめた。
    **性能**: Node（node:sqlite）で Ready の曲1000件のとき、数え方は約14ms、Show Mode を開くときの読み取り（`getShowView`）は約15ms で、同じ程度（数え方は、それと同じ読み取りに、ハッシュの計算が加わる）。
    画面を開くときの `load` は、数え終わるまで待ってから表示する（数だけ後から出す形にすると、行が後から現れて、下の Publish Now が押す前に動く）。実機（Hermes）で、Show Mode を開く時間と比べて
    遅いと分かったら、そのときに見直す。
    **未確認**: 実機（Hermes）での1000曲の読み取りの時間（`getShowView` で Ready の曲をすべて読む。画面を開くたび・Public Tags から戻るたびに1回）、Android、ダークモード、
    VoiceOver・TalkBack（数が変わったときに、読み上げで伝わるか。Publish の成功は notice が伝える）、本物のサーバーとの Publish のあとの 0（7.4.11）。

### Auto Publish（7.4.9b）

公開中のページへ、曲の変更を、編集を止めて一定時間たってからまとめて送る。実装は `src/services/autoPublishService.ts`（いつ試すか）と
`publishService.publishPendingChanges`（何を送るか・送ってよい状態か）。画面は Public Profile のスイッチと状態の1行（`singfolio-screen-flow.md`）。

**着手前に決めた3点**

-   **設定（ON/OFF）の置き場: `settings` の `auto_publish`（`on` / `off`）。既定は OFF**（未設定・`on` 以外はオフ。勝手に公開しない。候補の設定とは逆の向き）。端末の設定で、アカウントごとではない
    （Public Tags と同じ）。ただし、**端末の記録を別のアカウントのものと見て捨てるとき（`reconcile`・`claimUsername`）に、OFF へ戻す**（別のアカウントの公開ページを、そのアカウントの利用者が
    選んでいないのに、自動で更新しない）。同じアカウントなら、サインアウト・サインインし直しでは変えない。`publish_state` の列にはしない（migration が要り、Unpublish・再確保の扱いが絡む）。
-   **Display Name・Bio は、Auto Publish に載せない。** 曲の変更を、端末が最後に Publish した値（`publish_state`）で送る。Display Name・Bio の編集は Publish Now で送る。
    下書きの保存先を足さない（入力の途中を、debounce で勝手に公開しないため。「保存した下書き」と「公開済み」の2状態も増やさない）。「N unpublished changes」も曲だけを数える（7.4.9a）ので、
    数と送る内容が一致する。
-   **最初の公開・再公開・置き換えは、Auto Publish ではしない。** 自動で送るのは、**サーバーが公開中で、端末の記録（`username`・`baseVersion`）がサーバーの今の状態と一致するとき**だけ
    （すでに利用者の確認を経た公開の更新）。ON にしても、公開前は何も起きない。非公開にしたあとも、自動で公開し直さない。版の食い違いは止まる（`replaceVersion` は使わない）。

**仕組み**

-   **きっかけ**: ① 端末のDBへの書き込み（`createServices` が `observeCommits` で `Database` を包み、コミットのたびに `notifyChanged`。どの Service が書いても漏れない。何が変わったかは見ない。
    `auth` を注入しないビルドは包まない）。② アプリの起動の5秒後（`start`。前回送れていない変更の再送）。③ アプリが前面に戻ったとき（`flush`。`services/index.ts` の `AppState`）。④ 設定を ON にしたとき
    （すぐ）。⑤ Public Profile で Publish Now が成功したあと（`flush`。止まっていた状態を戻す）。
-   **待ち**: 最後のきっかけから30秒（`AUTO_PUBLISH_DEBOUNCE_MS`）。連続した編集の間は延び続ける（上限なし）。同時に1つだけ実行し、実行中のきっかけは、終わってからもう一度待つ。
    **背景に移るときは送らない**: 通信の途中でアプリが止まると、サーバーでは済んでいるのに端末は結果を記録できず、次の確認が版の食い違いになる（下）。
-   **Pending（送れていない変更）は、別に保存しない。** 端末の記録（最後に Publish した曲のハッシュ）と今の公開内容の差が、そのまま Pending（7.4.9a と同じ数え方）。再起動しても、次の確認が同じ差を見つける。
    `publishPendingChanges` は、**差が0なら通信しない**（サーバーを読みもしない）。
-   **再送**: 通信の失敗（`network`・`unavailable`・`timeout`）は、30秒・1分・2分・5分・10分（以後10分）の間隔で再送する。成功・OFF で間隔はやり直す。前面への復帰・新しい編集は、待たずに（または待ち直して）試す。
-   **`publishPendingChanges` の流れ**（`publish` などと直列）: 記録が無い → `idle`（通信しない）。差が0 → `idle`（通信しない）。サインインしていない・401 → `idle`（通信しない）。
    サーバーを読む → 記録を合わせる（別のアカウントなら捨てて、設定を OFF）→ 非公開なら `idle` → 版が違えば `stopped(version-conflict)` → 本文を組み立てる（`buildPublishBody`。Display Name は記録の値）→ 送る →
    記録を進める。曲が1000を超える・Display Name が空 → `stopped`（通信の前）。サーバーが断った（`invalid-snapshot`・`too-large`）→ `stopped(rejected)`。通信の失敗は投げる（呼ぶ側が再送を決める）。
    送る本文の組み立て（許可リスト・公開タグの選択）は Publish と同じ（`loadSources`・`buildPublishBody`）。
-   **状態（`AutoPublishStatus`）**: `idle` / `retrying`（通信の失敗。あとで再送）/ `stopped`（利用者の対応が要る。理由つき）。**`stopped` は、ずっと続く状態ではない**: 次の確認（編集・復帰・起動）で、
    もう一度試し、解決していれば `idle` に戻る（再送のタイマーは作らない。止まっている間は、編集のたびに、サーバーを1回読むだけ）。通知は、状態の変化と `published`（自動で Publish できた。
    開いている Public Profile が、`profile` を最新に合わせる。合わせないと、次の数え直しが「記録の版と合わない」で数えられなくなる）。
-   **画面**: スイッチは `username` を確保したあとに出す（公開前でも切り替えられる。ON で非公開なら「最初に公開してから始まる」と出す）。状態の行は、ON で公開中のときだけ。`retrying` は
    控えめな色、`stopped` はエラーの色（理由は3種類の文言: 別の端末の公開との食い違い・曲が多すぎる・それ以外は「今すぐ公開で理由を確かめる」）。

**既知の限界**

-   **応答を受け取れなかった自動の Publish**（`network`。サーバーでは済んでいることがある）のあと、再送が `version-conflict`（自分の Publish が済んでいる）になり、`stopped` で止まる。
    置き換えの確認つきの Publish Now で解決できる。別の端末の Publish と区別できないので、自動では置き換えない（確認なしに他の端末の公開を上書きしない）。解消するには、Publish に冪等キー
    （同じ要求の再送と分かる印）が Worker に要る。未実装（7.4.11 で実測してから判断する）。背景に移るときに送らないのは、この確率を減らすため。
-   背景で動かない。アプリが前面に戻る・起動したときに、たまっていた変更を送る（OSのバックグラウンド実行は使わない）。
-   DBへの書き込みは、公開に関係しない設定の保存や、Publish の記録でも、確認を予約する（差が0なら通信しない。1000曲で読み取り・照合が約15ms）。

**確かめたこと / 確かめていないこと。** Nodeのテスト（実際のSQL＋偽のサーバー・偽のタイマー）で、変更の送信・Display Name・Bio の扱い・最初の公開/非公開/版の食い違いで送らないこと・別のアカウントでの
設定の OFF・通信の失敗後の Pending の保持と再送・間隔・直列化・書き込みの通知の配線（`auth` の有無）を確かめた。iOS Simulator（Release のJSだけ差し込み。Service は偽）で、スイッチ ON →
再送待ちの行 → 停止の行 → 自動で Publish できたあとの「未公開の変更はありません」への更新を確かめた。**未確認**: 本物のサーバーでの自動の Publish（7.4.11）、実機の背景から前面への復帰、
Android、ダークモード、VoiceOver・TalkBack（状態の行は `accessibilityLiveRegion` で伝える。iOS の読み上げは未実装）、英語の表示、1000曲での確認の所要時間（実機）。

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
    `sessions` の行のうち `created_at <= event_time` のものだけを消し、`identities.consent_revoked_at`（0002）に時刻を記録する（`identities` の行は残す。
    記録の条件に `last_sign_in_at` が要るため）。`account-deleted` は `identities` の行を消す（セッションも消える）。
    `users.last_active_at`（0003）は、未使用のアカウントの自動削除の基準で、NULL は消さない側（「未使用のアカウントの自動削除」）。
    Cron Trigger は毎日1回の1つ（`triggers.crons`）で、`worker/test/config.test.ts` が固定している。
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
        共有・保存しない。AIのセッションなど、出力が記録に残る場で見るときは、`--format json` を jq で絞り、ヘッダーとURLのクエリ
        （Appleのコールバックは `code`・`state` が付く）を除く。
    -   **`APPLE_PRIVATE_KEY` が入ったことの確認（AndroidのAppleログイン。7.3.13）。** 上の確認（403・200・nonce）は、どれも鍵を使わない。
        `kind: web` の `T` を取り、でたらめな `code` と、合う `V` を付けて `/auth/apple/login` を呼ぶ。401 なら、鍵を読めて署名もできている
        （Appleは常に `invalid_grant`。D1には何も書かれない）。鍵が無い・形式が違うと、`AppleClientSecretConfigError` が Worker の外へ出て、
        1101（500）になる（503ではない。`worker/test/appleWeb.test.ts` が固定）。503 は、Appleに届かない・想定外の応答で、
        `wrangler tail` の `apple token exchange failed: …` の1行で切り分ける。分かるのは鍵の形式まで。Key ID・Team ID・Services ID の
        組が合うか（`invalid_client`）は、本物のコードで交換するまで分からない。
    -   ローカルの開発だけ、ホスト名が `localhost`・`127.0.0.1`・`[::1]` のものを通す（完全一致）。エッジでは、Custom Domainは
        `singfolio.app` に一致するリクエストだけを受けるので、`localhost` のHostは届かない（資料）。環境変数などで検査を切る口は
        作らない。`wrangler dev` は、既定で `routes` のホスト（`singfolio.app`）を `request.url` に入れ、`localhost` が見えず403に
        なる。`npm run dev` が `--infer-origin-from-routes=false` を付けて、実際のオリジンを保つ（`config.test.ts` が固定）。
    -   公開ページ（7.4以降）では、`GET`/`HEAD` をリダイレクトにする余地がある。いまは、`/auth/` しか無いので、一律に拒否している。
-   **R2（7.4.1）。** バケットは1つ（`singfolio-snapshots`）、binding は `SNAPSHOTS`（`wrangler.jsonc` の `r2_buckets`。`worker/test/config.test.ts` が固定）。
    キーは `public/{username}.json`。**バケットの公開アクセス（r2.dev のURL・カスタムドメイン）は有効にしない。** 読み書きするのは Worker だけで、公開ページ（7.5）も
    Worker が返す（キャッシュ・`noindex`・URLの正規化を、Worker の側で決められる）。バケットは利用者がダッシュボードで作る。`wrangler deploy` は、
    binding のバケットが無いと失敗するので、7.4 のコードのデプロイの前に作る。ローカルの開発・テストでは、バケットを作らずに、ローカルの代用が使われる。
-   **ローカルのD1の置き場所。** `wrangler.jsonc` に `database_id` を足したので、ローカルのD1のファイル名（ハッシュ）が変わる
    （足す前後の設定で `wrangler d1 migrations apply --local` を比べて確かめた）。`migrations apply` とテスト（`getPlatformProxy`）は
    同じ設定を読むので一貫する。`wrangler dev` がD1を使う経路は、7.4.3 のエンドポイントで確かめた（`wrangler dev --persist-to <ディレクトリ>` と `wrangler d1 migrations apply DB --local --persist-to <同じディレクトリ>` を揃える。
ディレクトリを揃えないと、`wrangler dev` は別の（空の）DBを使う）。

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
