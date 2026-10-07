// TagService（とTagRepository）のテスト。`npm test` で実行する。
// 実際のSQL（node:sqlite）に対して動かす。実機のexpo-sqliteでの確認の代わりにはならない。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServices } from '../testing/testDatabase.ts';
import { ServiceError, type ServiceErrorCode } from './errors.ts';

const rejectsWith = (promise: Promise<unknown>, code: ServiceErrorCode) =>
  assert.rejects(
    promise,
    (error) => error instanceof ServiceError && error.code === code,
  );

const names = (tags: { name: string }[]) => tags.map((tag) => tag.name);

describe('getOrCreateTag', () => {
  it('新しいタグを、IDと作成日時つきで作る', async () => {
    const { services } = await createTestServices();
    const tag = await services.tags.getOrCreateTag('Rock');
    assert.deepEqual(tag, { id: 'id-1', name: 'Rock', createdAt: 1_000 });
    assert.deepEqual(await services.tags.listTags(), [tag]);
  });

  it('名前を正規化して保存する（空白・全角半角）', async () => {
    const { services } = await createTestServices();
    assert.equal((await services.tags.getOrCreateTag('  Ｈard   Ｒock ')).name, 'Hard Rock');
    assert.equal((await services.tags.getOrCreateTag('ﾎﾞｶﾛ')).name, 'ボカロ');
  });

  it('同じ名前のタグがあれば、新しく作らずそれを返す', async () => {
    const { services, advance } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    advance();
    // 大文字小文字・全角半角・前後の空白の違いは、同じタグ。
    for (const name of ['Rock', 'rock', 'ROCK', ' rock ', 'Ｒock', 'ｒｏｃｋ']) {
      assert.deepEqual(await services.tags.getOrCreateTag(name), rock, name);
    }
    assert.deepEqual(await services.tags.listTags(), [rock]);
  });

  it('ASCII以外の大文字小文字も、同じタグとして扱う', async () => {
    const { services } = await createTestServices();
    const tag = await services.tags.getOrCreateTag('Äpfel');
    assert.deepEqual(await services.tags.getOrCreateTag('äpfel'), tag);
  });

  it('ひらがなとカタカナは別のタグ', async () => {
    const { services } = await createTestServices();
    await services.tags.getOrCreateTag('アニメ');
    await services.tags.getOrCreateTag('あにめ');
    assert.equal((await services.tags.listTags()).length, 2);
  });

  it('空の名前（空白だけを含む）は tag-name-required', async () => {
    const { services } = await createTestServices();
    await rejectsWith(services.tags.getOrCreateTag(''), 'tag-name-required');
    await rejectsWith(services.tags.getOrCreateTag(' 　 '), 'tag-name-required');
    assert.deepEqual(await services.tags.listTags(), []);
  });

  it('同時に同じ名前で呼んでも、1つしか作らない', async () => {
    const { services } = await createTestServices();
    const tags = await Promise.all(
      ['Rock', 'rock', 'ＲＯＣＫ'].map((name) => services.tags.getOrCreateTag(name)),
    );
    assert.equal(new Set(tags.map((tag) => tag.id)).size, 1);
    assert.equal((await services.tags.listTags()).length, 1);
  });
});

describe('listTags', () => {
  it('名前の昇順（ASCIIの大文字小文字は区別しない）で返す', async () => {
    const { services } = await createTestServices();
    for (const name of ['rock', 'Pop', 'acoustic', 'J-Pop']) {
      await services.tags.getOrCreateTag(name);
    }
    assert.deepEqual(names(await services.tags.listTags()), [
      'acoustic',
      'J-Pop',
      'Pop',
      'rock',
    ]);
  });
});

describe('renameTag', () => {
  it('名前を変更する（正規化して保存する）', async () => {
    const { services } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    const renamed = await services.tags.renameTag(rock.id, '  Ｈard  Rock ');
    assert.deepEqual(renamed, { ...rock, name: 'Hard Rock' });
    assert.deepEqual(await services.tags.listTags(), [renamed]);
  });

  it('大文字小文字だけの変更は、重複にならない', async () => {
    const { services } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('rock');
    assert.equal((await services.tags.renameTag(rock.id, 'Rock')).name, 'Rock');
    assert.deepEqual(names(await services.tags.listTags()), ['Rock']);
  });

  it('同じ名前への変更は、何も変えずに成功する', async () => {
    const { services } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    assert.deepEqual(await services.tags.renameTag(rock.id, ' Rock '), rock);
  });

  it('別のタグと重複する名前は tag-name-duplicate（大文字小文字・全角半角を同一視）', async () => {
    const { services } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    const pop = await services.tags.getOrCreateTag('Pop');
    for (const name of ['Rock', 'rock', 'Ｒock', ' ROCK ']) {
      await rejectsWith(services.tags.renameTag(pop.id, name), 'tag-name-duplicate');
    }
    assert.deepEqual(await services.tags.listTags(), [pop, rock]);
  });

  it('空の名前は tag-name-required、存在しないタグは tag-not-found', async () => {
    const { services } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    await rejectsWith(services.tags.renameTag(rock.id, '  '), 'tag-name-required');
    await rejectsWith(services.tags.renameTag('no-such-tag', 'Pop'), 'tag-not-found');
    assert.deepEqual(await services.tags.listTags(), [rock]);
  });

  it('曲の updatedAt は変えず、曲のタグ名には反映される', async () => {
    const { services, advance } = await createTestServices();
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      tagIds: [rock.id],
    });
    advance();
    await services.tags.renameTag(rock.id, 'Hard Rock');
    const after = await services.songs.getSong(song.id);
    assert.deepEqual(names(after?.tags ?? []), ['Hard Rock']);
    assert.equal(after?.updatedAt, song.updatedAt);
  });
});

describe('deleteTag', () => {
  it('タグを削除し、付いていた曲からは外れるが、曲は残る（updatedAt も変えない）', async () => {
    const { services, advance, count } = await createTestServices().then((t) => ({
      ...t,
      count: (table: string) =>
        (t.sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c,
    }));
    const rock = await services.tags.getOrCreateTag('Rock');
    const pop = await services.tags.getOrCreateTag('Pop');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      tagIds: [rock.id, pop.id],
    });
    advance();
    await services.tags.deleteTag(rock.id);

    assert.deepEqual(await services.tags.listTags(), [pop]);
    const after = await services.songs.getSong(song.id);
    assert.deepEqual(after, { ...song, tags: [pop] });
    assert.equal(count('song_tags'), 1);
    assert.equal(count('songs'), 1);
  });

  it('既に無いタグの削除は、何もせず成功する', async () => {
    const { services } = await createTestServices();
    await services.tags.deleteTag('no-such-tag');
  });

  it('削除した名前は、新しいタグとして作り直せる', async () => {
    const { services } = await createTestServices();
    const old = await services.tags.getOrCreateTag('Rock');
    await services.tags.deleteTag(old.id);
    const again = await services.tags.getOrCreateTag('rock');
    assert.notEqual(again.id, old.id);
    assert.equal(again.name, 'rock');
  });
});
