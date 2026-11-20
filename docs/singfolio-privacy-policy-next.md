<!--
  次のプライバシーポリシー（アカウント機能つきの版）の下書き。公開しない（`singfolio-*.md` は Jekyll の exclude で公開されない）。

  使い方: アカウントを出す版のリリース手順で、このファイルの内容を `docs/privacy-policy.md` に反映する（このコメントは写さない）。
  7.3.13 の確認用ビルド（TestFlight・内部テスト）はリリースしない。アカウントを出す版の時期は決めていない。
  反映するときに、施行日（Effective date）を決める。反映する前に `ACCOUNT_ENABLED` を外したビルドを出さない。
  `docs/privacy-policy.md` は main に push した時点で公開される（GitHub Pages）ので、アカウントを出すまでは、そちらを書き換えない。

  見出しの `{#…}` は kramdown の明示的なアンカー。Google Play の「アカウントの削除」のURLは、
  `https://yskms.github.io/singfolio/privacy-policy.html#delete-account` を使う（公開後に、実際にこの位置へ飛ぶことを確かめる）。
  日本語の見出しにはアンカー（`#delete-account-ja`）を明示する（自動の ID は、日本語の見出しでは当てにしない）。
  **`{#…}` の前には空白が要る**（空白が無いと、kramdown 2.6.1 は、`{#…}` を文字のまま出し、ID も付かない。空白を入れて描画し直して確かめた。
  確かめ方は、kramdown と kramdown-parser-gfm を入れて、`Kramdown::Document.new(src, input: 'GFM').to_html` の `<h3 id=…>` を見る）。

  事実の出どころ: docs/singfolio-publishing-backend.md §8（保存するもの・期限・削除・自動削除・Google/Appleのトークン）。
  書いてある数字（90日・1年・30日）を変えるときは、コードの定数（`SESSION_TTL_MS`・`INACTIVE_ACCOUNT_TTL_MS`）とdocsを一緒に直す。

  7.4.10: 公開機能（Public Profile・Publish。7.4）の内容を足した（「Public profile」の節。要約・保存するもの・削除・自動削除の説明も直した）。
  公開ページ（7.5）が出る版と一緒に出す前提で書いている（公開ページが無いと「誰でも開ける」が成り立たない）。
  まだ入っていないもの: 7.5（視聴者のアクセス。Cloudflare が視聴者のIPを扱うこと、キャッシュによる削除の反映の遅れ、検索エンジン）と、
  7.6（Requests。視聴者の入力・Turnstile・ニックネーム）。「サインインできない人の公開ページ」の文は、7.5 で取り下げの窓口を決めるまでの暫定。
  スナップショットの `version`・`publishedAt`（最後に公開した時刻と内部の版の番号）は、「What is published」に載せ済み。
  7.5 で、公開ページがこれらを出さないと決めたら、「What is published」から外す（R2 のスナップショットには入っているので、
  外す場合は、公開用のコピーに含まれることを、保存するものの側に書き直す）。
  事実の出どころは §8 の「Publish と Unpublish のエンドポイント」「公開スナップショットの形と上限」「公開するタグの選び方」「Auto Publish」
  「未使用のアカウントの自動削除」。公開する項目・自動削除の対象外の条件を変えるときは、ここも一緒に直す。
-->

# Singfolio Privacy Policy / プライバシーポリシー

Effective date / 施行日: (to be set at release / リリース時に決める)

## English

Singfolio (the “App”) is a repertoire manager for singers, available for Android and iOS and provided by yskms. You keep a list of the songs you can sing, are practicing, or want to sing.

### Summary

- The App works without an account. You can use every feature for managing your songs without signing in.
- Your song list is stored on your device. The developer does not receive it unless you choose to publish a public profile, and then only what is listed under “Public profile (optional)”. Your key and private notes are never sent.
- If you choose to create an account (with Apple or Google), the developer’s server stores an identifier for your account and when you last used it. It does not store your name or email address.
- If you choose to publish a public profile, your Display Name, Bio, username, and Ready songs (with the tags you choose to make public) are stored on the developer’s server and shown on a web page that anyone can open.
- The App also sends the text you type in the Title and Artist fields of Add / Edit Song to Apple, to find suggestions. You can turn this off.
- You can delete your account, or unpublish your profile, in the App at any time. An account that has not been used for one year is deleted automatically, unless it has a published profile. Only actions that connect to the developer’s server count as use, such as signing in or out, or opening Public Profile; opening the Account screen or using the App on your device alone does not.
- The App has no ads, no analytics, and no tracking.

### Data stored on your device

The songs you add (title, artist, status, your key, tags, and private notes), the tags you create, and your settings (appearance, language, and the Suggestions switch) are stored only in the App’s database on your device. The App does not send this data to the developer or to any server, except the items you choose to publish (see “Public profile (optional)”). It has no cloud synchronization: a published profile is a copy you send on purpose, and nothing on the server is brought back to change your songs.

You can delete a song or a tag in the App. Deleting the App deletes all of its data from the device. If you use your device’s backup features (for example iCloud Backup or Android backup), the operating system may include the App’s data in your backup according to your device settings. Backups are handled by Apple or Google, not by the developer.

### Song suggestions (information sent to Apple)

While you type in the Title or Artist field of Add / Edit Song, the App can show suggestions. To do this, it sends the text you have typed in that field to Apple’s iTunes Search service (itunes.apple.com) over HTTPS and shows the results.

- What is sent: the text you typed in the Title or Artist field of the screen you are on (when looking for songs, the artist you typed or chose on the same screen is sent together with the title), and a country code (Japan or the United States, chosen from the App’s display language). Nothing is sent when you only open the screen or focus a field; the App sends a request only after you edit the field and the text is at least two characters long.
- What is not sent: your song list, your key, your private notes, your tags, and the text of any other field. The App does not send an account, device identifier, or advertising identifier.
- As with any internet request, Apple’s servers can see technical connection information such as your IP address. How Apple handles requests is described in [Apple’s Privacy Policy](https://www.apple.com/legal/privacy/).
- The Suggestions switch in Settings is on by default. When you turn it off, the App sends nothing to Apple, and suggestions of artists you have already saved are shown from your device only.
- If the connection fails, the App simply shows no suggestions. You can always type and save a song freely. A suggestion you choose is saved as ordinary text on your device; the App does not keep which suggestion it came from.

The App does not use Apple’s results for anything other than showing suggestions. The App shows “Suggestions from Apple” next to the suggestions while the feature is on.

### Accounts (optional) {#accounts}

You can create an account in Settings > Account, by signing in with Apple or with Google. Nothing in the App requires an account, and signing in does not upload your songs.

What happens when you sign in:

- The App asks Apple or Google, through that service’s own sign-in screen, to confirm who you are. The service gives the App a signed token. On Android, signing in with Apple takes place in your browser. The App sends the token to the developer’s server (singfolio.app, hosted on Cloudflare) to check it.
- The App does not ask Apple for your name or email address. Google’s token can include your name, email address, and profile picture, and the server receives it. The server reads only the unique account identifier in the token, and does not store or log the rest.

What the server stores:

- An account record, with the date it was created and the date it was last used.
- The sign-in method (Apple or Google) and the identifier that service gives for you. It is a string made up for this purpose; it is not your email address or your name.
- A sign-in session for each device you sign in on. The server keeps only a one-way hash of the session value, and the date it was last used. The value itself is kept on your device, in the system’s secure storage (Keychain on iOS, encrypted storage on Android). A session stops working after 90 days without use.
- If you stop using Sign in with Apple for the App in your Apple Account settings, Apple notifies the server. The server then signs out that sign-in and records the time.
- Short-lived, one-time values that protect sign-in from being replayed. They are stored as hashes and are not linked to you.

What the server does not store: your name, email address, or profile picture (the Display Name you may type for a public profile is not taken from your account), device identifiers, or advertising identifiers. It does not store your song list, except the Ready songs you publish (see “Public profile (optional)” below), and it never stores your key or private notes. The server is set up not to record request logs. Requests reach it through Cloudflare, which handles technical connection information such as your IP address to deliver the service, as described in [Cloudflare’s Privacy Policy](https://www.cloudflare.com/privacypolicy/).

The account is used only to keep you signed in, to sign you out, to delete the account, and, if you choose to use it, to run your public profile. The developer does not sell or share it, and does not use it for advertising or analytics.

### Public profile (optional) {#public-profile}

If you have an account, you can publish a public profile in Profile > Public Profile. Nothing is published until you do it yourself; creating an account or signing in publishes nothing. A public profile is shown on a web page at `singfolio.app/<username>`, which anyone can open without signing in.

What is published:

- Your Display Name and Bio, which you type in the Public Profile screen.
- Your username. You choose it before your first publish, and it becomes part of the page’s address. It cannot be changed afterwards.
- Your songs whose status is Ready: title and artist, an identifier the App made up for the song, and the order in which they appear.
- Tags: only the tags you have turned on in Public Tags, and only on the Ready songs that have them. No tag is public by default.
- The time of your last publish, and an internal version number that changes each time you publish.

What is not published: your key, private notes, and status (so songs you are practicing or want to sing are not published at all), tags you have not turned on, your account identifier, and your sign-in method.

Everything you publish is text you typed, and it is shown as you wrote it. Do not put in anything you do not want to be public. If you use your real name, or a name that identifies you, as your username, Display Name, or Bio, that is what people will see.

How publishing works:

- *Publish Now* sends your Display Name, Bio, and Ready songs to the developer’s server. The server saves them as one published copy, replacing the previous copy. What visitors see is the last published copy, not your current list; changes on your device appear only when you publish again.
- *Publish changes automatically* is off by default, and you can turn it on only while your profile is published. When it is on, the App sends changes to your songs and public tags a short time after you make them, together with the Display Name and Bio you published last. The App does not publish a Display Name or Bio you are still typing.
- Publishing connects to the developer’s server while you are signed in, as does opening Public Profile. This counts as using your account (see below).
- The published copy is stored on Cloudflare (R2). The server also keeps, in its database, your username, the time and version number of your last publish, and a copy of the Display Name and Bio you last published, so that the App can show them again on a new device.

*Unpublish Profile* removes the published copy from the server, and the page stops being shown. The server keeps your username (still reserved for you) and the copy of your last Display Name and Bio until your account is deleted, either by you or automatically after one year without use (an unpublished account is no longer exempt from automatic deletion). Your songs on your device are not changed. Copies that others made while the page was visible, for example screenshots, are outside the developer’s control.

When you delete your account, the published copy and everything else the server stores about the account are deleted. **The one thing that stays is your username**, kept without any link to you or your account, so that no one else can take over an address you may have shared. Please choose a username you are comfortable with being kept this way. The copy of your Display Name and Bio can remain for up to 30 days in the hosting provider’s automatic database recovery history, like other account data (see below).

### Signing out and deleting your account (Singfolio, by yskms) {#delete-account}

**In the App.** Open Settings > Account.

- *Sign out* signs you out on this device. *Sign out of other devices* signs you out everywhere else.
- *Delete account* deletes your account from the developer’s server. To make sure it is you, the App asks you to sign in again with the same Apple or Google account. Deleting removes the account record, the sign-in identifier, all sessions, and your published profile (the published copy, and the saved Display Name and Bio). Only your username is kept, as described under “Public profile (optional)”. **Your songs on your device are not deleted.** If you used Apple, the App also asks Apple to end the connection between your Apple Account and the App; if that fails, you can remove Singfolio under “Sign in with Apple” in your Apple Account settings.

**If you cannot sign in** (for example, your Apple or Google account is no longer available, or you lost your device). The developer’s server does not store names or email addresses, so the developer cannot find your account from an email address, and cannot verify who you are. Instead, an account that has not been used for one year is deleted automatically, **unless it has a published profile**. “Used” means signing in, signing out, or using another feature that connects to the developer’s server: “Sign out of other devices”, and, while you are signed in, opening Public Profile, publishing, unpublishing, and automatic publishing when it sends changes. Opening the Account screen does not connect to the server, and neither does using the App on your device alone. So unless you do one of those things within a year, your account can be deleted even if you keep using the App for your songs. If you claimed a username but never published, your username is kept as described under “Public profile (optional)” when the account is deleted. When an account is deleted automatically, the connection under “Sign in with Apple” in your Apple Account settings stays until you remove it yourself.

**If your profile is published and you cannot sign in.** An account with a published profile is not deleted automatically, so the page stays until you unpublish it or delete the account, which you can only do while signed in. If you need a page taken down and cannot sign in, email the address below with the page’s address (`singfolio.app/<username>`) and the reason. The developer cannot verify who owns an account, so such requests are handled case by case. If you unpublish, the account is again subject to automatic deletion after one year without use.

**How long data is kept.** Account data is kept until you delete the account, or for one year after you last used it as described above. A published profile, and the account that has it, are kept until you unpublish or delete. After deletion, account data (including the saved Display Name and Bio) can remain for up to 30 days in the hosting provider’s automatic database recovery history, and is then gone. Your username is the one exception: it is kept, with no link to you or your account.

If you need help with these steps, email yskms.studio@gmail.com with the subject “Singfolio account deletion”. Do not include private information you do not need to share.

### Links

The App contains a link to this page. Opening it uses your browser, which is governed by that browser’s own privacy practices.

### Information the developer collects

If you do not create an account: none. The developer does not collect, store, sell, or share personal information through the App.

If you create an account: only what is described under “Accounts (optional)” above. If you also publish a public profile: the content described under “Public profile (optional)”. The App does not use advertising or analytics services.

### Children’s privacy

The App is not designed for children and does not knowingly collect personal information from children.

### Changes

If the App changes how it handles information - for example, if it starts sending more of your data to the developer’s servers - this policy will be updated before that feature is released. The effective date above will change when this policy changes.

### Contact

Privacy questions and account help: yskms.studio@gmail.com. Please do not post personal information in public GitHub Issues.

## 日本語

Singfolio（以下「本アプリ」）は、歌う人のためのレパートリー管理アプリで、yskmsが提供するAndroid・iOS向けアプリです。歌える曲・練習中の曲・歌いたい曲のリストを管理します。

### 要約

- 本アプリは、アカウントなしで使えます。曲を管理する機能は、すべて、サインインせずに使えます。
- 曲のリストは端末内に保存されます。公開プロフィールを公開することを選ばないかぎり、開発者は受け取りません。公開する場合も、送るのは「公開プロフィール（任意）」に書いたものだけです。自分のキーと非公開メモは、送りません。
- アカウントを作る場合（AppleまたはGoogleで作ります）、開発者のサーバーは、アカウントの識別子と、最後に使った日時を保存します。名前とメールアドレスは保存しません。
- 公開プロフィールを公開することを選んだ場合、表示名・自己紹介・ユーザー名・Readyの曲（公開すると選んだタグつき）は、開発者のサーバーに保存され、誰でも開けるWebページに表示されます。
- 本アプリは、曲の追加・編集の「曲名」「アーティスト」の入力欄に入力した文字を、候補を探すためにAppleへ送ります。これはオフにできます。
- アカウントの削除と、公開プロフィールの公開の取り下げは、本アプリの中でいつでもできます。1年間使われなかったアカウントは、自動で削除します。ただし、公開プロフィールを公開しているアカウントは、自動では削除しません。「使った」に数えるのは、サインイン・サインアウトや「公開プロフィール」の画面を開くなど、開発者のサーバーにつながる操作だけです。「アカウント」の画面を開く、端末の中だけで本アプリを使う、だけでは、数えません。
- 広告・アクセス解析・トラッキングはありません。

### 端末内に保存するデータ

追加した曲（曲名、アーティスト、ステータス、自分のキー、タグ、非公開メモ）、作成したタグ、設定（外観、言語、候補のスイッチ）は、端末内の本アプリのデータベースにだけ保存します。これらを開発者や外部のサーバーへ送信することはありません。ただし、公開すると選んだものは除きます（「公開プロフィール（任意）」を参照）。クラウド同期はありません。公開プロフィールは、自分の意思で送るコピーで、サーバー側の内容が曲のデータを書き換えることはありません。

曲やタグは、本アプリの中で削除できます。本アプリを削除すると、端末内のデータもすべて削除されます。iCloudバックアップやAndroidのバックアップなど、端末のバックアップ機能を使っている場合は、端末の設定に従って、OSが本アプリのデータをバックアップに含めることがあります。バックアップはAppleまたはGoogleが扱うもので、開発者は関与しません。

### 曲名・アーティストの候補（Appleへ送る情報）

曲の追加・編集で「曲名」または「アーティスト」を入力しているとき、本アプリは候補を表示できます。そのために、その入力欄に入力した文字を、HTTPSでAppleのiTunes Search（itunes.apple.com）へ送り、結果を表示します。

- 送るもの: 今の画面の「曲名」「アーティスト」の入力欄に入力した文字（曲を探すときは、同じ画面で入力した・選んだアーティストも、曲名と一緒に送ります）と、国コード（本アプリの表示言語から、日本または米国を選びます）。画面を開いた・欄にフォーカスしただけでは送りません。欄を編集して、文字が2文字以上になったときだけ送ります。
- 送らないもの: 曲のリスト、自分のキー、非公開メモ、タグ、他の入力欄の文字。アカウント、端末の識別子、広告ID も送りません。
- 通常のインターネット通信と同様に、Appleのサーバーは、IPアドレスなどの接続の技術的な情報を見ることができます。Appleでの扱いは、[Appleのプライバシーポリシー](https://www.apple.com/legal/privacy/)に記載されています。
- 設定の「候補」スイッチは、初期状態でオンです。オフにすると、Appleへは何も送らず、登録済みのアーティストの候補だけを、端末内から表示します。
- 通信できないときは、候補が出ないだけで、入力と保存はいつでも自由にできます。選んだ候補は、普通の文字として端末に保存され、どの候補から選んだかは記録しません。

Appleから受け取った結果は、候補の表示以外には使いません。この機能がオンの間、候補の欄に「候補の提供元: Apple」と表示します。

### アカウント（任意） {#accounts-ja}

設定の「アカウント」から、AppleまたはGoogleでサインインして、アカウントを作れます。本アプリの機能に、アカウントが必要なものはなく、サインインしても、曲はアップロードされません。

サインインするときの動き:

- 本アプリは、AppleまたはGoogleのサインイン画面を通じて、本人であることの確認を、そのサービスに頼みます。サービスは、署名つきのトークンを本アプリに渡します。AndroidのAppleでのサインインは、ブラウザで行います。本アプリは、そのトークンを、確認のために、開発者のサーバー（singfolio.app。Cloudflareで運用）へ送ります。
- 本アプリは、Appleに、名前とメールアドレスを求めません。Googleのトークンには、名前・メールアドレス・プロフィール写真が含まれることがあり、サーバーはそれを受け取ります。サーバーが読むのは、トークンの中の、アカウント固有の識別子だけで、残りは保存もログへの記録もしません。

サーバーが保存するもの:

- アカウントの記録（作成した日時と、最後に使った日時）。
- サインインの手段（AppleまたはGoogle）と、そのサービスが付ける、あなたの識別子。この目的のために作られた文字列で、メールアドレスや名前ではありません。
- サインインした端末ごとのセッション。サーバーが持つのは、セッションの値を一方向に変換したもの（ハッシュ）と、最後に使った日時だけです。値そのものは、端末のOSの安全な保管場所（iOSはキーチェーン、Androidは暗号化された保管場所）にだけあります。セッションは、90日間使わないと、使えなくなります。
- Apple Accountの設定で、本アプリの「Appleでサインイン」の利用を停止すると、Appleがサーバーに通知します。サーバーは、そのサインインをサインアウトさせ、その時刻を記録します。
- サインインの再利用を防ぐための、短時間だけ有効な使い捨ての値。ハッシュで保存し、あなたとは結び付けません。

サーバーが保存しないもの: 名前、メールアドレス、プロフィール写真（公開プロフィールで入力できる表示名は、アカウントから取るものではありません）、端末の識別子、広告ID。曲のリストも、公開するReadyの曲を除いて保存せず（下の「公開プロフィール（任意）」を参照）、自分のキーと非公開メモは、保存しません。サーバーは、リクエストのログを記録しない設定です。リクエストはCloudflareを経由し、Cloudflareは、サービスを提供するために、IPアドレスなどの接続の技術的な情報を扱います。扱いは、[Cloudflareのプライバシーポリシー](https://www.cloudflare.com/privacypolicy/)に記載されています。

アカウントは、サインインの状態を保つこと、サインアウト、アカウントの削除、そして、使うことを選んだ場合の公開プロフィールの運用のためだけに使います。開発者は、これを販売も共有もせず、広告やアクセス解析にも使いません。

### 公開プロフィール（任意） {#public-profile-ja}

アカウントがあれば、プロフィール > 公開プロフィール から、公開プロフィールを公開できます。自分で操作するまで、何も公開されません。アカウントを作る・サインインするだけでは、公開されません。公開プロフィールは、`singfolio.app/<ユーザー名>` のWebページに表示され、誰でも、サインインせずに開けます。

公開されるもの:

- 表示名と自己紹介。「公開プロフィール」の画面で入力します。
- ユーザー名。最初の公開の前に、自分で決めます。ページのアドレスの一部になり、あとから変更できません。
- ステータスがReadyの曲: 曲名とアーティスト、本アプリが曲につけた識別子、並び順。
- タグ: 「公開タグ」でオンにしたタグだけが、そのタグの付いたReadyの曲に表示されます。どのタグも、初期状態では公開されません。
- 最後に公開した時刻と、公開するたびに変わる、内部の版の番号。

公開されないもの: 自分のキー、非公開メモ、ステータス（練習中・歌いたい曲は、曲ごと公開されません）、オンにしていないタグ、アカウントの識別子、サインインの手段。

公開するものは、すべて自分で入力した文字で、書いたとおりに表示されます。公開したくないことは、書かないでください。ユーザー名・表示名・自己紹介に、本名や、あなたとわかる名前を使うと、それがそのまま見えます。

公開のしくみ:

- 「今すぐ公開」は、表示名・自己紹介・Readyの曲を、開発者のサーバーへ送ります。サーバーは、それを1つの公開用のコピーとして保存し、前のコピーを置き換えます。閲覧する人に見えるのは、最後に公開したコピーで、今の曲のリストではありません。端末での変更は、もう一度公開したときに反映されます。
- 「変更を自動で公開」は、初期状態でオフで、公開している間だけ、オンにできます。オンのときは、曲や公開タグを変えてから少し待って、その変更を、最後に公開した表示名・自己紹介と一緒に送ります。入力の途中の表示名・自己紹介は、公開しません。
- 公開するとき、また「公開プロフィール」の画面を開いたとき、サインイン中の本アプリは、開発者のサーバーにつながります。これは、アカウントを「使った」に数えます（下を参照）。
- 公開用のコピーは、Cloudflare（R2）に保存します。サーバーのデータベースには、ユーザー名、最後に公開した時刻と版の番号、最後に公開した表示名・自己紹介のコピーも保存します（新しい端末でも、公開中の内容を本アプリに表示するためです）。

「公開をやめる」は、公開用のコピーをサーバーから削除し、ページは表示されなくなります。ユーザー名（引き続き、あなたのために確保されます）と、最後の表示名・自己紹介のコピーは、アカウントが削除されるまで（ご自身での削除、または1年間使わなかったときの自動削除。公開をやめたアカウントは、自動削除の対象外ではなくなります）、サーバーに残ります。端末内の曲は変わりません。ページが見えていた間に、ほかの人が作ったコピー（スクリーンショットなど）は、開発者の手の届かないところにあります。

アカウントを削除すると、公開用のコピーと、アカウントについてサーバーが保存しているものは、すべて削除されます。**残るのは、ユーザー名だけです。** あなたやアカウントとは結びつけずに残し、あなたが配ったかもしれないアドレスを、ほかの人が使えないようにします。このように残っても構わないユーザー名を選んでください。表示名・自己紹介のコピーは、ほかのアカウントのデータと同様に、運用先の自動のデータベース復旧用の履歴に、最大30日間残ることがあります（下を参照）。

### サインアウトとアカウントの削除（Singfolio、yskms） {#delete-account-ja}

**本アプリの中で。** 設定の「アカウント」を開きます。

- 「サインアウト」は、この端末でサインアウトします。「ほかの端末をすべてサインアウト」は、ほかのすべての端末でサインアウトします。
- 「アカウントを削除」は、開発者のサーバーからアカウントを削除します。本人であることを確かめるため、同じAppleまたはGoogleのアカウントで、もう一度サインインしてもらいます。削除すると、アカウントの記録、サインインの識別子、すべてのセッション、公開プロフィール（公開用のコピーと、保存してある表示名・自己紹介）が消えます。残るのは、ユーザー名だけです（「公開プロフィール（任意）」に書いたとおりです）。**端末内の曲は消えません。** Appleを使っていた場合は、本アプリは、Apple Accountと本アプリの連携を終わらせるよう、Appleにも依頼します。失敗したときは、Apple Accountの設定の「Appleでサインイン」から、Singfolioを削除できます。

**サインインできない場合**（たとえば、AppleやGoogleのアカウントが使えなくなった、端末をなくした）。開発者のサーバーは、名前もメールアドレスも保存しないため、開発者は、メールアドレスからアカウントを探せず、本人かどうかも確かめられません。代わりに、1年間使われなかったアカウントは、自動で削除します。**ただし、公開プロフィールを公開しているアカウントは除きます。** 「使った」とは、サインイン、サインアウト、またはそのほかの、開発者のサーバーにつながる機能を使うことです。「ほかの端末をすべてサインアウト」と、サインイン中の、「公開プロフィール」の画面を開く・公開する・公開をやめる、また「変更を自動で公開」が変更を送ったときです。「アカウント」の画面を開くだけではサーバーにつながらず、端末の中だけで本アプリを使っても、サーバーにはつながりません。そのため、1年のあいだに、これらのどれかをしないと、曲の管理を続けていても、アカウントが削除されることがあります。ユーザー名を決めただけで公開しなかった場合も、アカウントを削除するときに、ユーザー名は「公開プロフィール（任意）」に書いたとおり残ります。自動で削除したときは、Apple Accountの設定の「Appleでサインイン」の連携は、ご自身で削除するまで残ります。

**公開プロフィールを公開していて、サインインできない場合。** 公開プロフィールを公開しているアカウントは、自動では削除しません。そのため、公開をやめるか、アカウントを削除するまで、ページは残ります（どちらも、サインインしているときだけできます）。サインインできず、ページを取り下げたいときは、下のメールアドレスへ、ページのアドレス（`singfolio.app/<ユーザー名>`）と理由を送ってください。開発者は、アカウントの持ち主を確かめられないため、こうした依頼は、個別に判断します。公開をやめると、アカウントは、1年間使わなければ自動で削除される対象に戻ります。

**保存期間。** アカウントのデータは、アカウントを削除するまで、または上のとおり最後に使ってから1年間、保存します。公開プロフィールと、それを持つアカウントは、公開をやめる、または削除するまで、保存します。削除したあとも、アカウントのデータ（保存してある表示名・自己紹介を含む）は、運用先の自動のデータベース復旧用の履歴に、最大30日間残ることがあり、その後、なくなります。ユーザー名だけは例外で、あなたやアカウントと結びつけずに、残します。

この手順で困ったときは、yskms.studio@gmail.com へ、件名「Singfolio account deletion」でメールしてください。共有の必要がない個人情報は、書かないでください。

### リンク

本アプリには、このページへのリンクがあります。リンクを開くとブラウザが使われ、そのブラウザ自体のプライバシーの扱いに従います。

### 開発者が収集する情報

アカウントを作らない場合: ありません。開発者が本アプリを通じて個人情報を収集・保存・販売・共有することはありません。

アカウントを作る場合: 上の「アカウント（任意）」に書いたものだけです。公開プロフィールも公開する場合は、「公開プロフィール（任意）」に書いた内容が加わります。広告サービス・アクセス解析サービスは使用していません。

### お子様のプライバシー

本アプリは子供向けではなく、子供から個人情報を意図的に収集することはありません。

### 変更

本アプリの情報の扱いが変わるとき（たとえば、開発者のサーバーへ送るデータが増えるとき）は、その機能を公開する前に、この方針を更新します。方針を変更したときは、上の施行日を更新します。

### 連絡先

プライバシーに関するご質問とアカウントについてのご相談は、yskms.studio@gmail.com で受け付けます。公開のGitHub Issuesには、個人情報を書かないでください。
