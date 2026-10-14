import type { Database } from '../db/appDatabase.ts';
import { createArtistRepository } from '../repositories/artistRepository.ts';
import type { RepositoryEnv } from '../repositories/env.ts';
import { createSettingsRepository } from '../repositories/settingsRepository.ts';
import {
  createSongCatalogRepository,
  type FetchLike,
} from '../repositories/songCatalogRepository.ts';
import { createSongRepository } from '../repositories/songRepository.ts';
import { createTagRepository } from '../repositories/tagRepository.ts';
import { createArtistService, type ArtistService } from './artistService.ts';
import { createSettingsService, type SettingsService } from './settingsService.ts';
import { createShowService, type ShowService } from './showService.ts';
import { createSongService, type SongService } from './songService.ts';
import { createSuggestionsService, type SuggestionsService } from './suggestionsService.ts';
import { createTagService, type TagService } from './tagService.ts';

export interface Services {
  songs: SongService;
  tags: TagService;
  /** アーティスト（名前と読み）の一覧と変更（Artists 画面）。曲の保存は `songs` */
  artists: ArtistService;
  /** Show Mode（人に見せる画面）用。Readyの曲だけを、管理情報を持たない形で返す */
  show: ShowService;
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
  const artistRepository = createArtistRepository(env);
  const settingsRepository = createSettingsRepository();
  const settings = createSettingsService({ db, settings: settingsRepository });
  const songs = createSongService({
    db,
    songs: songRepository,
    tags: tagRepository,
    artists: artistRepository,
  });
  const tags = createTagService({ db, tags: tagRepository });
  return {
    songs,
    tags,
    artists: createArtistService({ db, artists: artistRepository }),
    show: createShowService({ songs, tags }),
    settings,
    suggestions: createSuggestionsService({
      db,
      songs: songRepository,
      artists: artistRepository,
      catalog: options.catalogFetch ? createSongCatalogRepository(options.catalogFetch) : null,
      isEnabled: () => settings.getSuggestionsEnabled(),
      now: env.now,
    }),
  };
}
