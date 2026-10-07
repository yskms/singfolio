import type { Database, ReadExecutor } from '../db/appDatabase.ts';
import {
  isSongStatus,
  type Song,
  type SongListQuery,
  type SongStatus,
} from '../domain/types.ts';
import type { SongRepository } from '../repositories/songRepository.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import { ServiceError } from './errors.ts';

/** 曲の編集画面で保存する内容。 */
export interface SongInput {
  title: string;
  artist: string;
  status: SongStatus;
  /** My Key。原曲からの半音差の整数。`0` = Original */
  keyOffset: number;
  privateNote: string;
  tagIds: string[];
}

/** 曲の追加。Title / Artist / Status 以外は省略できる（My Key 0、メモ・タグなし）。 */
export type NewSongInput = Pick<SongInput, 'title' | 'artist' | 'status'> &
  Partial<Omit<SongInput, 'title' | 'artist' | 'status'>>;

export interface SongServiceDeps {
  db: Database;
  songs: SongRepository;
  tags: TagRepository;
}

/** 入力を検証し、保存する形（前後の空白の除去、タグIDの重複の除去）にする。 */
function normalizeInput(input: SongInput): SongInput {
  const title = input.title.trim();
  if (title === '') throw new ServiceError('title-required');
  const artist = input.artist.trim();
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

function isUnchanged(current: Song, next: SongInput): boolean {
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
      const input = normalizeInput(next(current));
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

    listSongs(query: SongListQuery = {}): Promise<Song[]> {
      return songs.list(db, { ...query, search: query.search?.trim() });
    },

    countSongsByStatus(): Promise<Record<SongStatus, number>> {
      return songs.countByStatus(db);
    },

    /**
     * 曲を追加する。入力が不正なら `ServiceError`（`title-required` など）で
     * reject し、何も保存しない。存在しないタグIDを含む場合は `tag-not-found`。
     */
    async createSong(input: NewSongInput): Promise<Song> {
      const normalized = normalizeInput({
        title: input.title,
        artist: input.artist,
        status: input.status,
        keyOffset: input.keyOffset ?? 0,
        privateNote: input.privateNote ?? '',
        tagIds: input.tagIds ?? [],
      });
      return db.transaction(async (tx) => {
        await assertTagsExist(tx, normalized.tagIds);
        const id = await songs.insert(tx, normalized);
        await songs.replaceTags(tx, id, normalized.tagIds);
        return requireSong(tx, id);
      });
    },

    /**
     * 曲の編集画面の保存。全項目を渡した内容に置き換える（タグも渡した一覧になる）。
     * `updatedAt` は、内容が実際に変わったときだけ更新する。
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
