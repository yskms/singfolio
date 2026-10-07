import type { Database } from '../db/appDatabase.ts';
import type { Tag } from '../domain/types.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import { ServiceError } from './errors.ts';
import { normalizeTagName, tagNameKey } from './text.ts';

export interface TagServiceDeps {
  db: Database;
  tags: TagRepository;
}

// 書き込みは必ず `db.transaction` の中で行う（理由は db/appDatabase.ts）。
// 重複の確認から保存までが他の書き込みに割り込まれないのも、これによる。
export function createTagService({ db, tags }: TagServiceDeps) {
  function requireName(name: string): string {
    const normalized = normalizeTagName(name);
    if (normalized === '') throw new ServiceError('tag-name-required');
    return normalized;
  }

  return {
    /** タグ名の昇順（ASCIIの大文字小文字は区別しない）。 */
    listTags(): Promise<Tag[]> {
      return tags.list(db);
    },

    /**
     * 同じ名前のタグがあればそれを返し、なければ作る。曲の編集画面の
     * 「新規タグ作成」用で、既にあるタグ名を入力しても重複のエラーにならない。
     * 名前は正規化し（text.ts）、正規化後に同じ名前（大文字小文字を除く）のものを同一とみなす。
     */
    async getOrCreateTag(name: string): Promise<Tag> {
      const normalized = requireName(name);
      return db.transaction(async (tx) => {
        const key = tagNameKey(normalized);
        const existing = (await tags.list(tx)).find(
          (tag) => tagNameKey(tag.name) === key,
        );
        return existing ?? tags.insert(tx, normalized);
      });
    },

    /**
     * タグ名を変更する。別のタグと重複する名前は `tag-name-duplicate`。
     * 大文字小文字だけを変える（`rock` → `Rock`）のは、重複にならない。
     * 曲の `updatedAt` は変わらない。
     */
    async renameTag(id: string, name: string): Promise<Tag> {
      const normalized = requireName(name);
      return db.transaction(async (tx) => {
        const current = await tags.get(tx, id);
        if (!current) throw new ServiceError('tag-not-found');

        const key = tagNameKey(normalized);
        const duplicate = (await tags.list(tx)).some(
          (tag) => tag.id !== id && tagNameKey(tag.name) === key,
        );
        if (duplicate) throw new ServiceError('tag-name-duplicate');

        if (normalized === current.name) return current;
        await tags.rename(tx, id, normalized);
        return { ...current, name: normalized };
      });
    },

    /**
     * タグを削除する。付いていた曲からは外れ、曲は残る（曲の `updatedAt` は変わらない）。
     * 既に無いタグの削除は何もしない（二重タップで失敗にしないため）。
     */
    async deleteTag(id: string): Promise<void> {
      await db.transaction((tx) => tags.delete(tx, id));
    },
  };
}

export type TagService = ReturnType<typeof createTagService>;
