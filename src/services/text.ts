/**
 * タグ名を正規化する（保存する形）。
 * - Unicode正規化（NFKC）: 全角の英数字・記号を半角に、半角カナを全角カナにする
 *   （`Ｒock` → `Rock`、`ﾎﾞｶﾛ` → `ボカロ`）。
 * - 連続する空白（全角空白を含む）を半角空白1つにし、前後の空白を除く。
 * 大文字小文字は変えない（`Rock` と入力したら `Rock` で保存する）。
 */
export function normalizeTagName(name: string): string {
  // `normalize('NFKC')` を1回で呼ばない。iOSのHermesのNFKCは、半角カナの濁点を
  // 合成せず `ホ` + U+3099 のまま返す（`ﾎﾞ` → 分解されたまま。Androidは合成する）。
  // NFKCは定義上「NFKD → NFC」と同じなので、2段階に分ける（NFKD・NFC単体は
  // iOSのHermesでも正しい。NodeのNFKCとも同じ結果になる）。
  return name
    .normalize('NFKD')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * タグ名が重複かどうかを比べるためのキー。正規化に加えて大文字小文字を同一視する。
 * DBの `COLLATE NOCASE` はASCIIしか同一視しない（`Ä` と `ä` を別扱いする）ため、
 * 重複の判定はDBに任せず、このキーで行う。ひらがなとカタカナは同一視しない。
 */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}
