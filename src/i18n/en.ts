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

  // ステータスの表示名（件数タイル）。一覧の見出しは songs.section.*。
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
