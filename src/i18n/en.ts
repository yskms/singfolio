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
