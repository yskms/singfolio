import { isLanguage, type Language } from '../domain/types.ts';

/** 端末の言語がどの対応言語にも当てはまらないときの言語（English First）。 */
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * 端末の言語から決める表示言語。初回起動で、保存する言語を決めるときと、DBが使えない場面
 * （起動時の失敗を出すエラー画面）で使う。普段の表示言語は、保存した言語（Settingsの
 * Language）で、端末の言語には従わない。
 *
 * 端末の言語（`deviceLanguageTags`。BCP 47、端末の優先順）は、先頭から順に見て、
 * 最初に対応している言語を使う（`ja-JP` → `ja`。`fr-FR`、`ja-JP` なら `ja`）。
 * どれも対応していなければ English。
 */
export function deviceLanguage(deviceLanguageTags: readonly string[]): Language {
  for (const tag of deviceLanguageTags) {
    const primary = tag.split(/[-_]/)[0]?.toLowerCase();
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
