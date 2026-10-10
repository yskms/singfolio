import type { Database } from '../db/appDatabase.ts';
import type { RepositoryEnv } from '../repositories/env.ts';
import { createSettingsRepository } from '../repositories/settingsRepository.ts';
import {
  createSongCatalogRepository,
  type FetchLike,
} from '../repositories/songCatalogRepository.ts';
import { createSongRepository } from '../repositories/songRepository.ts';
import { createTagRepository } from '../repositories/tagRepository.ts';
import { createSettingsService, type SettingsService } from './settingsService.ts';
import { createSongService, type SongService } from './songService.ts';
import { createSuggestionsService, type SuggestionsService } from './suggestionsService.ts';
import { createTagService, type TagService } from './tagService.ts';

export interface Services {
  songs: SongService;
  tags: TagService;
  settings: SettingsService;
  suggestions: SuggestionsService;
}

export interface ServicesOptions {
  /**
   * 曲名・アーティストの候補を探す、外部の楽曲検索に使う `fetch`。渡さなければ、外部へは
   * 何も送らない（`suggestions.available` が `false`。設定の切替・提供元の表記も出さない）。
   * 提供元の利用条件が通らなかったときは、`index.ts` で渡さなければ、候補は登録済みの
   * アーティストだけになる。
   */
  catalogFetch?: FetchLike;
}

/**
 * Repository と Service を組み立てる。UIは Repository・DBに触れず、ここで作る
 * Service だけを使う（UIとDBを密結合させないため。公開機能などの追加も、
 * この境界の内側で行う）。Expoに依存しないので、Nodeのテストからも使える
 * （Expoに依存する組み立ては `index.ts`）。
 */
export function createServices(
  db: Database,
  env: RepositoryEnv,
  options: ServicesOptions = {},
): Services {
  const songRepository = createSongRepository(env);
  const tagRepository = createTagRepository(env);
  const settingsRepository = createSettingsRepository();
  const settings = createSettingsService({ db, settings: settingsRepository });
  return {
    songs: createSongService({ db, songs: songRepository, tags: tagRepository }),
    tags: createTagService({ db, tags: tagRepository }),
    settings,
    suggestions: createSuggestionsService({
      db,
      songs: songRepository,
      catalog: options.catalogFetch ? createSongCatalogRepository(options.catalogFetch) : null,
      isEnabled: () => settings.getSuggestionsEnabled(),
      now: env.now,
    }),
  };
}
