import type { Database } from '../db/appDatabase.ts';
import type { PublicProfile, ShowTag } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import { PublishError } from '../repositories/publishError.ts';
import type { PublishRepository } from '../repositories/publishRepository.ts';
import type { PublishState, PublishStateRepository } from '../repositories/publishStateRepository.ts';
import type { SessionAccess } from './accountService.ts';
import { buildPublishBody, songContentHash, type PublishSongSource } from './publishSnapshot.ts';
import type { ShowService } from './showService.ts';

export interface PublishServiceDeps {
  db: Database;
  /** 認証が要る呼び出しの入口（`accountService`）。サインインしていなければ、すべて `not-signed-in` */
  access: SessionAccess;
  publish: PublishRepository;
  state: PublishStateRepository;
  show: ShowService;
}

export interface PublishInput {
  /** Display Name（公開には要る。整えたあとで空なら `display-name-required`） */
  displayName: string;
  bio: string;
  /**
   * 置き換えの確認を受けたときに、サーバーの今の版（`version-conflict` の `profile.version`）を渡す。省略すると、この端末が
   * 最後に合意した版（`PublishState.baseVersion`）を使う。
   */
  replaceVersion?: number;
}

/**
 * 公開するタグの名前。**公開するタグの選び方（7.4.8）を入れるまでは、どのタグも公開しない**（安全側。タグは、人に見せる
 * 情報に含めるかを、利用者が選んで決める）。
 */
function publicTagNames(_tags: readonly ShowTag[]): string[] {
  return [];
}

/**
 * 公開（Public Profile・Publish・Unpublish）。**ログインを要求しない**（サインインしていなければ、どの操作も `not-signed-in`
 * で、端末の機能は何も変わらない）。失敗はすべて `AuthError`（通信・認証）か `PublishError`（サーバーが断った、アプリ側の前提の不備）。
 *
 * 公開する曲は、`show`（Show Mode の Service）から取る: Ready の曲だけが、My Key・Private Note・ステータスを持たない形で来る。
 * 順序は Show Mode のアーティスト順で、これが公開ページの既定の並び（`sortOrder`）になる。
 *
 * `publish`・`unpublish`・`claimUsername` は1本ずつ順に実行する（同じ端末の Publish が重なると、2つ目が1つ目の版を知らずに送って、
 * 自分自身と食い違う）。
 */
export function createPublishService({ db, access, publish, state, show }: PublishServiceDeps) {
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }

  // 呼び出し側（画面）が `code` で分類できるよう、`AuthError`・`PublishError` 以外の失敗は `unexpected` に包む。元の例外は載せない。
  async function known<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (error instanceof AuthError || error instanceof PublishError) throw error;
      throw new AuthError('unexpected');
    }
  }

  /** 端末側の記録（失敗は握りつぶす。サーバーでは済んだ操作を、失敗に見せない）。記録できなければ、次の Publish が版の食い違いになる。 */
  async function recordQuietly(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch {
      // 記録できなかった。次の Publish は、置き換えの確認を通る（サーバーの状態は変わらない）
    }
  }

  return {
    /** この端末が最後に合意した公開の状態。まだ（`username` を確保していない、別のアカウントになった）なら `null`。通信しない。 */
    getState(): Promise<PublishState | null> {
      return known(() => state.get(db));
    },

    /**
     * サーバーの、このアカウントの公開の状態（`username`・版・公開中か・最後に Publish した Display Name と Bio）。`null` は、
     * まだ `username` を確保していない。**端末の記録がサーバーのアカウントと合わない**（`username` が違う、サーバーに `username` が無い）
     * ときは、端末の記録を捨てる（別のアカウントでサインインし直した、アカウントを削除した）。端末の `baseVersion` は、ここでは
     * 進めない（別の端末の Publish を、確認なしに上書きしないため）。
     */
    refreshProfile(): Promise<PublicProfile | null> {
      return known(async () => {
        const profile = await access.withSession((session) => publish.getProfile(session));
        const current = await state.get(db);
        if (current !== null && (profile === null || current.username !== profile.username)) {
          await db.transaction((tx) => state.clear(tx));
        }
        return profile;
      });
    },

    /**
     * `username` を確保する（Publish より前に要る。変更できない）。小文字にして送る（サーバーは大文字を断る）。失敗: `username-invalid`・
     * `username-unavailable`・`username-already-set`。同じ名前をもう一度確保しても成功する。
     */
    claimUsername(username: string): Promise<PublicProfile> {
      return serialize(() =>
        known(async () => {
          const profile = await access.withSession((session) =>
            publish.claimUsername(session, username.trim().toLowerCase()),
          );
          const current = await state.get(db);
          // すでにこの `username` の記録があれば、触れない（確保のやり直しで、`baseVersion` を進めない）。別のアカウントの記録は捨てる。
          if (current === null || current.username !== profile.username) {
            await db.transaction(async (tx) => {
              await state.clear(tx);
              await state.set(tx, { username: profile.username, baseVersion: 0, displayName: '', bio: '' });
            });
          }
          return profile;
        }),
      );
    },

    /**
     * Ready の曲の今の内容で、公開内容を差し替える。成功は、版が+1された `Profile`。失敗: `display-name-required`・`too-many-songs`
     * （通信の前に断る）、`username-required`、`version-conflict`（`profile` が今の公開内容。別の端末が Publish した、または非公開にした。
     * 確認のうえ、`replaceVersion` に `profile.version` を渡して送り直す）、`invalid-snapshot`、`too-large`、通信の失敗（`AuthError`）。
     * 通信が切れた（`network`）ときは、サーバーで済んでいることがある（送り直すと `version-conflict` になる）。
     */
    publish(input: PublishInput): Promise<PublicProfile> {
      return serialize(() =>
        known(async () => {
          const current = await state.get(db);
          const baseVersion = input.replaceVersion ?? current?.baseVersion ?? 0;

          const view = await show.getShowView({ sort: 'artist' });
          const sources: PublishSongSource[] = view.groups.flatMap((group) =>
            group.songs.map((song) => ({
              id: song.id,
              title: song.title,
              artist: group.artist,
              publicTags: publicTagNames(song.tags),
            })),
          );
          const built = buildPublishBody({ baseVersion, displayName: input.displayName, bio: input.bio, songs: sources });
          if (!built.ok) {
            throw built.reason === 'too-many-songs'
              ? new PublishError('too-many-songs', { songCount: built.songCount })
              : new PublishError('display-name-required');
          }
          const { body } = built;

          const profile = await access.withSession((session) => publish.publish(session, body));

          // 送った内容（整えたあと）の記録。ここでの失敗は、Publish の失敗に見せない。
          const hashes = new Map(body.songs.map((song) => [song.id, songContentHash(song)]));
          await recordQuietly(() =>
            db.transaction(async (tx) => {
              await state.set(tx, {
                username: profile.username,
                baseVersion: profile.version,
                displayName: body.profile.displayName,
                bio: body.profile.bio,
              });
              await state.replaceHashes(tx, hashes);
            }),
          );
          return profile;
        }),
      );
    },

    /**
     * 公開スナップショットを消して、非公開にする（`username` は残る。端末内のレパートリーには触れない）。何度呼んでも同じ。
     * `username` が無ければ `null`（端末の記録も捨てる）。成功のあと、端末の `baseVersion` を、非公開にした版へ進める
     * （利用者が自分で非公開にした: 別の端末の Publish を、黙って上書きしているわけではない）。
     */
    unpublish(): Promise<PublicProfile | null> {
      return serialize(() =>
        known(async () => {
          const profile = await access.withSession((session) => publish.unpublish(session));
          const current = await state.get(db);
          await recordQuietly(() =>
            db.transaction(async (tx) => {
              if (profile === null) {
                await state.clear(tx);
                return;
              }
              const same = current !== null && current.username === profile.username;
              await state.set(tx, {
                username: profile.username,
                baseVersion: profile.version,
                displayName: same ? current.displayName : '',
                bio: same ? current.bio : '',
              });
              // 公開していない: 最後に Publish した曲の記録は空にする。
              await state.replaceHashes(tx, new Map());
            }),
          );
          return profile;
        }),
      );
    },
  };
}

export type PublishService = ReturnType<typeof createPublishService>;
