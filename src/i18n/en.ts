import type { Message } from './types.ts';

// 文言のキーは、ここが正（`MessageKey` はここから決まる）。他の言語（ja.ts）が
// 同じキーを過不足なく持つことは、型で保証される。`as const` は、`{name}` の名前から
// `t` の必要な引数を型で決めるため（外さない）。
//
// - キーは `画面.項目` の形（エラーは `error.内容`）。使う場所が変わっても変えない。
// - 新しい画面の文言は、画面を作るときにここと ja.ts の両方へ足す。
export const en = {
  'tabs.songs': 'Songs',
  'tabs.profile': 'Profile',
  'tabs.settings': 'Settings',

  // ブランド名。翻訳しないが、画面の文言は直書きしないため、ここを通す。
  'app.name': 'Singfolio',

  'common.close': 'Close',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',

  // ステータスの表示名（件数タイル・行のボタンの見える文字）。一覧の見出しは songs.section.*。
  // ステータスの名前は、songs.* の文言（songs.action.* など）にも書いている（差し込みにしていない）。
  // 名前を変えるときは、それらも直す（ja.ts も同じ）。
  'status.ready': 'Ready',
  'status.practice': 'Practice',
  'status.want': 'Want',

  // Songs（app/(tabs)/index.tsx）。
  'songs.section.ready': 'Ready to sing',
  'songs.section.practice': 'Practice',
  'songs.section.want': 'Want to sing',
  'songs.section.all': 'All songs',
  'songs.tileA11y': {
    one: '{status}: {count} song',
    other: '{status}: {count} songs',
  },
  'songs.searchPlaceholder': 'Search songs or artists',
  'songs.searchClear': 'Clear search',
  'songs.allTags': 'All',
  'songs.allTagsA11y': 'All tags',
  'songs.sortTitle': 'Sort by',
  'songs.sortButtonA11y': 'Sort by: {sort}',
  'songs.sort.updated': 'Recently updated',
  'songs.sort.added': 'Recently added',
  'songs.sort.title': 'Title',
  'songs.sort.artist': 'Artist',
  'songs.empty.title': 'No songs yet',
  'songs.empty.message': 'Songs you add will appear here.',
  'songs.empty.add': 'Add a song',
  'songs.addA11y': 'Add song',
  'songs.emptyStatus.ready': 'No songs are ready to sing yet.',
  'songs.emptyStatus.practice': 'No songs in practice.',
  'songs.emptyStatus.want': 'No songs on your want list.',
  'songs.noMatch.title': 'No matching songs',
  'songs.noMatch.message':
    'Nothing in “{section}” matches. Try changing the search, tag, or status.',
  'songs.noMatch.clear': 'Clear search and tag',
  // 行の右のボタン（Practice で絞ると「Ready」へ、Want で絞ると「Practice」へ）。見える文字は
  // ステータスの名前（status.*）。以下は読み上げ用で、行ごとに同じ名前のボタンが並ぶので、どの曲かを
  // 添える（見えている文字を含める。WCAG 2.5.3 Label in Name）。音声コントロールで呼べるかは、確認
  // していない（RN には `accessibilityUserInputLabels` が無く、ラベルを別に渡せない）。
  'songs.action.toReadyLabel': 'Mark as Ready, {title}',
  'songs.action.toPracticeLabel': 'Mark as Practice, {title}',
  'songs.action.toReadyFailedTitle': 'Couldn’t mark as Ready',
  'songs.action.toPracticeFailedTitle': 'Couldn’t mark as Practice',

  // Profile（app/(tabs)/profile.tsx）。ボタンの名前は、機能の名前「Show Mode」を開く入口。
  'profile.count': {
    one: '{count} song ready to sing',
    other: '{count} songs ready to sing',
  },
  'profile.showMySongs': 'Show My Songs',
  // 読み上げ用。ボタンの名前と、開く画面（Show Mode）の名前が違うので、行き先を添える。
  'profile.showMySongsHint': 'Opens Show Mode',

  // Settings の項目（ui/SettingsSection.tsx）。Language の English / 日本語 は、その言語自身の
  // 名前で出すので、文言ではなく `languageNames`（src/i18n）。System だけは、表示中の言語の文言。
  'settings.appearance': 'Appearance',
  'settings.appearance.system': 'System',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.language': 'Language',
  // 言語を切り替える前の確認。ダイアログは、切り替える前の言語で出る。
  'settings.language.confirmTitle': 'Change language?',
  'settings.language.confirmMessage':
    'Switch to {language}? This also changes the rules for entering an artist’s reading.',
  'settings.language.confirmAction': 'Change',
  'settings.suggestions': 'Suggestions',
  'settings.suggestionsNote':
    'What you type in Title and Artist is sent to Apple to find suggestions. Nothing else is sent.',
  'settings.tags': 'Tags',
  'settings.artists': 'Artists',
  'settings.account': 'Account',
  'settings.about': 'About',
  'settings.saveFailedTitle': 'Couldn’t save the setting',

  // Tags（app/tags.tsx）。タグ名の入力の誤りは、error.tagName* を使う。
  // Artists（app/artists.tsx）。Settings から開く。読みの文言は songForm.reading を使う。
  'artists.title': 'Artists',
  'artists.empty.title': 'No artists yet',
  'artists.empty.message': 'The artists of the songs you add will appear here.',
  'artists.rowHint': 'Edit this artist’s name and sort name',
  'artists.songCount': { one: '{count} song', other: '{count} songs' },
  'artists.editTitle': 'Edit artist',
  'artists.nameLabel': 'Name',
  'artists.save': 'Save',

  'tags.title': 'Tags',
  'tags.empty.title': 'No tags yet',
  'tags.empty.message': 'Tags you add to songs will appear here.',
  'tags.rowHint': 'Rename or delete this tag',
  'tags.renameTitle': 'Edit tag',
  'tags.nameLabel': 'Tag name',
  'tags.save': 'Save',
  'tags.delete': 'Delete tag',
  'tags.deleteTitle': 'Delete this tag?',
  'tags.deleteMessage': '“{name}” will be removed from all songs. The songs themselves won’t be deleted.',
  'tags.deleteConfirm': 'Delete',
  'tags.deleteFailedTitle': 'Couldn’t delete',

  // About（app/about.tsx）と、そこから開く Open source licenses（app/licenses.tsx）。
  'about.version': 'Version {version}',
  'about.fonts': 'Fonts',
  'about.fontLicense': 'SIL Open Font License 1.1',
  // 出どころの表記（アーティストの読みの辞書）。
  'about.data': 'Data',
  'about.musicBrainzNote':
    'The artist reading dictionary is built from MusicBrainz core data (CC0, public domain).',
  'about.musicBrainzLink': 'Visit MusicBrainz',
  'about.showLicense': 'Show license',
  'about.hideLicense': 'Hide license',
  'about.privacyPolicy': 'Privacy Policy',
  'about.opensInBrowserHint': 'Opens in your browser',
  'about.licenses': 'Open source licenses',
  'licenses.intro':
    'This app uses the open source software and icon fonts below. Tap an item to see its license.',
  'licenses.includes': 'Includes:\n{list}',
  // 全文を載せない、Googleのライブラリ（Android。Android Software Development Kit License で配布される）の別枠。
  'licenses.termsHeading': 'Google libraries',
  'licenses.termsNote':
    'These Google libraries are not open source. They are provided under the Android Software Development Kit License. Tap an item to see what it includes and to read the terms.',
  'licenses.viewTerms': 'View terms',

  // Show Mode（app/show.tsx）。人に見せる画面。検索欄・「一致する曲がありません」の題・検索とタグの
  // クリアは、Songs の文言（songs.*）を使う。文言の中の機能名「Show Mode」は、日本語でも訳さない。
  'show.title': 'What should I sing?',
  'show.count': {
    one: '{count} song ready to sing',
    other: '{count} songs ready to sing',
  },
  // アーティストの見出し（読み上げ用。見た目は、名前と右端の曲数）。
  'show.artistA11y': {
    one: '{artist}, {count} song',
    other: '{artist}, {count} songs',
  },
  'show.closeA11y': 'Close Show Mode',
  'show.empty.title': 'No songs to show yet',
  'show.empty.message': 'Songs you mark as Ready will appear here.',
  'show.noMatch.message': 'No songs match your search or tag.',

  // Song Detail（app/song/[id]/index.tsx）。項目の見出しは songForm.* を使う（Add / Edit Song と
  // 同じ名前にそろえる）。曲が見つからないときの文言も songForm.notFoundTitle / error.songNotFound。
  'songDetail.edit': 'Edit',
  'songDetail.statusFailedTitle': 'Couldn’t change the status',
  'songDetail.delete': 'Delete song',
  'songDetail.deleteTitle': 'Delete this song?',
  'songDetail.deleteMessage': '“{title}” will be deleted. This can’t be undone.',
  'songDetail.deleteConfirm': 'Delete',
  'songDetail.deleteFailedTitle': 'Couldn’t delete',

  // Add / Edit Song（ui/SongForm.tsx）。My Key・Private Note・Show Mode は機能の名前なので、
  // 日本語でも訳さない（docs/singfolio-screen-flow.md「Add / Edit Song」の文言に合わせる）。
  'songForm.addTitle': 'Add Song',
  'songForm.editTitle': 'Edit Song',
  'songForm.save': 'Save',
  'songForm.notFoundTitle': 'Song not found',
  'songForm.title': 'Title',
  'songForm.artist': 'Artist',
  // 読み（アーティストの並び替え用の名前）。英語は、`The` を除くなど、自由に決められる。
  'songForm.reading': 'Sort name',
  'songForm.readingNote':
    'Used to sort this artist’s songs. For example, enter “Beatles” for “The Beatles”.',
  // 必須の項目。見た目は「*」で、読み上げでは、この文言を添える。
  'songForm.requiredHint': 'Required',
  'songForm.status': 'Status',
  'songForm.myKey': 'My Key',
  'songForm.keyOriginal': 'Original',
  'songForm.keyLowerA11y': 'Lower by one semitone',
  'songForm.keyRaiseA11y': 'Raise by one semitone',
  'songForm.tags': 'Tags',
  'songForm.tagsNote': 'Tags may appear in Show Mode. Keep private details in Private Note.',
  'songForm.newTagPlaceholder': 'New tag',
  'songForm.addTag': 'Add tag',
  'songForm.privateNote': 'Private Note',
  'songForm.privateNotePlaceholder': 'Only you can see this',
  'songForm.saveFailedTitle': 'Couldn’t save',
  'songForm.discardTitle': 'Discard changes?',
  'songForm.discardMessage': 'Your changes haven’t been saved.',
  'songForm.keepEditing': 'Keep editing',
  'songForm.discard': 'Discard',
  // 候補（サジェスト）。提供元の表記は、検索語を外部へ送る間、候補の欄に必ず出す。
  'songForm.suggestionsProvider': 'Suggestions from Apple',
  'songForm.suggestionRegistered': 'In your songs',
  'songForm.suggestionA11y': '{title} by {artist}',
  'songForm.suggestionA11yRegistered': '{title} by {artist}, already in your songs',
  'songForm.suggestionSongHint': 'Fills in the title',
  'songForm.suggestionArtistHint': 'Fills in the artist',

  // Account（app/account.tsx。Settings の Account から開く）。ログインを要求しないので、説明は
  // 「アカウントが無くても使える」ことを先に伝える。失敗の文言は account.error.*（対応は src/i18n/authErrors.ts）。
  // 「Apple」「Google」は、ログイン手段の名前で、翻訳しない。
  'account.title': 'Account',
  'account.signedOutNote': 'You don’t need an account to use Singfolio. Your songs stay on this device.',
  'account.signInApple': 'Sign in with Apple',
  'account.signInGoogle': 'Sign in with Google',
  'account.providerApple': 'Apple',
  'account.providerGoogle': 'Google',
  'account.signedInWith': 'Signed in with {provider}',
  'account.signingIn': 'Signing in…',
  'account.signOut': 'Sign out',
  'account.signOutConfirmTitle': 'Sign out?',
  'account.signOutConfirmMessage': 'You can sign in again at any time. Your songs stay on this device.',
  'account.signingOut': 'Signing out…',
  // サーバーに届かなかったとき。端末は、ログアウトできている。
  'account.signedOutLocalOnly':
    'Signed out on this device. Couldn’t end the sign-in on the server, so it will expire on its own.',
  'account.signOutOthers': 'Sign out of other devices',
  'account.signOutOthersNote': 'Ends the sign-in on every other device. You stay signed in here.',
  'account.signOutOthersConfirmTitle': 'Sign out of other devices?',
  'account.signOutOthersConfirmMessage': 'Every other device will be signed out. You stay signed in on this one.',
  'account.signingOutOthers': 'Signing out other devices…',
  'account.signedOutOthers': 'Signed out of all other devices.',
  'account.deleteAccount': 'Delete account',
  'account.deleteNote': 'Songs on this device are not deleted.',
  'account.deleteConfirmTitle': 'Delete your account?',
  'account.deleteConfirmMessage':
    'Your Singfolio account will be deleted permanently and can’t be restored. First, you’ll be asked to confirm with {provider}. Songs on this device are not deleted.',
  'account.deleteConfirmAction': 'Continue',
  'account.deleting': 'Deleting your account. This can take up to 30 seconds.',
  'account.deleted': 'Your account was deleted.',
  // 削除は成功したが、端末のセッションを捨てられなかったとき（`sessionCleared` が偽）。「サインアウト」で端末の値を捨てられる。
  'account.deletedSignInRemains': 'This device is still signed in. Tap Sign out to finish.',
  // Appleのトークンを失効できなかったとき（`appleRevoked` が偽）。アカウントは消えている。
  'account.appleNotRevokedNote':
    'To also stop using Sign in with Apple with Singfolio, open your Apple Account settings.',
  'account.loadFailed': 'Couldn’t check your sign-in status.',
  'account.retry': 'Try again',
  // 失敗。取りやめは何も出さない。providerFailed は、原因を言い切らず、強く出さない（OSのシートを「閉じる」もこれになる）。
  'account.error.network': 'Couldn’t connect. Check your connection and try again.',
  'account.error.unavailable': 'Singfolio’s server isn’t available right now. Please try again later.',
  'account.error.signInFailed': 'Couldn’t sign in. Please try again.',
  'account.error.providerFailed': 'Sign-in didn’t finish. Please try again.',
  'account.error.providerUnavailable': 'This sign-in isn’t available on this device.',
  'account.error.timeout': 'Sign-in took too long. Please try again.',
  'account.error.signInStorageFailed': 'Couldn’t save your sign-in on this device. Please try again.',
  'account.error.signOutFailed': 'Couldn’t sign out on this device. Please try again.',
  'account.error.signedOut': 'You’re no longer signed in. Please sign in again.',
  'account.error.reauthFailed': 'Couldn’t confirm it’s you, so your account wasn’t deleted. Please try again.',
  'account.error.accountMismatch':
    'That’s not the account you signed in with, so your account wasn’t deleted. Please choose the same account.',
  // 削除の要求を送ったあとの通信が途中で切れたとき。サーバーで削除が済んでいるかもしれない（やり直すと、サインアウトされる）。
  'account.error.deleteUnconfirmed':
    'Couldn’t reach the server, so we can’t tell whether your account was deleted. Please try again. If you get signed out, it may already be deleted.',
  // 削除の 401。削除の再試行とは限らない（別の端末のサインアウトや、使わないままの失効でも起きる）ので、両方の場合を伝える。
  'account.error.deleteSignedOut':
    'You were signed out. Your account may already be deleted. If it still exists, sign in again to delete it.',

  // ServiceErrorCode → 文言の対応は errors.ts。
  'error.titleRequired': 'Enter a title.',
  'error.artistRequired': 'Enter an artist.',
  'error.artistReadingRequired': 'Enter a sort name.',
  'error.artistNameRequired': 'Enter an artist name.',
  'error.artistNameDuplicate': 'An artist with this name already exists.',
  'error.artistNotFound': 'This artist no longer exists.',
  // 画面だけの確認（Serviceのエラーではない）。日本語の設定で、読みに漢字・英字を使ったとき。
  'error.readingKanaOnly': 'Use hiragana or katakana only.',
  'error.songNotFound': 'This song no longer exists.',
  'error.tagNotFound': 'This tag no longer exists.',
  'error.tagNameRequired': 'Enter a tag name.',
  'error.tagNameDuplicate': 'A tag with this name already exists.',
  'error.unexpected': 'Something went wrong. Please try again.',

  // 起動時の失敗などで画面全体に出すエラー画面。内容の決め方は errors.ts の errorScreenContent。
  'errorScreen.title': 'Something went wrong',
  'errorScreen.message':
    'Singfolio ran into a problem. Try again, or close and reopen the app if it keeps happening.',
  'errorScreen.retry': 'Try again',
  'errorScreen.updateTitle': 'Update Singfolio',
  'errorScreen.updateMessage':
    'Your songs were saved by a newer version of Singfolio, so this version can’t open them. Update the app to continue. Your songs haven’t been changed.',

  // 存在しない画面を開いたとき（app/+not-found.tsx）。
  'notFound.title': 'Screen not found',
  'notFound.message': 'This screen doesn’t exist.',
  'notFound.home': 'Go to Songs',
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
