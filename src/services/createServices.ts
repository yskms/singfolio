import type { Database } from '../db/appDatabase.ts';
import type { RepositoryEnv } from '../repositories/env.ts';
import { createSongRepository } from '../repositories/songRepository.ts';
import { createTagRepository } from '../repositories/tagRepository.ts';
import { createSongService, type SongService } from './songService.ts';
import { createTagService, type TagService } from './tagService.ts';

export interface Services {
  songs: SongService;
  tags: TagService;
}

/**
 * Repository と Service を組み立てる。UIは Repository・DBに触れず、ここで作る
 * Service だけを使う（UIとDBを密結合させないため。公開機能などの追加も、
 * この境界の内側で行う）。Expoに依存しないので、Nodeのテストからも使える
 * （Expoに依存する組み立ては `index.ts`）。
 */
export function createServices(db: Database, env: RepositoryEnv): Services {
  const songRepository = createSongRepository(env);
  const tagRepository = createTagRepository(env);
  return {
    songs: createSongService({ db, songs: songRepository, tags: tagRepository }),
    tags: createTagService({ db, tags: tagRepository }),
  };
}
