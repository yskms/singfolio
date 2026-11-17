<!--
  次のプライバシーポリシー（アカウント機能つきの版）の下書き。公開しない（`singfolio-*.md` は Jekyll の exclude で公開されない）。

  使い方: 7.3.13 のリリース手順で、このファイルの内容を `docs/privacy-policy.md` に反映する（このコメントは写さない）。
  反映するときに、施行日（Effective date）を決める。反映する前に `ACCOUNT_ENABLED` を外したビルドを出さない。
  `docs/privacy-policy.md` は main に push した時点で公開される（GitHub Pages）ので、アカウントを出すまでは、そちらを書き換えない。

  見出しの `{#…}` は kramdown の明示的なアンカー。Google Play の「アカウントの削除」のURLは、
  `https://yskms.github.io/singfolio/privacy-policy.html#delete-account` を使う（公開後に、実際にこの位置へ飛ぶことを確かめる）。
  日本語の見出しにはアンカー（`#delete-account-ja`）を明示する（自動の ID は、日本語の見出しでは当てにしない）。

  事実の出どころ: docs/singfolio-publishing-backend.md §8（保存するもの・期限・削除・自動削除・Google/Appleのトークン）。
  書いてある数字（90日・1年・30日）を変えるときは、コードの定数（`SESSION_TTL_MS`・`INACTIVE_ACCOUNT_TTL_MS`）とdocsを一緒に直す。
-->

# Singfolio Privacy Policy / プライバシーポリシー

Effective date / 施行日: (to be set at release / リリース時に決める)

## English

Singfolio (the “App”) is a repertoire manager for singers, available for Android and iOS and provided by yskms. You keep a list of the songs you can sing, are practicing, or want to sing.

### Summary

- The App works without an account. You can use every feature for managing your songs without signing in.
- Your song list is stored only on your device. The developer does not receive it, whether or not you have an account.
- If you choose to create an account (with Apple or Google), the developer’s server stores an identifier for your account and when you last used it. It does not store your name or email address.
- The App also sends the text you type in the Title and Artist fields of Add / Edit Song to Apple, to find suggestions. You can turn this off.
- You can delete your account in the App at any time. An account that has not been used for one year is deleted automatically.
- The App has no ads, no analytics, and no tracking.

### Data stored on your device

The songs you add (title, artist, status, your key, tags, and private notes), the tags you create, and your settings (appearance, language, and the Suggestions switch) are stored only in the App’s database on your device. The App does not send this data to the developer or to any server, and it has no cloud synchronization.

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

What the server does not store: your name, email address, profile picture, your song list, keys, notes, or tags, device identifiers, or advertising identifiers. The server is set up not to record request logs. Requests reach it through Cloudflare, which handles technical connection information such as your IP address to deliver the service, as described in [Cloudflare’s Privacy Policy](https://www.cloudflare.com/privacypolicy/).

The account is used only to keep you signed in, to sign you out, and to delete the account. The developer does not sell or share it, and does not use it for advertising or analytics. If a feature that needs an account, such as an online profile, is added, this policy will be updated before it is released.

### Signing out and deleting your account (Singfolio, by yskms) {#delete-account}

**In the App.** Open Settings > Account.

- *Sign out* signs you out on this device. *Sign out of other devices* signs you out everywhere else.
- *Delete account* deletes your account from the developer’s server. To make sure it is you, the App asks you to sign in again with the same Apple or Google account. Deleting removes the account record, the sign-in identifier, and all sessions. **Your songs on your device are not deleted.** If you used Apple, the App also asks Apple to end the connection between your Apple Account and the App; if that fails, you can remove Singfolio under “Sign in with Apple” in your Apple Account settings.

**If you cannot sign in** (for example, your Apple or Google account is no longer available, or you lost your device). The developer’s server does not store names or email addresses, so the developer cannot find your account from an email address, and cannot verify who you are. Instead, an account that has not been used for one year is deleted automatically. “Used” means signing in, using a feature that needs the account, or signing out. When an account is deleted automatically, the connection under “Sign in with Apple” in your Apple Account settings stays until you remove it yourself.

**How long data is kept.** Account data is kept until you delete the account, or for one year after you last used it. After deletion it can remain for up to 30 days in the hosting provider’s automatic database recovery history, and is then gone.

If you need help with these steps, email yskms.studio@gmail.com with the subject “Singfolio account deletion”. Do not include private information you do not need to share.

### Links

The App contains a link to this page. Opening it uses your browser, which is governed by that browser’s own privacy practices.

### Information the developer collects

If you do not create an account: none. The developer does not collect, store, sell, or share personal information through the App.

If you create an account: only what is described under “Accounts (optional)” above. The App does not use advertising or analytics services.

### Children’s privacy

The App is not designed for children and does not knowingly collect personal information from children.

### Changes

If the App changes how it handles information - for example, if a feature that sends your songs to the developer’s servers, such as an online profile, is added - this policy will be updated before that feature is released. The effective date above will change when this policy changes.

### Contact

Privacy questions and account help: yskms.studio@gmail.com. Please do not post personal information in public GitHub Issues.

## 日本語

Singfolio（以下「本アプリ」）は、歌う人のためのレパートリー管理アプリで、yskmsが提供するAndroid・iOS向けアプリです。歌える曲・練習中の曲・歌いたい曲のリストを管理します。

### 要約

- 本アプリは、アカウントなしで使えます。曲を管理する機能は、すべて、サインインせずに使えます。
- 曲のリストは端末内にだけ保存され、アカウントの有無にかかわらず、開発者は受け取りません。
- アカウントを作る場合（AppleまたはGoogleで作ります）、開発者のサーバーは、アカウントの識別子と、最後に使った日時を保存します。名前とメールアドレスは保存しません。
- 本アプリは、曲の追加・編集の「曲名」「アーティスト」の入力欄に入力した文字を、候補を探すためにAppleへ送ります。これはオフにできます。
- アカウントは、本アプリの中でいつでも削除できます。1年間使われなかったアカウントは、自動で削除します。
- 広告・アクセス解析・トラッキングはありません。

### 端末内に保存するデータ

追加した曲（曲名、アーティスト、ステータス、自分のキー、タグ、非公開メモ）、作成したタグ、設定（外観、言語、候補のスイッチ）は、端末内の本アプリのデータベースにだけ保存します。これらを開発者や外部のサーバーへ送信することはなく、クラウド同期もありません。

曲やタグは、本アプリの中で削除できます。本アプリを削除すると、端末内のデータもすべて削除されます。iCloudバックアップやAndroidのバックアップなど、端末のバックアップ機能を使っている場合は、端末の設定に従って、OSが本アプリのデータをバックアップに含めることがあります。バックアップはAppleまたはGoogleが扱うもので、開発者は関与しません。

### 曲名・アーティストの候補（Appleへ送る情報）

曲の追加・編集で「曲名」または「アーティスト」を入力しているとき、本アプリは候補を表示できます。そのために、その入力欄に入力した文字を、HTTPSでAppleのiTunes Search（itunes.apple.com）へ送り、結果を表示します。

- 送るもの: 今の画面の「曲名」「アーティスト」の入力欄に入力した文字（曲を探すときは、同じ画面で入力した・選んだアーティストも、曲名と一緒に送ります）と、国コード（本アプリの表示言語から、日本または米国を選びます）。画面を開いた・欄にフォーカスしただけでは送りません。欄を編集して、文字が2文字以上になったときだけ送ります。
- 送らないもの: 曲のリスト、自分のキー、非公開メモ、タグ、他の入力欄の文字。アカウント、端末の識別子、広告ID も送りません。
- 通常のインターネット通信と同様に、Appleのサーバーは、IPアドレスなどの接続の技術的な情報を見ることができます。Appleでの扱いは、[Appleのプライバシーポリシー](https://www.apple.com/legal/privacy/)に記載されています。
- 設定の「候補」スイッチは、初期状態でオンです。オフにすると、Appleへは何も送らず、登録済みのアーティストの候補だけを、端末内から表示します。
- 通信できないときは、候補が出ないだけで、入力と保存はいつでも自由にできます。選んだ候補は、普通の文字として端末に保存され、どの候補から選んだかは記録しません。

Appleから受け取った結果は、候補の表示以外には使いません。この機能がオンの間、候補の欄に「候補の提供元: Apple」と表示します。

### アカウント（任意）{#accounts-ja}

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

サーバーが保存しないもの: 名前、メールアドレス、プロフィール写真、曲のリスト・キー・メモ・タグ、端末の識別子、広告ID。サーバーは、リクエストのログを記録しない設定です。リクエストはCloudflareを経由し、Cloudflareは、サービスを提供するために、IPアドレスなどの接続の技術的な情報を扱います。扱いは、[Cloudflareのプライバシーポリシー](https://www.cloudflare.com/privacypolicy/)に記載されています。

アカウントは、サインインの状態を保つこと、サインアウト、アカウントの削除のためだけに使います。開発者は、これを販売も共有もせず、広告やアクセス解析にも使いません。オンラインのプロフィールなど、アカウントが必要な機能を追加するときは、その機能を公開する前に、この方針を更新します。

### サインアウトとアカウントの削除（Singfolio、yskms）{#delete-account-ja}

**本アプリの中で。** 設定の「アカウント」を開きます。

- 「サインアウト」は、この端末でサインアウトします。「ほかの端末をすべてサインアウト」は、ほかのすべての端末でサインアウトします。
- 「アカウントを削除」は、開発者のサーバーからアカウントを削除します。本人であることを確かめるため、同じAppleまたはGoogleのアカウントで、もう一度サインインしてもらいます。削除すると、アカウントの記録、サインインの識別子、すべてのセッションが消えます。**端末内の曲は消えません。** Appleを使っていた場合は、本アプリは、Apple Accountと本アプリの連携を終わらせるよう、Appleにも依頼します。失敗したときは、Apple Accountの設定の「Appleでサインイン」から、Singfolioを削除できます。

**サインインできない場合**（たとえば、AppleやGoogleのアカウントが使えなくなった、端末をなくした）。開発者のサーバーは、名前もメールアドレスも保存しないため、開発者は、メールアドレスからアカウントを探せず、本人かどうかも確かめられません。代わりに、1年間使われなかったアカウントは、自動で削除します。「使った」とは、サインイン、アカウントが必要な機能の利用、サインアウトのことです。自動で削除したときは、Apple Accountの設定の「Appleでサインイン」の連携は、ご自身で削除するまで残ります。

**保存期間。** アカウントのデータは、アカウントを削除するまで、または最後に使ってから1年間、保存します。削除したあとも、運用先の自動のデータベース復旧用の履歴に、最大30日間残ることがあり、その後、なくなります。

この手順で困ったときは、yskms.studio@gmail.com へ、件名「Singfolio account deletion」でメールしてください。共有の必要がない個人情報は、書かないでください。

### リンク

本アプリには、このページへのリンクがあります。リンクを開くとブラウザが使われ、そのブラウザ自体のプライバシーの扱いに従います。

### 開発者が収集する情報

アカウントを作らない場合: ありません。開発者が本アプリを通じて個人情報を収集・保存・販売・共有することはありません。

アカウントを作る場合: 上の「アカウント（任意）」に書いたものだけです。広告サービス・アクセス解析サービスは使用していません。

### お子様のプライバシー

本アプリは子供向けではなく、子供から個人情報を意図的に収集することはありません。

### 変更

本アプリの情報の扱いが変わるとき（たとえば、オンラインのプロフィールのように、曲を開発者のサーバーへ送る機能を追加するとき）は、その機能を公開する前に、この方針を更新します。方針を変更したときは、上の施行日を更新します。

### 連絡先

プライバシーに関するご質問とアカウントについてのご相談は、yskms.studio@gmail.com で受け付けます。公開のGitHub Issuesには、個人情報を書かないでください。
