// 外部の楽曲検索のgatewayのテスト。`npm test` で実行する。偽の `fetch` で動かすので、
// 実際の提供元には通信しない（応答の形は、実測の結果を縮めたもの）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSearchUrl,
  CatalogError,
  createSongCatalogRepository,
  storeForLanguage,
  type FetchLike,
} from './songCatalogRepository.ts';

function respond(status: number, body: unknown): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const songsBody = {
  resultCount: 4,
  results: [
    { kind: 'song', trackName: '紅蓮華', artistName: 'LiSA', primaryGenreName: 'J-Pop' },
    { kind: 'song', trackName: '紅蓮華 -TV ver.-', artistName: 'LiSA', primaryGenreName: 'アニメ' },
    { kind: 'song', trackName: '紅蓮華', artistName: '稲垣涼子' },
    // 形が違うものは読み飛ばす
    { kind: 'song', trackName: 'no artist' },
    'not an object',
  ],
};

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof CatalogError && error.code === code);
}

describe('buildSearchUrl', () => {
  it('検索語をエンコードし、ストア・件数・種類を付ける。lang は送らない', () => {
    const url = buildSearchUrl('ぐれんげ LiSA', 'JP', 'song');
    assert.equal(
      url,
      'https://itunes.apple.com/search?term=%E3%81%90%E3%82%8C%E3%82%93%E3%81%92%20LiSA' +
        '&media=music&entity=song&country=JP&limit=25',
    );
    assert.ok(!url.includes('lang='));
  });

  it('アーティストは、曲の検索の artistTerm で探す（entity=musicArtist は使わない）', () => {
    const url = buildSearchUrl('よねづ', 'US', 'artist');
    assert.ok(url.includes('entity=song'));
    assert.ok(url.endsWith('&attribute=artistTerm'));
    assert.ok(url.includes('country=US'));
    assert.ok(!url.includes('musicArtist'));
  });

  it('& や = を含む検索語が、他のパラメータに混ざらない', () => {
    const url = buildSearchUrl('A&country=KR=', 'JP', 'song');
    assert.ok(url.includes('term=A%26country%3DKR%3D&'));
    assert.equal(url.match(/country=/g)?.length, 1);
  });
});

describe('storeForLanguage', () => {
  it('日本語なら JP、それ以外は US', () => {
    assert.equal(storeForLanguage('ja'), 'JP');
    assert.equal(storeForLanguage('en'), 'US');
  });
});

describe('searchSongs', () => {
  it('曲名・アーティスト・ジャンルに変換する。形が違うものは読み飛ばす', async () => {
    const catalog = createSongCatalogRepository(respond(200, songsBody));
    assert.deepEqual(await catalog.searchSongs('ぐれんげ', 'JP'), [
      { title: '紅蓮華', artist: 'LiSA', genre: 'J-Pop' },
      { title: '紅蓮華 -TV ver.-', artist: 'LiSA', genre: 'アニメ' },
      { title: '紅蓮華', artist: '稲垣涼子', genre: null },
    ]);
  });

  it('検索のURLを、signal 付きで fetch に渡す', async () => {
    const seen: { url: string; signal: AbortSignal }[] = [];
    const catalog = createSongCatalogRepository(async (url, init) => {
      seen.push({ url, signal: init.signal });
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    });
    await catalog.searchSongs('夜に駆', 'US');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.url, buildSearchUrl('夜に駆', 'US', 'song'));
    assert.equal(seen[0]?.signal.aborted, false);
  });

  it('結果が0件でも成功（空の配列）', async () => {
    const catalog = createSongCatalogRepository(respond(200, { resultCount: 0, results: [] }));
    assert.deepEqual(await catalog.searchSongs('zzz', 'US'), []);
  });
});

describe('searchArtists', () => {
  it('アーティスト名を、重複なし・出てきた順で返す', async () => {
    const catalog = createSongCatalogRepository(respond(200, songsBody));
    assert.deepEqual(await catalog.searchArtists('りさ', 'JP'), ['LiSA', '稲垣涼子']);
  });
});

describe('失敗', () => {
  it('429 と 403 は rate-limited', async () => {
    for (const status of [429, 403]) {
      const catalog = createSongCatalogRepository(respond(status, {}));
      await rejectsWith(catalog.searchSongs('ひとり', 'JP'), 'rate-limited');
    }
  });

  it('それ以外のHTTPエラーは invalid-response', async () => {
    for (const status of [400, 500, 503]) {
      const catalog = createSongCatalogRepository(respond(status, {}));
      await rejectsWith(catalog.searchSongs('ひとり', 'JP'), 'invalid-response');
    }
  });

  it('fetch が失敗（オフラインなど）したら network', async () => {
    const catalog = createSongCatalogRepository(async () => {
      throw new TypeError('Network request failed');
    });
    await rejectsWith(catalog.searchSongs('ひとり', 'JP'), 'network');
  });

  it('JSONでない・想定外の形の応答は invalid-response', async () => {
    const notJson = createSongCatalogRepository(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }));
    await rejectsWith(notJson.searchSongs('ひとり', 'JP'), 'invalid-response');
    for (const body of [null, 'text', [], { results: 'x' }, { resultCount: 0 }]) {
      const catalog = createSongCatalogRepository(respond(200, body));
      await rejectsWith(catalog.searchSongs('ひとり', 'JP'), 'invalid-response');
    }
  });

  it('応答が遅いと、上限で打ち切って network にする', async () => {
    const catalog = createSongCatalogRepository(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 20 },
    );
    await rejectsWith(catalog.searchSongs('ひとり', 'JP'), 'network');
  });
});
