import type { Language } from '../domain/types.ts';

/**
 * アプリに同梱しているフォントの太さ。Regular / Bold の2つだけで、
 * 画面の `fontWeight` はこの値（'400' / '700'）に限る。
 * 同梱していない太さ（'500'・'600' など）は、iOS・Androidで近い太さの選び方が違い、
 * 見た目がずれる（`fontFamily` を指定すると、OSが太さを合成することもない）。
 * 増減するときは、scripts/generate-fonts.py と app.json の expo-font も同じにする
 * （`npm test` の src/theme/nativeConfig.test.ts が、app.json との食い違いを検出する）。
 */
export const FONT_WEIGHTS = [400, 700] as const;

/**
 * 表示言語ごとの書体（英語はInter、日本語はNoto Sans JP）。値は、フォントファイルを
 * ネイティブに埋め込む設定（app.json の expo-font）の `fontFamily` と同じ。画面で
 * 直接使わず、`ui/Text.tsx` の `Text` と `useFontFamily()` を通す。
 */
export const fontFamilies: Record<Language, string> = {
  en: 'Inter',
  ja: 'Noto Sans JP',
};

/** React Navigation のテーマの `fonts`（ヘッダーの題・タブのラベルなど）。太さは同梱した2つに寄せる（ヘッダーの題・タブのラベルは Bold）。 */
export function navigationFonts(fontFamily: string) {
  return {
    regular: { fontFamily, fontWeight: '400' },
    medium: { fontFamily, fontWeight: '700' },
    bold: { fontFamily, fontWeight: '700' },
    heavy: { fontFamily, fontWeight: '700' },
  } as const;
}
