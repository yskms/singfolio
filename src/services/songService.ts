import type { Database, ReadExecutor, WriteExecutor } from '../db/appDatabase.ts';
import {
  isSongStatus,
  type Song,
  type SongListQuery,
  type SongStatus,
} from '../domain/types.ts';
import type { SongRepository } from '../repositories/songRepository.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import { ServiceError } from './errors.ts';
import { findOrCreateTag } from './tagLookup.ts';
import { normalizeText, searchKey } from './text.ts';

/** 曲の編集画面で保存する内容。 */
export interface SongInput {
  title: string;
  artist: string;
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
}

/** 保存する形にした入力。タグは、新しいタグを作る前のもの。 */
type NormalizedInput = Required<SongInput>;
/** 新しいタグを作って、タグIDにまとめた後の入力。 */
type ResolvedInput = Omit<SongInput, 'newTagNames'>;

/** 入力を検証し、保存する形（曲名・アーティストの正規化、タグIDの重複の除去など）にする。 */
function normalizeInput(input: SongInput): NormalizedInput {
  const title = normalizeText(input.title);
  if (title === '') throw new ServiceError('title-required');
  const artist = normalizeText(input.artist);
  if (artist === '') throw new ServiceError('artist-required');
  if (!isSongStatus(input.status)) throw new ServiceError('invalid-status');
  if (!Number.isSafeInteger(input.keyOffset)) {
    throw new ServiceError('invalid-key-offset');
  }
  return {
    title,
    artist,
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
    current.artist === next.artist &&
    current.status === next.status &&
    current.keyOffset === next.keyOffset &&
    current.privateNote === next.privateNote &&
    currentTagIds.size === next.tagIds.length &&
    next.tagIds.every((id) => currentTagIds.has(id))
  );
}

// 書き込みは必ず `db.transaction` の中で行う（理由は db/appDatabase.ts）。
export function createSongService({ db, songs, tags }: SongServiceDeps) {
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
      // （内容が変わらないのに、タグだけが作られることは無い）。
      const input = { ...normalized, tagIds: await resolveTagIds(tx, normalized) };
      if (isUnchanged(current, input)) return current;

      await assertTagsExist(tx, input.tagIds);
      await songs.update(tx, id, input);
      await songs.replaceTags(tx, id, input.tagIds);
      return requireSong(tx, id);
    });
  }

  return {
    getSong(id: string): Promise<Song | null> {
      return songs.get(db, id);
    },

    /**
     * 条件をすべて満たす曲を返す。曲名・アーティストの検索は、SQLではなくここで行う
     * （`searchKey` が、大文字小文字・全角半角・ひらがな/カタカナの違いを同一視する。
     * SQLiteの `LIKE` にはできない）。絞り込んだ曲を全部読んでから検索するが、端末内の
     * 曲数（数百曲）なら問題にならない。
     */
    async listSongs(query: SongListQuery = {}): Promise<Song[]> {
      const { search, ...filter } = query;
      const found = await songs.list(db, filter);
      const key = search === undefined ? '' : searchKey(search);
      if (key === '') return found;
      return found.filter(
        (song) => searchKey(song.title).includes(key) || searchKey(song.artist).includes(key),
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
        status: input.status,
        keyOffset: input.keyOffset ?? 0,
        privateNote: input.privateNote ?? '',
        tagIds: input.tagIds ?? [],
        newTagNames: input.newTagNames,
      });
      return db.transaction(async (tx) => {
        const tagIds = await resolveTagIds(tx, normalized);
        await assertTagsExist(tx, tagIds);
        const id = await songs.insert(tx, normalized);
        await songs.replaceTags(tx, id, tagIds);
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

    /** ステータスだけを変える（Song Detail・Practiceの「Mark as Ready」）。 */
    setStatus(id: string, status: SongStatus): Promise<Song> {
      return edit(id, (current) => ({ ...toInput(current), status }));
    },

    /**
     * 曲を削除する。付いていたタグは残る。既に無い曲の削除は何もしない
     * （二重タップで失敗にしないため）。
     */
    async deleteSong(id: string): Promise<void> {
      await db.transaction((tx) => songs.delete(tx, id));
    },
  };
}

export type SongService = ReturnType<typeof createSongService>;
