import type { Message } from './types.ts';

// 文言のキーは、ここが正（`MessageKey` はここから決まる）。他の言語（ja.ts）が
// 同じキーを過不足なく持つことは、型で保証される。`as const` は、`{name}` の名前から
// `t` の必要な引数を型で決めるため（外さない）。
//
// - キーは `画面.項目` の形（エラーは `error.内容`）。使う場所が変わっても変えない。
// - 新しい画面の文言は、画面を作るときにここと ja.ts の両方へ足す。
export const en = {
  'tabs.songs': 'Songs',
  'tabs.practice': 'Practice',
  'tabs.profile': 'Profile',

  // ブランド名。翻訳しないが、画面の文言は直書きしないため、ここを通す。
  'app.name': 'Singfolio',

  'common.close': 'Close',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',

  // ステータスの表示名（件数タイル）。一覧の見出しは songs.section.*。ステータスの名前は、
  // songs.* ・practice.* の文言にも書いている（差し込みにしていない）。名前を変えるときは、
  // それらも直す（ja.ts も同じ）。タブの名前（tabs.practice）は別の文言で、English では今、
  // ステータスの名前と同じ字になっているだけ（ja では揃えていない）。
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

  // Practice（app/(tabs)/practice.tsx）。検索欄・「一致する曲がありません」の題・検索のクリアは、
  // Songs の文言（songs.*）を使う。
  'practice.count': {
    one: '{count} song',
    other: '{count} songs',
  },
  'practice.updatedToday': 'Last updated: Today',
  'practice.updated': 'Last updated: {date}',
  'practice.empty.title': 'No songs in practice',
  'practice.empty.message': 'Songs you set to Practice will appear here.',
  'practice.noMatch.message': 'No songs in practice match your search.',
  'practice.markReady': 'Mark as Ready',
  // 読み上げ用。行ごとに同じ名前のボタンが並ぶので、どの曲かを添える。先頭は見えている文字と
  // 同じにする（WCAG 2.5.3 Label in Name）。音声コントロールで呼べるかは、確認していない
  // （RN には `accessibilityUserInputLabels` が無く、ラベルを別に渡せない）。
  'practice.markReadyLabel': 'Mark as Ready, {title}',
  'practice.markReadyFailedTitle': 'Couldn’t mark as Ready',

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
  'songForm.suggestionSongHint': 'Fills in the title and artist',
  'songForm.suggestionArtistHint': 'Fills in the artist',

  // ServiceErrorCode → 文言の対応は errors.ts。
  'error.titleRequired': 'Enter a title.',
  'error.artistRequired': 'Enter an artist.',
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
