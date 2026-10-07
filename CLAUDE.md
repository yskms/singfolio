# Singfolio

歌う人のためのレパートリー管理アプリ（React Native / Expo、端末内SQLite）。
管理するのは「歌の点数」ではなく「何を歌えるか」。

仕様・設計は `docs/` が正。実装前に該当ドキュメントを読むこと。

-   `docs/singfolio-requirements.md` --- 要件・対象外・UI/ブランド方針
-   `docs/singfolio-screen-flow.md` --- v1.0の画面設計
-   `docs/singfolio-publishing-backend.md` --- 公開機能・バックエンド方針（未確定事項を含む）
-   `docs/singfolio-data-model.md` --- ローカルDB（SQLite）のスキーマ・マイグレーション方針
-   `docs/singfolio-wbs.md` --- v1.0の作業分解と進捗
-   `docs/Singfolio ブランドスタイルガイドとアプリ展示板.png` --- ブランドカラー・フォント（確定。
    ただしMint・Purpleはアイコンの色が正。「ブランド」節参照）、
    モックアップ（参考イメージ）
-   `assets/icon.png` --- アプリアイコンの原画（1024×1024、透過なし、iOS・ストア用）。
    Play Storeアイコン（512×512）・公開Web用のfavicon（48×48）・Androidの前景・
    テーマアイコン・スプラッシュ画像はここから `scripts/generate-icons.py` で生成する
    （生成物は手で編集しない。faviconは公開Webで使うもので、app.jsonからは参照しない）。
    Androidの `adaptiveIcon.backgroundColor` はこの画像の背景色に合わせている

設計判断が変わったら、コードだけでなく該当のdocsも更新する。

作業の着手・完了時は、`docs/singfolio-wbs.md` のチェックと「現在地」を更新する。
WBSは公開リポジトリのため、日付やリリース目標などの時期は書かない。

PNGのモックアップは画面の参考イメージであり、機能・表示項目の確定仕様ではない。
機能仕様と食い違う場合は、要件定義・画面設計・バックエンド方針のMarkdownを優先する。
ブランドカラーなど、ブランド資料として明示された情報は除く
（ただしMint・Purpleは、PNGではなくアイコンの色が正）。

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
-   一度リリースしたマイグレーション（`src/db/migrations.ts`）は書き換えない。
    スキーマを変えるときは末尾に次の番号を追加する。
-   Published Songに `status` を持たせない（公開対象はReadyのみ）。公開内容は
    最後に正常にPublishされたスナップショットで、ローカル状態の即時の鏡ではない。
-   タグに公開/非公開などの可視性属性（`isPublic` 等）をv1.0で追加しない。
    Webへ送るタグはローカルのタグとは別に `publicTags` として扱う。

### Repository / Service層

詳細は `docs/singfolio-data-model.md`「Repository / Service層」。

-   UI → Service → Repository → SQLite の一方向。画面はRepository・DBに触れず、
    `getServices()` のServiceだけを使う。
-   DBへの書き込みは、必ず `Database.transaction` の中で行う（expo-sqliteの
    `withTransactionAsync` は排他ではないため）。`Database` を読み取り専用の型に
    しているのはこのためで、`runAsync` を直接呼べるように型を緩めない。
-   `src/` のコードはNodeのテスト（`npm test`）からも直接実行する。型だけのimportは
    `import type`、enumやコンストラクタ引数プロパティは使わない（tsconfigで検出する）。
    importは `.ts` 付き（付け忘れは型チェックを通り、`npm test` の実行時にだけ失敗する）。
    テストファイルの先頭には `/// <reference types="node" />` を置く（エディタ用）。
-   タグ名の正規化は `normalize('NFKD').normalize('NFC')`。`normalize('NFKC')` 1回に
    「簡略化」しない（iOSのHermesは半角カナの濁点を合成しない。Nodeのテストでは検出できない）。

### 画面

-   「管理する画面」と「人に見せる画面」を分離する。Show Modeは閲覧専用で、
    My Key・Private Note・Wantなどの管理情報を出さず、編集操作も置かない。
-   ボトムタブはSongs / Practice / Profileの3つ。Wantは独立タブにせず
    Songs内のステータスとして扱う（Practiceのみ独立タブ）。
-   ログインを要求しない（v1.0）。
-   画面（ルート）は `app/`（Expo Router）に置く。`src/` はNodeのテストから直接
    実行するため、画面（RN・Expoのimport）を置かない。
-   `app/_layout.tsx` は、DB初期化（`getServices()`）が終わるまで画面を出さない。
    Serviceが使えない状態で画面を描画させない（エラー画面は WBS 1.7）。

### 言語

-   English First。ただし最初から日本語対応を前提とし、画面の文言は直書きせず
    多言語化の仕組みを通す。初期言語は端末設定から決める。

### ネイティブビルド

-   `ios/`・`android/` は `expo prebuild` の生成物（gitignore）。直接直さず、
    app.json と `plugins/` で設定する。
-   `plugins/withIosSceneDelegate.js` は、iOS 27 SDK（Xcode 27）の UIScene 必須化
    （未対応だと起動直後にクラッシュする）への対応で、削除しない。Expo SDK 58 の
    テンプレートが同じ配線を持つので、SDK 58 へ上げるときにこのプラグインと
    app.json の登録を撤去する。
-   `react-native-reanimated` / `react-native-gesture-handler` /
    `react-native-worklets` は画面から直接使っていないが、Expo Routerの依存
    （`react-native-drawer-layout`）のpeerなので消さない。バージョンは
    `npx expo install` が決める値（SDK 57では reanimated 4.5.1 / worklets 0.10.1 /
    gesture-handler ~2.32.0）に固定する。`npm install` が自動で入れる最新版は
    SDK 57の想定外で、ネイティブビルドを壊しうる。
-   `package.json` の `overrides.react-dom` は消さない。Expo Routerのpeerとして
    react-dom 19.3.0 が入り、react 19.2.3 と食い違って `npm install` が
    ERESOLVEで失敗するのを防いでいる（ネイティブでは使わない）。

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
-   フォントは英語がInter、日本語がNoto Sans JP。
-   PNG上のSurfaceの文字は「#F7F778」と崩れて読めるが、色見本はほぼ白のため
    `#F7F7F8` と解釈している。
-   ダークモードの色コードはPNGに記載がなく、モックアップ（暗い背景に明るいミント/
    パープル）のみ。実装時に決めたら、ここに追記する。
