# Singfolio v1.0 画面設計

## 1. ナビゲーション

ボトムタブは3つ。

-   **Songs** --- レパートリー管理
-   **Practice** --- 練習中の曲
-   **Profile** --- 見せる・設定

メイン導線は `Songs` とする。

## 2. 画面遷移

``` text
                     Singfolio
                         │
          ┌──────────────┼──────────────┐
          │              │              │
        Songs         Practice        Profile
          │              │              │
          │              │         ┌────┴────┐
          │              │         │         │
      Song Detail    Song Detail  Show Mode  Settings
          │
       Add / Edit
```

v1.0ではログインを必須にしない。

公開Web・Requestsは将来追加する。

## 3. Songs

アプリのホーム画面。

### 表示

``` text
Singfolio                              ＋

My Songs

  84             12             23
 Ready         Practice         Want

Search songs or artists...

[ All ] [ J-Pop ] [ Rock ] [ Acoustic ]

Ready to sing                         84

チェリー
スピッツ
J-Pop · Acoustic

HANABI
Mr.Children
J-Pop · Ballad

天体観測
BUMP OF CHICKEN
Rock · Anime
```

### 操作

-   曲を検索
-   タグで絞り込み
-   ステータスで絞り込み
-   曲をタップ → Song Detail
-   `＋` → Add Song
-   Ready / Practice / Want の数字をタップ → 該当曲のみ表示

## 4. Add / Edit Song

曲の登録・編集画面。

### 項目

**Song** - Title * - Artist *

**Status** - Ready - Practice - Want

**My Key** - Original - - / + 数値

**Tags** - 複数選択 - 新規タグ作成

**Private Note** - 自由入力

`*` のみ必須。

素早く登録できることを優先し、Title + Artistだけでも保存可能とする。

### タグに関する注意事項

タグはShow Modeに表示される。人に見せたくない内容はPrivate Noteに入力するよう、
タグ欄の近くで短く案内する。

``` text
Tags may appear in Show Mode.
Keep private details in Private Note.

タグはShow Modeに表示されます。
人に見せたくない内容はPrivate Noteに入力してください。
```

常時表示・初回説明・情報アイコンなど、UI上の提示方法は未確定とし、実装時に決定する。

## 5. Song Detail

登録した曲の詳細画面。

``` text
チェリー
スピッツ

STATUS
● Ready to sing

MY KEY
-2

TAGS
J-Pop
Acoustic

PRIVATE NOTE
2番の歌詞を確認
サビは問題なし。

────────────────

Edit
```

ここからステータス変更も可能とする。

`Practice → Ready` などを簡単に行えるようにする。

## 6. Practice

現在練習している曲に集中する画面。

``` text
Practice

12 songs

Search...

怪獣
サカナクション

Last updated: Today

[ Mark as Ready ]


晩餐歌
tuki.

Last updated: Sep 28

[ Mark as Ready ]
```

### 操作

-   練習中の曲を一覧表示
-   曲をタップ → Song Detail
-   `Mark as Ready`
-   検索

練習履歴などの高度な管理はv1.0では行わない。

## 7. Profile

自分のSingfolioに関する画面。

``` text
Profile

YSKMS

84 songs ready to sing

────────────────

Show My Songs

────────────────

Appearance
Language
Tags
Data
About
```

v1.0では公開プロフィールではなく、端末内のプロフィール・設定画面として扱う。

## 8. Show Mode

Singfolioの重要機能。

友人などにスマートフォンを見せて、「この中から選んで」と使うための閲覧専用画面。

``` text
             Singfolio

        What should I sing?

      84 songs ready to sing

Search songs or artists...

[ All ] [ J-Pop ] [ Rock ] [ Ballad ]

スピッツ                              8

チェリー
ロビンソン
楓
空も飛べるはず


Mr.Children                         12

HANABI
Sign
しるし
Tomorrow never knows
```

### 表示する

-   曲名
-   アーティスト
-   タグ

### 表示しない

-   My Key
-   Private Note
-   Want
-   その他管理情報

Show Modeから編集操作はできない。

画面右上の `×` で通常画面へ戻る。

## 9. Settings

### Appearance

-   System
-   Light
-   Dark

デフォルトはSystem。

-   アプリ全体（ネイティブの描画を含む）のカラースキームを切り替えるため、ステータスバーや
    ダイアログも設定に従う。端末（OS）の設定は変えない。
-   起動画面（スプラッシュ）だけは、アプリが起動する前に表示されるため、この設定ではなく
    端末の設定に従う（端末がダークでAppearanceがLightのときは、ダークの起動画面のあと
    ライトの画面になる）。Androidでは、アプリを終了して同じプロセスのまま再び開いた
    直後にも、Appearanceが System 以外のときは、設定を反映するまでの短い間、端末の配色の
    画面が見える。

### Language

-   English
-   日本語

-   選択肢には、各言語をその言語自身の名前（English / 日本語）で出す。
-   利用者が選ぶまでは、端末の言語に従う。端末の言語の優先順に見て、最初に対応している
    言語（`ja-JP` → 日本語）を使い、どれも対応していなければ English。選ぶまでは、
    端末の言語が後で変わったときも追従する。選ぶまで保存はしない（保存すると追従できない）。
-   一度選んだら、その言語を保存し、端末の言語が変わっても変えない。切り替えは、アプリを
    再起動せず全画面にすぐ反映する。
-   iOSは、アプリの対応言語（`CFBundleLocalizations`）を app.json で宣言している
    （宣言が無いと、コピー/ペーストのメニューやダイアログのボタンなど、iOSの標準の文言が
    日本語の端末でも英語のままになる）。そのため、OSの設定アプリのSingfolioにも、
    アプリごとの言語の項目が出る（OSの標準の動作）。アプリ内で選んでいない間は、
    それにも従う。選んだ後は、アプリ内の設定が優先する。
-   OSの標準の文言は、アプリ内のLanguageではなく、端末（OSで選んだアプリの言語を含む）の
    言語に従う。

### Tags

作成済みタグの管理。

### Data

将来的なImport / Exportを想定する。

v1.0で実装しない項目は表示しない。

## 10. 将来の画面追加

公開機能追加時：

``` text
Profile
   │
   └── Public Profile Settings
              │
              ↓
       singfolio.app/username
              │
              ↓
        Viewer Request
              │
              ↓
           Requests
```

ボトムタブ：

v1.0

`Songs / Practice / Profile`

Requests実装後

`Songs / Practice / Requests / Profile`

## 11. UI原則

### Fast

曲の登録・検索・ステータス変更を少ない操作で行える。

### Clean

曲数が数百曲になっても見やすいリストUIを優先する。

### Private by Default

キー・メモなど個人用情報は外部に見せない。

### No Scores

採点・ランキングをUIに持ち込まない。

### Showable

「自分で管理する画面」と「人に見せる画面」を明確に分離する。

## 12. v1.0の中心体験

`Want → Practice → Ready` を基本的な曲の成長フローとする。

`Want` は Songs 内のステータスとして扱い、`Practice`
は「今練習する曲」に集中するため独立タブとする。

v1.0で最も重要な体験は以下。

**曲を登録 → Readyにする → Show My Songs → 「この中から選んで」**

公開WebやRequestsを実装する前から、Singfolioの中心コンセプトを体験できることを重視する。
