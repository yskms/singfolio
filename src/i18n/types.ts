// 文言（カタログ）の型。キーの一覧は en.ts が正で、他の言語は同じキーを過不足なく持つ。

/**
 * 件数で形が変わる文言。`count` を渡して使う。形は言語の規則（translate.ts の
 * `pluralRules`）で選び、その言語に無い形は `other` を使う。
 */
export interface PluralMessage {
  one?: string;
  other: string;
}

/**
 * `{name}` の部分は、`translate` に渡す値で置き換える。
 */
export type Message = string | PluralMessage;

// `{count} songs` → 'count'。文言のリテラル型（en.ts は `as const`）から、必要な値の名前を取る。
type PlaceholderNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never;

/**
 * 文言が要求する値。件数の文言は `count`（数）を必須にし、`{name}` は文字か数を必須にする。
 * 呼び出し側の渡し忘れ（画面に `{count} songs` がそのまま出る）を、型で防ぐ。
 */
export type MessageParams<M extends Message> = M extends string
  ? { [N in PlaceholderNames<M>]: string | number }
  : { [N in Exclude<PlaceholderNames<Extract<M[keyof M], string>>, 'count'>]: string | number } & {
      count: number;
    };

/** 値の要らない文言は引数なし、要る文言は値を必須にする。 */
export type TranslateArgs<M extends Message> = keyof MessageParams<M> extends never
  ? []
  : [params: MessageParams<M>];
