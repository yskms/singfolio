// 公開（Public Profile・Publish・Unpublish）の Service のテスト。`npm test` で実行する。実際のSQL（node:sqlite）に対して動かし、
// サーバー（HTTP）とセッションは偽物。実機のexpo-sqliteと、本物のWorkerでの確認は 7.4.11。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PublicProfile, SongStatus } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import { PublishError } from '../repositories/publishError.ts';
import type { PublishRepository } from '../repositories/publishRepository.ts';
import { createPublicTagRepository } from '../repositories/publicTagRepository.ts';
import { createPublishStateRepository } from '../repositories/publishStateRepository.ts';
import { createSettingsRepository } from '../repositories/settingsRepository.ts';
import { createTagRepository } from '../repositories/tagRepository.ts';
import { createTestServices } from '../testing/testDatabase.ts';
import { ServiceError } from './errors.ts';
import type { SessionAccess } from './accountService.ts';
import { createPublishService } from './publishService.ts';
import { PUBLISH_LIMITS, songContentHash, type PublishBody } from './publishSnapshot.ts';

/** 偽のサーバー。`baseVersion` の照合と版の+1は、Worker と同じ。 */
function fakeServer(initial: PublicProfile | null) {
  const server = { profile: initial, published: [] as PublishBody[], calls: [] as string[] };
  const repo: PublishRepository = {
    getProfile: async () => {
      server.calls.push('getProfile');
      return server.profile;
    },
    claimUsername: async (_session, username) => {
      server.calls.push(`claim:${username}`);
      server.profile ??= { username, version: 0, published: false, publishedAt: null, displayName: '', bio: '' };
      return server.profile;
    },
    publish: async (_session, body) => {
      server.calls.push('publish');
      const request = body as PublishBody;
      if (server.profile === null) throw new PublishError('username-required');
      if (request.baseVersion !== server.profile.version) {
        throw new PublishError('version-conflict', { profile: server.profile });
      }
      server.published.push(request);
      server.profile = {
        ...server.profile,
        version: server.profile.version + 1,
        published: true,
        publishedAt: 5_000,
        displayName: request.profile.displayName,
        bio: request.profile.bio,
      };
      return server.profile;
    },
    unpublish: async () => {
      server.calls.push('unpublish');
      if (server.profile === null) return null;
      server.profile = { ...server.profile, version: server.profile.version + 1, published: false, publishedAt: null };
      return server.profile;
    },
  };
  return { server, repo };
}

const signedIn: SessionAccess = { withSession: (task) => task('SESSION') };
const signedOut: SessionAccess = {
  withSession: async () => {
    throw new AuthError('not-signed-in');
  },
};

const profileV = (version: number, username = 'karaoke_fan'): PublicProfile => ({
  username,
  version,
  published: version > 0,
  publishedAt: version > 0 ? 1 : null,
  displayName: 'Other',
  bio: '',
});

async function setup(options: { profile?: PublicProfile | null; access?: SessionAccess } = {}) {
  const t = await createTestServices();
  const fake = fakeServer(options.profile === undefined ? profileV(0) : options.profile);
  const state = createPublishStateRepository();
  const publicTags = createPublicTagRepository();
  // 読み取りだけに使う（IDや時刻は作らない）。
  const tagRepository = createTagRepository({ newId: () => 'unused', now: () => 0 });
  const service = createPublishService({
    db: t.db,
    access: options.access ?? signedIn,
    publish: fake.repo,
    state,
    show: t.services.show,
    publicTags,
    tags: tagRepository,
    settings: createSettingsRepository(),
  });
  const add = (title: string, artist: string, status: SongStatus = 'ready', extra: { privateNote?: string; keyOffset?: number } = {}) =>
    t.services.songs.createSong({ title, artist, status, ...extra });
  return { ...t, ...fake, service, state, publicTags, tagRepository, add };
}

const INPUT = { displayName: 'Karaoke Fan', bio: 'bio' };

async function rejectsPublish(promise: Promise<unknown>, code: string): Promise<PublishError> {
  let caught: PublishError | undefined;
  await assert.rejects(promise, (error) => {
    if (error instanceof PublishError && error.code === code) {
      caught = error;
      return true;
    }
    return false;
  });
  return caught!;
}
async function rejectsAuth(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AuthError && error.code === code);
}

describe('publish: 送る内容', () => {
  it('Ready の曲だけを、アーティスト順・曲名順で送る。My Key・Private Note・ステータス・タグは送らない', async () => {
    const t = await setup();
    await t.services.songs.createSong({
      title: 'Sign',
      artist: 'Beta',
      status: 'ready',
      keyOffset: 3,
      privateNote: 'ひみつのメモ',
      newTagNames: ['ballad'],
    });
    await t.add('Alive', 'Alpha');
    await t.add('Zebra', 'Alpha');
    await t.add('Practicing', 'Alpha', 'practice');
    await t.add('Wanted', 'Gamma', 'want');

    await t.service.publish(INPUT);

    const body = t.server.published[0]!;
    assert.deepEqual(
      body.songs.map((s) => [s.title, s.artist, s.sortOrder]),
      [
        ['Alive', 'Alpha', 0],
        ['Zebra', 'Alpha', 1],
        ['Sign', 'Beta', 2],
      ],
    );
    assert.deepEqual(body.profile, { displayName: 'Karaoke Fan', bio: 'bio' });
    const text = JSON.stringify(body);
    for (const leaked of ['ひみつのメモ', 'keyOffset', 'ballad', 'Practicing', 'Wanted']) {
      assert.equal(text.includes(leaked), false, leaked);
    }
    // 公開に選んでいないタグは、公開しない（名前も送らない）。
    assert.ok(body.songs.every((s) => s.publicTags.length === 0));
  });

  it('Display Name が空・曲が上限を超えるときは、通信の前に断る', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await rejectsPublish(t.service.publish({ displayName: '  ', bio: '' }), 'display-name-required');
    assert.deepEqual(t.server.calls, []);

    // 上限を超える曲を、DBへ直接入れる（createSong を1000回呼ぶより速い）。
    t.sqlite.exec(`INSERT INTO artists (id, name, reading, created_at) VALUES ('a1', 'Bulk', 'Bulk', 1)`);
    const insert = t.sqlite.prepare(
      `INSERT INTO songs (id, title, artist_id, status, created_at, updated_at) VALUES (?, ?, 'a1', 'ready', 1, 1)`,
    );
    for (let i = 0; i < PUBLISH_LIMITS.songs; i += 1) insert.run(`bulk-${i}`, `t${i}`);
    const error = await rejectsPublish(t.service.publish(INPUT), 'too-many-songs');
    assert.equal(error.songCount, PUBLISH_LIMITS.songs + 1);
    assert.deepEqual(t.server.calls, []);
  });
});

describe('publish: 公開するタグ（7.4.8）', () => {
  async function tagId(t: Awaited<ReturnType<typeof setup>>, name: string): Promise<string> {
    const tag = (await t.services.tags.listTags()).find((candidate) => candidate.name === name);
    assert.ok(tag, name);
    return tag.id;
  }

  it('公開に選んだタグだけが、Ready の曲の publicTags に入る。選んでいないタグの名前は本文に出ない', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad', 'secret'] });
    await t.services.songs.createSong({ title: 'B', artist: 'X', status: 'ready', newTagNames: ['rock'] });
    await t.service.setTagPublic(await tagId(t, 'ballad'), true);
    await t.service.setTagPublic(await tagId(t, 'rock'), true);

    await t.service.publish(INPUT);

    const body = t.server.published[0]!;
    assert.deepEqual(
      body.songs.map((s) => [s.title, s.publicTags]),
      [
        ['A', ['ballad']],
        ['B', ['rock']],
      ],
    );
    assert.equal(JSON.stringify(body).includes('secret'), false);
  });

  it('Ready でない曲のタグは公開しない（選んだタグでも、その曲は公開されない）', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'Practicing', artist: 'X', status: 'practice', newTagNames: ['hidden'] });
    await t.add('Alive', 'X');
    await t.service.setTagPublic(await tagId(t, 'hidden'), true);

    await t.service.publish(INPUT);

    const text = JSON.stringify(t.server.published[0]);
    assert.equal(text.includes('hidden'), false);
    assert.equal(text.includes('Practicing'), false);
  });

  it('既定は、どのタグも公開しない。外すと次の Publish から出なくなる', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    await t.service.publish(INPUT);
    assert.deepEqual(t.server.published[0]!.songs[0]!.publicTags, []);

    const id = await tagId(t, 'ballad');
    await t.service.setTagPublic(id, true);
    await t.service.publish(INPUT);
    assert.deepEqual(t.server.published[1]!.songs[0]!.publicTags, ['ballad']);

    await t.service.setTagPublic(id, false);
    await t.service.publish(INPUT);
    assert.deepEqual(t.server.published[2]!.songs[0]!.publicTags, []);
  });

  it('タグの名前を変えると、次の Publish では新しい名前で出る（選択はIDに付く）', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    const id = await tagId(t, 'ballad');
    await t.service.setTagPublic(id, true);

    await t.services.tags.renameTag(id, 'slow song');
    await t.service.publish(INPUT);
    assert.deepEqual(t.server.published[0]!.songs[0]!.publicTags, ['slow song']);
  });

  it('タグを消すと選択も消える。同じ名前で作り直したタグは、黙って公開されない', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    await t.service.setTagPublic(await tagId(t, 'ballad'), true);

    await t.services.tags.deleteTag(await tagId(t, 'ballad'));
    assert.equal(
      Number((t.sqlite.prepare('SELECT COUNT(*) AS n FROM public_tags').get() as { n: number }).n),
      0,
    );

    const song = (await t.services.songs.listSongs({}))[0]!;
    await t.services.songs.updateSong(song.id, {
      title: 'A',
      artist: 'X',
      status: 'ready',
      keyOffset: 0,
      privateNote: '',
      tagIds: [],
      newTagNames: ['ballad'],
    });
    await t.service.publish(INPUT);
    assert.deepEqual(t.server.published[0]!.songs[0]!.publicTags, []);
  });

  it('選択を変えると、その曲のハッシュが変わる（7.4.9 の「未公開の変更」の数え方が拾える）。付いていない曲は変わらない', async () => {
    const t = await setup();
    const tagged = await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    const plain = await t.add('B', 'X');
    await t.service.publish(INPUT);
    const before = await t.state.listHashes(t.db);

    await t.service.setTagPublic(await tagId(t, 'ballad'), true);
    await t.service.publish(INPUT);
    const after = await t.state.listHashes(t.db);

    assert.notEqual(after.get(tagged.id), before.get(tagged.id));
    assert.equal(after.get(plain.id), before.get(plain.id));
  });

  it('1曲に付く公開タグは10個まで（超えた分は、公開ページに出ない）', async () => {
    const t = await setup();
    const names = Array.from({ length: PUBLISH_LIMITS.tagsPerSong + 2 }, (_, i) => `tag${String(i).padStart(2, '0')}`);
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: names });
    for (const name of names) await t.service.setTagPublic(await tagId(t, name), true);

    await t.service.publish(INPUT);

    assert.equal(t.server.published[0]!.songs[0]!.publicTags.length, PUBLISH_LIMITS.tagsPerSong);
  });

  describe('listPublicTagChoices / setTagPublic', () => {
    it('すべてのタグを名前の昇順で返す。選択の有無と、付いている Ready の曲の数つき', async () => {
      const t = await setup();
      await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['rock', 'ballad'] });
      await t.services.songs.createSong({ title: 'B', artist: 'X', status: 'ready', newTagNames: ['rock'] });
      await t.services.songs.createSong({ title: 'C', artist: 'X', status: 'practice', newTagNames: ['rock', 'only practice'] });
      await t.services.tags.getOrCreateTag('unused');
      await t.service.setTagPublic(await tagId(t, 'rock'), true);

      const choices = await t.service.listPublicTagChoices();
      assert.deepEqual(
        choices.map((c) => [c.name, c.isPublic, c.readySongCount]),
        [
          ['ballad', false, 1],
          ['only practice', false, 0],
          ['rock', true, 2],
          ['unused', false, 0],
        ],
      );
    });

    it('countPublicTags は、オンにしたタグの数だけを返す（Ready の曲に付いていないタグも数える。消したタグは数えない）', async () => {
      const t = await setup();
      assert.equal(await t.service.countPublicTags(), 0);
      await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
      await t.services.songs.createSong({ title: 'B', artist: 'X', status: 'practice', newTagNames: ['only practice'] });
      await t.service.setTagPublic(await tagId(t, 'ballad'), true);
      await t.service.setTagPublic(await tagId(t, 'only practice'), true);
      assert.equal(await t.service.countPublicTags(), 2);
      // 数は、Public Tags 画面でオンのスイッチの数と同じ。
      assert.equal((await t.service.listPublicTagChoices()).filter((c) => c.isPublic).length, 2);

      await t.service.setTagPublic(await tagId(t, 'ballad'), false);
      assert.equal(await t.service.countPublicTags(), 1);
      await t.services.tags.deleteTag(await tagId(t, 'only practice'));
      assert.equal(await t.service.countPublicTags(), 0);
    });

    it('通信しない・サインインも要らない（端末内だけの設定）', async () => {
      const t = await setup({ access: signedOut });
      await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
      const id = await tagId(t, 'ballad');

      await t.service.setTagPublic(id, true);
      assert.equal((await t.service.listPublicTagChoices())[0]!.isPublic, true);
      assert.deepEqual(t.server.calls, []);
    });

    it('同じ値をもう一度設定しても成功する。存在しないタグを選ぶと tag-not-found、外すときは何もしない', async () => {
      const t = await setup();
      await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
      const id = await tagId(t, 'ballad');

      await t.service.setTagPublic(id, true);
      await t.service.setTagPublic(id, true);
      assert.equal((await t.service.listPublicTagChoices())[0]!.isPublic, true);
      await t.service.setTagPublic(id, false);
      await t.service.setTagPublic(id, false);
      assert.equal((await t.service.listPublicTagChoices())[0]!.isPublic, false);

      await assert.rejects(
        t.service.setTagPublic('missing', true),
        (error) => error instanceof ServiceError && error.code === 'tag-not-found',
      );
      await t.service.setTagPublic('missing', false);
    });
  });
});

describe('publish: 端末の記録と版', () => {
  it('成功したら、username・版・Display Name・Bio と、曲ごとのハッシュを記録する。次の Publish はその版を baseVersion にする', async () => {
    const t = await setup();
    const song = await t.add('Alive', 'Alpha');

    const first = await t.service.publish(INPUT);
    assert.equal(first.version, 1);
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 1, displayName: 'Karaoke Fan', bio: 'bio' });
    const hashes = await t.state.listHashes(t.db);
    assert.deepEqual([...hashes.keys()], [song.id]);
    assert.equal(hashes.get(song.id), songContentHash(t.server.published[0]!.songs[0]!));

    await t.service.publish(INPUT);
    assert.equal(t.server.published[1]!.baseVersion, 1);
    assert.equal((await t.service.getState())?.baseVersion, 2);
  });

  it('Publish ごとに、曲の記録は丸ごと入れ替わる（Ready でなくなった曲は消える）', async () => {
    const t = await setup();
    const a = await t.add('A', 'X');
    const b = await t.add('B', 'X');
    await t.service.publish(INPUT);
    assert.deepEqual([...(await t.state.listHashes(t.db)).keys()].sort(), [a.id, b.id].sort());

    await t.services.songs.setStatus(b.id, 'practice');
    await t.service.publish(INPUT);
    assert.deepEqual([...(await t.state.listHashes(t.db)).keys()], [a.id]);
  });

  it('別の端末が Publish していたら version-conflict（サーバーの今の内容つき）。端末の baseVersion は進めない', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT); // base 0 -> 1
    t.server.profile = profileV(5); // 別の端末が公開した

    const error = await rejectsPublish(t.service.publish(INPUT), 'version-conflict');
    assert.equal(error.profile?.version, 5);
    assert.equal((await t.service.getState())?.baseVersion, 1);
    assert.equal(t.server.published.length, 1);
  });

  it('置き換えの確認のあと、replaceVersion を baseVersion にして送り直せる', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    t.server.profile = profileV(5);
    const conflict = await rejectsPublish(t.service.publish(INPUT), 'version-conflict');

    const done = await t.service.publish({ ...INPUT, replaceVersion: conflict.profile!.version });
    assert.equal(done.version, 6);
    assert.equal(t.server.published[1]!.baseVersion, 5);
    assert.equal((await t.service.getState())?.baseVersion, 6);
  });

  it('再インストール後の空のローカル（端末の記録なし）からの Publish は、サーバーに公開があれば version-conflict で止まる', async () => {
    const t = await setup({ profile: profileV(3) });
    // 端末側は空のレパートリー。確認なしに通すと、サーバーの公開を空で上書きする。
    await rejectsPublish(t.service.publish(INPUT), 'version-conflict');
    assert.equal(t.server.published.length, 0);
    assert.equal(await t.service.getState(), null);
  });

  it('Publish が重なっても、順に実行する（2つ目は1つ目の版を使い、自分自身と食い違わない）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    const results = await Promise.all([t.service.publish(INPUT), t.service.publish(INPUT), t.service.publish(INPUT)]);
    assert.deepEqual(results.map((r) => r.version), [1, 2, 3]);
    assert.deepEqual(t.server.published.map((b) => b.baseVersion), [0, 1, 2]);
  });

  it('失敗したときは、端末の記録を変えない（通信の失敗）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    t.repo.publish = async () => {
      throw new AuthError('network');
    };
    await rejectsAuth(t.service.publish(INPUT), 'network');
    assert.equal((await t.service.getState())?.baseVersion, 1);
  });

  it('端末の記録に失敗しても、サーバーで済んだ Publish は成功として返す（次は版の食い違いの確認を通る）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    const failing = {
      ...t.db,
      transaction: async () => {
        throw new Error('disk full');
      },
    } as typeof t.db;
    const service = createPublishService({
      db: failing,
      access: signedIn,
      publish: t.repo,
      state: t.state,
      show: t.services.show,
      publicTags: t.publicTags,
      tags: t.tagRepository,
      settings: createSettingsRepository(),
    });
    const result = await service.publish(INPUT);
    assert.equal(result.version, 1);
    assert.equal(await service.getState(), null);
    await rejectsPublish(service.publish(INPUT), 'version-conflict');
  });
});

describe('サインインしていないとき', () => {
  it('どの操作も not-signed-in。端末の記録には触れない', async () => {
    const t = await setup({ access: signedOut });
    await t.add('A', 'X');
    await rejectsAuth(t.service.publish(INPUT), 'not-signed-in');
    await rejectsAuth(t.service.unpublish(), 'not-signed-in');
    await rejectsAuth(t.service.refreshProfile(), 'not-signed-in');
    await rejectsAuth(t.service.claimUsername('karaoke_fan'), 'not-signed-in');
    assert.deepEqual(t.server.calls, []);
    assert.equal(await t.service.getState(), null);
  });

  it('想定外の失敗は、AuthError(unexpected) に包む（元の例外を載せない）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    t.repo.publish = async () => {
      throw new TypeError('secret detail');
    };
    await assert.rejects(t.service.publish(INPUT), (error) => {
      assert.ok(error instanceof AuthError && error.code === 'unexpected');
      assert.equal(error.message.includes('secret'), false);
      return true;
    });
  });
});

describe('claimUsername', () => {
  it('前後の空白を落として小文字にして送る。端末の記録は baseVersion 0 で作る', async () => {
    const t = await setup({ profile: null });
    const profile = await t.service.claimUsername('  KaRaoKe_Fan ');
    assert.equal(profile.username, 'karaoke_fan');
    assert.deepEqual(t.server.calls, ['claim:karaoke_fan']);
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 0, displayName: '', bio: '' });
  });

  it('同じ名前をもう一度確保しても、記録の baseVersion は進めない', async () => {
    const t = await setup({ profile: null });
    await t.add('A', 'X');
    await t.service.claimUsername('karaoke_fan');
    await t.service.publish(INPUT);
    t.server.profile = { ...t.server.profile!, version: 9 }; // 別の端末が公開した

    await t.service.claimUsername('karaoke_fan');
    assert.equal((await t.service.getState())?.baseVersion, 1);
  });

  it('別のアカウントの記録（別の username）は捨てて、作り直す', async () => {
    const t = await setup({ profile: profileV(2, 'other') });
    await t.add('A', 'X');
    t.server.profile = profileV(0, 'other');
    await t.service.claimUsername('other');
    await t.service.publish(INPUT);
    assert.ok((await t.state.listHashes(t.db)).size > 0);

    t.server.profile = null; // 別のアカウントでサインインし直した
    await t.service.claimUsername('karaoke_fan');
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 0, displayName: '', bio: '' });
    assert.equal((await t.state.listHashes(t.db)).size, 0);
  });

  it('サーバーが断ったら PublishError で、記録は作らない', async () => {
    const t = await setup({ profile: null });
    t.repo.claimUsername = async () => {
      throw new PublishError('username-unavailable');
    };
    await rejectsPublish(t.service.claimUsername('admin'), 'username-unavailable');
    assert.equal(await t.service.getState(), null);
  });
});

describe('refreshProfile', () => {
  it('サーバーの状態を返す。端末の baseVersion は進めない（別の端末の Publish を確認なしに上書きしない）', async () => {
    const t = await setup({ profile: null });
    await t.add('A', 'X');
    await t.service.claimUsername('karaoke_fan');
    await t.service.publish(INPUT);
    t.server.profile = profileV(7);

    const profile = await t.service.refreshProfile();
    assert.equal(profile?.version, 7);
    assert.equal((await t.service.getState())?.baseVersion, 1);
    await rejectsPublish(t.service.publish(INPUT), 'version-conflict');
  });

  it('サーバーに username が無い・別の username なら、端末の記録を捨てる（アカウントを削除した、別のアカウントになった）', async () => {
    for (const after of [null, profileV(0, 'someone_else')]) {
      const t = await setup({ profile: null });
      await t.add('A', 'X');
      await t.service.claimUsername('karaoke_fan');
      await t.service.publish(INPUT);
      t.server.profile = after;

      assert.deepEqual(await t.service.refreshProfile(), after);
      assert.equal(await t.service.getState(), null);
      assert.equal((await t.state.listHashes(t.db)).size, 0);
    }
  });

  it('端末の記録が無いままでも、記録を作らない', async () => {
    const t = await setup({ profile: profileV(3) });
    await t.service.refreshProfile();
    assert.equal(await t.service.getState(), null);
  });
});

describe('unpublish', () => {
  it('非公開にして、baseVersion を非公開にした版へ進める。曲の記録は空にし、username と最後の Display Name・Bio は残す', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT); // v1

    const profile = await t.service.unpublish();
    assert.equal(profile?.published, false);
    assert.equal(profile?.version, 2);
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 2, displayName: 'Karaoke Fan', bio: 'bio' });
    assert.equal((await t.state.listHashes(t.db)).size, 0);

    // その後の Publish は、確認なしに通る。
    assert.equal((await t.service.publish(INPUT)).version, 3);
  });

  it('username が無ければ null。端末の記録も捨てる', async () => {
    const t = await setup({ profile: null });
    t.sqlite.exec(`INSERT INTO publish_state (id, username, base_version, display_name, bio) VALUES (1, 'old', 1, 'x', 'y')`);
    assert.equal(await t.service.unpublish(), null);
    assert.equal(await t.service.getState(), null);
  });

  it('端末に記録が無くても、非公開にできる（サーバーの版を記録する）', async () => {
    const t = await setup({ profile: profileV(4) });
    await t.service.unpublish();
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 5, displayName: '', bio: '' });
  });
});

describe('別のアカウントに切り替えたあと（レビュー指摘）', () => {
  it('前のアカウントの記録と版がたまたま同じでも、確認なしに上書きしない（version-conflict。アップロードしない）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT); // karaoke_fan: 版1。端末の記録も base 1
    assert.equal((await t.service.getState())?.baseVersion, 1);
    const uploaded = t.server.published.length;

    // サインアウトして、別のアカウントでサインインした。そのアカウントは、別の端末で公開済み（版も1で偶然同じ）。
    t.server.profile = profileV(1, 'other');
    const error = await rejectsPublish(t.service.publish(INPUT), 'version-conflict');
    assert.equal(error.profile?.username, 'other');
    assert.equal(t.server.published.length, uploaded, '内容を送っていない');
    assert.equal(await t.service.getState(), null, '前のアカウントの記録は捨てる');
    assert.equal((await t.state.listHashes(t.db)).size, 0);
  });

  it('置き換えを確認すれば、新しいアカウントとして公開できる。記録も新しいアカウントのものになる', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    t.server.profile = profileV(1, 'other');
    const conflict = await rejectsPublish(t.service.publish(INPUT), 'version-conflict');

    await t.service.publish({ ...INPUT, replaceVersion: conflict.profile!.version });
    assert.equal(t.server.published.at(-1)!.baseVersion, 1);
    assert.deepEqual(await t.service.getState(), { username: 'other', baseVersion: 2, displayName: 'Karaoke Fan', bio: 'bio' });
  });

  it('新しいアカウントがまだ公開していなければ（版0・username あり）、そのまま公開できる', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    t.server.profile = profileV(0, 'other');
    assert.equal((await t.service.publish(INPUT)).version, 1);
    assert.equal((await t.service.getState())?.username, 'other');
  });

  it('新しいアカウントに username が無ければ username-required。アップロードせず、前の記録は捨てる', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    const uploaded = t.server.published.length;
    t.server.profile = null;
    await rejectsPublish(t.service.publish(INPUT), 'username-required');
    assert.equal(t.server.published.length, uploaded);
    assert.equal(await t.service.getState(), null);
  });

  it('版の食い違いは、アップロードの前に見つける（本文を送らない）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    t.server.profile = profileV(5);
    t.server.calls.length = 0;
    await rejectsPublish(t.service.publish(INPUT), 'version-conflict');
    assert.deepEqual(t.server.calls, ['getProfile']);
  });
});

describe('サーバーで済んだ操作を、記録の失敗で失敗に見せない（レビュー指摘）', () => {
  it('unpublish: 成功のあとに端末の記録を読めなくても、成功として返す', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT);
    const service = createPublishService({
      db: t.db,
      access: signedIn,
      publish: t.repo,
      state: {
        ...t.state,
        get: async () => {
          throw new Error('disk error');
        },
      },
      show: t.services.show,
      publicTags: t.publicTags,
      tags: t.tagRepository,
      settings: createSettingsRepository(),
    });
    const profile = await service.unpublish();
    assert.equal(profile?.published, false);
    assert.equal(t.server.profile?.published, false);
  });
});

describe('refreshProfile も直列に実行する（レビュー指摘）', () => {
  it('claimUsername と重なっても、確保した直後の記録を消さない', async () => {
    const t = await setup({ profile: null });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const originalGet = t.repo.getProfile;
    t.repo.getProfile = async (session) => {
      const result = await originalGet(session); // 確保の前の状態（null）を受け取る
      await gate; // 返すのを遅らせる
      return result;
    };

    const refreshing = t.service.refreshProfile();
    const claiming = t.service.claimUsername('karaoke_fan'); // refresh が終わるまで待つ（直列）
    await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    await Promise.all([refreshing, claiming]);

    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 0, displayName: '', bio: '' });
  });
});

describe('countUnpublishedChanges（未公開の変更の数え方。7.4.9a）', () => {
  const zero = { added: 0, changed: 0, removed: 0, total: 0 };
  async function tagId(t: Awaited<ReturnType<typeof setup>>, name: string): Promise<string> {
    const tag = (await t.services.tags.listTags()).find((candidate) => candidate.name === name);
    assert.ok(tag, name);
    return tag.id;
  }
  const input = (title: string, artist: string, extra: { keyOffset?: number; privateNote?: string } = {}) => ({
    title,
    artist,
    status: 'ready' as const,
    keyOffset: extra.keyOffset ?? 0,
    privateNote: extra.privateNote ?? '',
    tagIds: [],
  });

  it('Publish した直後は 0。曲を足す・変える・消す・Ready でなくすと、1曲ずつ数える', async () => {
    const t = await setup();
    const keep = await t.add('Keep', 'A');
    const edit = await t.add('Edit', 'B');
    const drop = await t.add('Drop', 'C');
    const demote = await t.add('Demote', 'D');
    const profile = await t.service.publish(INPUT);
    assert.deepEqual(await t.service.countUnpublishedChanges(profile), zero);

    await t.add('New', 'E');
    await t.services.songs.updateSong(edit.id, input('Edited', 'B'));
    await t.services.songs.deleteSong(drop.id);
    await t.services.songs.setStatus(demote.id, 'practice');

    assert.deepEqual(await t.service.countUnpublishedChanges(profile), { added: 1, changed: 1, removed: 2, total: 4 });
    // 通信しない（Publish のときの2回だけ）
    assert.deepEqual(t.server.calls, ['getProfile', 'publish']);
    assert.ok(keep);
  });

  it('Practice・Want の曲の追加、My Key・Private Note の変更は数えない', async () => {
    const t = await setup();
    const song = await t.add('A', 'X');
    const profile = await t.service.publish(INPUT);

    await t.add('Practice', 'X', 'practice');
    await t.add('Want', 'X', 'want');
    await t.services.songs.updateSong(song.id, input('A', 'X', { keyOffset: 2, privateNote: 'memo' }));

    assert.deepEqual(await t.service.countUnpublishedChanges(profile), zero);
  });

  it('公開タグの選択の変更は、そのタグが付いた Ready の曲だけを「変更あり」にする', async () => {
    const t = await setup();
    await t.services.songs.createSong({ title: 'Tagged', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    await t.add('Plain', 'X');
    await t.services.songs.createSong({ title: 'Practicing', artist: 'X', status: 'practice', newTagNames: ['ballad'] });
    const profile = await t.service.publish(INPUT);

    await t.service.setTagPublic(await tagId(t, 'ballad'), true);
    assert.deepEqual(await t.service.countUnpublishedChanges(profile), { added: 0, changed: 1, removed: 0, total: 1 });

    await t.service.setTagPublic(await tagId(t, 'ballad'), false); // 元に戻せば 0
    assert.deepEqual(await t.service.countUnpublishedChanges(profile), zero);
  });

  it('Publish し直すと 0 に戻る（応答の profile で数える）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    const first = await t.service.publish(INPUT);
    await t.add('B', 'X');
    assert.equal((await t.service.countUnpublishedChanges(first))?.total, 1);

    const second = await t.service.publish(INPUT);
    assert.deepEqual(await t.service.countUnpublishedChanges(second), zero);
  });

  it('公開中でなければ null（非公開・まだ公開していない）。非公開にしたあとも null', async () => {
    const t = await setup();
    await t.add('A', 'X');
    assert.equal(await t.service.countUnpublishedChanges(profileV(0)), null);
    await t.service.publish(INPUT);
    const unpublished = (await t.service.unpublish())!;
    assert.equal(await t.service.countUnpublishedChanges(unpublished), null);
  });

  it('端末の記録が無い（再インストール後）、または前のアカウントのものなら null', async () => {
    const t = await setup({ profile: profileV(3) });
    await t.add('A', 'X');
    // 記録が無い
    assert.equal(await t.service.countUnpublishedChanges(profileV(3)), null);

    // 別のアカウントの記録（同じ版でも、基準にしない）
    t.sqlite.exec(`INSERT INTO publish_state (id, username, base_version, display_name, bio) VALUES (1, 'old_user', 3, 'x', 'y')`);
    assert.equal(await t.service.countUnpublishedChanges(profileV(3)), null);
  });

  it('別の端末が Publish した（サーバーの版が記録より新しい）なら null。記録は、今の公開内容と比べる基準にならない', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish(INPUT); // 記録の版は 1
    await t.add('B', 'X');
    assert.equal((await t.service.countUnpublishedChanges(profileV(1)))?.total, 1);
    assert.equal(await t.service.countUnpublishedChanges(profileV(2)), null);
  });

  it('1000曲を超えていても数えられる（Publish を断るのは Publish の側）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    const profile = await t.service.publish(INPUT);
    for (let i = 0; i < PUBLISH_LIMITS.songs; i += 1) {
      t.sqlite.exec(`INSERT INTO songs (id, title, artist_id, status, key_offset, private_note, created_at, updated_at)
        SELECT 'extra-${i}', 'Extra ${i}', artist_id, 'ready', 0, '', 1, 1 FROM songs LIMIT 1`);
    }
    const changes = await t.service.countUnpublishedChanges(profile);
    assert.equal(changes?.added, PUBLISH_LIMITS.songs);
  });

  it('Publish と重なっても、記録の途中を読まない（直列に実行する）', async () => {
    const t = await setup();
    await t.add('A', 'X');
    const first = await t.service.publish(INPUT);
    await t.add('B', 'X');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = t.repo.publish;
    t.repo.publish = async (session, body) => {
      await gate; // 応答を遅らせる（その間、記録はまだ古い）
      return original(session, body);
    };

    const publishing = t.service.publish(INPUT);
    const counting = t.service.countUnpublishedChanges(first); // Publish が終わるまで待つ
    await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    const second = await publishing;
    // Publish のあとの記録で数える（版が合わなければ null。ここでは古い profile を渡しているので null）。
    assert.equal(await counting, null);
    assert.deepEqual(await t.service.countUnpublishedChanges(second), zero);
  });
});

describe('publishPendingChanges（Auto Publish が使う。7.4.9b）', () => {
  /** 最初の公開まで済ませた状態（記録の版 1 = サーバーの版 1）。 */
  async function published() {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.publish({ displayName: 'Karaoke Fan', bio: 'my bio' });
    t.server.calls.length = 0;
    t.server.published.length = 0;
    return t;
  }
  const autoOn = (t: Awaited<ReturnType<typeof setup>>) =>
    t.sqlite.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_publish', 'on')");

  it('変更があれば、端末が最後に Publish した Display Name・Bio で送り、記録を進める。送るのは曲の変更だけで、Display Name・Bio の編集は載せない', async () => {
    const t = await published();
    await t.add('B', 'X');

    const result = await t.service.publishPendingChanges();

    assert.equal(result.kind, 'published');
    if (result.kind !== 'published') return;
    assert.equal(result.changeCount, 1);
    assert.equal(result.profile.version, 2);
    const body = t.server.published[0]!;
    assert.deepEqual([body.profile.displayName, body.profile.bio], ['Karaoke Fan', 'my bio']);
    assert.deepEqual(body.songs.map((song) => song.title), ['A', 'B']);
    assert.equal(body.baseVersion, 1);
    assert.deepEqual(await t.service.getState(), { username: 'karaoke_fan', baseVersion: 2, displayName: 'Karaoke Fan', bio: 'my bio' });
    // 送ったあとの差は 0（次は通信しない）
    assert.deepEqual(await t.service.countUnpublishedChanges(result.profile), { added: 0, changed: 0, removed: 0, total: 0 });
  });

  it('変更が無ければ、通信しない（サーバーを読みにも行かない）', async () => {
    const t = await published();
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'no-changes' });
    assert.deepEqual(t.server.calls, []);
  });

  it('Practice・Want の追加や My Key・Private Note の変更は変更に数えない（通信しない）', async () => {
    const t = await published();
    await t.add('P', 'X', 'practice', { privateNote: 'memo', keyOffset: 2 });
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'no-changes' });
    assert.deepEqual(t.server.calls, []);
  });

  it('この端末が公開していなければ（記録が無い）、通信しない', async () => {
    const t = await setup();
    await t.add('A', 'X');
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'no-record' });
    assert.deepEqual(t.server.calls, []);
  });

  it('username を確保しただけ（まだ公開していない）なら、自動では公開しない。最初の公開は確認つきの Publish Now だけ', async () => {
    const t = await setup();
    await t.add('A', 'X');
    await t.service.claimUsername('karaoke_fan');
    t.server.calls.length = 0;

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'not-published' });
    assert.deepEqual(t.server.calls, ['getProfile']);
    assert.equal(t.server.published.length, 0);
  });

  it('非公開にしたあとは、自動で公開し直さない（サーバーを読んで、公開中でないと分かったら送らない）', async () => {
    const t = await published();
    await t.service.unpublish();
    await t.add('B', 'X');
    t.server.calls.length = 0;

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'not-published' });
    assert.deepEqual(t.server.calls, ['getProfile']);
    assert.equal(t.server.published.length, 0);
  });

  it('別の端末が Publish していたら（版の食い違い）、上書きせず stopped(version-conflict)。本文を送らず、記録の版も進めない', async () => {
    const t = await published();
    await t.add('B', 'X');
    t.server.profile = { ...t.server.profile!, version: 2, displayName: 'Other' };

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'stopped', reason: 'version-conflict' });
    assert.deepEqual(t.server.calls, ['getProfile']);
    assert.equal((await t.service.getState())?.baseVersion, 1);
  });

  it('読んだあとに別の端末が Publish しても（サーバーの照合が 409）、stopped(version-conflict)', async () => {
    const t = await published();
    await t.add('B', 'X');
    const original = t.repo.publish;
    t.repo.publish = async (session, body) => {
      t.server.profile = { ...t.server.profile!, version: 2 }; // 読んだあとに、別の端末が Publish した
      return original(session, body);
    };
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'stopped', reason: 'version-conflict' });
    assert.equal((await t.service.getState())?.baseVersion, 1);
  });

  it('端末の記録が別のアカウントのもの: 送らずに記録を捨て、Auto Publish の設定をオフに戻す', async () => {
    const t = await published();
    autoOn(t);
    await t.add('B', 'X');
    t.server.profile = { ...profileV(1, 'someone_else'), published: true };

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'no-record' });
    assert.equal(t.server.published.length, 0);
    assert.equal(await t.service.getState(), null);
    assert.equal(await t.services.settings.getAutoPublishEnabled(), false);
  });

  it('サーバーに username が無い（アカウントを削除した）なら、記録を捨て、設定をオフに戻す', async () => {
    const t = await published();
    autoOn(t);
    await t.add('B', 'X');
    t.server.profile = null;

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'no-record' });
    assert.equal(await t.service.getState(), null);
    assert.equal(await t.services.settings.getAutoPublishEnabled(), false);
  });

  it('同じアカウントのままなら、設定には触れない（サインアウトしても、サインインし直せば同じ）', async () => {
    const t = await published();
    autoOn(t);
    await t.add('B', 'X');
    await t.service.publishPendingChanges();
    assert.equal(await t.services.settings.getAutoPublishEnabled(), true);
  });

  it('別のアカウントの username を確保し直すときも、設定をオフに戻す。同じ username のやり直しでは触れない', async () => {
    const t = await published();
    autoOn(t);
    await t.service.claimUsername('karaoke_fan'); // 同じ名前
    assert.equal(await t.services.settings.getAutoPublishEnabled(), true);

    t.server.profile = null; // 別のアカウント（まだ username が無い）
    await t.service.claimUsername('another_one');
    assert.equal(await t.services.settings.getAutoPublishEnabled(), false);
  });

  it('サインインしていなければ、通信しない（not-signed-in）。端末の記録には触れない', async () => {
    const t = await setup({ access: signedOut });
    await t.add('A', 'X');
    t.sqlite.exec(`INSERT INTO publish_state (id, username, base_version, display_name, bio) VALUES (1, 'karaoke_fan', 1, 'Karaoke Fan', '')`);

    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'not-signed-in' });
    assert.deepEqual(t.server.calls, []);
    assert.equal((await t.service.getState())?.baseVersion, 1);
  });

  it('401（セッションが外れた）は、signed-out として扱う。通信の失敗（network・unavailable）は、投げる（呼ぶ側が再送する）。端末の記録は変えない', async () => {
    const t = await published();
    await t.add('B', 'X');

    for (const code of ['network', 'unavailable'] as const) {
      t.repo.publish = async () => {
        throw new AuthError(code);
      };
      await rejectsAuth(t.service.publishPendingChanges(), code);
      assert.equal((await t.service.getState())?.baseVersion, 1);
    }
    t.repo.getProfile = async () => {
      throw new AuthError('unauthorized');
    };
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'idle', reason: 'not-signed-in' });
  });

  it('通信の失敗のあとも、差は残る。次の呼び出しが、同じ変更をまとめて送る（Pending の保持）', async () => {
    const t = await published();
    await t.add('B', 'X');
    const original = t.repo.publish;
    t.repo.publish = async () => {
      throw new AuthError('network');
    };
    await rejectsAuth(t.service.publishPendingChanges(), 'network');
    await t.add('C', 'X'); // 失敗している間に、さらに変更

    t.repo.publish = original;
    const result = await t.service.publishPendingChanges();
    assert.equal(result.kind, 'published');
    if (result.kind === 'published') assert.equal(result.changeCount, 2);
    assert.deepEqual(t.server.published.at(-1)!.songs.map((song) => song.title), ['A', 'B', 'C']);
  });

  it('端末の記録の Display Name が空なら、送らず stopped(display-name-required)。曲が1000を超えるなら stopped(too-many-songs)（通信の前に断る）', async () => {
    const t = await published();
    await t.add('B', 'X');
    t.sqlite.exec("UPDATE publish_state SET display_name = ''");
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'stopped', reason: 'display-name-required' });
    assert.equal(t.server.published.length, 0);

    t.sqlite.exec("UPDATE publish_state SET display_name = 'Karaoke Fan'");
    for (let i = 0; i < PUBLISH_LIMITS.songs; i += 1) {
      t.sqlite.exec(`INSERT INTO songs (id, title, artist_id, status, key_offset, private_note, created_at, updated_at)
        SELECT 'extra-${i}', 'Extra ${i}', artist_id, 'ready', 0, '', 1, 1 FROM songs LIMIT 1`);
    }
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'stopped', reason: 'too-many-songs' });
    assert.equal(t.server.published.length, 0);
  });

  it('サーバーが本文を断ったら（invalid-snapshot・too-large）、stopped(rejected)', async () => {
    const t = await published();
    await t.add('B', 'X');
    t.repo.publish = async () => {
      throw new PublishError('invalid-snapshot');
    };
    assert.deepEqual(await t.service.publishPendingChanges(), { kind: 'stopped', reason: 'rejected' });
  });

  it('送るのは、公開に選んだタグだけ。My Key・Private Note・ステータスは本文に出ない（Publish と同じ組み立て）', async () => {
    const t = await published();
    await t.services.songs.createSong({
      title: 'Tagged',
      artist: 'Y',
      status: 'ready',
      keyOffset: 4,
      privateNote: 'ひみつ',
      newTagNames: ['ballad', 'secret'],
    });
    const ballad = (await t.services.tags.listTags()).find((tag) => tag.name === 'ballad')!;
    await t.service.setTagPublic(ballad.id, true);

    await t.service.publishPendingChanges();

    const text = JSON.stringify(t.server.published[0]);
    assert.ok(text.includes('ballad'));
    assert.ok(!text.includes('secret'));
    assert.ok(!text.includes('ひみつ'));
    assert.ok(!text.includes('keyOffset'));
  });

  it('Publish・Unpublish と重なっても、順に実行する（記録の途中を読まない）', async () => {
    const t = await published();
    await t.add('B', 'X');
    const [manual, auto] = await Promise.all([
      t.service.publish({ displayName: 'Karaoke Fan', bio: 'my bio' }),
      t.service.publishPendingChanges(),
    ]);
    assert.equal(manual.version, 2);
    // Publish Now が先に送ったので、自動の確認では、差が無い。
    assert.deepEqual(auto, { kind: 'idle', reason: 'no-changes' });
    assert.equal(t.server.published.length, 1);
  });
});
