import { observeCommits, type Database } from '../db/appDatabase.ts';
import type { AuthProvider } from '../domain/types.ts';
import { createArtistRepository } from '../repositories/artistRepository.ts';
import { createAuthRepository, type AuthFetchLike } from '../repositories/authRepository.ts';
import { createPublicTagRepository } from '../repositories/publicTagRepository.ts';
import { createPublishRepository } from '../repositories/publishRepository.ts';
import { createPublishStateRepository } from '../repositories/publishStateRepository.ts';
import type { RepositoryEnv } from '../repositories/env.ts';
import { createSessionRepository, type SecureStorage } from '../repositories/sessionRepository.ts';
import { createSettingsRepository } from '../repositories/settingsRepository.ts';
import {
  createSongCatalogRepository,
  type FetchLike,
} from '../repositories/songCatalogRepository.ts';
import { createSongRepository } from '../repositories/songRepository.ts';
import { createTagRepository } from '../repositories/tagRepository.ts';
import {
  createAccountService,
  type AccountService,
  type AuthCodeProvider,
  type IdTokenProvider,
} from './accountService.ts';
import { createArtistService, type ArtistService } from './artistService.ts';
import { createAutoPublishService, type AutoPublishService, type AutoPublishTimers } from './autoPublishService.ts';
import { createPublishService, type PublishService } from './publishService.ts';
import { createSettingsService, type SettingsService } from './settingsService.ts';
import { createShowService, type ShowService } from './showService.ts';
import { createSongService, type SongService } from './songService.ts';
import { createSuggestionsService, type SuggestionsService } from './suggestionsService.ts';
import { createTagService, type TagService } from './tagService.ts';

// `auth` を注入しないビルドの公開の Repository に渡す。呼ばれることは無い（`access` が先に断る）。
const noFetch: AuthFetchLike = async () => {
  throw new Error('network is not available');
};

export interface Services {
  songs: SongService;
  tags: TagService;
  /** アーティスト（名前と読み）の一覧と変更（Artists 画面）。曲の保存は `songs` */
  artists: ArtistService;
  /** Show Mode（人に見せる画面）用。Readyの曲だけを、管理情報を持たない形で返す */
  show: ShowService;
  settings: SettingsService;
  suggestions: SuggestionsService;
  /** アカウント（ログイン・ログアウト）。ログインを要求しない: 使えなくても、v1.0の機能は変わらない */
  account: AccountService;
  /**
   * 公開（Public Profile・Publish・Unpublish）。サインインしていなければ、どの操作も `not-signed-in`（`account.available` が
   * 偽のビルドでは、画面が入口ごと出さない）。画面が呼ぶまで、何も送らない
   */
  publish: PublishService;
  /**
   * Auto Publish（公開中のページへ、曲の変更を、待ってまとめて自動で送る。7.4.9b）。設定（既定はオフ）・状態・購読。`auth` を注入しないビルドでは、
   * 何も監視せず、何も送らない（`start`・`flush` も、呼ばれない）。
   */
  autoPublish: AutoPublishService;
}

/** アカウントの通信・保存に使うもの。渡さなければ、`account` はサインインできない（常にログアウト中）。 */
export interface AuthOptions {
  /** グローバルの `fetch`。送るのは、`POST /auth/*` だけ（`authRepository`） */
  fetch: AuthFetchLike;
  /** セッションの保存先（SecureStore） */
  storage: SecureStorage;
  /** 文字列の SHA-256 を base64url（パディングなし）にする */
  sha256Base64Url(text: string): Promise<string>;
  /** 組み込み済みの各社のサインイン（7.3.7 以降）。無い手段は `provider-unavailable` */
  idTokenProviders?: Partial<Record<AuthProvider, IdTokenProvider>>;
  /** 組み込み済みの、認可コードを返すサインイン（AndroidのApple。7.3.9） */
  authCodeProviders?: Partial<Record<AuthProvider, AuthCodeProvider>>;
  /** 検証用の値 `V`（乱数の base64url。43字）を作る。`authCodeProviders` を渡すときに要る */
  randomVerifier?: () => string;
  /** APIの置き場（既定は本番）。テスト用 */
  origin?: string;
}

export interface ServicesOptions {
  /**
   * 曲名・アーティストの候補を探す、外部の楽曲検索に使う `fetch`。渡さなければ、外部へは
   * 何も送らない（`suggestions.available` が `false`。設定の切替・提供元の表記も出さない）。
   * 提供元の利用条件が通らなかったときは、`index.ts` で渡さなければ、候補は登録済みの
   * アーティストだけになる。
   */
  catalogFetch?: FetchLike;
  /**
   * アカウントの通信・保存。渡さなければ、`account` は使えない（ログアウト中のまま）。
   * 渡す側は `index.ts`（アプリ）とテストだけ。
   */
  auth?: AuthOptions;
  /** Auto Publish の待ち時間の計り方。テストだけが渡す（既定は `setTimeout`） */
  autoPublishTimers?: AutoPublishTimers;
  /** アプリが前面にあるか。Auto Publish は、背景では確認を始めない（既定は常に前面。`index.ts` が `AppState` から渡す） */
  isForeground?: () => boolean;
}

/**
 * Repository と Service を組み立てる。UIは Repository・DBに触れず、ここで作る
 * Service だけを使う（UIとDBを密結合させないため。公開機能などの追加も、
 * この境界の内側で行う）。Expoに依存しないので、Nodeのテストからも使える
 * （Expoに依存する組み立ては `index.ts`）。
 */
export function createServices(
  baseDb: Database,
  env: RepositoryEnv,
  options: ServicesOptions = {},
): Services {
  const { auth } = options;
  // 端末のDBへの書き込みを、Auto Publish のきっかけにする（どの Service が書いても漏れない。`auth` を注入しないビルドは、監視しない）。
  // Auto Publish は、Service を組み立てたあとに作る（Service が使う `db` を、先に作る必要がある）ので、通知の宛先は、あとから入れる。
  const changeListener: { current: () => void } = { current: () => {} };
  const db = auth ? observeCommits(baseDb, () => changeListener.current()) : baseDb;
  const songRepository = createSongRepository(env);
  const tagRepository = createTagRepository(env);
  const artistRepository = createArtistRepository(env);
  const settingsRepository = createSettingsRepository();
  const settings = createSettingsService({ db, settings: settingsRepository, newId: env.newId });
  const songs = createSongService({
    db,
    songs: songRepository,
    tags: tagRepository,
    artists: artistRepository,
  });
  const tags = createTagService({ db, tags: tagRepository });
  const show = createShowService({ songs, tags });
  // `access`（セッションの値を渡す入口）は公開の Service だけに渡し、画面へ届く `account` には含めない。
  const { access, ...account } = createAccountService(
    auth
      ? {
          auth: createAuthRepository(auth.fetch, { origin: auth.origin }),
          sessions: createSessionRepository(auth.storage),
          sha256Base64Url: auth.sha256Base64Url,
          localDataId: () => settings.ensureLocalDataId(),
          idTokenProviders: auth.idTokenProviders ?? {},
          authCodeProviders: auth.authCodeProviders ?? {},
          randomVerifier: auth.randomVerifier,
        }
      : null,
  );
  const publish = createPublishService({
    db,
    access,
    // `auth` を注入しないビルドでは、`access` が `not-signed-in` で断るので、この `fetch` は呼ばれない。
    publish: createPublishRepository(auth ? auth.fetch : noFetch, { origin: auth?.origin }),
    state: createPublishStateRepository(),
    show,
    publicTags: createPublicTagRepository(),
    tags: tagRepository,
    settings: settingsRepository,
  });
  const autoPublish = createAutoPublishService({
    settings,
    publish,
    timers: options.autoPublishTimers,
    isForeground: options.isForeground,
  });
  changeListener.current = () => autoPublish.notifyChanged();
  return {
    songs,
    tags,
    artists: createArtistService({ db, artists: artistRepository }),
    show,
    settings,
    suggestions: createSuggestionsService({
      db,
      songs: songRepository,
      artists: artistRepository,
      catalog: options.catalogFetch ? createSongCatalogRepository(options.catalogFetch) : null,
      isEnabled: () => settings.getSuggestionsEnabled(),
      now: env.now,
    }),
    account,
    publish,
    autoPublish,
  };
}
