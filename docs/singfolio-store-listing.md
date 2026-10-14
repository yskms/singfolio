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

フィーチャーグラフィック・スクリーンショットは作成済み（WBS 6.3）。

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
-   **App Store 用の横長の素材**: 3840×1646（24ビットPNG、透過なし）。`assets/app-store-artwork-3840x1646.png`。
    Google Play のフィーチャーグラフィックと同じ色・同じロゴで、ロゴは拡大せず、まわりの余白だけを
    広げた（ロゴは幅の約36%）。Apple の「App Store asset best practices」
    （`https://developer.apple.com/app-store/asset-best-practices/`）の素材に使う。このページには
    3840×1646 の記載が無く（Product page header・Search results asset などは、Apple が配る
    テンプレートの寸法に従う）、どの素材にどの寸法かは、提出時にテンプレートで確認する。
-   **スクリーンショット**: Songs・Song Detail・Add Song・Practice・Show Mode・Profile（ダーク表示）の6枚を、
    English と日本語で用意した。見出し・補足つきで、
    `assets/store-screenshots/` にある。ブランドの色と書体（Inter / Noto Sans JP。`assets/fonts/`）を使い、
    採点や順位を連想させる表現は使わない。
    -   **撮影画像**は、App Store 用が `raw/{en,ja}/`（iOS シミュレータ。iPhone 18 Pro、1206×2622）、
        Google Play 用が `raw-android/{en,ja}/`（Android エミュレータ。1080×2424）。`scripts/store-screenshots/compose.sh`
        が、見出し・補足・背景を合成して、`ios/` と `play/` に出す（生成物は手で編集しない）。
    -   **App Store** 用は 1320×2868（`ios/`）。App Store Connect の「Dynamic Island (large)」。App Store Connect の
        必須は「Dynamic Island (medium)」（6.1インチ、1179×2556）の1枚以上で、Apple の仕様ページ
        （2026年10月に確認）は、「UI が各サイズで一貫していれば、必要な最高の解像度だけ出せば、App Store Connect が
        小さい大きさへ縮小する」としている。1320×2868 だけで 1179×2556 の枠が埋まるかは、提出のとき、
        App Store Connect にアップロードして確かめる。埋まらなければ、`compose.sh` に 1179×2556 の出力を足す。
    -   **Google Play** 用は 1080×1920（`play/`。9:16）。Play は長辺が短辺の2倍までなので、Android の撮影画像
        （比率 約2.24）もそのまま使えず、別のキャンバスに合成している。下端は、画像をはみ出させて切るが、切り口が
        ボタンや行の途中に当たらないよう、余白の帯に合わせて画像の大きさを少し変える（`find_cut.py`）。
    -   **Android エミュレータへの日本語の入力**: Gboard に、日本語（QWERTY）のキーボードを足す（設定 → On-screen keyboard →
        Gboard → Languages → Add keyboard → 日本語 → QWERTY → Done）。足したあと、ソフトキーボードの地球儀キーで日本語に
        切り替え、ローマ字を `adb shell input text` で送ると、かなになり、変換の候補が出る。候補を押して確定する
        （先頭の候補で、アーティストは「灯火の庭」になった）。エミュレータを停止すれば、この設定は消える。
        クリップボードの共有・エミュレータコンソールの `event text`・ADBKeyBoard は、使えなかった。
    -   **背景**は、Mint `#C9FCED` と Lavender `#EEE5FF` を交互にし（1〜5枚目）、6枚目だけ Purple `#9C70FE`。
        Lavender は Purple を白に約18%混ぜた派生色（ブランド表にはない）。白に近い中立色は、白いストアの
        ページで画像の縁が消える（白との差が 1.09:1）ので、背景にしない。見出しは Text Primary `#17171A`。
        補足は `#52525B`（Text Secondary `#71717A` は、Mint の上で 4.29:1、Lavender の上で 3.98:1 と、AA の
        4.5 に足りないため、濃くした）。6枚目の補足だけ `#17171A`（Purple の上では、グレーが読めない）。
    -   **曲名・アーティスト名はすべて架空**（`scripts/store-screenshots/seed.py` が、撮影用のDBへ入れる）。
        実在のアーティスト・曲を、画面に出さない。第三者の素材（App Store 5.2.1）に当たらないためと、
        実在の人名を、許可なく宣伝の画像に載せないため。足すときは、`check_names.py`（Apple の検索 API の
        `entity=musicArtist`）で、同じ名前のアーティストが居ないことを確かめる（`Marlo Vance`・`Luna Quill`・
        `Hollis Gray` など、架空のつもりの名前が、実在した）。曲名は、実在の曲と偶然一致してもよい。
    -   **候補（Suggestions）が出ている画面は、スクリーンショットにしない**。候補は Apple のカタログの実在の曲
        で、避けられない。Add Song は、候補をオフにして、`seed.py` の `ADD_SONG` の値を手で入力した画面にしている
        （入力した文字が、撮影中に Apple へ送られることも避ける）。候補があることは、掲載文で伝える。
    -   **撮影の手順**（再現できるよう、使ったコマンドを残す）:
        -   Release ビルドで撮る（debug は、LogBox が写り、ダーク表示の配色も変わる）。撮影用のデータは、アプリを止めて、
            DB を `seed.py` で入れ替える（`seed.py <en|ja> <DB> [light|dark] [on|off]`）。
        -   iOS: ステータスバーを `xcrun simctl status_bar <UDID> override --time 9:41 --batteryState charged
            --batteryLevel 100 --wifiBars 3 --cellularBars 4 --operatorName ''` で揃え、撮影後に `status_bar <UDID> clear`
            で戻す。撮影は `xcrun simctl io <UDID> screenshot`。
        -   Android: ステータスバーはデモモード（`settings put global sysui_demo_allowed 1` のあと、
            `am broadcast -a com.android.systemui.demo -e command` に、`enter`・`clock -e hhmm 0941`・
            `battery -e level 100 -e plugged false`・`network -e wifi show -e level 4 -e fully true`・
            `network -e mobile hide`・`notifications -e visible false` を順に渡す。戻すときは `exit` と
            `settings delete global sysui_demo_allowed`）。撮影は `adb exec-out screencap -p`。
            DB は、`adb exec-out run-as com.yskms.singfolio cat files/SQLite/singfolio.db` で取り出して `seed.py` で
            入れ替え、`adb push` → `run-as ... cp` で戻す。`run-as` は debuggable なアプリにしか使えず、エミュレータ
            （production ビルド）は `adb root` も使えないので、`android/app/build.gradle`（prebuild の生成物）の
            `release` に、一時的に `debuggable true` を足して Release ビルドする（開発者向けの機能は、
            React Native 側の設定で、debuggable でも有効にならない）。撮影のあとは、この行を消す。
        -   Practice の「Last updated」の日付は、撮った日で変わる。English・日本語の6枚は、同じ日に撮る。
-   App Store は、1枚から10枚。JPEG・PNG、透過なし。サイズの仕様は、提出のとき、App Store Connect で最新の
    ものを確認する（上の「App Store 用」）。
-   Google Play は、スマートフォン用に2〜8枚（JPEG または 24ビットPNG。辺は320〜3840px。長辺は短辺の2倍まで）。
    9:16 の 1080px 以上を4枚以上出すと、おすすめの掲載の対象になる。

## 5. この内容が前提にしていること

-   候補（Suggestions）の外部検索が、アプリに入っていること。入れない場合（`src/services/index.ts` の
    `catalogFetch` を外した場合）は、プライバシーポリシー・掲載文・プライバシーの申告から、Apple へ送る
    記述を外す（WBS 6.5）。
-   公開機能（公開プロフィール・リクエスト）は、v1.0に含まれない。
