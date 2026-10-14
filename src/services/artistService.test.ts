// ArtistService のテスト。`npm test` で実行する。実際のSQL（node:sqlite）に対して動かす。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServices } from '../testing/testDatabase.ts';
import { ServiceError, type ServiceErrorCode } from './errors.ts';

const rejectsWith = (promise: Promise<unknown>, code: ServiceErrorCode) =>
  assert.rejects(promise, (error) => error instanceof ServiceError && error.code === code);

async function setup() {
  const t = await createTestServices();
  const add = (title: string, artist: string, artistReading?: string) =>
    t.services.songs.createSong({ title, artist, artistReading, status: 'ready' });
  return { ...t, add };
}

describe('listArtists', () => {
  it('曲が無ければ空', async () => {
    const { services } = await setup();
    assert.deepEqual(await services.artists.listArtists(), []);
  });

  it('読みの五十音順に、曲数つきで返す（英字の読みが先、漢字の名前も読みの位置）', async () => {
    const { services, add } = await setup();
    await add('a', '米津玄師', 'よねづけんし');
    await add('b', 'ELLEGARDEN', 'えるれがーでん');
    await add('c', 'ELLEGARDEN');
    await add('d', 'The Beatles', 'Beatles');
    await add('e', 'スピッツ', 'すぴっつ');
    const list = await services.artists.listArtists();
    assert.deepEqual(
      list.map((artist) => [artist.name, artist.reading, artist.songCount]),
      [
        ['The Beatles', 'Beatles', 1],
        ['ELLEGARDEN', 'えるれがーでん', 2],
        ['スピッツ', 'すぴっつ', 1],
        ['米津玄師', 'よねづけんし', 1],
      ],
    );
  });

  it('読みが同じなら名前の順', async () => {
    const { services, add } = await setup();
    await add('a', 'B', 'おなじ');
    await add('b', 'A', 'おなじ');
    assert.deepEqual((await services.artists.listArtists()).map((artist) => artist.name), ['A', 'B']);
  });
});

describe('updateArtist', () => {
  it('名前と読みを変え、そのアーティストの全曲に効く。曲の updatedAt は変わらない', async () => {
    const { services, add, advance } = await setup();
    const a = await add('a', 'ELLEGARDEN');
    const b = await add('b', 'ELLEGARDEN');
    advance();
    const updated = await services.artists.updateArtist(a.artistId, {
      name: 'ELLEGARDEN（エルレ）',
      reading: 'えるれがーでん',
    });
    assert.deepEqual([updated.name, updated.reading], ['ELLEGARDEN（エルレ）', 'えるれがーでん']);
    for (const id of [a.id, b.id]) {
      const song = await services.songs.getSong(id);
      assert.equal(song?.artist, 'ELLEGARDEN（エルレ）');
      assert.equal(song?.artistReading, 'えるれがーでん');
      assert.equal(song?.updatedAt, 1_000);
    }
  });

  it('名前・読みは正規化して保存する', async () => {
    const { services, add } = await setup();
    const song = await add('a', 'X');
    const updated = await services.artists.updateArtist(song.artistId, {
      name: '  Maroon 5 ',
      reading: 'ﾏﾙｰﾝ５',
    });
    assert.deepEqual([updated.name, updated.reading], ['Maroon 5', 'マルーン5']);
  });

  it('空の名前・空の読みは保存しない', async () => {
    const { services, add } = await setup();
    const song = await add('a', 'X', 'えっくす');
    await rejectsWith(services.artists.updateArtist(song.artistId, { name: ' ', reading: 'a' }), 'artist-name-required');
    await rejectsWith(services.artists.updateArtist(song.artistId, { name: 'X', reading: ' ' }), 'artist-reading-required');
    assert.equal((await services.songs.getSong(song.id))?.artistReading, 'えっくす');
  });

  it('別のアーティストと同じ名前（大文字小文字・全角半角を除く）は重複。大文字小文字だけを変えるのは可', async () => {
    const { services, add } = await setup();
    const queen = await add('a', 'Queen');
    await add('b', 'Coldplay');
    await rejectsWith(services.artists.updateArtist(queen.artistId, { name: 'coldplay', reading: 'x' }), 'artist-name-duplicate');
    await rejectsWith(services.artists.updateArtist(queen.artistId, { name: 'Ｃｏｌｄｐｌａｙ', reading: 'x' }), 'artist-name-duplicate');
    const renamed = await services.artists.updateArtist(queen.artistId, { name: 'QUEEN', reading: 'Queen' });
    assert.equal(renamed.name, 'QUEEN');
  });

  it('変更が無ければ何も書かない。存在しないIDは artist-not-found', async () => {
    const { services, add } = await setup();
    const song = await add('a', 'X', 'えっくす');
    const same = await services.artists.updateArtist(song.artistId, { name: 'X', reading: 'えっくす' });
    assert.equal(same.id, song.artistId);
    await rejectsWith(services.artists.updateArtist('nope', { name: 'X', reading: 'x' }), 'artist-not-found');
  });
});
