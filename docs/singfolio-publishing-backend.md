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
-   セッションはD1に持ち、失効できる（ログアウト・アカウント削除）。詳細な方式は、実装前に詰める。
-   アカウントの削除は、アプリの中から行える。D1の行とR2のスナップショットを消し、Sign in with Appleの
    ユーザーはAppleのトークンも失効させる。

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

実装前に確かめること（デプロイとアカウントが要る）：

-   本番のWorkersから、Appleの公開鍵（JWKS）を取得できるか。ローカルの実行環境では拒否された。取得できなければ、
    鍵を自前で控える。
-   Freeプランで一定期間アクセスがない状態から、手動の操作なしで再アクセスできるか（D1はscale-to-zeroとして
    提供されているが、実環境での確認は未実施）。
-   nonce・リプレイ対策、セッションの失効の方式、アカウント削除時のAppleのトークン失効API。
-   AndroidでAppleログインを出すか（出すなら、Web OAuthと秘密鍵の定期的な再生成が要る。出さない場合は、
    OSをまたぐアカウントのつなぎ方を決める）。
-   `singfolio.app` の取得と、Cloudflareへの載せ替え。

実装時に決めること：

-   端末側のPublishの状態（「3 unpublished changes」の数え方のために、何を端末に持つか）。
-   D1の版の用途。端末の「公開済み」の判定に使うか、複数の端末のPublishの衝突の検知に使うか。
-   複数の端末から同じアカウントでPublishしたときの扱い（端末ごとのローカルDBなので、後勝ちで全体が
    差し替わる。版で衝突を検知するか）。
-   `username` の変更の可否（§8「バックエンドが担当すること」）。
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
前に、D1で確保する。予約語（`api`・`auth`・`me` などのAPIのパスと、紹介ページの最上位のパス（`images`・`ja` など））は
取れないようにする。

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
