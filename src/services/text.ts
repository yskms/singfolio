/**
 * 曲名・アーティストを正規化する（保存する形）。前後の空白（全角を含む）を除き、
 * 濁点などが分解された形（NFD。macOSのファイル名からの貼り付けなど）を、普通に
 * 入力した形（NFC）にそろえる。見た目は変わらない。検索・並び替えで、
 * 同じ文字が別の文字として扱われるのを防ぐ。全角半角の統一はしない（`Ｔ.Ｍ.Revolution`
 * は入力どおりに保存する）。データが入ってからでは、そろえ直すのにマイグレーションが
 * 必要になるため、最初から行う。
 */
export function normalizeText(text: string): string {
  return text.normalize('NFC').trim();
}

/**
 * タグ名を正規化する（保存する形）。
 * - Unicode正規化（NFKC）: 全角の英数字・記号を半角に、半角カナを全角カナにする
 *   （`Ｒock` → `Rock`、`ﾎﾞｶﾛ` → `ボカロ`）。
 * - 連続する空白（全角空白を含む）を半角空白1つにし、前後の空白を除く。
 * 大文字小文字は変えない（`Rock` と入力したら `Rock` で保存する）。
 * NFKCは全角半角だけでなく、互換文字も変換する（`①` → `1`、`™` → `TM`、`㈱` → `(株)`、
 * `½` → `1⁄2`）。タグ名は、見た目の揺れをそろえる目的で、これを許容する。
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
 * `toLowerCase` がASCII以外（`Ä` → `ä`）も変換することは、iOSシミュレータ・
 * Androidエミュレータ上のHermesでも確認した。
 */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/**
 * 検索で、検索語と曲名・アーティストを比べるためのキー。次の違いを同一視する。
 * - 大文字小文字（ASCII以外も。`Ä` と `ä`）
 * - 全角半角（`ＲＯＣＫ` と `rock`、`ﾁｪﾘｰ` と `チェリー`）。互換文字も変換される
 *   （`①` → `1`）。タグ名と同じ（`normalizeTagName`）で、見た目の揺れをそろえる目的。
 * - ひらがなとカタカナ（`ちぇりー` と `チェリー`）。日本語は、ひらがなで入力して
 *   カタカナの曲を探すことが多いため。長音（ー）は、そのままにする。
 * - 空白（全角を含む）の量。連続する空白は1つ、前後は除く。
 * 漢字の読み（`桜` と `さくら`）は、読みのデータが無いため同一視できない。
 * 保存する形ではなく、比べるためだけのキー。
 */
export function searchKey(text: string): string {
  // `normalize('NFKC')` を1回で呼ばない（理由は `normalizeTagName`）。
  const folded = text
    .normalize('NFKD')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  // カタカナ（ァ〜ヶ、ヽヾ）を、0x60 離れたひらがなにする。
  return folded.replace(/[\u30A1-\u30F6\u30FD\u30FE]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

/**
 * アーティスト名が同じかを比べるキー（同じアーティストとみなす範囲）。全角半角・互換文字
 * （`normalizeTagName` と同じ）と、大文字小文字（ASCII以外も）を同一視し、空白の量を
 * そろえる。ひらがなとカタカナは同一視しない（別のアーティストになりうる）。保存する形
 * （`normalizeText`）ではなく、比べるためだけのキー。
 */
export function artistNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/**
 * 読み（並び替え用の名前）を正規化する（保存する形）。全角の英数字を半角に、半角カナを
 * 全角カナにし、空白を整える（`normalizeTagName` と同じ。理由もそちら）。ひらがなとカタカナは
 * 入力のまま保存する（並び替え・検索で同一視する）。
 */
export function normalizeReading(reading: string): string {
  return normalizeTagName(reading);
}

const SMALL_KANA: Record<string, string> = {
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け',
};

// 長音（ー）を、直前のかなの母音（あいうえお）にするための表。あ行〜わ行の、行ごとの母音。
const KANA_VOWELS: Record<string, string> = {};
for (const [row, vowels] of [
  ['あいうえお', 'あいうえお'],
  ['かきくけこ', 'あいうえお'],
  ['さしすせそ', 'あいうえお'],
  ['たちつてと', 'あいうえお'],
  ['なにぬねの', 'あいうえお'],
  ['はひふへほ', 'あいうえお'],
  ['まみむめも', 'あいうえお'],
  ['やゆよ', 'あうお'],
  ['らりるれろ', 'あいうえお'],
  ['わゐゑを', 'あいえお'],
] as const) {
  [...row].forEach((kana, index) => {
    KANA_VOWELS[kana] = vowels[index] as string;
  });
}

/**
 * 並び替えのキー。キー同士を `<` で比べて並べる（コード順）。読み順（五十音順）になるよう、
 * 次のようにする。
 * - 検索と同じ同一視（`searchKey`）: 大文字小文字・全角半角・ひらがな/カタカナ。
 * - 第1のキー（先に比べる）: 濁点・半濁点・アクセントを除く（`か` と `が` は同じ位置）、
 *   小さいかな（`っ` `ゃ` など）を大きいかなにする、長音（ー）を直前のかなの母音にする
 *   （`らーめん` は `らあめん`）、中点（・）を空白にする（記号として、文字より前に並ぶ。
 *   `ミスター・チルドレン` が `ミスターチルドレン` の近くに来る）。
 * - 第2のキー（第1のキーが同じときの順）: 濁点などの有無（`か` が `が` より先）、大きいかなが
 *   小さいかなより先（`きよう` が `きょう` より先）、母音が長音より先（`らあめん` が `らーめん` より先）。
 * 並びは、記号・数字・英字 → かな（五十音順）→ 漢字（文字コード順）。漢字は読みを持たないので、
 * 読みを入力した欄（アーティストの読み）で並べる。保存する形ではなく、比べるためだけのキー。
 */
export function sortKey(text: string): string {
  let primary = '';
  let secondary = '';
  for (const char of searchKey(text).normalize('NFD')) {
    if (/[\u0300-\u036f\u3099\u309a]/.test(char)) {
      // 濁点・半濁点・アクセント: 第1のキーには入れず、第2のキーに、直前の字の後ろへ足す。
      secondary += char;
      continue;
    }
    const large = SMALL_KANA[char];
    if (large !== undefined) {
      primary += large;
      secondary += `${large}\uffff`;
      continue;
    }
    if (char === '・') {
      // 中点は、第1のキーでは空白（かなの後ろへ回らない）。第2のキーでは、中点のまま。
      primary += ' ';
      secondary += char;
      continue;
    }
    const vowel = char === 'ー' ? KANA_VOWELS[primary.slice(-1)] : undefined;
    if (vowel !== undefined) {
      primary += vowel;
      secondary += `${vowel}\ufffe`;
      continue;
    }
    primary += char;
    secondary += char;
  }
  return `${primary}\u0000${secondary}`;
}
