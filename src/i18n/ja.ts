import type { MessageKey } from './en.ts';
import type { Message } from './types.ts';

// キーは en.ts と同じ。足りないキーも、余分なキーも、型エラーになる。
export const ja: Record<MessageKey, Message> = {
  // tabs.* は仮の訳。ステータスの表示名（Practice＝練習中。要件定義 §4）と揃えるかは、
  // 文言を決める画面（WBS 2.1・3.1）で決める。
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
