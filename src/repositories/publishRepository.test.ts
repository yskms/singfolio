// 公開プロフィール・Publish・Unpublish のHTTPのテスト。`npm test` で実行する。偽の `fetch` で動かすので、実際のサーバーには
// 通信しない（応答の形は docs/singfolio-publishing-backend.md §8 と worker/src/profile.ts・publish.ts による）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PublicProfile } from '../domain/types.ts';
import type { ApiFetchLike } from './apiClient.ts';
import { AuthError } from './authError.ts';
import { PublishError } from './publishError.ts';
import { createPublishRepository, PUBLISH_TIMEOUT_MS } from './publishRepository.ts';

type Init = Parameters<ApiFetchLike>[1];

function fakeFetch(respond: (url: string, init: Init) => ReturnType<ApiFetchLike> | Error) {
  const calls: { url: string; init: Init }[] = [];
  const fetchImpl: ApiFetchLike = async (url, init) => {
    calls.push({ url, init });
    const result = respond(url, init);
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetchImpl, calls };
}

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

const SESSION = 'S'.repeat(43);

const profile: PublicProfile = {
  username: 'karaoke_fan',
  version: 3,
  published: true,
  publishedAt: 1_700_000_000_000,
  displayName: 'Karaoke Fan',
  bio: 'hi',
};

async function rejectsAuth(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AuthError && error.code === code);
}
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

describe('共通: 認証と失敗の分類', () => {
  const calls = [
    ['getProfile', (r: ReturnType<typeof createPublishRepository>) => r.getProfile(SESSION)],
    ['claimUsername', (r: ReturnType<typeof createPublishRepository>) => r.claimUsername(SESSION, 'karaoke_fan')],
    ['publish', (r: ReturnType<typeof createPublishRepository>) => r.publish(SESSION, { baseVersion: 0 })],
    ['unpublish', (r: ReturnType<typeof createPublishRepository>) => r.unpublish(SESSION)],
  ] as const;

  for (const [name, call] of calls) {
    it(`${name}: セッションを Bearer で送り、Cookie は送らない`, async () => {
      const { fetchImpl, calls: sent } = fakeFetch(() => reply(200, { profile }));
      await call(createPublishRepository(fetchImpl));
      assert.equal(sent[0]!.init.headers.Authorization, `Bearer ${SESSION}`);
      assert.equal(sent[0]!.init.credentials, 'omit');
    });

    it(`${name}: 401 は unauthorized、429・5xx は unavailable、通信の失敗は network`, async () => {
      const status = (code: number) => createPublishRepository(fakeFetch(() => reply(code)).fetchImpl);
      await rejectsAuth(call(status(401)), 'unauthorized');
      await rejectsAuth(call(status(429)), 'unavailable');
      await rejectsAuth(call(status(503)), 'unavailable');
      await rejectsAuth(call(status(500)), 'unavailable');
      await rejectsAuth(call(createPublishRepository(fakeFetch(() => new Error('offline')).fetchImpl)), 'network');
    });

    it(`${name}: 応答の本文が想定の形でなければ invalid-response（Profile の項目の型違いを含む）`, async () => {
      for (const body of [null, 'text', {}, { profile: 'x' }, { profile: { ...profile, version: 1.5 } }, { profile: { ...profile, published: 'yes' } }]) {
        await rejectsAuth(call(createPublishRepository(fakeFetch(() => reply(200, body)).fetchImpl)), 'invalid-response');
      }
    });
  }
});

describe('getProfile', () => {
  it('GET /me/profile。本文も Content-Type も付けない', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { profile }));
    assert.deepEqual(await createPublishRepository(fetchImpl).getProfile(SESSION), profile);
    assert.equal(calls[0]!.url, 'https://singfolio.app/me/profile');
    assert.equal(calls[0]!.init.method, 'GET');
    assert.equal(calls[0]!.init.body, undefined);
    assert.equal(calls[0]!.init.headers['Content-Type'], undefined);
  });

  it('username を確保していなければ null', async () => {
    const { fetchImpl } = fakeFetch(() => reply(200, { profile: null }));
    assert.equal(await createPublishRepository(fetchImpl).getProfile(SESSION), null);
  });

  it('非公開（publishedAt が null）も読める。サーバーが足した項目は画面に届かない', async () => {
    const { fetchImpl } = fakeFetch(() =>
      reply(200, { profile: { ...profile, published: false, publishedAt: null, userId: 'secret' } }),
    );
    const result = await createPublishRepository(fetchImpl).getProfile(SESSION);
    assert.deepEqual(result, { ...profile, published: false, publishedAt: null });
    assert.equal('userId' in (result ?? {}), false);
  });
});

describe('claimUsername', () => {
  it('PUT /me/username に username だけを送る', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { profile: { ...profile, version: 0 } }));
    const result = await createPublishRepository(fetchImpl).claimUsername(SESSION, 'karaoke_fan');
    assert.equal(result.username, 'karaoke_fan');
    assert.equal(calls[0]!.url, 'https://singfolio.app/me/username');
    assert.equal(calls[0]!.init.method, 'PUT');
    assert.deepEqual(JSON.parse(calls[0]!.init.body ?? ''), { username: 'karaoke_fan' });
  });

  it('サーバーが理由を返して断ったものは PublishError', async () => {
    const repo = (status: number, error: string) => createPublishRepository(fakeFetch(() => reply(status, { error })).fetchImpl);
    await rejectsPublish(repo(400, 'username_invalid').claimUsername(SESSION, 'X'), 'username-invalid');
    await rejectsPublish(repo(409, 'username_unavailable').claimUsername(SESSION, 'admin'), 'username-unavailable');
    await rejectsPublish(repo(409, 'username_already_set').claimUsername(SESSION, 'other'), 'username-already-set');
  });

  it('理由の分からない 400 は invalid-request、JSONでない 4xx も invalid-request', async () => {
    await rejectsAuth(
      createPublishRepository(fakeFetch(() => reply(400, { error: 'invalid_request' })).fetchImpl).claimUsername(SESSION, 'a'),
      'invalid-request',
    );
    const broken = Promise.resolve({
      ok: false,
      status: 409,
      json: async () => {
        throw new SyntaxError('not json');
      },
    });
    await rejectsAuth(createPublishRepository(fakeFetch(() => broken).fetchImpl).claimUsername(SESSION, 'a'), 'invalid-request');
  });
});

describe('publish', () => {
  const body = { baseVersion: 2, profile: { displayName: 'M', bio: '' }, songs: [] };

  it('POST /me/publish に本文をそのまま送り、版が進んだ Profile を返す', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply(200, { profile }));
    assert.deepEqual(await createPublishRepository(fetchImpl).publish(SESSION, body), profile);
    assert.equal(calls[0]!.url, 'https://singfolio.app/me/publish');
    assert.equal(calls[0]!.init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0]!.init.body ?? ''), body);
  });

  it('409 version_conflict は PublishError と、サーバーの今の Profile', async () => {
    const { fetchImpl } = fakeFetch(() => reply(409, { error: 'version_conflict', profile }));
    const error = await rejectsPublish(createPublishRepository(fetchImpl).publish(SESSION, body), 'version-conflict');
    assert.deepEqual(error.profile, profile);
  });

  it('version_conflict の本文に Profile が無い・壊れていれば invalid-response（置き換えの確認に進めない）', async () => {
    for (const payload of [{ error: 'version_conflict' }, { error: 'version_conflict', profile: { username: 1 } }]) {
      const { fetchImpl } = fakeFetch(() => reply(409, payload));
      await rejectsAuth(createPublishRepository(fetchImpl).publish(SESSION, body), 'invalid-response');
    }
  });

  it('username_required・invalid_snapshot・413 を PublishError にする。invalid_snapshot の本文（理由・曲の番号）は載せない', async () => {
    const repo = (status: number, payload: unknown) => createPublishRepository(fakeFetch(() => reply(status, payload)).fetchImpl);
    await rejectsPublish(repo(409, { error: 'username_required' }).publish(SESSION, body), 'username-required');
    const invalid = await rejectsPublish(repo(400, { error: 'invalid_snapshot', reason: 'title', index: 4 }).publish(SESSION, body), 'invalid-snapshot');
    assert.equal(invalid.message, 'invalid-snapshot');
    await rejectsPublish(repo(413, { error: 'payload_too_large' }).publish(SESSION, body), 'too-large');
    await rejectsPublish(repo(413, 'too large').publish(SESSION, body), 'too-large');
  });

  it('待つ上限は、ほかより長い（30秒）', async () => {
    assert.equal(PUBLISH_TIMEOUT_MS, 30_000);
    let aborted = false;
    const fetchImpl: ApiFetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    // 上限を短くして、時間切れが network になることを確かめる。
    await rejectsAuth(createPublishRepository(fetchImpl, { publishTimeoutMs: 20 }).publish(SESSION, body), 'network');
    assert.equal(aborted, true);
  });
});

describe('unpublish', () => {
  it('POST /me/unpublish。非公開になった Profile を返す。username が無ければ null', async () => {
    const off = { ...profile, published: false, publishedAt: null, version: 4 };
    const first = fakeFetch(() => reply(200, { profile: off }));
    assert.deepEqual(await createPublishRepository(first.fetchImpl).unpublish(SESSION), off);
    assert.equal(first.calls[0]!.url, 'https://singfolio.app/me/unpublish');
    assert.equal(first.calls[0]!.init.method, 'POST');

    const none = fakeFetch(() => reply(200, { profile: null }));
    assert.equal(await createPublishRepository(none.fetchImpl).unpublish(SESSION), null);
  });
});
