import type { Language } from '../domain/types.ts';
import type { Message, TranslateArgs } from './types.ts';

type PluralCategory = 'one' | 'other';

// 件数による形の選び方。`Intl.PluralRules` は使わない（Hermesには無い。iOS・Androidとも
// `typeof Intl.PluralRules` が `undefined`）。言語を足すときは、ここにも足す
// （`Record<Language, ...>` なので、足し忘れは型エラーになる）。
const pluralRules: Record<Language, (count: number) => PluralCategory> = {
  en: (count) => (count === 1 ? 'one' : 'other'),
  ja: () => 'other',
};

export type TranslateParams = Record<string, string | number>;

/** キーごとに、文言が要求する値を型で要求する関数（`Catalog` は、キーの型を決める文言の型）。 */
export type Translator<Catalog extends Readonly<Record<string, Message>>> = <
  Key extends keyof Catalog & string,
>(
  key: Key,
  ...args: TranslateArgs<Catalog[Key]>
) => string;

/**
 * 文言のキーと値（`{name}` の置き換え用）から、画面に出す文字列を作る関数を返す。
 *
 * `Catalog` は、キーと、キーごとの必要な値の型を決める文言の型（`typeof en` など。
 * `as const` のリテラル型）。`catalog` はその言語の文言で、キーが同じであればよい。
 *
 * 型で防いでいても、実行時は画面を止めず、抜けに気づけるようにする。値の足りない
 * `{name}` はそのまま残し、カタログに無いキーはキーそのものを返す。件数で形が変わる文言
 * （`PluralMessage`）は `params.count` で選ぶ。`count` が数でないときは `other`。
 */
export function createTranslator<Catalog extends Readonly<Record<string, Message>>>(
  catalog: Readonly<Record<keyof Catalog & string, Message>>,
  language: Language,
): Translator<Catalog> {
  const translate = (key: keyof Catalog & string, params?: TranslateParams): string => {
    const message: Message | undefined = catalog[key];
    // 型で防いでいるキーの誤り（カタログとの食い違いなど）でも、画面は止めない。
    if (message === undefined) return key;
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
  return translate as Translator<Catalog>;
}

/** `{name}` の名前の一覧（言語間で食い違わないことのテスト用）。 */
export function placeholderNames(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
}
