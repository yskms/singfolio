// SongService（とSongRepository）のテスト。`npm test` で実行する。
// 実際のSQL（node:sqlite）に対して動かす。実機のexpo-sqliteでの確認の代わりにはならない。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServices } from '../testing/testDatabase.ts';
import { ServiceError, type ServiceErrorCode } from './errors.ts';

const rejectsWith = (promise: Promise<unknown>, code: ServiceErrorCode) =>
  assert.rejects(
    promise,
    (error) => error instanceof ServiceError && error.code === code,
  );

const titles = (songs: { title: string }[]) => songs.map((song) => song.title);

async function setup() {
  const t = await createTestServices();
  const count = (table: string) =>
    (t.sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;
  return { ...t, count };
}

describe('createSong', () => {
  it('Title / Artist / Status だけで保存でき、他は既定値になる', async () => {
    const { services, env } = await setup();
    const song = await services.songs.createSong({
      title: 'チェリー',
      artist: 'スピッツ',
      status: 'ready',
    });
    assert.deepEqual(song, {
      id: 'id-1',
      title: 'チェリー',
      artist: 'スピッツ',
      status: 'ready',
      keyOffset: 0,
      privateNote: '',
      tags: [],
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    assert.equal(env.newId(), 'id-2', 'IDはRepositoryが生成する');
    assert.deepEqual(await services.songs.getSong('id-1'), song);
  });

  it('全項目を保存できる（My Keyは負の値も可）', async () => {
    const { services } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'HANABI',
      artist: 'Mr.Children',
      status: 'practice',
      keyOffset: -2,
      privateNote: '2番の歌詞を確認',
      tagIds: [rock.id],
    });
    assert.equal(song.keyOffset, -2);
    assert.equal(song.privateNote, '2番の歌詞を確認');
    assert.deepEqual(song.tags, [rock]);
  });

  it('省略した項目に undefined を明示しても、既定値になる', async () => {
    const { services } = await setup();
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'want',
      keyOffset: undefined,
      privateNote: undefined,
      tagIds: undefined,
    });
    assert.equal(song.keyOffset, 0);
    assert.equal(song.privateNote, '');
    assert.deepEqual(song.tags, []);
  });

  it('Title / Artist の前後の空白（全角を含む）を除き、メモの空白も整える', async () => {
    const { services } = await setup();
    const song = await services.songs.createSong({
      title: '  チェリー　',
      artist: '　スピッツ ',
      status: 'ready',
      privateNote: ' \n ',
    });
    assert.equal(song.title, 'チェリー');
    assert.equal(song.artist, 'スピッツ');
    assert.equal(song.privateNote, '', '空白だけのメモは「メモなし」');
    const noted = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      privateNote: '  1行目\n2行目\n',
    });
    assert.equal(noted.privateNote, '1行目\n2行目', '内側の改行は残す');
  });

  it('Title / Artist の分解された濁点（NFD）は、合成した形にそろえて保存する', async () => {
    const { services } = await setup();
    const song = await services.songs.createSong({
      title: 'ホ\u3099カロ',
      artist: 'ハ\u309aスピッツ',
      status: 'ready',
    });
    assert.equal(song.title, 'ボカロ');
    assert.equal(song.artist, 'パスピッツ');
    // 普通に入力した形でも、分解した形で貼り付けた検索語でも、見つかる。
    assert.equal((await services.songs.listSongs({ search: 'ボカ' })).length, 1);
    assert.equal((await services.songs.listSongs({ search: 'ホ\u3099カ' })).length, 1);
  });

  it('Title / Artist が空（空白だけを含む）なら保存しない', async () => {
    const { services, count } = await setup();
    await rejectsWith(
      services.songs.createSong({ title: '', artist: 'a', status: 'ready' }),
      'title-required',
    );
    await rejectsWith(
      services.songs.createSong({ title: ' 　', artist: 'a', status: 'ready' }),
      'title-required',
    );
    await rejectsWith(
      services.songs.createSong({ title: 'a', artist: '  ', status: 'ready' }),
      'artist-required',
    );
    assert.equal(count('songs'), 0);
  });

  it('不正な Status・My Key は保存しない', async () => {
    const { services, count } = await setup();
    await rejectsWith(
      services.songs.createSong({
        title: 'a',
        artist: 'b',
        status: 'done' as unknown as 'ready',
      }),
      'invalid-status',
    );
    for (const keyOffset of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await rejectsWith(
        services.songs.createSong({ title: 'a', artist: 'b', status: 'ready', keyOffset }),
        'invalid-key-offset',
      );
    }
    assert.equal(count('songs'), 0);
  });

  it('同じタグIDが重複していても、1回だけ付ける', async () => {
    const { services } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      tagIds: [rock.id, rock.id],
    });
    assert.deepEqual(song.tags, [rock]);
  });

  it('存在しないタグIDを含むなら、曲もタグの関連も保存しない', async () => {
    const { services, count } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    await rejectsWith(
      services.songs.createSong({
        title: 'a',
        artist: 'b',
        status: 'ready',
        tagIds: [rock.id, 'no-such-tag'],
      }),
      'tag-not-found',
    );
    assert.equal(count('songs'), 0);
    assert.equal(count('song_tags'), 0);
  });
});

describe('getSong', () => {
  it('タグを名前の昇順（大文字小文字を区別しない）で返す', async () => {
    const { services } = await setup();
    const pop = await services.tags.getOrCreateTag('pop');
    const acoustic = await services.tags.getOrCreateTag('Acoustic');
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      tagIds: [rock.id, pop.id, acoustic.id],
    });
    assert.deepEqual(
      song.tags.map((tag) => tag.name),
      ['Acoustic', 'pop', 'Rock'],
    );
  });

  it('無い曲は null', async () => {
    const { services } = await setup();
    assert.equal(await services.songs.getSong('no-such-song'), null);
  });
});

describe('updateSong', () => {
  async function created() {
    const t = await setup();
    const rock = await t.services.tags.getOrCreateTag('Rock');
    const pop = await t.services.tags.getOrCreateTag('Pop');
    const song = await t.services.songs.createSong({
      title: 'HANABI',
      artist: 'Mr.Children',
      status: 'practice',
      keyOffset: -2,
      privateNote: 'note',
      tagIds: [rock.id],
    });
    const input = {
      title: song.title,
      artist: song.artist,
      status: song.status,
      keyOffset: song.keyOffset,
      privateNote: song.privateNote,
      tagIds: [rock.id],
    };
    return { ...t, rock, pop, song, input };
  }

  it('全項目とタグを置き換え、updatedAt だけを更新する', async () => {
    const { services, advance, song, pop, input } = await created();
    advance(5_000);
    const updated = await services.songs.updateSong(song.id, {
      ...input,
      title: ' Sign ',
      status: 'ready',
      keyOffset: 0,
      privateNote: '',
      tagIds: [pop.id],
    });
    assert.equal(updated.id, song.id);
    assert.equal(updated.title, 'Sign');
    assert.equal(updated.status, 'ready');
    assert.equal(updated.keyOffset, 0);
    assert.equal(updated.privateNote, '');
    assert.deepEqual(updated.tags, [pop]);
    assert.equal(updated.createdAt, song.createdAt);
    assert.equal(updated.updatedAt, 6_000);
    assert.deepEqual(await services.songs.getSong(song.id), updated);
  });

  it('タグの付け外しだけでも updatedAt を更新する', async () => {
    const { services, advance, song, pop, rock, input } = await created();
    advance();
    const added = await services.songs.updateSong(song.id, {
      ...input,
      tagIds: [rock.id, pop.id],
    });
    assert.equal(added.updatedAt, 2_000);
    advance();
    const removed = await services.songs.updateSong(song.id, { ...input, tagIds: [] });
    assert.equal(removed.updatedAt, 3_000);
    assert.deepEqual(removed.tags, []);
  });

  it('内容が変わらない保存では、updatedAt を更新しない', async () => {
    const { services, advance, song, rock, input } = await created();
    advance();
    const same = await services.songs.updateSong(song.id, input);
    assert.deepEqual(same, song);
    // 空白の違い・タグの順序や重複は「内容の変更」ではない。
    const noise = await services.songs.updateSong(song.id, {
      ...input,
      title: ` ${input.title} `,
      tagIds: [rock.id, rock.id],
    });
    assert.deepEqual(noise, song);
    assert.equal((await services.songs.getSong(song.id))?.updatedAt, 1_000);
  });

  it('存在しない曲は song-not-found', async () => {
    const { services, input } = await created();
    await rejectsWith(services.songs.updateSong('no-such-song', input), 'song-not-found');
  });

  it('入力が不正なら、曲を変更しない', async () => {
    const { services, advance, song, input } = await created();
    advance();
    await rejectsWith(
      services.songs.updateSong(song.id, { ...input, title: ' ' }),
      'title-required',
    );
    await rejectsWith(
      services.songs.updateSong(song.id, { ...input, keyOffset: 0.5 }),
      'invalid-key-offset',
    );
    assert.deepEqual(await services.songs.getSong(song.id), song);
  });

  it('存在しないタグIDを含むなら、曲もタグも変更しない', async () => {
    const { services, advance, song, input } = await created();
    advance();
    await rejectsWith(
      services.songs.updateSong(song.id, {
        ...input,
        title: 'changed',
        tagIds: ['no-such-tag'],
      }),
      'tag-not-found',
    );
    assert.deepEqual(await services.songs.getSong(song.id), song);
  });
});

describe('setStatus', () => {
  it('ステータスだけを変え、updatedAt を更新する', async () => {
    const { services, advance } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'practice',
      keyOffset: 3,
      privateNote: 'note',
      tagIds: [rock.id],
    });
    advance();
    const ready = await services.songs.setStatus(song.id, 'ready');
    assert.deepEqual(ready, { ...song, status: 'ready', updatedAt: 2_000 });
  });

  it('同じステータスへの変更は、updatedAt を更新しない', async () => {
    const { services, advance } = await setup();
    const song = await services.songs.createSong({ title: 'a', artist: 'b', status: 'ready' });
    advance();
    assert.deepEqual(await services.songs.setStatus(song.id, 'ready'), song);
  });

  it('存在しない曲・不正なステータスはエラー', async () => {
    const { services } = await setup();
    await rejectsWith(services.songs.setStatus('no-such-song', 'ready'), 'song-not-found');
    const song = await services.songs.createSong({ title: 'a', artist: 'b', status: 'want' });
    await rejectsWith(
      services.songs.setStatus(song.id, 'done' as unknown as 'ready'),
      'invalid-status',
    );
    assert.equal((await services.songs.getSong(song.id))?.status, 'want');
  });
});

describe('deleteSong', () => {
  it('曲とタグの関連を消し、タグは残す', async () => {
    const { services, count } = await setup();
    const rock = await services.tags.getOrCreateTag('Rock');
    const song = await services.songs.createSong({
      title: 'a',
      artist: 'b',
      status: 'ready',
      tagIds: [rock.id],
    });
    const other = await services.songs.createSong({
      title: 'c',
      artist: 'd',
      status: 'ready',
      tagIds: [rock.id],
    });
    await services.songs.deleteSong(song.id);
    assert.equal(await services.songs.getSong(song.id), null);
    assert.equal(count('song_tags'), 1, '他の曲の関連は残る');
    assert.deepEqual(await services.tags.listTags(), [rock]);
    assert.equal((await services.songs.getSong(other.id))?.tags.length, 1);
  });

  it('既に無い曲の削除は、何もせず成功する', async () => {
    const { services } = await setup();
    await services.songs.deleteSong('no-such-song');
  });
});

describe('listSongs', () => {
  // 並び順の確認用に、登録・更新の時刻をずらした曲を用意する。
  async function seeded() {
    const t = await setup();
    const { services, advance } = t;
    const rock = await services.tags.getOrCreateTag('Rock');
    const pop = await services.tags.getOrCreateTag('J-Pop');
    const add = async (
      title: string,
      artist: string,
      status: 'ready' | 'practice' | 'want',
      tagIds: string[] = [],
    ) => {
      const song = await services.songs.createSong({ title, artist, status, tagIds });
      advance();
      return song;
    };
    const cherry = await add('Cherry', 'Spitz', 'ready', [pop.id]);
    const hanabi = await add('hanabi', 'Mr.Children', 'ready', [pop.id, rock.id]);
    const sign = await add('Sign', 'Mr.Children', 'practice', [rock.id]);
    const zeal = await add('Zeal', 'bump', 'want');
    return { ...t, rock, pop, cherry, hanabi, sign, zeal };
  }

  it('条件なしでは更新日の新しい順に、全曲をタグ付きで返す', async () => {
    const { services, pop, rock } = await seeded();
    const songs = await services.songs.listSongs();
    assert.deepEqual(titles(songs), ['Zeal', 'Sign', 'hanabi', 'Cherry']);
    assert.deepEqual(
      songs.map((song) => song.tags.map((tag) => tag.name)),
      [[], ['Rock'], ['J-Pop', 'Rock'], ['J-Pop']],
    );
    assert.deepEqual(songs[2]?.tags, [pop, rock]);
  });

  it('曲が無ければ空の配列', async () => {
    const { services } = await setup();
    assert.deepEqual(await services.songs.listSongs(), []);
  });

  it('ステータスで絞り込む', async () => {
    const { services } = await seeded();
    assert.deepEqual(
      titles(await services.songs.listSongs({ status: 'ready' })),
      ['hanabi', 'Cherry'],
    );
    assert.deepEqual(titles(await services.songs.listSongs({ status: 'want' })), ['Zeal']);
  });

  it('タグで絞り込んでも、曲の他のタグは返す', async () => {
    const { services, rock } = await seeded();
    const songs = await services.songs.listSongs({ tagId: rock.id });
    assert.deepEqual(titles(songs), ['Sign', 'hanabi']);
    assert.deepEqual(
      songs[1]?.tags.map((tag) => tag.name),
      ['J-Pop', 'Rock'],
    );
    assert.deepEqual(await services.songs.listSongs({ tagId: 'no-such-tag' }), []);
  });

  it('曲名またはアーティストに含まれる文字列で検索する（英字の大文字小文字は区別しない）', async () => {
    const { services } = await seeded();
    const search = async (text: string) =>
      titles(await services.songs.listSongs({ search: text, sortBy: 'title', direction: 'asc' }));
    assert.deepEqual(await search('HANA'), ['hanabi']);
    assert.deepEqual(await search('mr.'), ['hanabi', 'Sign'], 'アーティストで一致');
    assert.deepEqual(await search('SPITZ'), ['Cherry'], 'アーティストで一致');
    assert.deepEqual(await search('no match'), []);
  });

  it('検索の前後の空白は無視し、空の検索は絞り込まない', async () => {
    const { services } = await seeded();
    assert.deepEqual(titles(await services.songs.listSongs({ search: '  sign ' })), ['Sign']);
    assert.equal((await services.songs.listSongs({ search: '' })).length, 4);
    assert.equal((await services.songs.listSongs({ search: '   ' })).length, 4);
  });

  it('検索の % _ \\ は、ワイルドカードではなく文字として扱う', async () => {
    const { services } = await setup();
    for (const title of ['100%', 'a_b', 'a\\b', 'axb', '1000']) {
      await services.songs.createSong({ title, artist: 'x', status: 'ready' });
    }
    const search = async (text: string) =>
      titles(await services.songs.listSongs({ search: text, sortBy: 'title', direction: 'asc' }));
    assert.deepEqual(await search('%'), ['100%']);
    assert.deepEqual(await search('a_b'), ['a_b']);
    assert.deepEqual(await search('a\\b'), ['a\\b']);
  });

  it('条件はすべて満たす曲だけを返す（AND）', async () => {
    const { services, rock } = await seeded();
    assert.deepEqual(
      titles(
        await services.songs.listSongs({ status: 'ready', tagId: rock.id, search: 'mr' }),
      ),
      ['hanabi'],
    );
    assert.deepEqual(
      await services.songs.listSongs({ status: 'want', tagId: rock.id }),
      [],
    );
  });

  it('曲名・アーティストは英字の大文字小文字を区別せず並べ、方向を切り替えられる', async () => {
    const { services } = await seeded();
    const sorted = async (sortBy: 'title' | 'artist', direction: 'asc' | 'desc') =>
      titles(await services.songs.listSongs({ sortBy, direction }));
    // 'hanabi' が 'Cherry' と 'Sign' の間に来る（バイナリ順なら末尾になる）。
    assert.deepEqual(await sorted('title', 'asc'), ['Cherry', 'hanabi', 'Sign', 'Zeal']);
    assert.deepEqual(await sorted('title', 'desc'), ['Zeal', 'Sign', 'hanabi', 'Cherry']);
    // アーティストが同じ曲（Mr.Children）は、曲名の昇順になる。
    assert.deepEqual(await sorted('artist', 'asc'), ['Zeal', 'hanabi', 'Sign', 'Cherry']);
    assert.deepEqual(await sorted('artist', 'desc'), ['Cherry', 'hanabi', 'Sign', 'Zeal']);
  });

  it('登録日・更新日で並べる', async () => {
    const { services, advance, cherry } = await seeded();
    const sorted = async (sortBy: 'createdAt' | 'updatedAt', direction: 'asc' | 'desc') =>
      titles(await services.songs.listSongs({ sortBy, direction }));
    assert.deepEqual(await sorted('createdAt', 'asc'), ['Cherry', 'hanabi', 'Sign', 'Zeal']);
    assert.deepEqual(await sorted('createdAt', 'desc'), ['Zeal', 'Sign', 'hanabi', 'Cherry']);
    // 最初の曲を編集すると、更新日だけが新しくなる。
    advance();
    await services.songs.setStatus(cherry.id, 'practice');
    assert.deepEqual(await sorted('updatedAt', 'desc'), ['Cherry', 'Zeal', 'Sign', 'hanabi']);
    assert.deepEqual(await sorted('updatedAt', 'asc'), ['hanabi', 'Sign', 'Zeal', 'Cherry']);
    assert.deepEqual(await sorted('createdAt', 'asc'), ['Cherry', 'hanabi', 'Sign', 'Zeal']);
  });

  it('一覧にない並び替えのキー・方向は、既定（更新日の降順）にする', async () => {
    const { services } = await seeded();
    const expected = ['Zeal', 'Sign', 'hanabi', 'Cherry'];
    // 型の外から来た値（保存した設定の読み戻しなど）。プロトタイプ上の名前も含める。
    for (const sortBy of ['nope', 'constructor', 'toString', '__proto__', '']) {
      assert.deepEqual(
        titles(await services.songs.listSongs({ sortBy: sortBy as never })),
        expected,
        sortBy,
      );
    }
    assert.deepEqual(
      titles(await services.songs.listSongs({ direction: 'sideways' as never })),
      expected,
    );
  });

  it('並べ替えの値が同じ曲は、毎回同じ順序になる', async () => {
    const { services } = await setup();
    // 同じ時刻に登録した曲（更新日が同じ）。
    for (const title of ['b', 'a', 'c']) {
      await services.songs.createSong({ title, artist: 'x', status: 'ready' });
    }
    const first = titles(await services.songs.listSongs());
    assert.deepEqual(first, ['a', 'b', 'c']);
    assert.deepEqual(titles(await services.songs.listSongs()), first);
  });
});

describe('countSongsByStatus', () => {
  it('ステータスごとの曲数を返す（0件のステータスも含む）', async () => {
    const { services } = await setup();
    assert.deepEqual(await services.songs.countSongsByStatus(), {
      ready: 0,
      practice: 0,
      want: 0,
    });
    await services.songs.createSong({ title: 'a', artist: 'x', status: 'ready' });
    await services.songs.createSong({ title: 'b', artist: 'x', status: 'ready' });
    await services.songs.createSong({ title: 'c', artist: 'x', status: 'want' });
    assert.deepEqual(await services.songs.countSongsByStatus(), {
      ready: 2,
      practice: 0,
      want: 1,
    });
  });
});

describe('同時に呼ばれた書き込み', () => {
  it('互いに割り込まず、すべて保存される', async () => {
    const { services } = await setup();
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((title) =>
        services.songs.createSong({ title, artist: 'x', status: 'ready' }),
      ),
    );
    assert.deepEqual(
      titles(await services.songs.listSongs({ sortBy: 'title', direction: 'asc' })),
      ['a', 'b', 'c', 'd', 'e'],
    );
  });
});
