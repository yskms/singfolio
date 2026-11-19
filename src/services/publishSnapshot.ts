// Publish のリクエスト（公開スナップショットの元）を組み立てる、純粋な関数。DBにも通信にも触れない。
// 方針は docs/singfolio-publishing-backend.md §3「Published Song」、§8「公開スナップショットの形と上限」。
//
// **公開してよい項目の許可リストで作る。** 入力は `PublishSongSource`（id・曲名・アーティスト・公開タグの名前）だけで、
// My Key・Private Note・ステータスを型の上でも持たない（`Show Mode` の `ShowSong` と同じ発想）。型は構造的なので、
// `Song` をそのまま渡せてしまうが、ここは必要な項目だけを取り出して新しいオブジェクトを作る（`{ ...song }` で渡さない）。
// 入力のオブジェクトを、そのまま送らない。
//
// **Worker（`worker/src/snapshot.ts`）と同じ数字・同じ文字の規則を、別に持つ**（コードは共有しない）。Workerは、規則に合わない
// 値が1つでもあると Publish 全体を 400 にするので、アプリが先に整える: 長すぎる曲名・アーティスト・タグは切り詰め、使えない
// 文字は空白にし、空になった曲は外す。1曲の事情で、全体の Publish を止めない。曲数だけは切り詰めない（どの曲を落とすかを
// 勝手に決めない）: 上限を超えるときは断り、理由を返す。数字を変えるときは、Workerの `SNAPSHOT_LIMITS` と一緒に直す。

import type { UnpublishedChanges } from '../domain/types.ts';

/** Workerの `SNAPSHOT_LIMITS` と同じ値（本文のバイト数の上限は、アプリでは数えない。超えたら 413 を `too-large` にする）。 */
export const PUBLISH_LIMITS = {
  songs: 1000,
  displayNameChars: 50,
  bioChars: 500,
  titleChars: 200,
  artistChars: 200,
  tagsPerSong: 10,
  tagChars: 50,
} as const;

/** 公開する曲の元。Ready の曲から、公開してよい項目だけを取り出したもの。 */
export interface PublishSongSource {
  id: string;
  title: string;
  artist: string;
  /** 公開するタグの名前（Show Mode の曲のタグから、公開に選んだものだけ。7.4.8） */
  publicTags: readonly string[];
}

/** Publish のリクエストに載せる曲。 */
export interface PublishSongBody {
  id: string;
  title: string;
  artist: string;
  publicTags: string[];
  /** 公開ページの既定の並び（0から連番。渡された曲の並び） */
  sortOrder: number;
}

/** `POST /me/publish` の本文。 */
export interface PublishBody {
  baseVersion: number;
  profile: { displayName: string; bio: string };
  songs: PublishSongBody[];
}

export type BuildPublishResult =
  | { ok: true; body: PublishBody }
  /** Display Name が（整えたあと）空。公開には要る。 */
  | { ok: false; reason: 'display-name-required' }
  /** 曲が上限を超える。`songCount` は、渡された曲の数。 */
  | { ok: false; reason: 'too-many-songs'; songCount: number };

// 1行の文字に入れない文字（Workerの `SINGLE_LINE_FORBIDDEN` と同じ）: 制御文字（改行・タブを含む）、行・段落の区切り、
// 文字の向きを強制する制御。自己紹介は、改行（\n）だけを通す。
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g;
const BIO_FORBIDDEN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g;
// 対になっていないサロゲート（表示のとき壊れる。Workerは拒否する）を取り除く。**正規表現の後読み（`(?<!…)`）は使わない**: アプリの
// JavaScriptエンジン（Hermes）で、正規表現のリテラルを解釈できないと、このファイルを読み込んだ時点でアプリの起動が失敗する
// （Nodeのテストでは検出できない）。1文字ずつ見る。サロゲートを含まない文字列（大半）は、最初の1回の走査で返す。
const HAS_SURROGATE = /[\uD800-\uDFFF]/;
function stripLoneSurrogates(text: string): string {
  if (!HAS_SURROGATE.test(text)) return text;
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1); // 範囲外は NaN（下の比較は偽）
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += text.slice(i, i + 2);
        i += 1;
      }
    } else if (unit < 0xdc00 || unit > 0xdfff) {
      result += text[i];
    }
  }
  return result;
}

/** コードポイントの数で `max` 字までに切る（サロゲートペアの途中では切らない）。 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

/** 1行の文字列に整える: 使えない文字は空白にして、前後の空白を落とし、長ければ切る。空になったら空文字。 */
function toLine(value: string, maxChars: number): string {
  const text = stripLoneSurrogates(value).replace(SINGLE_LINE_FORBIDDEN, ' ').trim();
  return truncate(text, maxChars).trim();
}

/** 自己紹介に整える: 改行は `\n` にそろえ、使えない文字は取り除き、前後の空白を落とし、長ければ切る。空でもよい。 */
function toBio(value: string): string {
  const text = stripLoneSurrogates(value.replace(/\r\n?/g, '\n')).replace(BIO_FORBIDDEN, ' ').trim();
  return truncate(text, PUBLISH_LIMITS.bioChars).trim();
}

function toTags(tags: readonly string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const name = toLine(tag, PUBLISH_LIMITS.tagChars);
    if (name === '' || result.includes(name)) continue;
    result.push(name);
    if (result.length === PUBLISH_LIMITS.tagsPerSong) break;
  }
  return result;
}

/**
 * 公開する曲を、Publish の本文に載せる形に整える（曲数の上限は見ない）。`songs` の並びが `sortOrder` になる。整えたあとで曲名かアーティストが
 * 空になる曲は、外す（普通は起きない。曲名は保存時に空を断っている）。**Publish と「N unpublished changes」の数え方が、同じ整え方を使う**
 * （別々に書くと、整えた値のずれが、いつまでも消えない「変更あり」になる）。
 */
export function buildPublishSongs(sources: readonly PublishSongSource[]): PublishSongBody[] {
  const songs: PublishSongBody[] = [];
  for (const source of sources) {
    const title = toLine(source.title, PUBLISH_LIMITS.titleChars);
    const artist = toLine(source.artist, PUBLISH_LIMITS.artistChars);
    if (title === '' || artist === '') continue;
    // 許可リストの項目だけで、新しく作る。
    songs.push({ id: source.id, title, artist, publicTags: toTags(source.publicTags), sortOrder: songs.length });
  }
  return songs;
}

/**
 * Publish のリクエストの本文を作る。`songs` の並びが、公開ページの既定の並び（`sortOrder`）になる（呼ぶ側が、Show Mode の
 * アーティスト順に並べて渡す）。曲の整え方は `buildPublishSongs`。
 * 曲数の上限は、外す前の数で見る（渡された数が多いときに、外れた曲で上限の内側に戻るのを当てにしない）。
 */
export function buildPublishBody(input: {
  baseVersion: number;
  displayName: string;
  bio: string;
  songs: readonly PublishSongSource[];
}): BuildPublishResult {
  const displayName = toLine(input.displayName, PUBLISH_LIMITS.displayNameChars);
  if (displayName === '') return { ok: false, reason: 'display-name-required' };
  if (input.songs.length > PUBLISH_LIMITS.songs) {
    return { ok: false, reason: 'too-many-songs', songCount: input.songs.length };
  }

  return {
    ok: true,
    body: {
      baseVersion: input.baseVersion,
      profile: { displayName, bio: toBio(input.bio) },
      songs: buildPublishSongs(input.songs),
    },
  };
}

// cyrb53（53ビットの非暗号のハッシュ）。公開した内容と今の内容の違いを数えるためのもの（セキュリティには使わない）。
// 同期で動き、Nodeでもテストできる。違う内容が同じ値になる確率は 2^-53 ほどで、そのとき数え漏らすだけ（次のPublishで直る）。
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * 公開する曲の内容のハッシュ（曲名・アーティスト・公開タグ）。**`sortOrder` を含めない**: 曲を1つ足すと、あとの曲の
 * `sortOrder` がすべてずれ、全部が「変更あり」になってしまう。並びの変化は、数えない（公開ページの既定の並びは、曲の追加・削除で
 * 自然に変わる）。入力は、`buildPublishBody` が整えたあとの曲（整える前の値と、整えたあとの値が混ざらないように）。
 */
export function songContentHash(song: Pick<PublishSongBody, 'title' | 'artist' | 'publicTags'>): string {
  return cyrb53(JSON.stringify([song.title, song.artist, song.publicTags])).toString(16);
}

/**
 * 最後に Publish した曲（曲のID → `songContentHash`）と、今 Publish するはずの曲（`buildPublishSongs` で整えたもの）を比べて、
 * 変更の数を数える（「N unpublished changes」）。曲ごとに1つ: 公開していない曲が加わったら `added`、公開した曲の内容が変わったら
 * `changed`、公開した曲が無くなったら `removed`。並び（`sortOrder`）は見ない。
 */
export function countSongChanges(
  published: ReadonlyMap<string, string>,
  songs: readonly Pick<PublishSongBody, 'id' | 'title' | 'artist' | 'publicTags'>[],
): UnpublishedChanges {
  let added = 0;
  let changed = 0;
  const seen = new Set<string>();
  for (const song of songs) {
    seen.add(song.id);
    const before = published.get(song.id);
    if (before === undefined) added += 1;
    else if (before !== songContentHash(song)) changed += 1;
  }
  let removed = 0;
  for (const id of published.keys()) {
    if (!seen.has(id)) removed += 1;
  }
  return { added, changed, removed, total: added + changed + removed };
}
