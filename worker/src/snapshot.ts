// 公開スナップショット（R2に置く、最後に正常にPublishした内容）の形と、Publishのリクエストの検証。
// 方針は docs/singfolio-publishing-backend.md §3「Published Song」「公開用データの扱い」、§8「公開スナップショット」。
//
// このファイルは、R2にもD1にも触れない純粋な関数だけを置く（Publishのエンドポイントは 7.4.4）。
//
// **公開してよい項目の許可リストで作る。** 入力から必要な項目だけを取り出して新しいオブジェクトを作り、
// 余分な項目（My Key・Private Note・ステータスなど、送られてきても）は、検証せず、保存もしない。入力のオブジェクトを
// そのまま（`{ ...song }` などで）保存する形に「簡略化」しない。許可リストの外の項目は、型の上でも持たない
// （`PublishedSong` に My Key・Private Note・status を足さない）。
//
// 検証の失敗は、固定の語彙（`ContentProblem`）で返す。入力の値（曲名など）は、結果にもエラーにも載せない。
//
// **アプリのテスト（`src/services/publishSnapshot.test.ts`）が、このファイルを import する**（アプリの組み立てが、数字の上でも、整えた本文の上でも、
// Workerの検証と食い違わないことを確かめるため。アプリの実行時のコードは、Workerとコードを共有しない）。ルートの型チェック（`tsc`）と `npm test` が、
// このファイルと、これが import するものを読む。**Workers の型（`D1Database` など）や、`worker/` の依存を、このファイルに持ち込まない**
// （持ち込むと、ルートの `tsc` と `npm test` が壊れる）。

/** スナップショットの形の版。公開ページ（7.5）が、読めない版を見分けるための番号。形を変えるときに上げる。 */
export const SNAPSHOT_SCHEMA = 1;

/**
 * 上限。Free の CPU 時間（1リクエスト10ms）に収まるように決めた値（実測と余裕の取り方は docs §8「公開スナップショットの形と上限」）。
 * **曲数を上げるときは、`npm run bench:snapshot` と workerd で実測し直す**（3000曲は、初回に10msを超えた）。
 * アプリのスナップショットの組み立て（7.4.6）は、同じ数字を別に持つ（コードは共有しない）。
 */
export const SNAPSHOT_LIMITS = {
  /** Publish のリクエストの本文（バイト）。これを超えたら、読み切る前に 413 にする。 */
  requestBytes: 512 * 1024,
  /** 公開する曲（Readyの曲）の数。 */
  songs: 1000,
  displayNameChars: 50,
  bioChars: 500,
  titleChars: 200,
  artistChars: 200,
  /** 1曲に付けられる公開タグの数。 */
  tagsPerSong: 10,
  tagChars: 50,
} as const;

/** 公開する曲。Local Song から、公開してよい項目だけを取り出したもの（docs §3）。 */
export interface PublishedSong {
  /** Local Song と同じ ID。Request（7.6）が対象の曲を指すために使う。 */
  id: string;
  title: string;
  artist: string;
  /** 公開タグの名前（重複なし）。 */
  publicTags: string[];
  /** 公開ページの既定の並び（0から連番）。 */
  sortOrder: number;
}

export interface PublishedProfile {
  displayName: string;
  bio: string;
}

/** Publish のたびに差し替わる、公開内容。 */
export interface SnapshotContent {
  profile: PublishedProfile;
  songs: PublishedSong[];
}

/** R2に置く形。内容に、スナップショットの版と、Publishした時刻を足したもの。 */
export interface Snapshot extends SnapshotContent {
  schema: typeof SNAPSHOT_SCHEMA;
  /** D1の `profiles` の版（Publishのたびに+1）。 */
  version: number;
  /** Publishした時刻（Unixエポックのミリ秒）。 */
  publishedAt: number;
}

export type ContentProblemReason =
  | 'profile'
  | 'display_name'
  | 'bio'
  | 'songs'
  | 'too_many_songs'
  | 'song'
  | 'song_id'
  | 'duplicate_song_id'
  | 'title'
  | 'artist'
  | 'tags'
  | 'sort_order';

/** どの項目が不正かだけを返す（値は載せない）。`index` は、`songs` の何番目か。 */
export interface ContentProblem {
  reason: ContentProblemReason;
  index?: number;
}

export type ContentResult = { ok: true; content: SnapshotContent } | { ok: false; problem: ContentProblem };

// 1行の文字（表示名・曲名・アーティスト・タグ）に入れない文字: 制御文字（改行・タブを含む）、行・段落の区切り、
// 文字の向きを強制する制御（表示が、見た目と違う文字列に化ける）。向きを示す印（U+200E・U+200F）は通す。
// 自己紹介は、改行（\n）だけを通す。
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;
const BIO_FORBIDDEN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;
// サロゲートを含む文字列（絵文字・まれな漢字）だけを、詳しく調べる。大半の文字列は、この1回の走査で済む
// （CPU時間の節約。docs §8「公開スナップショットの形と上限」）。
const HAS_SURROGATE = /[\uD800-\uDFFF]/;
// 対になっていないサロゲート（JSON.stringify は \udXXX と書くが、表示のとき壊れる）。
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const hasLoneSurrogate = (text: string): boolean => HAS_SURROGATE.test(text) && LONE_SURROGATE.test(text);
// アプリは `randomUUID`（小文字）で曲のIDを作る。
const SONG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SORT_ORDER = 1_000_000;

/** コードポイント数が `max` 以下か。大半の文字列は、UTF-16の長さだけで決まる（数える手間を避ける）。 */
function withinChars(value: string, max: number): boolean {
  if (value.length <= max) return true;
  // 1文字は1〜2単位なので、max の2倍を超えれば、必ず超えている。
  if (value.length > max * 2) return false;
  let count = 0;
  for (const _ of value) count += 1;
  return count <= max;
}

/** 1行の文字列。前後の空白は落とす。空・長すぎ・使えない文字を含む場合は null。 */
function cleanLine(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || !withinChars(text, maxChars)) return null;
  if (SINGLE_LINE_FORBIDDEN.test(text) || hasLoneSurrogate(text)) return null;
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > SNAPSHOT_LIMITS.tagsPerSong) return null;
  const tags: string[] = [];
  for (const raw of value) {
    const tag = cleanLine(raw, SNAPSHOT_LIMITS.tagChars);
    if (tag === null || tags.includes(tag)) return null;
    tags.push(tag);
  }
  return tags;
}

const fail = (reason: ContentProblemReason, index?: number): ContentResult => ({
  ok: false,
  problem: index === undefined ? { reason } : { reason, index },
});

/**
 * Publish のリクエストの `profile` と `songs` を検証し、公開内容にする。
 * 文字列は前後の空白を落とす。曲は `sortOrder` の昇順（同じ値は、送られた順）に並べ、`sortOrder` を0から振り直す
 * （欠番や重複で、公開ページの並びが揺れないように）。
 */
export function parseSnapshotContent(input: unknown): ContentResult {
  if (!isRecord(input) || !isRecord(input.profile)) return fail('profile');

  const displayName = cleanLine(input.profile.displayName, SNAPSHOT_LIMITS.displayNameChars);
  if (displayName === null) return fail('display_name');

  const rawBio = input.profile.bio;
  if (typeof rawBio !== 'string') return fail('bio');
  const bio = rawBio.replace(/\r\n/g, '\n').trim();
  if (!withinChars(bio, SNAPSHOT_LIMITS.bioChars) || BIO_FORBIDDEN.test(bio) || hasLoneSurrogate(bio)) {
    return fail('bio');
  }

  const rawSongs = input.songs;
  if (!Array.isArray(rawSongs)) return fail('songs');
  if (rawSongs.length > SNAPSHOT_LIMITS.songs) return fail('too_many_songs');

  const ids = new Set<string>();
  const entries: { song: PublishedSong; order: number }[] = [];
  for (let index = 0; index < rawSongs.length; index += 1) {
    const raw: unknown = rawSongs[index];
    if (!isRecord(raw)) return fail('song', index);

    const id = raw.id;
    if (typeof id !== 'string' || !SONG_ID.test(id)) return fail('song_id', index);
    if (ids.has(id)) return fail('duplicate_song_id', index);
    ids.add(id);

    const title = cleanLine(raw.title, SNAPSHOT_LIMITS.titleChars);
    if (title === null) return fail('title', index);
    const artist = cleanLine(raw.artist, SNAPSHOT_LIMITS.artistChars);
    if (artist === null) return fail('artist', index);
    const publicTags = cleanTags(raw.publicTags);
    if (publicTags === null) return fail('tags', index);

    const order = raw.sortOrder;
    if (typeof order !== 'number' || !Number.isSafeInteger(order) || order < 0 || order > MAX_SORT_ORDER) {
      return fail('sort_order', index);
    }

    // 許可リストの項目だけで作る（余分な項目を持ち込まない）。sortOrder は、並べたあとに振り直す。
    entries.push({ song: { id, title, artist, publicTags, sortOrder: 0 }, order });
  }

  // Array.prototype.sort は安定（同じ値は、送られた順のまま）。
  entries.sort((a, b) => a.order - b.order);
  const songs: PublishedSong[] = new Array(entries.length);
  for (let position = 0; position < entries.length; position += 1) {
    const { song } = entries[position]!;
    song.sortOrder = position; // 上で作った、自分のオブジェクト。入力は書き換えない。
    songs[position] = song;
  }

  return { ok: true, content: { profile: { displayName, bio }, songs } };
}

/** 公開内容に、スナップショットの版と時刻を足す。 */
export function buildSnapshot(content: SnapshotContent, version: number, publishedAt: number): Snapshot {
  return { schema: SNAPSHOT_SCHEMA, version, publishedAt, profile: content.profile, songs: content.songs };
}

/** R2に置く文字列。 */
export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot);
}
