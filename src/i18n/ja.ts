import type { MessageKey } from './en.ts';
import type { Message } from './types.ts';

// キーは en.ts と同じ。足りないキーも、余分なキーも、型エラーになる。
export const ja: Record<MessageKey, Message> = {
  'tabs.songs': '曲',
  'tabs.practice': '練習',
  'tabs.profile': 'プロフィール',

  'error.titleRequired': '曲名を入力してください。',
  'error.artistRequired': 'アーティスト名を入力してください。',
  'error.songNotFound': 'この曲は見つかりませんでした。',
  'error.tagNotFound': 'このタグは見つかりませんでした。',
  'error.tagNameRequired': 'タグ名を入力してください。',
  'error.tagNameDuplicate': '同じ名前のタグがすでにあります。',
  'error.unexpected': '問題が発生しました。もう一度お試しください。',
};
