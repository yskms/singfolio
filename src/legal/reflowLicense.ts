/**
 * ライセンスの全文（`fontLicenses.ts`・`thirdPartyLicenses.ts`）を、画面に出す形に詰め直す。元の文は、
 * 約75桁で改行してあるため、そのまま出すと、スマホの幅で、折り返しの後に短い行が残って読みにくい。
 * 内容は変えず、空行で区切られた段落の中の改行を、空白に置き換える（詰めるとき、行頭の字下げは除く。
 * Apache License は、題や条項を字下げしている）。次の行は、詰めずにそのまま残す。
 * - 罫線（`-----`）を含む段落（題の囲み）
 * - 続けて並ぶ `Copyright` で始まる行（共著の著作権表示は、1行ずつ残す）
 * - 段落の先頭の、短い大文字だけの行（`PREAMBLE` などの見出し）。その後ろの本文は詰める
 */
export function reflowLicense(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      if (paragraph.split('\n').some((line) => /^-{3,}$/.test(line))) return paragraph;
      const lines = paragraph.split('\n').map((line) => line.trim());
      const [first = '', ...rest] = lines;
      if (rest.length > 0 && /^[A-Z][A-Z &]{2,29}$/.test(first)) return `${first}\n${join(rest)}`;
      return join(lines);
    })
    .join('\n\n');
}

// 行を空白でつなぐ。ただし、`Copyright` の行の次の `Copyright` の行は、改行のまま残す。
function join(lines: string[]): string {
  return lines.reduce((joined, line, index) => {
    if (index === 0) return line;
    const bothCopyright = /^Copyright\b/.test(line) && /^Copyright\b/.test(lines[index - 1] ?? '');
    return joined + (bothCopyright ? '\n' : ' ') + line;
  }, '');
}
