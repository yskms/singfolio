import type { Language } from '../domain/types.ts';
import type { Message } from './types.ts';

type PluralCategory = 'one' | 'other';

// 件数による形の選び方。`Intl.PluralRules` は使わない（Hermesには無い。iOS・Androidとも
// `typeof Intl.PluralRules` が `undefined`）。言語を足すときは、ここにも足す
// （`Record<Language, ...>` なので、足し忘れは型エラーになる）。
const pluralRules: Record<Language, (count: number) => PluralCategory> = {
  en: (count) => (count === 1 ? 'one' : 'other'),
  ja: () => 'other',
};

export type TranslateParams = Record<string, string | number>;

/**
 * 文言のキーと値（`{name}` の置き換え用）から、画面に出す文字列を作る関数を返す。
 *
 * 値の足りない `{name}` は、そのまま残す（利用者の画面を止めずに、抜けに気づける）。
 * 件数で形が変わる文言（`PluralMessage`）は `params.count` で選ぶ。`count` が数でない
 * ときは `other`。
 */
export function createTranslator<Key extends string>(
  catalog: Readonly<Record<Key, Message>>,
  language: Language,
): (key: Key, params?: TranslateParams) => string {
  return (key, params) => {
    const message = catalog[key];
    let template: string;
    if (typeof message === 'string') {
      template = message;
    } else {
      const count = params?.count;
      const category = typeof count === 'number' ? pluralRules[language](count) : 'other';
      template = message[category] ?? message.other;
    }
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : placeholder,
    );
  };
}

/** `{name}` の名前の一覧（言語間で食い違わないことのテスト用）。 */
export function placeholderNames(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
}
