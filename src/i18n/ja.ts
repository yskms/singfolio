import type { MessageKey } from './en.ts';
import type { Message } from './types.ts';

// キーは en.ts と同じ。足りないキーも、余分なキーも、型エラーになる。
export const ja: Record<MessageKey, Message> = {
  // タブのラベルは短くするため、ステータスの表示名（練習中。要件定義 §4）とは揃えない
  // （一覧の見出しは「練習中の曲」）。
  'tabs.songs': '曲',
  'tabs.practice': '練習',
  'tabs.profile': 'プロフィール',

  'app.name': 'Singfolio',

  'common.close': '閉じる',
  'common.ok': 'OK',

  'status.ready': '歌える',
  'status.practice': '練習中',
  'status.want': '歌いたい',

  'songs.section.ready': '歌える曲',
  'songs.section.practice': '練習中の曲',
  'songs.section.want': '歌いたい曲',
  'songs.section.all': 'すべての曲',
  'songs.tileA11y': { other: '{status}：{count}曲' },
  'songs.searchPlaceholder': '曲名・アーティストで検索',
  'songs.searchClear': '検索をクリア',
  'songs.allTags': 'すべて',
  'songs.allTagsA11y': 'すべてのタグ',
  'songs.sortTitle': '並び替え',
  'songs.sortButtonA11y': '並び替え：{sort}',
  'songs.sort.updated': '更新が新しい順',
  'songs.sort.added': '追加が新しい順',
  'songs.sort.title': '曲名順',
  'songs.sort.artist': 'アーティスト順',
  'songs.empty.title': 'まだ曲がありません',
  'songs.empty.message': '追加した曲がここに並びます。',
  'songs.empty.add': '曲を追加',
  'songs.addA11y': '曲を追加',
  'songs.emptyStatus.ready': '歌える曲はまだありません。',
  'songs.emptyStatus.practice': '練習中の曲はありません。',
  'songs.emptyStatus.want': '歌いたい曲はまだありません。',
  'songs.noMatch.title': '一致する曲がありません',
  'songs.noMatch.message':
    '「{section}」に一致する曲はありません。検索語・タグ・ステータスを変えてみてください。',
  'songs.noMatch.clear': '検索とタグをクリア',

  'songDetail.edit': '編集',
  'songDetail.statusFailedTitle': 'ステータスを変更できませんでした',

  'songForm.addTitle': '曲を追加',
  'songForm.editTitle': '曲を編集',
  'songForm.save': '保存',
  'songForm.notFoundTitle': '曲が見つかりません',
  'songForm.title': '曲名',
  'songForm.artist': 'アーティスト',
  'songForm.requiredHint': '必須',
  'songForm.status': 'ステータス',
  'songForm.myKey': 'My Key',
  'songForm.keyOriginal': 'Original',
  'songForm.keyLowerA11y': '半音下げる',
  'songForm.keyRaiseA11y': '半音上げる',
  'songForm.tags': 'タグ',
  'songForm.tagsNote':
    'タグはShow Modeに表示されます。人に見せたくない内容はPrivate Noteに入力してください。',
  'songForm.newTagPlaceholder': '新しいタグ',
  'songForm.addTag': 'タグを追加',
  'songForm.privateNote': 'Private Note',
  'songForm.privateNotePlaceholder': '自分だけが見られます',
  'songForm.saveFailedTitle': '保存できませんでした',
  'songForm.discardTitle': '変更を破棄しますか？',
  'songForm.discardMessage': '変更はまだ保存されていません。',
  'songForm.keepEditing': '編集を続ける',
  'songForm.discard': '破棄',
  'songForm.suggestionsProvider': '候補の提供元: Apple',
  'songForm.suggestionRegistered': '登録済み',
  'songForm.suggestionA11y': '{artist}の{title}',
  'songForm.suggestionA11yRegistered': '{artist}の{title}、登録済み',
  'songForm.suggestionSongHint': '曲名とアーティストを入力します',
  'songForm.suggestionArtistHint': 'アーティストを入力します',

  'error.titleRequired': '曲名を入力してください。',
  'error.artistRequired': 'アーティスト名を入力してください。',
  'error.songNotFound': 'この曲は見つかりませんでした。',
  'error.tagNotFound': 'このタグは見つかりませんでした。',
  'error.tagNameRequired': 'タグ名を入力してください。',
  'error.tagNameDuplicate': '同じ名前のタグがすでにあります。',
  'error.unexpected': '問題が発生しました。もう一度お試しください。',

  'errorScreen.title': '問題が発生しました',
  'errorScreen.message':
    'Singfolioで問題が起きました。もう一度お試しください。繰り返し起きる場合は、アプリを終了して開き直してください。',
  'errorScreen.retry': 'もう一度試す',
  'errorScreen.updateTitle': 'アプリの更新が必要です',
  'errorScreen.updateMessage':
    '曲のデータが新しいバージョンのSingfolioで保存されているため、このバージョンでは開けません。アプリを更新してください。曲のデータは変更されていません。',

  'notFound.title': '画面が見つかりません',
  'notFound.message': 'この画面は存在しません。',
  'notFound.home': '曲の一覧へ',
};
