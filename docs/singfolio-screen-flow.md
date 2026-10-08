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

### 起動時の例外

起動に失敗したときや、画面の描画に失敗したときは、タブを出さず、専用のエラー画面で伝える
（アプリ全体で1つ。ルートの `ErrorBoundary`）。エラー画面はDBに触れない（起動時の失敗では
DBを読めないことがある）ため、言語は保存したLanguageの設定ではなく、常に端末の言語で出す。
配色は、起動に失敗したときは端末の設定に従い、起動が終わった後の描画の失敗では、保存した
Appearanceのまま（起動時に端末へ反映済みのため）。

-   **アプリより新しいDB**（ストアで古い版へ戻した場合など）：「アプリの更新が必要です」と
    伝える。やり直しても開けないため、ボタンは出さない。DBは変更していない旨も伝える。
-   **それ以外の起動時の失敗**（DBを開けないなど）：汎用の文言と「もう一度試す」ボタン。
    押すと起動の処理を最初からやり直す。原因は利用者に見せない。
-   **起動後の画面の描画の失敗**：同じ汎用のエラー画面（タブも隠れる）。「もう一度試す」を
    押すと、アプリの画面を作り直し、先頭の画面（Songs）から始める（開いていた画面は残らない。
    iOSで確認）。先頭の画面自体が失敗する場合は、やり直しても同じ失敗になる（アプリの
    再起動が要る）。画面（ルート）ごとの `ErrorBoundary` は置かない。失敗してもタブへ戻れる
    ようにしたい画面が出てきたら、その画面に足す（2. 以降の画面を足すときに判断する）。
-   **存在しない画面**（`singfolio://...` のリンクなど）：「画面が見つかりません」と、
    曲の一覧へ戻るボタン。通常の画面と同じく、保存した言語・配色に従う。
-   スプラッシュは、DBの初期化と設定の読み込みが終わり、最初の画面を描画できるまで残す。
    エラー画面を出すときは閉じる。

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

-   System
-   English
-   日本語

デフォルトはSystem（Appearanceと同じ形）。

-   English / 日本語は、その言語自身の名前で出す（言語が分からなくなっても選び直せるように）。
    System だけは、表示中の言語の文言で出す。
-   System のあいだは、端末の言語に従う。端末の言語の優先順に見て、最初に対応している
    言語（`ja-JP` → 日本語）を使い、どれも対応していなければ English。端末の言語が
    後で変わったときも追従する。
-   English / 日本語を選ぶと、その言語を保存し、端末の言語が変わっても変えない。System を
    選ぶと、端末の言語への追従に戻る。切り替えは、アプリを再起動せず全画面にすぐ反映する。
-   初回起動で端末の言語から決めた言語を保存しない（保存すると、System のまま追従できなく
    なる。未保存は System）。
-   書体は表示言語に従う（English → Inter、日本語 → Noto Sans JP）。ヘッダーの題・タブの
    ラベルも含め、言語を切り替えるとすぐ変わる。ユーザーが入力した日本語を English の画面で
    出すときは、Inter に日本語の字が無いため、OS（端末）のフォントで表示される（端末の言語に
    日本語が無いと、漢字が中国語の字形になりうる。未確認。許容している）。
-   iOSは、アプリの対応言語（`CFBundleLocalizations`）を app.json で宣言している。
    宣言が無いと、iOSの標準の文言（コピー/ペーストのメニュー、ダイアログのボタンなど）が
    日本語の端末でも英語のままになる（Appleの説明による。未確認）。宣言すると、OSの設定
    アプリのSingfolioに、アプリごとの言語の項目が出る（Appleの仕様。未確認）。
    System のあいだは、アプリはOSが返す言語の優先順に従う（起動引数 `-AppleLanguages` で
    言語を変えて、従うことをiOSシミュレータで確認済み。設定アプリの項目からの変更は
    未確認）。English / 日本語を選んだ後は、アプリ内の設定が優先する。このときOSの設定
    アプリで言語を変えても、アプリの文言は変わらず、OS標準の文言だけが変わる（System へ
    戻せば、OSの設定に従う）。
-   Androidは、アプリごとの言語（Android 13以降のOSの機能）を宣言していない。言語の操作は
    アプリ内のLanguageに一本化する。Androidの標準の文言は端末の言語に従う。
-   OS標準の部品の文言は、アプリ内のLanguageではなく、端末（iOSでOSの設定アプリで選んだ
    アプリの言語を含む）の言語に従う。そのため、アプリ内で選んだ言語が端末と違うと、
    ずれる（`Alert.alert` のボタンを省略したときの既定の「OK」など）。文言を指定できる
    ものは、省略せず指定する（CLAUDE.md「言語」）。

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
