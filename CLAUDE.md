# Singfolio

歌う人のためのレパートリー管理アプリ（React Native / Expo、端末内SQLite）。
管理するのは「歌の点数」ではなく「何を歌えるか」。

仕様・設計は `docs/` が正。実装前に該当ドキュメントを読むこと。

-   `docs/singfolio-requirements.md` --- 要件・対象外・UI/ブランド方針
-   `docs/singfolio-screen-flow.md` --- v1.0の画面設計
-   `docs/singfolio-publishing-backend.md` --- 公開機能・バックエンド方針（未確定事項を含む）
-   `docs/singfolio-wbs.md` --- v1.0の作業分解と進捗
-   `docs/Singfolio ブランドスタイルガイドとアプリ展示板.png` --- ブランドカラー・フォント（確定。
    ただしMint・Purpleはアイコン原画が正。「ブランド」節参照）、
    モックアップ（参考イメージ）
-   `docs/singfolio ミント背景のアイコン.png` --- アプリアイコンの原画（1254×1254、透過なし）。
    `assets/` のアイコン・スプラッシュ画像はここから `scripts/generate-icons.py` で
    生成する（手で編集しない）。原画の色（背景 `#C9FCED`、シンボル `#9C70FE`）が
    Mint / Purpleの確定値で、Androidの `adaptiveIcon.backgroundColor` もこの値

設計判断が変わったら、コードだけでなく該当のdocsも更新する。

作業の着手・完了時は、`docs/singfolio-wbs.md` のチェックと「現在地」を更新する。
WBSは公開リポジトリのため、日付やリリース目標などの時期は書かない。

PNGのモックアップは画面の参考イメージであり、機能・表示項目の確定仕様ではない。
機能仕様と食い違う場合は、要件定義・画面設計・バックエンド方針のMarkdownを優先する。
ブランドカラーなど、ブランド資料として明示された情報は除く
（ただしMint・Purpleは、PNGではなくアイコン原画の色が正）。

## 公開範囲

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
-   v1.0は完全ローカル。バックエンド・認証・同期処理を先行実装しない。
-   v1.0で実装しない設定項目（Dataなど）は画面に表示しない。

### バックエンドは未確定

-   バックエンド製品は未確定。公開機能の着手時に技術検証して決める
    （`docs/singfolio-publishing-backend.md` §8）。特定の製品を前提として
    コードやドキュメントを書かない。
-   特定のバックエンド製品のSDK・APIをアプリ全体に散らさない。公開機能は
    Repository / Service境界の内側に閉じ込める。

### データモデル

-   Song IDはUUID。
-   LocalデータとPublished（公開）データは別モデル。My KeyとPrivate Noteを
    公開モデルへ含めない（「Webで隠す」ではなく、最初から公開用DBに保存しない）。
-   UIとDBを密結合させない。
-   Published Songに `status` を持たせない（公開対象はReadyのみ）。公開内容は
    最後に正常にPublishされたスナップショットで、ローカル状態の即時の鏡ではない。
-   タグに公開/非公開などの可視性属性（`isPublic` 等）をv1.0で追加しない。
    Webへ送るタグはローカルのタグとは別に `publicTags` として扱う。

### 画面

-   「管理する画面」と「人に見せる画面」を分離する。Show Modeは閲覧専用で、
    My Key・Private Note・Wantなどの管理情報を出さず、編集操作も置かない。
-   ボトムタブはSongs / Practice / Profileの3つ。Wantは独立タブにせず
    Songs内のステータスとして扱う（Practiceのみ独立タブ）。
-   ログインを要求しない（v1.0）。

### 言語

-   English First。ただし最初から日本語対応を前提とし、画面の文言は直書きせず
    多言語化の仕組みを通す。初期言語は端末設定から決める。

## ブランド

元データは `docs/Singfolio ブランドスタイルガイドとアプリ展示板.png`（画像のため
grepできないので、値はここに転記している。ただしMint・Purpleはアイコン原画が正）。
色は定数に集約し、直書きしない。

| 用途 | 色 |
|---|---|
| Mint（Brand） | `#C9FCED` |
| Purple（Primary） | `#9C70FE` |
| Text Primary | `#17171A` |
| Text Secondary | `#71717A` |
| Surface | `#F7F7F8` |
| Background | `#FFFFFF` |

-   MintとPurpleは、アイコン原画の色で確定している。PNGに書かれた
    `#CFF7E9` / `#A78BFA` は使わない（PNGのラベルの値も色見本の実際の色も、
    Purpleについてはアイコン原画の色と一致せず、どちらも正確ではないため）。
-   フォントは英語がInter、日本語がNoto Sans JP。
-   PNG上のSurfaceの文字は「#F7F778」と崩れて読めるが、色見本はほぼ白のため
    `#F7F7F8` と解釈している。
-   ダークモードの色コードはPNGに記載がなく、モックアップ（暗い背景に明るいミント/
    パープル）のみ。実装時に決めたら、ここに追記する。
