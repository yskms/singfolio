import type { Database, ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';
import {
  isSongStatus,
  type Song,
  type SongListQuery,
  type SongStatus,
} from '../domain/types.ts';
import type { ArtistRepository } from '../repositories/artistRepository.ts';
import type { SongRepository } from '../repositories/songRepository.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import { findOrCreateArtist } from './artistLookup.ts';
import { ServiceError } from './errors.ts';
import { findOrCreateTag } from './tagLookup.ts';
import { normalizeReading, normalizeText, searchKey, sortKey } from './text.ts';

/** 曲の編集画面で保存する内容。 */
export interface SongInput {
  title: string;
  /** アーティストの名前。同じアーティスト（大文字小文字・全角半角を区別しない）があれば、それに付ける */
  artist: string;
  /**
   * アーティストの読み（並び替え用の名前）。渡すと、そのアーティストの読みを、この値にする
   * （同じアーティストの全曲に効く）。空は `artist-reading-required`。省略すると、既存のアーティストの
   * 読みはそのまま、新しいアーティストは名前を読みにする。
   */
  artistReading?: string;
  status: SongStatus;
  /** My Key。原曲からの半音差の整数。`0` = Original */
  keyOffset: number;
  privateNote: string;
  tagIds: string[];
  /**
   * 曲の保存と一緒に作る、新しいタグの名前（省略は無し）。同じ名前（正規化して、大文字小文字を
   * 同一視）のタグが既にあれば、作らずにそのタグを付ける。タグの作成は曲の保存と同じ
   * トランザクションで行うので、保存が失敗したら、作ったタグも残らない。
   */
  newTagNames?: string[];
}

/** 曲の追加。Title / Artist / Status 以外は省略できる（My Key 0、メモ・タグなし）。 */
export type NewSongInput = Pick<SongInput, 'title' | 'artist' | 'status'> &
  Partial<Omit<SongInput, 'title' | 'artist' | 'status'>>;

export interface SongServiceDeps {
  db: Database;
  songs: SongRepository;
  tags: TagRepository;
  artists: ArtistRepository;
}

/** 保存する形にした入力。タグは、新しいタグを作る前のもの。 */
type NormalizedInput = Omit<Required<SongInput>, 'artistReading'> & {
  artistReading: string | undefined;
};
/** 新しいタグを作って、タグIDにまとめ、アーティストを決めた後の入力。 */
type ResolvedInput = Omit<NormalizedInput, 'newTagNames' | 'artist' | 'artistReading'> & {
  artistId: string;
};

/** 入力を検証し、保存する形（曲名・アーティストの正規化、タグIDの重複の除去など）にする。 */
function normalizeInput(input: SongInput): NormalizedInput {
  const title = normalizeText(input.title);
  if (title === '') throw new ServiceError('title-required');
  const artist = normalizeText(input.artist);
  if (artist === '') throw new ServiceError('artist-required');
  const artistReading =
    input.artistReading === undefined ? undefined : normalizeReading(input.artistReading);
  if (artistReading === '') throw new ServiceError('artist-reading-required');
  if (!isSongStatus(input.status)) throw new ServiceError('invalid-status');
  if (!Number.isSafeInteger(input.keyOffset)) {
    throw new ServiceError('invalid-key-offset');
  }
  return {
    title,
    artist,
    artistReading,
    status: input.status,
    keyOffset: input.keyOffset,
    // 空白だけのメモは「メモなし」（空文字）にそろえる。
    privateNote: input.privateNote.trim(),
    tagIds: [...new Set(input.tagIds)],
    newTagNames: input.newTagNames ?? [],
  };
}

function toInput(song: Song): SongInput {
  return {
    title: song.title,
    artist: song.artist,
    artistReading: song.artistReading,
    status: song.status,
    keyOffset: song.keyOffset,
    privateNote: song.privateNote,
    tagIds: song.tags.map((tag) => tag.id),
  };
}

function isUnchanged(current: Song, next: ResolvedInput): boolean {
  const currentTagIds = new Set(current.tags.map((tag) => tag.id));
  return (
    current.title === next.title &&
    current.artistId === next.artistId &&
    current.status === next.status &&
    current.keyOffset === next.keyOffset &&
    current.privateNote === next.privateNote &&
    currentTagIds.size === next.tagIds.length &&
    next.tagIds.every((id) => currentTagIds.has(id))
  );
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 曲名順・アーティスト順の並び替え（五十音順。アーティストは読みで並べる）。ほかの並び（登録日・
 * 更新日）はSQLが決めているので、そのまま返す。向きは、`asc` 以外（不正な値を含む）は降順
 * （Repositoryと同じ）。同順位は、いつも昇順（曲名・アーティストの読み・IDの順）。
 */
function sortByReading(
  list: Song[],
  sortBy: SongListQuery['sortBy'],
  direction: SongListQuery['direction'],
): Song[] {
  if (sortBy !== 'title' && sortBy !== 'artist') return list;
  const sign = direction === 'asc' ? 1 : -1;
  const keyed = list.map((song) => ({
    song,
    title: sortKey(song.title),
    artist: sortKey(song.artistReading),
  }));
  keyed.sort((a, b) => {
    const primary = sortBy === 'title' ? compareKeys(a.title, b.title) : compareKeys(a.artist, b.artist);
    return (
      sign * primary ||
      compareKeys(a.title, b.title) ||
      compareKeys(a.artist, b.artist) ||
      compareKeys(a.song.id, b.song.id)
    );
  });
  return keyed.map(({ song }) => song);
}

// 書き込みは必ず `db.transaction` の中で行う（理由は db/appDatabase.ts）。
export function createSongService({ db, songs, tags, artists }: SongServiceDeps) {
  async function assertTagsExist(
    executor: ReadExecutor,
    tagIds: readonly string[],
  ): Promise<void> {
    const found = await tags.findByIds(executor, tagIds);
    if (found.length !== tagIds.length) throw new ServiceError('tag-not-found');
  }

  /**
   * 新しいタグを作り（同じ名前のタグがあれば、それを使う）、付けるタグのIDにまとめる。
   * `tx` の中で呼ぶ（曲の保存が失敗したとき、作ったタグも取り消すため）。
   */
  async function resolveTagIds(tx: WriteExecutor, input: NormalizedInput): Promise<string[]> {
    const ids = new Set(input.tagIds);
    for (const name of input.newTagNames) {
      ids.add((await findOrCreateTag(tx, tags, name)).id);
    }
    return [...ids];
  }

  /**
   * アーティストを決め（同じアーティストがあればそれ、なければ作る。読みを渡していれば、アーティスト
   * の読みを書き換える）、曲の書き込みに渡す形にする。`tx` の中で呼ぶ（曲の保存が失敗したとき、
   * 作ったアーティストも取り消すため）。
   */
  async function resolveInput(tx: WriteExecutor, input: NormalizedInput): Promise<ResolvedInput> {
    const { artist: name, artistReading, newTagNames: _newTagNames, ...rest } = input;
    const artist = await findOrCreateArtist(tx, artists, { name, reading: artistReading });
    return { ...rest, artistId: artist.id, tagIds: await resolveTagIds(tx, input) };
  }

  async function requireSong(executor: ReadExecutor, id: string): Promise<Song> {
    const song = await songs.get(executor, id);
    if (!song) throw new ServiceError('song-not-found');
    return song;
  }

  /**
   * 曲を編集して保存する。`next` に、現在の曲から新しい内容を作る関数を渡す。
   * 内容が変わらないときは何も書かず、`updatedAt` も更新しない。
   */
  function edit(id: string, next: (current: Song) => SongInput): Promise<Song> {
    return db.transaction(async (tx) => {
      const current = await requireSong(tx, id);
      const normalized = normalizeInput(next(current));
      // 新しいタグを作った場合は、そのIDが現在のタグに無いので、必ず「変更あり」になる
      // （内容が変わらないのに、タグだけが作られることは無い）。アーティストも、別のアーティスト
      // （新しく作った場合を含む）になれば、IDが変わるので「変更あり」。
      const input = await resolveInput(tx, normalized);
      // 曲は変わらなくても、読みを変えた場合は、アーティストが書き換わっている（曲の `updatedAt` は
      // 変えない。アーティストの読みの変更は、曲の編集ではない）。
      if (isUnchanged(current, input)) return requireSong(tx, id);

      await assertTagsExist(tx, input.tagIds);
      await songs.update(tx, id, input);
      await songs.replaceTags(tx, id, input.tagIds);
      // 付け替えて、曲が1つも無くなったアーティストは消す。
      await artists.deleteWithoutSongs(tx);
      return requireSong(tx, id);
    });
  }

  return {
    getSong(id: string): Promise<Song | null> {
      return songs.get(db, id);
    },

    /**
     * 条件をすべて満たす曲を返す。曲名・アーティストの検索と、曲名・アーティストの並び替えは、
     * SQLではなくここで行う。検索は `searchKey`（大文字小文字・全角半角・ひらがな/カタカナの違いを
     * 同一視する。SQLiteの `LIKE` にはできない）で、アーティストは名前だけでなく読みにも
     * 一致する（`えるれ` で `ELLEGARDEN` が見つかる）。並び替えは `sortKey`（五十音順。
     * アーティストは読みで並べる）。絞り込んだ曲を全部読んでから行うが、端末内の曲数
     * （数百曲）なら問題にならない。
     */
    async listSongs(query: SongListQuery = {}): Promise<Song[]> {
      const { search, ...filter } = query;
      const found = sortByReading(await songs.list(db, filter), filter.sortBy, filter.direction);
      const key = search === undefined ? '' : searchKey(search);
      if (key === '') return found;
      return found.filter(
        (song) =>
          searchKey(song.title).includes(key) ||
          searchKey(song.artist).includes(key) ||
          searchKey(song.artistReading).includes(key),
      );
    },

    countSongsByStatus(): Promise<Record<SongStatus, number>> {
      return songs.countByStatus(db);
    },

    /**
     * 曲を追加する。入力が不正なら `ServiceError`（`title-required` など）で
     * reject し、何も保存しない（`newTagNames` で作るタグも残らない）。存在しない
     * タグIDを含む場合は `tag-not-found`。
     */
    async createSong(input: NewSongInput): Promise<Song> {
      const normalized = normalizeInput({
        title: input.title,
        artist: input.artist,
        artistReading: input.artistReading,
        status: input.status,
        keyOffset: input.keyOffset ?? 0,
        privateNote: input.privateNote ?? '',
        tagIds: input.tagIds ?? [],
        newTagNames: input.newTagNames,
      });
      return db.transaction(async (tx) => {
        const input = await resolveInput(tx, normalized);
        await assertTagsExist(tx, input.tagIds);
        const id = await songs.insert(tx, input);
        await songs.replaceTags(tx, id, input.tagIds);
        return requireSong(tx, id);
      });
    },

    /**
     * 曲の編集画面の保存。全項目を渡した内容に置き換える（タグも、`tagIds` と、`newTagNames`
     * から作ったタグの一覧になる）。`updatedAt` は、内容が実際に変わったときだけ更新する。
     * 失敗したら、曲もタグも変更しない（`newTagNames` で作るタグも残らない）。
     */
    updateSong(id: string, input: SongInput): Promise<Song> {
      return edit(id, () => input);
    },

    /** ステータスだけを変える（Song Detail、Songs の行のボタン）。 */
    setStatus(id: string, status: SongStatus): Promise<Song> {
      return edit(id, (current) => ({ ...toInput(current), status }));
    },

    /**
     * 曲を削除する。付いていたタグは残る。アーティストは、その曲が最後の1曲なら一緒に消える。
     * 既に無い曲の削除は何もしない（二重タップで失敗にしないため）。
     */
    async deleteSong(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await songs.delete(tx, id);
        await artists.deleteWithoutSongs(tx);
      });
    },
  };
}

export type SongService = ReturnType<typeof createSongService>;
