import { isLanguage, type Language } from '../domain/types.ts';

/** 端末の言語がどの対応言語にも当てはまらないときの言語（English First）。 */
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * 実際に使う表示言語。利用者が選んでいれば（`saved`）それ、選んでいなければ端末の言語
 * から決める。
 *
 * 端末の言語（`deviceLanguageTags`。BCP 47、端末の優先順）は、先頭から順に見て、
 * 最初に対応している言語を使う（`ja-JP` → `ja`。`fr-FR`、`ja-JP` なら `ja`）。
 * どれも対応していなければ English。
 */
export function resolveLanguage(
  saved: Language | null,
  deviceLanguageTags: readonly string[],
): Language {
  if (saved) return saved;
  for (const tag of deviceLanguageTags) {
    const primary = tag.split(/[-_]/)[0]?.toLowerCase();
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
