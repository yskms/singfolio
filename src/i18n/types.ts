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
