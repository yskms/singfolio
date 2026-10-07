import type { Language } from '../domain/types.ts';
import { en, type MessageKey } from './en.ts';
import { ja } from './ja.ts';
import type { Message } from './types.ts';

export { errorMessageKey } from './errors.ts';
export { resolveLanguage } from './resolveLanguage.ts';
export { createTranslator, type TranslateParams } from './translate.ts';
export type { MessageKey } from './en.ts';

/** 言語ごとの文言。言語を足すと、ここに足すまで型エラーになる。 */
export const catalogs: Record<Language, Readonly<Record<MessageKey, Message>>> = { en, ja };

/**
 * 言語の選択肢に出す名前。どの表示言語でも、その言語自身の名前で出す
 * （言語が分からなくなっても選び直せるように）ため、文言のカタログには入れない。
 */
export const languageNames: Record<Language, string> = {
  en: 'English',
  ja: '日本語',
};
