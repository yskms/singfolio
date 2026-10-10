// 候補（suggestions）のServiceのテスト。`npm test` で実行する。実際のSQL（node:sqlite）と、
// 偽の `fetch`（提供元には通信しない）で動かす。時計は手で進める。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FetchLike } from '../repositories/songCatalogRepository.ts';
import { createTestServices } from '../testing/testDatabase.ts';

type Handler = (url: string, call: number) => { status: number; body?: unknown } | Promise<never>;

/** 呼ばれたURLを記録する偽の `fetch`。 */
function fakeFetch(handler: Handler) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const { status, body } = await handler(url, calls.length);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

const songsBody = (...items: [title: string, artist: string, genre?: string][]) => ({
  resultCount: items.length,
  results: items.map(([trackName, artistName, primaryGenreName]) => ({
    kind: 'song',
    trackName,
    artistName,
    primaryGenreName,
  })),
});

const ok = (...items: [string, string, string?][]): Handler => () => ({
  status: 200,
  body: songsBody(...items),
});

const MINUTE = 60_000;

describe('提供元が組み込まれていないとき', () => {
  it('available が false で、曲・アーティストの外部の候補は空（何も送らない）', async () => {
    const { services } = await createTestServices();
    assert.equal(services.suggestions.available, false);
    assert.deepEqual(
      await services.suggestions.catalogSongs({ title: 'ぐれんげ', artist: '', language: 'ja' }),
      [],
    );
    assert.deepEqual(await services.suggestions.catalogArtists({ artist: 'ヨルシカ', language: 'ja' }), []);
  });

  it('登録済みのアーティストの候補は、これまでどおり出る', async () => {
    const { services } = await createTestServices();
    await services.songs.createSong({ title: '夜に駆ける', artist: 'YOASOBI', status: 'ready' });
    assert.deepEqual(await services.suggestions.localArtists('yo'), ['YOASOBI']);
  });
});

describe('catalogSongs', () => {
  it('提供元の結果を、曲の候補にして返す。検索語は曲名（アーティストがあれば加える）', async () => {
    const { fetch, calls } = fakeFetch(ok(['紅蓮華', 'LiSA', 'J-Pop']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    assert.equal(services.suggestions.available, true);

    assert.deepEqual(
      await services.suggestions.catalogSongs({ title: 'ぐれんげ', artist: '', language: 'ja' }),
      [{ title: '紅蓮華', artist: 'LiSA', registered: false }],
    );
    await services.suggestions.catalogSongs({ title: 'ぐれんげ', artist: ' LiSA ', language: 'ja' });
    assert.ok(calls[0]?.includes('term=%E3%81%90%E3%82%8C%E3%82%93%E3%81%92&'));
    assert.ok(calls[1]?.includes('term=%E3%81%90%E3%82%8C%E3%82%93%E3%81%92%20LiSA&'));
  });

  it('ストアは表示言語で決める（ja → JP、en → US）。lang は送らない', async () => {
    const { fetch, calls } = fakeFetch(ok(['Gurenge', 'LiSA']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    await services.suggestions.catalogSongs({ title: 'ぐれんげ', artist: '', language: 'ja' });
    await services.suggestions.catalogSongs({ title: 'ぐれんげ', artist: '', language: 'en' });
    assert.ok(calls[0]?.includes('country=JP'));
    assert.ok(calls[1]?.includes('country=US'));
    assert.ok(calls.every((url) => !url.includes('lang=')));
  });

  it('既に曲にある（曲名, アーティスト）には registered を付ける。重複登録は止めない', async () => {
    const { fetch } = fakeFetch(ok(['紅蓮華', 'LiSA'], ['紅蓮華', '稲垣涼子']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    await services.songs.createSong({ title: '紅蓮華', artist: 'lisa', status: 'ready' });
    const found = await services.suggestions.catalogSongs({ title: '紅蓮', artist: '', language: 'ja' });
    assert.deepEqual(
      found.map((s) => [s.artist, s.registered]),
      [
        ['LiSA', true],
        ['稲垣涼子', false],
      ],
    );
  });

  it('2文字未満は送らない（searchKey で比べた後の長さ）', async () => {
    const { fetch, calls } = fakeFetch(ok(['愛', 'A']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    for (const title of ['', ' ', '愛', '　愛　']) {
      assert.deepEqual(await services.suggestions.catalogSongs({ title, artist: '', language: 'ja' }), []);
    }
    assert.equal(calls.length, 0);
    await services.suggestions.catalogSongs({ title: '愛し', artist: '', language: 'ja' });
    assert.equal(calls.length, 1);
  });

  it('設定でオフなら送らない。オンに戻せば送る', async () => {
    const { fetch, calls } = fakeFetch(ok(['紅蓮華', 'LiSA']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    await services.settings.setSuggestionsEnabled(false);
    assert.deepEqual(await services.suggestions.catalogSongs({ title: '紅蓮', artist: '', language: 'ja' }), []);
    assert.deepEqual(await services.suggestions.catalogArtists({ artist: 'LiSA', language: 'ja' }), []);
    assert.equal(calls.length, 0);

    await services.settings.setSuggestionsEnabled(true);
    assert.equal((await services.suggestions.catalogSongs({ title: '紅蓮', artist: '', language: 'ja' })).length, 1);
    assert.equal(calls.length, 1);
  });
});

describe('catalogArtists', () => {
  it('曲の検索の artistTerm で探し、アーティスト名を返す（共演の表記は後ろ）', async () => {
    const { fetch, calls } = fakeFetch(
      ok(['Lemon', '米津玄師 & 宇多田ヒカル'], ['Lemon', '米津玄師'], ['Lemon', '米津玄師']),
    );
    const { services } = await createTestServices({ catalogFetch: fetch });
    assert.deepEqual(await services.suggestions.catalogArtists({ artist: 'よねづ', language: 'ja' }), [
      '米津玄師',
      '米津玄師 & 宇多田ヒカル',
    ]);
    assert.ok(calls[0]?.includes('attribute=artistTerm'));
  });
});

describe('キャッシュと同時リクエスト', () => {
  it('同じ検索は1回しか送らない。ストアが違えば別の検索', async () => {
    const { fetch, calls } = fakeFetch(ok(['紅蓮華', 'LiSA']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    const input = { title: '紅蓮', artist: '', language: 'ja' } as const;
    await services.suggestions.catalogSongs(input);
    await services.suggestions.catalogSongs(input);
    assert.equal(calls.length, 1);
    await services.suggestions.catalogSongs({ ...input, language: 'en' });
    assert.equal(calls.length, 2);
  });

  it('曲の検索とアーティストの検索は別（同じ検索語でも）', async () => {
    const { fetch, calls } = fakeFetch(ok(['紅蓮華', 'LiSA']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    await services.suggestions.catalogSongs({ title: 'LiSA', artist: '', language: 'ja' });
    await services.suggestions.catalogArtists({ artist: 'LiSA', language: 'ja' });
    assert.equal(calls.length, 2);
  });

  it('有効期限を過ぎたら送り直す', async () => {
    const { fetch, calls } = fakeFetch(ok(['紅蓮華', 'LiSA']));
    const { services, advance } = await createTestServices({ catalogFetch: fetch });
    const input = { title: '紅蓮', artist: '', language: 'ja' } as const;
    await services.suggestions.catalogSongs(input);
    advance(9 * MINUTE);
    await services.suggestions.catalogSongs(input);
    assert.equal(calls.length, 1);
    advance(2 * MINUTE);
    await services.suggestions.catalogSongs(input);
    assert.equal(calls.length, 2);
  });

  it('0件の成功はキャッシュする（見つからなかったことを覚える）', async () => {
    const { fetch, calls } = fakeFetch(ok());
    const { services } = await createTestServices({ catalogFetch: fetch });
    const input = { title: 'zzzz', artist: '', language: 'en' } as const;
    assert.deepEqual(await services.suggestions.catalogSongs(input), []);
    assert.deepEqual(await services.suggestions.catalogSongs(input), []);
    assert.equal(calls.length, 1);
  });

  it('同時に同じ検索をしても、送るのは1回', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      await gate;
      return { ok: true, status: 200, json: async () => songsBody(['紅蓮華', 'LiSA']) };
    };
    const { services } = await createTestServices({ catalogFetch: fetch });
    const input = { title: '紅蓮', artist: '', language: 'ja' } as const;
    const first = services.suggestions.catalogSongs(input);
    const second = services.suggestions.catalogSongs(input);
    // どちらも「送る」ところまで進めてから、応答を返す
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls.length, 1);
    assert.deepEqual(a, b);
    assert.equal(a.length, 1);
  });

  it('キャッシュの件数に上限がある（古いものから捨て、また送る）', async () => {
    const { fetch, calls } = fakeFetch(ok(['a', 'b']));
    const { services, advance } = await createTestServices({ catalogFetch: fetch });
    const search = (n: number) =>
      services.suggestions.catalogSongs({ title: `検索${n}`, artist: '', language: 'ja' });
    // 予算（1分あたり）に当たらないよう、時間を進めながら51種類を検索する
    for (let n = 0; n <= 50; n++) {
      await search(n);
      advance(5_000);
    }
    assert.equal(calls.length, 51);
    await search(50); // 新しいものは残っている
    assert.equal(calls.length, 51);
    await search(0); // 最初のものは捨てられた
    assert.equal(calls.length, 52);
  });
});

describe('失敗', () => {
  it('失敗は reject せず空にする。キャッシュせず、一時停止が明けたら送り直す', async () => {
    const { fetch, calls } = fakeFetch((_url, call) =>
      call === 1 ? { status: 500, body: {} } : { status: 200, body: songsBody(['紅蓮華', 'LiSA']) },
    );
    const { services, advance } = await createTestServices({ catalogFetch: fetch });
    const input = { title: '紅蓮', artist: '', language: 'ja' } as const;

    assert.deepEqual(await services.suggestions.catalogSongs(input), []);
    assert.equal(calls.length, 1);
    // 一時停止中は送らない（別の検索語でも）
    assert.deepEqual(await services.suggestions.catalogSongs(input), []);
    await services.suggestions.catalogSongs({ ...input, title: '夜に駆' });
    assert.equal(calls.length, 1);

    advance(6_000);
    assert.equal((await services.suggestions.catalogSongs(input)).length, 1);
    assert.equal(calls.length, 2); // 失敗を「0件」として覚えていない
  });

  it('通信できない（fetch が例外）ときも、空にして一時停止する', async () => {
    const { fetch, calls } = fakeFetch(() => Promise.reject(new TypeError('Network request failed')));
    const { services } = await createTestServices({ catalogFetch: fetch });
    assert.deepEqual(await services.suggestions.catalogSongs({ title: '紅蓮', artist: '', language: 'ja' }), []);
    assert.deepEqual(await services.suggestions.catalogSongs({ title: '夜に駆', artist: '', language: 'ja' }), []);
    assert.equal(calls.length, 1);
  });

  it('回数の制限（429）の後は、通常の失敗より長く止める', async () => {
    const { fetch, calls } = fakeFetch((_url, call) =>
      call === 1 ? { status: 429 } : { status: 200, body: songsBody(['紅蓮華', 'LiSA']) },
    );
    const { services, advance } = await createTestServices({ catalogFetch: fetch });
    const input = { title: '紅蓮', artist: '', language: 'ja' } as const;
    assert.deepEqual(await services.suggestions.catalogSongs(input), []);

    advance(10_000);
    assert.deepEqual(await services.suggestions.catalogSongs(input), []);
    assert.equal(calls.length, 1);

    advance(25_000);
    assert.equal((await services.suggestions.catalogSongs(input)).length, 1);
    assert.equal(calls.length, 2);
  });

  it('止めている間も、登録済みのアーティストの候補は出る', async () => {
    const { fetch } = fakeFetch(() => ({ status: 429 }));
    const { services } = await createTestServices({ catalogFetch: fetch });
    await services.songs.createSong({ title: '夜に駆ける', artist: 'YOASOBI', status: 'ready' });
    await services.suggestions.catalogSongs({ title: '紅蓮', artist: '', language: 'ja' });
    assert.deepEqual(await services.suggestions.catalogArtists({ artist: 'yo', language: 'ja' }), []);
    assert.deepEqual(await services.suggestions.localArtists('yo'), ['YOASOBI']);
  });
});

describe('送信の予算', () => {
  it('1分あたりの上限を超える検索は送らない。時間が経てば送れる', async () => {
    const { fetch, calls } = fakeFetch(ok(['a', 'b']));
    const { services, advance } = await createTestServices({ catalogFetch: fetch });
    const search = (n: number) =>
      services.suggestions.catalogSongs({ title: `検索${n}`, artist: '', language: 'ja' });

    for (let n = 0; n < 15; n++) await search(n);
    assert.equal(calls.length, 15);

    assert.deepEqual(await search(15), []); // 予算切れ。送らない
    assert.equal(calls.length, 15);

    advance(MINUTE + 1);
    assert.equal((await search(15)).length, 1);
    assert.equal(calls.length, 16);
  });

  it('キャッシュに当たる検索は、予算を使わない', async () => {
    const { fetch, calls } = fakeFetch(ok(['a', 'b']));
    const { services } = await createTestServices({ catalogFetch: fetch });
    for (let i = 0; i < 40; i++) {
      await services.suggestions.catalogSongs({ title: '同じ検索', artist: '', language: 'ja' });
    }
    assert.equal(calls.length, 1);
  });
});

describe('localArtists', () => {
  it('searchKey で含むものを、前方一致を先に、曲数の多い順に返す。通信しない', async () => {
    const { fetch, calls } = fakeFetch(ok());
    const { services } = await createTestServices({ catalogFetch: fetch });
    for (const [title, artist] of [
      ['A', 'Mrs. GREEN APPLE'],
      ['B', 'back number'],
      ['C', 'back number'],
      ['D', 'ナンバーガール'],
      ['E', 'Number Girl'],
      ['F', 'Number Girl'],
      ['G', 'Number Girl'],
    ] as const) {
      await services.songs.createSong({ title, artist, status: 'ready' });
    }
    // 'number' を含む: 前方一致の Number Girl（3曲）が先、次に back number（2曲）
    assert.deepEqual(await services.suggestions.localArtists('number'), ['Number Girl', 'back number']);
    // カタカナ・ひらがなを同一視する
    assert.deepEqual(await services.suggestions.localArtists('なんばー'), ['ナンバーガール']);
    assert.equal(calls.length, 0);
  });

  it('1文字から出す。空・入力と同じ文字列は出さない。最大4件', async () => {
    const { services } = await createTestServices();
    for (let i = 0; i < 6; i++) {
      await services.songs.createSong({ title: `曲${i}`, artist: `ア${i}`, status: 'ready' });
    }
    assert.equal((await services.suggestions.localArtists('ア')).length, 4);
    assert.deepEqual(await services.suggestions.localArtists(''), []);
    assert.deepEqual(await services.suggestions.localArtists('  '), []);
    assert.ok(!(await services.suggestions.localArtists('ア1')).includes('ア1'));
  });
});
