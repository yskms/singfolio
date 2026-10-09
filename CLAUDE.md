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
-   曲の検索は、SQLの `LIKE` ではなく、Serviceが `searchKey`（`src/services/text.ts`）で
    行う。`LIKE` へ「簡略化」しない（ひらがな/カタカナ・全角半角を同一視できなくなる）。
    Repositoryは検索の条件を持たない。
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
-   新しいタグは、Add / Edit Song で追加した時点ではなく、曲を保存するときに
    `getOrCreateTag` で作る。追加した時点で作ると、保存せずに戻ったとき、使われないタグが残る。
-   Androidはエッジ・ツー・エッジで、キーボードが出ても画面（ScrollView）が縮まず、下にある入力欄が
    キーボードに隠れる（`adjustResize` は効かない。エミュレータで確認）。入力欄が下にある画面は、
    `SongForm` のように、キーボードの高さの分の余白を足してスクロールする。
-   RN・Expoに依存するUIの部品・hookは、`src/` に置けないため `ui/`（ルート直下）に置く。
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
    多言語化の仕組みを通す。初期言語は端末設定から決める。
-   文言は `src/i18n/en.ts` が正（キーの一覧）。`ja.ts` は同じキーを型で強制される。
    画面は `ui/i18n.tsx` の `useI18n()` の `t` から取る。`t` は、文言の `{name}`（件数の
    文言は `count`）の値を型で必須にする（`en.ts` の `as const` を外さない）。
    `Intl.PluralRules` は使わない（Hermesには無い。iOS・Androidで確認）。件数の形は
    `src/i18n/translate.ts` の `pluralRules` で選ぶ。
-   言語を足すときは、`LANGUAGES`（`src/domain/types.ts`）と、app.json の
    expo-localization の `supportedLocales`（ios）の両方に足す。後者はJSから読めず
    手で写していて、`npm test` が食い違いを検出する。
-   言語の設定は `system` / `en` / `ja`（Appearanceと同じ形）。未保存は `system`
    （端末の言語に従う）。初回起動で、端末の言語から決めた言語を保存しない（保存すると、
    `system` のまま端末の言語の変更に追従できなくなる）。実際に使う言語は
    `resolveLanguage`（設定と端末の言語から決める）。
-   DBが使えない画面（起動時の失敗を出すエラー画面。`ErrorBoundary` は `app/_layout.tsx`
    の Provider の外で描画される）は、`<I18nProvider initialSetting="system">` で包んで
    端末の言語で出す（`ui/ErrorScreen.tsx`）。`+not-found` は Stack の中の画面なので、
    普通に `useI18n()` が使える。
-   OS標準の部品の文言は端末の言語に従い、アプリ内の言語とずれる。`Alert.alert` のボタン
    など、文言を指定できるものは省略せず `t` で渡す（省略すると既定の「OK」が端末の言語で
    出る）。

### フォント

-   書体は表示言語で決める（English → Inter、日本語 → Noto Sans JP。`src/theme/fonts.ts`）。
    言語の設定（`system` を含む）に従い、切り替えは全画面にすぐ反映する。ユーザーが入力した
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
    消さない。アプリ内のAbout（WBS 5.2）にも、同梱フォントのライセンスを表記する。

### ネイティブビルド

-   `ios/`・`android/` は `expo prebuild` の生成物（gitignore）。直接直さず、
    app.json と `plugins/` で設定する。
-   `plugins/withIosSceneDelegate.js` は、iOS 27 SDK（Xcode 27）の UIScene 必須化
    （未対応だと起動直後にクラッシュする）への対応で、削除しない。Expo SDK 58 の
    テンプレートが同じ配線を持つので、SDK 58 へ上げるときにこのプラグインと
    app.json の登録を撤去する。
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
