// ブランドカラーとテーマの色。色はここに集約し、画面・部品に直書きしない。
// 値の根拠と、PNGのブランド資料との違いは CLAUDE.md「ブランド」節を参照。
//
// この値は、JSから読めないネイティブ設定にも手で写している。変えたら
// `nativeConfig.test.ts` が失敗するので、そこに挙がる箇所（app.json、
// plugins/withAndroidNightColors.js）を同じ値に直すこと。

export const brand = {
  /** Mint（Brand）。アイコンの背景色 */
  mint: '#C9FCED',
  /** Purple（Primary）。アイコンのシンボルの色 */
  purple: '#9C70FE',
} as const;

export interface ThemeColors {
  /** 画面の背景 */
  background: string;
  /** カード・件数タイル・入力欄などの、背景から一段浮いた面 */
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  /** アクセント（選択中のタブ・主要なボタンなど）。Purple */
  primary: string;
  /** primary の面（主要なボタンの塗りなど）の上の文字。ダークでも濃い色（textPrimary は明るい色になる） */
  onPrimary: string;
  /** 選択中の面（件数タイル・絞り込みのチップ）。Mint系。縁には primary を使う */
  selected: string;
  /** selected の面の上の文字 */
  onSelected: string;
  /** モーダルの背後を暗くする幕。不透明度を下げて重ねる（色そのものは不透明） */
  scrim: string;
  /** 入力エラーの文字。background・surface の上でAA（4.5:1）を満たす */
  error: string;
}

// textPrimary / textSecondary は、同じテーマの background・surface の上でWCAG AA
// （4.5:1）を満たす（`colors.test.ts` が確認する）。
// primary（Purple）は白の上で約3.4:1、surfaceの上で約3.2:1で、小さな文字の色には
// 足りない。アイコン・大きな文字・塗りとして使い、紫の面の上の文字は
// textPrimary側の濃い色（#17171A、約5.3:1）にする。ダークの背景の上では約5.5:1ある。
// selected は、色だけで選択中を伝えないよう、縁を primary にして使う（ライトでは、Mintと
// 白・surface の輝度の差が小さく、色だけでは見分けにくいため）。
export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F7F7F8',
  border: '#E4E4E7',
  textPrimary: '#17171A',
  textSecondary: '#71717A',
  primary: brand.purple,
  onPrimary: '#17171A',
  selected: brand.mint,
  onSelected: '#17171A',
  scrim: '#000000',
  error: '#B3261E',
};

// ダークの値は、ブランド資料にはモックアップ（暗い背景に明るいミント/パープル）しか
// 無いため、そこから決めた。
export const darkColors: ThemeColors = {
  background: '#111113',
  surface: '#1C1C1F',
  border: '#2E2E33',
  textPrimary: '#F4F4F5',
  textSecondary: '#A1A1AA',
  primary: brand.purple,
  onPrimary: '#17171A',
  // モックアップ（暗い背景の選択中のタイル）に合わせて、暗いMint系の面に明るいMintの文字。
  selected: '#1D3B34',
  onSelected: brand.mint,
  scrim: '#000000',
  error: '#F2B8B5',
};

export type ColorSchemeName = 'light' | 'dark';

export const colorsByScheme: Record<ColorSchemeName, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
