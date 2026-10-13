# Singfolio ストア掲載情報

App Store（iOS）と Google Play（Android）の掲載文・申告の内容。掲載文は、English（既定）と
日本語の2言語。仕様の正は、要件定義・画面設計・`privacy-policy.md`。機能を変えたら、ここも直す。

-   掲載文に書くのは、アプリにある機能だけ。採点・ランキング・歌唱分析・楽曲再生・SNS・公開プロフィール・
    リクエスト（将来機能）は書かない（要件定義 §7）。
-   候補（Suggestions）で、入力した曲名・アーティスト名を Apple へ送ることは、掲載文にも、
    プライバシーの申告にも書く（`privacy-policy.md`）。商標の都合で、掲載文に「iTunes」「Apple Music」
    とは書かない（画面の表記は `Suggestions from Apple`）。

## 1. 共通

| 項目 | 内容 |
|---|---|
| アプリ名 | Singfolio |
| タグライン | Your songs, ready to sing. / 歌える曲を、ひとつの場所に。 |
| カテゴリ | App Store: Music（副: Lifestyle） / Google Play: Music & Audio |
| サポートURL・マーケティングURL | `https://yskms.github.io/singfolio/` |
| プライバシーポリシーURL（英語・日本語共通） | `https://yskms.github.io/singfolio/privacy-policy.html` |
| 提供者 | yskms |
| 価格・内課金・広告 | 無料。アプリ内課金なし。広告なし |
| 言語 | English（既定）・日本語 |

サポートURL・プライバシーポリシーURLは、GitHub Pages（このリポジトリの `docs/`）で公開する。
`docs/index.md` と `docs/privacy-policy.md` が、それぞれのページになる。`docs/_config.yml` の
`exclude` で、他の docs（仕様・WBS・このファイル・ブランド資料）は、サイトには公開しない。アプリの
About にも、プライバシーポリシーへのリンクがある（`src/legal/legalUrls.ts`）。公開後に、2つのURLが
開けることと、他の docs（`.html`・`.md`・画像）が404になることを確認した。公開する2ページは、
`.md` のソースも同じ名前（`privacy-policy.md` など）で取れる（中身はHTMLの元で、リポジトリにも出ている）。
docs の構成や `_config.yml` を変えたときは、ストアに入れる前に、同じ確認をやり直す。

## 2. App Store（iOS）

文字数の上限は、App Store Connect の制限（名前・サブタイトルは30、プロモーション用テキストは170、
説明は4000、キーワードは100、いずれも文字数）。

### English

-   **Name**: `Singfolio`
-   **Subtitle**: `Your songs, ready to sing.`
-   **Promotional Text**: `Keep every song you can sing, are practicing, or want to sing in one place. Add tags, note your key, and show your repertoire to anyone.`
-   **Keywords**: `karaoke,repertoire,setlist,songs,singer,song list,practice,key,vocal,acoustic,music`
-   **Description**:

```text
Singfolio is a repertoire manager for people who sing: at karaoke, for acoustic sets, on streams, or on stage. It keeps track of what you can sing, not how well you scored.

THREE LISTS, ONE PLACE
• Ready: songs you can sing
• Practice: songs you're working on
• Want: songs you'd like to sing

EVERYTHING A SINGER NEEDS
• Add songs with a title and an artist. Suggestions appear as you type (optional)
• Note your own key for each song
• Add tags like "Ballad" or "Duet", and filter by them
• Keep private notes that only you can see
• Search by title or artist, and sort the list your way
• The Practice tab shows the songs you're working on. Mark one Ready when you've got it

SHOW MODE
Hand your phone to a friend and let them see what you can sing. Show Mode lists your Ready songs by artist, with search and tag filters. It shows nothing private: no keys, no notes, no editing.

PRIVATE BY DESIGN
• No account, no ads, no tracking
• Your song list stays on your device
• Suggestions are optional. They send only what you type in Title and Artist to Apple to find matches, and you can turn them off in Profile

Light and dark mode. English and Japanese.

No scores. No rankings. Just what you can sing.
```

### 日本語

-   **名前**: `Singfolio`
-   **サブタイトル**: `歌える曲を、ひとつの場所に。`
-   **プロモーション用テキスト**: `歌える曲・練習中の曲・歌いたい曲を、ひとつの場所に。タグやキーのメモで整理して、レパートリーをそのまま人に見せられます。`
-   **キーワード**: `カラオケ,レパートリー,持ち歌,歌,曲リスト,弾き語り,歌配信,練習,キー,タグ,セットリスト`
-   **説明**:

```text
Singfolioは、歌う人のためのレパートリー管理アプリです。カラオケ、弾き語り、歌配信、ライブで。管理するのは歌の点数ではなく、自分が何を歌えるか。

3つのリストを、ひとつの場所に
• 歌える: 歌える曲
• 練習中: 練習している曲
• 歌いたい: 歌ってみたい曲

歌う人に必要なものを
• 曲名とアーティストで曲を追加。入力中に候補が出ます（オフにもできます）
• 曲ごとに、自分のキーをメモ
• 「バラード」「デュエット」などのタグを付けて、絞り込み
• 自分だけが見られる非公開メモ
• 曲名・アーティストで検索、好きな順に並び替え
• 「練習」タブに、練習中の曲を一覧。歌えるようになったら「歌える」へ

SHOW MODE
スマートフォンを友だちに見せて、歌える曲を伝えられます。Show Modeは「歌える」曲をアーティストごとに並べ、検索とタグの絞り込みができます。キーも非公開メモも出ず、編集もできません。

プライベートな設計
• アカウント登録なし、広告なし、トラッキングなし
• 曲のリストは、端末の中だけに保存
• 候補は任意です。曲名・アーティストの入力欄に入力した文字だけを、候補を探すためにAppleへ送ります。プロフィールでオフにできます

ライトモード・ダークモードに対応。日本語・英語で使えます。

点数も、ランキングもありません。歌えるものだけを。
```

### リリースノート（1.0.0）

-   English: `First release.`
-   日本語: `初回リリース。`

### 年齢指定（Age Rating）

質問には、すべて「なし」と答える。**「広告（Advertising）」は「いいえ」**（広告を表示しない）。
ユーザーが作る内容は端末内にとどまり、他の人へ共有されないため、「ユーザー生成コンテンツ」も
「いいえ」。「制限のないWebアクセス」も「いいえ」（アプリ内にブラウザを持たない。
プライバシーポリシーは外部のブラウザで開く）。結果は 4+。

候補（Suggestions）の曲名は、Apple の楽曲カタログのまま出る。検索の `explicit` は指定しない
（`explicit=No` を足さない）。実測（2026年10月、米国・日本ストアで、ラップなどそれぞれ8つの検索）では、指定しなくても
`trackExplicitness` が `explicit` の曲は返らず（`cleaned` / `notExplicit` だけ）、`explicit=No` を
足しても結果は同じだった。審査で、候補に出る曲名を指摘されたら、年齢指定を見直す。

### 輸出コンプライアンス

`app.json` の `ios.config.usesNonExemptEncryption: false`（通信は標準のHTTPSだけで、独自の暗号化は
無い）。App Store Connect の質問にも、同じ答え（免除される暗号化のみ）で答える。

### App プライバシー（App Privacy）

Apple へ送る検索語があるため、次の1項目を申告する。他は「収集しない」。

| データの種類 | 収集 | ユーザーに紐付け | トラッキング | 目的 |
|---|---|---|---|---|
| 検索履歴（Search History） | する | しない | しない | アプリの機能 |

-   検索語は、曲名・アーティスト名の入力欄に入力した文字（`privacy-policy.md`）。識別子は付けない
    ので、ユーザーには紐付かない。
-   アカウント・広告ID・位置情報・連絡先・購入履歴・診断データなどは、取得しない。

## 3. Google Play（Android）

文字数の上限は、Play Console の制限（アプリ名は30、簡単な説明は80、詳細な説明は4000）。

### English

-   **App name**: `Singfolio: Song Repertoire`
-   **Short description**: `Manage the songs you can sing, are practicing, and want to sing.`
-   **Full description**: App Store の Description（§2）と同じ文（見出しの大文字は、そのまま使ってよい）。
-   **Release notes (1.0.0)**: `First release.`

### 日本語

-   **アプリ名**: `Singfolio: 持ち歌レパートリー管理`
-   **簡単な説明**: `歌える曲・練習中の曲・歌いたい曲を、ひとつの場所で管理するアプリ。`
-   **詳細な説明**: App Store の説明（§2）と同じ文。
-   **リリースノート（1.0.0）**: `初回リリース。`

### アプリのコンテンツの申告

-   **広告**: 広告を含まない。
-   **ターゲット ユーザー**: 13歳以上（子供向けではない。13歳未満を含めない）。
-   **コンテンツのレーティング（IARC）**: 暴力・性的な表現・不適切な言葉・薬物・ギャンブルなどは、すべて
    「なし」。ユーザー間のやり取りも、位置情報の共有も、ユーザー生成コンテンツの共有も、無い。
-   **健康アプリの申告**: 健康に関する機能は無い（「健康に関する機能が一切ない」を選ぶ）。
-   **データ セーフティ**: 下の表。

| データの種類 | 収集 | 共有 | 目的 | 任意か |
|---|---|---|---|---|
| アプリのアクティビティ > アプリ内の検索履歴 | する | する（Apple） | アプリの機能 | 任意（プロフィールの「候補」で、オフにできる） |

-   他のデータの種類は、収集も共有もしない。
-   データは、転送中に暗号化される（HTTPS）。
-   開発者はこのデータを受け取らず、保持しない。削除をリクエストする手段は、設けない。
-   プライバシーポリシーのURLは、§1のもの。

## 4. スクリーンショット・フィーチャーグラフィック

フィーチャーグラフィックは作成済み。スクリーンショットは未作成（WBS 6.3）。

-   **Google Play のフィーチャーグラフィック**: 1024×500（JPEG または 24ビットPNG。透過なし）。
    `assets/play-feature-graphic-1024x500.png`。ロゴとキャッチコピーを横に並べた元の画像（2048×768）を
    0.53倍に縮め、1024×500 のキャンバスの中央に置いて作った（比率が違うため、引き伸ばしも切り詰め
    もしない）。色は、ブランドの色に塗り直している（背景は Mint `#C9FCED`、マークは Purple `#9C70FE`、
    ワードマークは Text Primary `#17171A`、キャッチコピーは Text Secondary `#71717A`。元の画像は、
    背景が白に近く、マークの紫が約 `#A781EE` と明るく、文字が青みがかっていた）。輪郭の混ざり具合は
    保ち、元の画像にあったかすかなムラは消している。背景をミントにしたのは、アイコン（ミントの上の
    紫のマーク）と揃えるため。ストアのページは白（ダークモードでは暗い色）で、白い背景だと画像の縁が
    ページに溶けて、ダークモードでは白い板になる。
    アプリアイコンの 512×512 は、`assets/play-store-icon-512.png`。
-   **スクリーンショット**: Songs・Song Detail・Add Song（候補が出ている状態）・Practice・Show Mode・
    Profile（ダーク表示も1枚）。ブランドの色と書体（Mint・Purple・Inter / Noto Sans JP）を使い、
    採点や順位を連想させる表現は使わない。English と日本語で、それぞれ用意する。
-   App Store のサイズは、App Store Connect の最新の仕様を、提出時に確認する（2026年10月に確認した
    ときは、6.1インチ 1179×2556 が必須、6.9インチ 1320×2868 などは任意で、足りない大きさは自動で
    縮小。1枚から10枚。JPEG・PNG、透過なし）。
-   Google Play は、スマートフォン用に2〜8枚（JPEG または 24ビットPNG。辺は320〜3840px）。

## 5. この内容が前提にしていること

-   候補（Suggestions）の外部検索が、アプリに入っていること。入れない場合（`src/services/index.ts` の
    `catalogFetch` を外した場合）は、プライバシーポリシー・掲載文・プライバシーの申告から、Apple へ送る
    記述を外す（WBS 6.5）。
-   公開機能（公開プロフィール・リクエスト）は、v1.0に含まれない。
