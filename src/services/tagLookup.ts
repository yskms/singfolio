import type { WriteExecutor } from '../db/appDatabase.ts';
import type { Tag } from '../domain/types.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import { ServiceError } from './errors.ts';
import { normalizeTagName, tagNameKey } from './text.ts';

/**
 * 同じ名前のタグがあればそれを返し、なければ作る。`tx`（`Database.transaction` の中）で呼ぶ。
 * 名前は正規化し（text.ts）、正規化後に同じ名前（大文字小文字を除く）のものを同一とみなす。
 * 空の名前は `tag-name-required`。
 *
 * タグだけを作る `tagService.getOrCreateTag` と、曲の保存と一緒にタグを作る
 * `songService`（`newTagNames`）が共有する。後者は、曲の保存が失敗したとき、作ったタグも
 * 残らないよう、曲の書き込みと同じトランザクションの中で呼ぶ。
 */
export async function findOrCreateTag(
  tx: WriteExecutor,
  tags: TagRepository,
  name: string,
): Promise<Tag> {
  const normalized = normalizeTagName(name);
  if (normalized === '') throw new ServiceError('tag-name-required');
  const key = tagNameKey(normalized);
  const existing = (await tags.list(tx)).find((tag) => tagNameKey(tag.name) === key);
  return existing ?? tags.insert(tx, normalized);
}
