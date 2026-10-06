# Singfolio 公開機能・バックエンド方針

## 1. 基本方針

Singfolioは **Local First** とする。

通常のレパートリー管理は端末内のSQLiteで完結し、公開機能を利用するユーザーのみアカウントを作成して公開用データをサーバーへ送信する。

v1.0ではバックエンドを導入せず、将来の公開機能追加を前提としたデータ構造のみ考慮する。

バックエンド製品は **未確定** で、公開機能の実装に着手する時点で決定する（§8）。

## 2. 構成

``` text
Singfolio App (React Native / Expo)
  └─ SQLite
       │
       │ Publish / Auto Publish
       ↓
Backend（製品は未確定、§8参照）
  ├─ Auth
  ├─ Public Profile
  ├─ Published Songs
  └─ Requests（将来）
       │
       │ Publish時に公開スナップショットを生成
       ↓
Public Web (Cloudflare)
  ├─ 公開スナップショット / Edge Cache
  └─ singfolio.app/username
       ↑
     Viewer
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

-   title
-   artist
-   publicTags
-   sortOrder

以下の情報は原則としてサーバーへ送信しない。

-   My Key
-   Private Note
-   その他の個人用管理情報

「Webで非表示にする」のではなく、Privateな情報は
**最初から公開用DBに保存しない** ことを原則とする。

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

将来的には未登録曲へのRequestにも対応する。

Requestは匿名の視聴者からの書き込みになるため、スパム対策を前提に設計する。

## 8. バックエンド

### 選定方針

バックエンド製品は **未確定** とする。

公開機能の実装に着手する時点で、認証・認可、運用コスト、休眠時の挙動、
可用性、実装量を技術検証して決定する。
v1.0では特定製品に依存しない。

### 公開ページの可用性

公開ページは、単なるHTTPキャッシュだけに依存せず、Publish時に
**公開スナップショットを生成** してCloudflare側から配信する。

``` text
Local SQLite
    ↓ Publish
公開用DB
    ↓
公開スナップショット / Edge Cache
    ↓
singfolio.app/username
```

バックエンドの障害・停止中でも、最後に公開した状態は表示できる。

ただし、バックエンド停止中は新規ログイン・Publish・Request受付が止まる。
この仕組みが守るのは公開閲覧のみで、バックエンド全体の可用性を保証するもの
ではない。

### 技術検証

公開機能に着手する時点で、候補製品ごとに小さな技術検証を行って比較する。

-   Apple / Googleログイン
-   Publish API
-   `singfolio.app/username` の取得
-   所有者以外による更新の拒否
-   Requestのスパム対策
-   バックエンド停止時の公開ページ表示

### バックエンドが担当すること

どの製品を選んでも、以下を担当する。

-   Authentication
-   Database
-   Public Profile
-   Published Songs
-   Requests
-   API

想定テーブル（製品に依存しない）：

``` text
profiles
published_songs
published_song_tags
requests
```

v1.0では導入しない。公開プロフィール機能を実装する段階で導入する。

### Cloudflare

公開Webのホスティングと、公開スナップショットの配信に利用する。

``` text
singfolio.app/username
```

Webは公開情報のみを取得して表示する。

## 9. 実装順序

版番号は実装順序の目安であり、時期の約束ではない。

### v1.0

-   React Native / Expo
-   SQLite
-   Songs
-   Practice
-   Show Mode
-   Profile / Settings
-   Light / Dark Mode
-   English / Japanese

完全ローカルで動作する。

### v1.x

-   バックエンド選定（技術検証）
-   認証（Apple / Google）
-   Public Profile
-   Auto Publish
-   Public Web
-   Cloudflare

### v2.0

-   Requests
-   未登録曲へのRequest
-   Request → Want / Practice

## 10. v1.0で準備しておくこと

公開機能そのものは実装しないが、後から追加しやすい構造にする。

-   Song IDはUUIDを使用
-   LocalデータとPublicデータを分離できる設計
-   Private Note等を公開モデルへ含めない
-   UIとDBを密結合させない
-   将来の同期処理を追加できるRepository / Service構造を意識する
-   特定のバックエンド製品に依存しない（SDK・APIをアプリ全体に散らさず、
    公開機能はService境界の内側に閉じ込められる構造にする）

ただし、将来機能のためのバックエンド導入・認証・同期処理などをv1.0へ先行実装しない。

## 11. 原則

**Local First** --- アプリ本体はネットワークなしでも利用可能にする。

**Private by Default** ---
公開対象として明示された情報だけをサーバーへ送信する。

**No App Required for Viewers** ---
公開Singfolioを見る人にはアプリのインストールやアカウント登録を要求しない。

**Simple Publishing** --- 公開する本人だけがアカウントを必要とし、Auto
Publishを利用すれば普段は公開操作を意識しなくてよい。
