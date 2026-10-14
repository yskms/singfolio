// ShowService（Show Mode用）のテスト。`npm test` で実行する。
// 実際のSQL（node:sqlite）に対して動かす。実機のexpo-sqliteでの確認の代わりにはならない。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ShowTag, SongStatus, Tag } from '../domain/types.ts';
import { createTestServices } from '../testing/testDatabase.ts';

async function setup() {
  const t = await createTestServices();
  const add = async (
    title: string,
    artist: string,
    status: SongStatus = 'ready',
    extra: { tagIds?: string[]; keyOffset?: number; privateNote?: string } = {},
  ) => t.services.songs.createSong({ title, artist, status, ...extra });
  return { ...t, add };
}

// Show Mode が返すタグは、`id` と `name` だけ。
const showTag = (tag: Tag): ShowTag => ({ id: tag.id, name: tag.name });

const shape = (groups: { artist: string; songs: { title: string }[] }[]) =>
  groups.map((group) => [group.artist, group.songs.map((song) => song.title)]);

describe('getShowView: 対象と並び', () => {
  it('Readyの曲だけを出す（PracticeとWantは、件数にも一覧にも入らない）', async () => {
    const { services, add } = await setup();
    await add('チェリー', 'スピッツ', 'ready');
    await add('練習中の曲', 'スピッツ', 'practice');
    await add('歌いたい曲', 'Mr.Children', 'want');

    const view = await services.show.getShowView();
    assert.equal(view.readyCount, 1);
    assert.deepEqual(shape(view.groups), [['スピッツ', ['チェリー']]]);
  });

  it('アーティスト別にまとめ、アーティスト順・曲名順に並べる', async () => {
    const { services, add } = await setup();
    await add('Sign', 'Mr.Children');
    await add('楓', 'スピッツ');
    await add('HANABI', 'Mr.Children');
    await add('チェリー', 'スピッツ');
    await add('Alive', 'AAA');

    const view = await services.show.getShowView();
    // 英字は大文字小文字を区別せず、日本語は文字コード順（Songs の「アーティスト順」と同じ）。
    assert.deepEqual(shape(view.groups), [
      ['AAA', ['Alive']],
      ['Mr.Children', ['HANABI', 'Sign']],
      ['スピッツ', ['チェリー', '楓']],
    ]);
  });

  it('大文字小文字・全角半角だけが違う表記は、同じアーティスト（最初の表記の見出し）にまとまる', async () => {
    const { services, add } = await setup();
    await add('A', 'MR.CHILDREN');
    await add('B', 'Mr.Children');
    await add('C', 'Ｍｒ．Ｃｈｉｌｄｒｅｎ');

    const view = await services.show.getShowView();
    assert.deepEqual(shape(view.groups), [['MR.CHILDREN', ['A', 'B', 'C']]]);
  });

  it('アーティストは読みの順に並べる（漢字・英字の名前も、読みの位置に来る）', async () => {
    const { services, add } = await setup();
    await services.songs.createSong({ title: 'a', artist: '米津玄師', artistReading: 'よねづけんし', status: 'ready' });
    await services.songs.createSong({ title: 'b', artist: 'ELLEGARDEN', artistReading: 'えるれがーでん', status: 'ready' });
    await services.songs.createSong({ title: 'c', artist: 'スピッツ', artistReading: 'すぴっつ', status: 'ready' });
    await services.songs.createSong({ title: 'd', artist: 'The Beatles', artistReading: 'Beatles', status: 'ready' });
    await add('e', 'あいみょん');

    const byArtist = await services.show.getShowView();
    assert.deepEqual(
      byArtist.groups.map((group) => group.artist),
      ['The Beatles', 'あいみょん', 'ELLEGARDEN', 'スピッツ', '米津玄師'],
    );
    // 曲名順の一覧にも、読みは持ち込まない（行は、曲名とアーティストの名前だけ）。
    const byTitle = await services.show.getShowView({ sort: 'title' });
    assert.deepEqual(byTitle.songs.map((song) => song.title), ['a', 'b', 'c', 'd', 'e']);
  });

  it('曲が無ければ、空を返す', async () => {
    const { services } = await setup();
    assert.deepEqual(await services.show.getShowView(), { readyCount: 0, tags: [], sort: 'artist', groups: [] });
  });
});

describe('getShowView: 絞り込み', () => {
  it('検索は曲名とアーティストに効き、ひらがな/カタカナを区別しない。件数とタグは変わらない', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('チェリー', 'スピッツ', 'ready', { tagIds: [rock.id] });
    await add('HANABI', 'Mr.Children');

    const byTitle = await services.show.getShowView({ search: 'ちぇりー' });
    assert.deepEqual(shape(byTitle.groups), [['スピッツ', ['チェリー']]]);
    const byArtist = await services.show.getShowView({ search: 'mr.' });
    assert.deepEqual(shape(byArtist.groups), [['Mr.Children', ['HANABI']]]);

    const none = await services.show.getShowView({ search: 'zzz' });
    assert.deepEqual(none.groups, []);
    assert.equal(none.readyCount, 2, '検索で絞っても、Readyの総数は変わらない');
    assert.deepEqual(none.tags, [showTag(rock)], '検索で絞っても、タグの一覧は変わらない');
  });

  it('検索はReady以外の曲に当たらない', async () => {
    const { services, add } = await setup();
    await add('チェリー', 'スピッツ', 'ready');
    await add('チェリー（練習中）', 'スピッツ', 'practice');
    await add('チェリーパイ', 'どこか', 'want');

    const view = await services.show.getShowView({ search: 'チェリー' });
    assert.deepEqual(shape(view.groups), [['スピッツ', ['チェリー']]]);
  });

  it('タグで絞り込める（Readyの曲の中で）', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const ballad = await services.tags.getOrCreateTag('Ballad');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id] });
    await add('チェリー', 'スピッツ', 'ready', { tagIds: [ballad.id] });
    await add('練習中のロック', 'スピッツ', 'practice', { tagIds: [rock.id] });

    const view = await services.show.getShowView({ tagId: rock.id });
    assert.deepEqual(shape(view.groups), [['スピッツ', ['ロビンソン']]]);
  });

  it('検索とタグは両方満たす曲だけ（AND）', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id] });
    await add('チェリー', 'スピッツ');
    await add('HANABI', 'Mr.Children', 'ready', { tagIds: [rock.id] });

    const view = await services.show.getShowView({ search: 'スピッツ', tagId: rock.id });
    assert.deepEqual(shape(view.groups), [['スピッツ', ['ロビンソン']]]);
  });

  it('型の外から status を渡されても、Ready以外は返さない', async () => {
    const { services, add } = await setup();
    await add('チェリー', 'スピッツ', 'ready');
    await add('練習中', 'スピッツ', 'practice');

    // 並びを指定しない呼び出しの型（アーティスト別）に合わせる。
    const query = { status: 'practice' } as unknown as { search?: string };
    const view = await services.show.getShowView(query);
    assert.deepEqual(shape(view.groups), [['スピッツ', ['チェリー']]]);
  });
});

describe('getShowView: タグの一覧', () => {
  it('Readyの曲に付いているタグだけを、名前順に出す', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const ballad = await services.tags.getOrCreateTag('Ballad');
    const practiceOnly = await services.tags.getOrCreateTag('練習用');
    await services.tags.getOrCreateTag('未使用');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id, ballad.id] });
    await add('練習中の曲', 'スピッツ', 'practice', { tagIds: [practiceOnly.id] });

    const view = await services.show.getShowView();
    assert.deepEqual(view.tags, [showTag(ballad), showTag(rock)]);
  });

  it('曲の行のタグは、その曲に付いたタグ（名前順）', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const ballad = await services.tags.getOrCreateTag('Ballad');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id, ballad.id] });
    await add('チェリー', 'スピッツ');

    const [group] = (await services.show.getShowView()).groups;
    assert.deepEqual(
      group?.songs.map((song) => song.tags),
      [[], [showTag(ballad), showTag(rock)]],
    );
  });
});

describe('getShowView: 曲名順', () => {
  // 曲名順の一覧は、見出しが無いので、行がアーティストを持つ。
  const listed = (songs: { title: string; artist: string }[]) => songs.map((song) => [song.title, song.artist]);

  it('曲名順の一覧を返す（見出しは無く、行がアーティストを持つ）。英字は大文字小文字を区別しない', async () => {
    const { services, add } = await setup();
    await add('Sign', 'Mr.Children');
    await add('楓', 'スピッツ');
    await add('HANABI', 'Mr.Children');
    await add('チェリー', 'スピッツ');
    await add('alive', 'AAA');

    const view = await services.show.getShowView({ sort: 'title' });
    assert.equal(view.sort, 'title');
    assert.deepEqual(listed(view.songs), [
      ['alive', 'AAA'],
      ['HANABI', 'Mr.Children'],
      ['Sign', 'Mr.Children'],
      ['チェリー', 'スピッツ'],
      ['楓', 'スピッツ'],
    ]);
    assert.equal('groups' in view, false);
  });

  it('同じ曲名は、アーティストの昇順に並ぶ', async () => {
    const { services, add } = await setup();
    await add('Home', 'ZZ Top');
    await add('Home', 'Aimer');
    await add('Home', 'Mr.Children');

    const view = await services.show.getShowView({ sort: 'title' });
    assert.deepEqual(listed(view.songs), [
      ['Home', 'Aimer'],
      ['Home', 'Mr.Children'],
      ['Home', 'ZZ Top'],
    ]);
  });

  it('Readyの曲だけ。検索・タグで絞れて、件数とタグの一覧は変わらない', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id] });
    await add('チェリー', 'スピッツ');
    await add('練習中のロック', 'スピッツ', 'practice', { tagIds: [rock.id] });
    await add('歌いたい曲', 'どこか', 'want');

    const all = await services.show.getShowView({ sort: 'title' });
    assert.deepEqual(listed(all.songs), [
      ['チェリー', 'スピッツ'],
      ['ロビンソン', 'スピッツ'],
    ]);

    const byTag = await services.show.getShowView({ sort: 'title', tagId: rock.id });
    assert.deepEqual(listed(byTag.songs), [['ロビンソン', 'スピッツ']]);

    const bySearch = await services.show.getShowView({ sort: 'title', search: 'ちぇりー' });
    assert.deepEqual(listed(bySearch.songs), [['チェリー', 'スピッツ']]);
    assert.equal(bySearch.readyCount, 2);
    assert.deepEqual(bySearch.tags, [showTag(rock)]);

    const none = await services.show.getShowView({ sort: 'title', search: 'zzz' });
    assert.deepEqual(none.songs, []);
    assert.equal(none.readyCount, 2);
  });

  it('曲名順でもアーティスト別でも、件数とタグの一覧は同じ', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('ロビンソン', 'スピッツ', 'ready', { tagIds: [rock.id] });
    await add('Sign', 'Mr.Children');

    const byArtist = await services.show.getShowView();
    const byTitle = await services.show.getShowView({ sort: 'title' });
    assert.equal(byTitle.readyCount, byArtist.readyCount);
    assert.deepEqual(byTitle.tags, byArtist.tags);
  });

  it('型の外から来た sort は、アーティスト別にする', async () => {
    const { services, add } = await setup();
    await add('チェリー', 'スピッツ');

    const query = { sort: 'updatedAt' } as unknown as Parameters<typeof services.show.getShowView>[0];
    const view = await services.show.getShowView(query);
    assert.equal(view.sort, 'artist');
    assert.deepEqual(shape((view as { groups: { artist: string; songs: { title: string }[] }[] }).groups), [
      ['スピッツ', ['チェリー']],
    ]);
  });

  it('型の外から status を渡されても、Ready以外は返さない', async () => {
    const { services, add } = await setup();
    await add('チェリー', 'スピッツ', 'ready');
    await add('練習中', 'スピッツ', 'practice');

    const query = { sort: 'title', status: 'practice' } as unknown as Parameters<typeof services.show.getShowView>[0];
    const view = await services.show.getShowView(query);
    assert.equal(view.sort, 'title');
    assert.deepEqual(listed((view as { songs: { title: string; artist: string }[] }).songs), [['チェリー', 'スピッツ']]);
  });
});

describe('getShowView: 人に見せない情報', () => {
  it('曲は id / title / tags だけを持つ（My Key・Private Note・ステータスを含まない）', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('チェリー', 'スピッツ', 'ready', { keyOffset: -3, privateNote: '2番が不安', tagIds: [rock.id] });

    const view = await services.show.getShowView();
    const song = view.groups[0]?.songs[0];
    assert.deepEqual(Object.keys(song ?? {}).sort(), ['id', 'tags', 'title']);
    assert.deepEqual(Object.keys(view).sort(), ['groups', 'readyCount', 'sort', 'tags']);
    assert.deepEqual(Object.keys(view.groups[0] ?? {}).sort(), ['artist', 'songs']);
    // タグも、id と name だけ（`Tag` に項目が増えても、Show Mode には届かない）。
    assert.deepEqual(Object.keys(song?.tags[0] ?? {}).sort(), ['id', 'name']);
    assert.deepEqual(Object.keys(view.tags[0] ?? {}).sort(), ['id', 'name']);
    assert.equal(JSON.stringify(view).includes('2番が不安'), false);
  });

  it('曲名順の行は id / title / artist / tags だけを持つ（管理情報を含まない）', async () => {
    const { services, add } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await add('チェリー', 'スピッツ', 'ready', { keyOffset: -3, privateNote: '2番が不安', tagIds: [rock.id] });

    const view = await services.show.getShowView({ sort: 'title' });
    assert.deepEqual(Object.keys(view).sort(), ['readyCount', 'songs', 'sort', 'tags']);
    assert.deepEqual(Object.keys(view.songs[0] ?? {}).sort(), ['artist', 'id', 'tags', 'title']);
    assert.deepEqual(Object.keys(view.songs[0]?.tags[0] ?? {}).sort(), ['id', 'name']);
    assert.equal(JSON.stringify(view).includes('2番が不安'), false);
  });
});
