/**
 * ライセンスの全文（`fontLicenses.ts`）を、画面に出す形に詰め直す。元の文は、約75桁で改行して
 * あるため、そのまま出すと、スマホの幅で、折り返しの後に短い行が残って読みにくい。内容は変えず、
 * 空行で区切られた段落の中の改行を、空白に置き換える。次の行は、詰めずにそのまま残す。
 * - 罫線（`-----`）を含む段落（題の囲み）
 * - 段落の先頭の、短い大文字だけの行（`PREAMBLE` などの見出し）。その後ろの本文は詰める
 */
export function reflowLicense(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      if (lines.some((line) => /^-{3,}$/.test(line))) return paragraph;
      const [first = '', ...rest] = lines;
      if (rest.length > 0 && /^[A-Z][A-Z &]{2,29}$/.test(first)) return `${first}\n${rest.join(' ')}`;
      return lines.join(' ');
    })
    .join('\n\n');
}
