import type { Database } from '../db/appDatabase.ts';
import type { PublicProfile, PublicTagChoice, UnpublishedChanges } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import type { PublicTagRepository } from '../repositories/publicTagRepository.ts';
import { PublishError } from '../repositories/publishError.ts';
import type { PublishRepository } from '../repositories/publishRepository.ts';
import type { PublishState, PublishStateRepository } from '../repositories/publishStateRepository.ts';
import type { TagRepository } from '../repositories/tagRepository.ts';
import type { SessionAccess } from './accountService.ts';
import { ServiceError } from './errors.ts';
import {
  buildPublishBody,
  buildPublishSongs,
  countSongChanges,
  songContentHash,
  type PublishSongSource,
} from './publishSnapshot.ts';
import type { ShowService } from './showService.ts';
import { normalizeUsernameInput } from './username.ts';

export interface PublishServiceDeps {
  db: Database;
  /** 認証が要る呼び出しの入口（`accountService`）。サインインしていなければ、すべて `not-signed-in` */
  access: SessionAccess;
  publish: PublishRepository;
  state: PublishStateRepository;
  show: ShowService;
  /** 公開に選んだタグの保存先（7.4.8。`public_tags`） */
  publicTags: PublicTagRepository;
  /** 公開に選べるタグ（端末のタグ）の読み取り */
  tags: TagRepository;
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
 * 公開（Public Profile・Publish・Unpublish）。**ログインを要求しない**（サインインしていなければ、どの操作も `not-signed-in`
 * で、端末の機能は何も変わらない）。サーバーとやりとりする操作の失敗は、すべて `AuthError`（通信・認証）か `PublishError`（サーバーが断った、
 * アプリ側の前提の不備）。**端末の中だけの操作は例外**: 公開タグの選択（`listPublicTagChoices`・`countPublicTags`・`setTagPublic`）と、未公開の変更の数え方
 * （`countUnpublishedChanges`）は、通信もサインインも要らず、失敗は `ServiceError`・DBのエラーのまま（数の2つ、`countPublicTags`・`countUnpublishedChanges` は、画面が補助の情報として受ける。
 * `setTagPublic` は Public Tags 画面の本来の操作で、失敗は画面が伝える）。
 *
 * 公開する曲は、`show`（Show Mode の Service）から取る: Ready の曲だけが、My Key・Private Note・ステータスを持たない形で来る。
 * 順序は Show Mode のアーティスト順で、これが公開ページの既定の並び（`sortOrder`）になる。
 *
 * `publish`・`unpublish`・`claimUsername`・`refreshProfile` は1本ずつ順に実行する（同じ端末の Publish が重なると、2つ目が1つ目の版を知らずに
 * 送って、自分自身と食い違う。`refreshProfile` は記録を捨てる処理を持つ）。
 */
export function createPublishService({ db, access, publish, state, show, publicTags, tags }: PublishServiceDeps) {
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

  /**
   * 端末の記録を、サーバーのこのアカウントの状態に合わせる: サーバーに `username` が無い、または記録の `username` と違えば、記録を捨てる
   * （別のアカウントでサインインし直した、アカウントを削除した）。`baseVersion` は進めない。直列化の外から呼ばない（呼ぶ側が
   * `serialize` の中にいる）。
   */
  async function reconcile(profile: PublicProfile | null): Promise<void> {
    const current = await state.get(db);
    if (current !== null && (profile === null || current.username !== profile.username)) {
      await db.transaction((tx) => state.clear(tx));
    }
  }

  /**
   * 公開する曲の元。Ready の曲だけが、Show Mode のアーティスト順（公開ページの既定の並び）で来る。**曲のタグのうち、公開に選んだタグ
   * （`public_tags`）だけ**を `publicTags` に入れる（選んでいないタグは、名前も送らない。7.4.8）。
   */
  async function loadSources(): Promise<PublishSongSource[]> {
    const [view, publicIds] = await Promise.all([show.getShowView({ sort: 'artist' }), publicTags.listIds(db)]);
    return view.groups.flatMap((group) =>
      group.songs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: group.artist,
        publicTags: song.tags.filter((tag) => publicIds.has(tag.id)).map((tag) => tag.name),
      })),
    );
  }

  return {
    /** この端末が最後に合意した公開の状態。まだ（`username` を確保していない、別のアカウントになった）なら `null`。通信しない。 */
    getState(): Promise<PublishState | null> {
      return known(() => state.get(db));
    },

    /**
     * 公開ページに出すタグの選択（7.4.8）。端末のすべてのタグを名前の昇順で返す。`readySongCount` は、そのタグが付いた Ready の曲の数
     * （選んだときに出る曲の数）。**端末内だけの設定で、通信しない・サインインも要らない**（失敗は `ServiceError`・DBのエラーのまま）。
     */
    async listPublicTagChoices(): Promise<PublicTagChoice[]> {
      const [all, publicIds, view] = await Promise.all([
        tags.list(db),
        publicTags.listIds(db),
        show.getShowView({ sort: 'artist' }),
      ]);
      const readyCounts = new Map<string, number>();
      for (const group of view.groups) {
        for (const song of group.songs) {
          for (const tag of song.tags) readyCounts.set(tag.id, (readyCounts.get(tag.id) ?? 0) + 1);
        }
      }
      return all.map((tag) => ({
        id: tag.id,
        name: tag.name,
        isPublic: publicIds.has(tag.id),
        readySongCount: readyCounts.get(tag.id) ?? 0,
      }));
    },

    /**
     * 公開に選んだタグの数（Public Profile の行の値）。`public_tags` の件数だけを読む（`listPublicTagChoices` のように、Ready の曲を全件は読まない）。
     * **数えるのは、オンにしたタグ**（Public Tags 画面のスイッチと同じ数）で、公開ページに実際に出るタグの数ではない（Ready の曲に付いていないタグも数える）。
     */
    countPublicTags(): Promise<number> {
      return publicTags.count(db);
    },

    /**
     * タグを公開ページに出すか（`isPublic`）を決める。既定は、どのタグも出さない。次の Publish から反映される（公開中の内容はすぐには変わらない）。
     * 同じ値をもう一度設定しても成功する。存在しないタグを公開に選ぶと `tag-not-found`（外すときは何もしない）。タグを消すと選択も消える
     * （作り直した同じ名前のタグが、黙って公開されない）。名前を変えると、公開されるタグの名前も、次の Publish で変わる。
     */
    setTagPublic(tagId: string, isPublic: boolean): Promise<void> {
      return db.transaction(async (tx) => {
        if (!isPublic) {
          await publicTags.remove(tx, tagId);
          return;
        }
        if ((await tags.get(tx, tagId)) === null) throw new ServiceError('tag-not-found');
        await publicTags.add(tx, tagId);
      });
    },

    /**
     * 最後に Publish したあとの、公開する曲の変更の数（「N unpublished changes」。7.4.9a）。**通信しない**。曲ごとに1つと数える
     * （曲名・アーティスト・公開タグのどれが変わっても1つ。Ready になった・Ready でなくなった・削除も）。並びと、Display Name・Bio の下書きは数えない。
     *
     * `profile` は、呼ぶ側が最後に読んだ、サーバーの状態（`refreshProfile`・Publish の応答・版の食い違いの `profile`）。この関数は、サーバーに聞き直さない
     * （渡された `profile` が古ければ、数も、その時点に対する値になる）。**数えられるのは、端末の記録が、その `profile` の公開内容そのもののとき**だけ:
     * 公開中で、記録の `username` と `baseVersion` が一致する。そうでなければ `null`（数えない）。
     * 記録が無い（再インストール後）、前のアカウントのもの、別の端末が Publish した（記録より新しい版がある。`profile` がそれを読んだあと）ときは、
     * 端末の記録は、公開内容と比べる基準にならない。次の Publish は、版の食い違いの確認を通る。
     * 失敗（DBの読み取り）は、そのまま投げる。
     * `publish`・`unpublish` などと直列に実行する（待つのは、実行中の操作が終わるまで）。
     */
    countUnpublishedChanges(profile: PublicProfile): Promise<UnpublishedChanges | null> {
      if (!profile.published) return Promise.resolve(null);
      // 端末の記録（`publish_state` と `published_songs`）を書く操作と直列にする（Publish の途中の、一部だけ新しい記録を読まない）。
      return serialize(async () => {
        const [current, hashes, sources] = await Promise.all([state.get(db), state.listHashes(db), loadSources()]);
        if (current === null || current.username !== profile.username || current.baseVersion !== profile.version) return null;
        return countSongChanges(hashes, buildPublishSongs(sources));
      });
    },

    /**
     * サーバーの、このアカウントの公開の状態（`username`・版・公開中か・最後に Publish した Display Name と Bio）。`null` は、
     * まだ `username` を確保していない。**端末の記録がサーバーのアカウントと合わない**（`username` が違う、サーバーに `username` が無い）
     * ときは、端末の記録を捨てる（別のアカウントでサインインし直した、アカウントを削除した）。端末の `baseVersion` は、ここでは
     * 進めない（別の端末の Publish を、確認なしに上書きしないため）。
     */
    refreshProfile(): Promise<PublicProfile | null> {
      // 記録を捨てる処理を持つので、ほかの操作と直列にする（`claimUsername` が書いた直後の記録を、確保の前に読んだ状態で消さない）。
      return serialize(() =>
        known(async () => {
          const profile = await access.withSession((session) => publish.getProfile(session));
          await reconcile(profile);
          return profile;
        }),
      );
    },

    /**
     * `username` を確保する（Publish より前に要る。変更できない）。小文字にして送る（サーバーは大文字を断る）。失敗: `username-invalid`・
     * `username-unavailable`・`username-already-set`。同じ名前をもう一度確保しても成功する。
     */
    claimUsername(username: string): Promise<PublicProfile> {
      return serialize(() =>
        known(async () => {
          const profile = await access.withSession((session) =>
            publish.claimUsername(session, normalizeUsernameInput(username)),
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
     *
     * 本文を送る前に、同じセッションでサーバーの状態を読み、端末の記録が今のアカウントのものと確かめてから `baseVersion` を決める
     * （別のアカウントでサインインし直したあと、前のアカウントの版で、確認なしに上書きしないため）。サーバーに `username` が無い、または
     * 版が食い違うときは、本文を送らずに断る。
     */
    publish(input: PublishInput): Promise<PublicProfile> {
      return serialize(() =>
        known(async () => {
          const sources = await loadSources();
          // 通信の前に、内容を確かめる（`baseVersion` は、サーバーの状態を見てから入れる）。
          const built = buildPublishBody({ baseVersion: 0, displayName: input.displayName, bio: input.bio, songs: sources });
          if (!built.ok) {
            throw built.reason === 'too-many-songs'
              ? new PublishError('too-many-songs', { songCount: built.songCount })
              : new PublishError('display-name-required');
          }
          const { body: draft } = built;

          // サーバーの今の状態を読み、端末の記録が**今のアカウントのもの**だと確かめてから、`baseVersion` を決める（同じセッションで続ける）。
          // 確かめずに記録の `baseVersion` を使うと、別のアカウントでサインインし直したあと、前のアカウントの版が、たまたま今のアカウントの
          // 版と同じとき、確認なしに別の端末の公開を上書きする。版の食い違いは、本文を送る前に見つける（大きな本文を無駄に送らない）。
          // 読んだあとに別の端末が Publish しても、サーバーの照合（`baseVersion`）が 409 にする。
          const profile = await access.withSession(async (session) => {
            const server = await publish.getProfile(session);
            await reconcile(server);
            if (server === null) throw new PublishError('username-required');
            const current = await state.get(db);
            const baseVersion = input.replaceVersion ?? current?.baseVersion ?? 0;
            if (baseVersion !== server.version) throw new PublishError('version-conflict', { profile: server });
            return publish.publish(session, { ...draft, baseVersion });
          });

          // 送った内容（整えたあと）の記録。ここでの失敗は、Publish の失敗に見せない。
          const hashes = new Map(draft.songs.map((song) => [song.id, songContentHash(song)]));
          await recordQuietly(() =>
            db.transaction(async (tx) => {
              await state.set(tx, {
                username: profile.username,
                baseVersion: profile.version,
                displayName: draft.profile.displayName,
                bio: draft.profile.bio,
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
          // 端末の記録は、サーバーで済んだあとの後始末。読めなくても、非公開にできたことは変わらない。
          await recordQuietly(() =>
            db.transaction(async (tx) => {
              if (profile === null) {
                await state.clear(tx);
                return;
              }
              const current = await state.get(tx);
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
