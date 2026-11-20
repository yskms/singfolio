/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import worker from '../src/index.ts';
import { resolveIdentity } from '../src/identity.ts';
import { createSession } from '../src/session.ts';
import { SNAPSHOT_LIMITS } from '../src/snapshot.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';

const song = (overrides: Record<string, unknown> = {}) => ({
  id: ID_1,
  title: 'Blue Hour',
  artist: 'Aoi Lane',
  publicTags: ['Ballad'],
  sortOrder: 0,
  ...overrides,
});
const body = (baseVersion: number, overrides: Record<string, unknown> = {}) => ({
  baseVersion,
  profile: { displayName: 'Yu', bio: 'I sing.' },
  songs: [song()],
  ...overrides,
});

describe('Publish と Unpublish（POST /me/publish・POST /me/unpublish）', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let bucket: R2Bucket;
  let env: Env;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
    bucket = local.env.SNAPSHOTS;
    env = { DB: db, SNAPSHOTS: bucket } as Env;
  });
  after(async () => {
    await local.dispose();
  });

  let counter = 0;
  // テストごとに別のアカウント・別の username（互いに影響しない）。`claim: false` なら、username は確保しない。
  const newAccount = async ({ claim = true } = {}) => {
    const n = counter++;
    const { identityId, userId } = await resolveIdentity(db, 'apple', `publish-test-${n}`, NOW);
    const token = (await createSession(db, identityId, NOW))!;
    const username = `pub_user_${n}`;
    if (claim) await db.prepare('INSERT INTO profiles (user_id, username, created_at) VALUES (?, ?, ?)').bind(userId, username, NOW).run();
    return { userId, token, username };
  };

  const call = (path: string, token: string | null, payload?: unknown, method = 'POST', testEnv: Env = env) =>
    worker.fetch(
      new Request(`https://singfolio.app${path}`, {
        method,
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
      }),
      testEnv,
    );
  const publish = (token: string | null, payload?: unknown, testEnv?: Env) => call('/me/publish', token, payload, 'POST', testEnv);
  const unpublish = (token: string | null, testEnv?: Env) => call('/me/unpublish', token, undefined, 'POST', testEnv);
  const row = (userId: string) =>
    db
      .prepare('SELECT username, version, published_at, display_name, bio FROM profiles WHERE user_id = ?')
      .bind(userId)
      .first<{ username: string; version: number; published_at: number | null; display_name: string; bio: string }>();
  const stored = async (username: string) => {
    const object = await bucket.get(`public/${username}.json`);
    return object === null ? null : await object.text();
  };

  // R2 を使えなくする binding（書き込み・削除が失敗する）。
  const brokenBucket = (): R2Bucket =>
    ({
      put: () => Promise.reject(new Error('R2 is down: SECRET-DETAIL')),
      delete: () => Promise.reject(new Error('R2 is down: SECRET-DETAIL')),
      get: () => Promise.reject(new Error('R2 is down')),
    }) as unknown as R2Bucket;

  describe('Publish', () => {
    it('R2 に公開スナップショットを書き、版を+1して「公開中」にする。Display Name・Bio の控えも残す', async () => {
      const { userId, token, username } = await newAccount();
      const response = await publish(token, body(0));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const { profile } = (await response.json()) as { profile: Record<string, unknown> };
      assert.equal(profile.username, username);
      assert.equal(profile.version, 1);
      assert.equal(profile.published, true);
      assert.equal(profile.displayName, 'Yu');
      assert.equal(profile.bio, 'I sing.');
      assert.equal(typeof profile.publishedAt, 'number');

      const text = await stored(username);
      assert.notEqual(text, null);
      const snapshot = JSON.parse(text!) as Record<string, unknown>;
      assert.deepEqual(snapshot, {
        schema: 1,
        version: 1,
        publishedAt: profile.publishedAt,
        profile: { displayName: 'Yu', bio: 'I sing.' },
        songs: [{ id: ID_1, title: 'Blue Hour', artist: 'Aoi Lane', publicTags: ['Ballad'], sortOrder: 0 }],
      });
      const saved = await row(userId);
      assert.deepEqual(saved, {
        username,
        version: 1,
        published_at: profile.publishedAt,
        display_name: 'Yu',
        bio: 'I sing.',
      });
      // GET /me/profile も同じ内容。
      const read = (await (await call('/me/profile', token, undefined, 'GET')).json()) as { profile: unknown };
      assert.deepEqual(read.profile, profile);
    });

    it('My Key・Private Note・ステータスなど、送られてきた余分な項目は、R2 にも D1 にも残らない', async () => {
      const { userId, token, username } = await newAccount();
      const response = await publish(
        token,
        body(0, {
          songs: [song({ keyOffset: -3, privateNote: 'SECRET-NOTE', status: 'ready', tags: [{ id: 't', name: 'LOCAL-TAG' }] })],
          privateNote: 'SECRET-TOP',
          profile: { displayName: 'Yu', bio: 'hi', email: 'secret@example.com' },
        }),
      );
      assert.equal(response.status, 200);
      const text = (await stored(username))!;
      for (const secret of ['SECRET', 'secret@', 'keyOffset', 'privateNote', 'status', 'LOCAL-TAG', 'email']) {
        assert.equal(text.includes(secret), false, `${secret} が R2 のスナップショットに入っている`);
      }
      const dump = JSON.stringify(await row(userId));
      assert.equal(dump.includes('SECRET'), false);
    });

    it('続けて Publish すると、版が 1、2、3 と上がる。スナップショットは丸ごと差し替わる', async () => {
      const { token, username } = await newAccount();
      assert.equal(((await (await publish(token, body(0))).json()) as { profile: { version: number } }).profile.version, 1);
      const second = await publish(token, body(1, { songs: [song({ id: ID_2, title: 'Red Line' })] }));
      assert.equal(((await second.json()) as { profile: { version: number } }).profile.version, 2);
      const third = await publish(token, body(2, { songs: [] }));
      assert.equal(((await third.json()) as { profile: { version: number } }).profile.version, 3);
      const snapshot = JSON.parse((await stored(username))!) as { version: number; songs: unknown[] };
      assert.equal(snapshot.version, 3);
      assert.deepEqual(snapshot.songs, []);
    });

    it('baseVersion が食い違うと 409。R2 も D1 も変わらず、今の公開内容（profile）を返す', async () => {
      const { userId, token, username } = await newAccount();
      assert.equal((await publish(token, body(0))).status, 200);
      const before = await stored(username);
      const beforeRow = await row(userId);

      // 別の端末（版0のまま）が Publish する。
      const response = await publish(token, body(0, { profile: { displayName: 'Other', bio: '' }, songs: [] }));
      assert.equal(response.status, 409);
      const result = (await response.json()) as { error: string; profile: { version: number; displayName: string; published: boolean } };
      assert.equal(result.error, 'version_conflict');
      assert.equal(result.profile.version, 1);
      assert.equal(result.profile.displayName, 'Yu');
      assert.equal(result.profile.published, true);
      assert.equal(await stored(username), before);
      assert.deepEqual(await row(userId), beforeRow);

      // 先の版（まだ無い版）も 409。
      assert.equal((await publish(token, body(5))).status, 409);
    });

    it('置き換えるなら、サーバーの最新の版を baseVersion にして送り直せる', async () => {
      const { token, username } = await newAccount();
      await publish(token, body(0));
      assert.equal((await publish(token, body(0))).status, 409);
      const retry = await publish(token, body(1, { profile: { displayName: 'Replaced', bio: '' } }));
      assert.equal(retry.status, 200);
      assert.equal((JSON.parse((await stored(username))!) as { profile: { displayName: string } }).profile.displayName, 'Replaced');
    });

    it('同じ版から同時に Publish すると、通るのは1つだけ。負けた端末は R2 に書かない', async () => {
      const { token, username } = await newAccount();
      const responses = await Promise.all(
        ['A', 'B', 'C', 'D'].map((name) => publish(token, body(0, { profile: { displayName: name, bio: '' } }))),
      );
      const statuses = responses.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409, 409, 409]);
      const winner = responses.findIndex((r) => r.status === 200);
      const snapshot = JSON.parse((await stored(username))!) as { version: number; profile: { displayName: string } };
      assert.equal(snapshot.version, 1);
      assert.equal(snapshot.profile.displayName, ['A', 'B', 'C', 'D'][winner]);
    });

    it('username を確保していないと 409 username_required（何も書かない）', async () => {
      const { token } = await newAccount({ claim: false });
      const response = await publish(token, body(0));
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: 'username_required' });
    });

    it('スナップショットが不正なら 400 invalid_snapshot（理由と曲の番号だけ。値は載せない）。何も書かない', async () => {
      const { userId, token, username } = await newAccount();
      const response = await publish(token, body(0, { songs: [song(), song({ id: ID_2, title: 'SECRET-TITLE', artist: '' })] }));
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { error: 'invalid_snapshot', reason: 'artist', index: 1 });
      assert.equal(text.includes('SECRET'), false);
      assert.equal(await stored(username), null);
      assert.equal((await row(userId))!.version, 0);
      assert.equal((await row(userId))!.published_at, null);
    });

    it('baseVersion が整数でない・負・無い、本文が JSON でない、は 400', async () => {
      const { token } = await newAccount();
      for (const baseVersion of [undefined, '0', -1, 1.5, null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal((await publish(token, body(0, { baseVersion }))).status, 400, String(baseVersion));
      }
      assert.equal((await publish(token, 'not json')).status, 400);
      assert.equal((await publish(token, '[]')).status, 400);
    });

    it('本文が大きすぎると 413（読み切る前に断る）', async () => {
      const { token } = await newAccount();
      const huge = body(0, { profile: { displayName: 'Yu', bio: 'x'.repeat(SNAPSHOT_LIMITS.requestBytes) } });
      assert.equal((await publish(token, huge)).status, 413);
    });

    it('曲数が上限を超えると 400 too_many_songs', async () => {
      const { token } = await newAccount();
      const songs = Array.from({ length: SNAPSHOT_LIMITS.songs + 1 }, (_, i) =>
        song({ id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`, sortOrder: i }),
      );
      const response = await publish(token, body(0, { songs }));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_snapshot', reason: 'too_many_songs' });
    });

    it('認証: ヘッダーが無い・形が違う・無効なセッションは 401。メソッドが違えば 405', async () => {
      for (const token of [null, 'short', 'A'.repeat(43)]) {
        assert.equal((await publish(token, body(0))).status, 401);
        assert.equal((await unpublish(token)).status, 401);
      }
      const { token } = await newAccount();
      const get = await call('/me/publish', token, undefined, 'GET');
      assert.equal(get.status, 405);
      assert.equal(get.headers.get('allow'), 'POST');
      assert.equal((await call('/me/unpublish', token, undefined, 'PUT')).status, 405);
    });

    it('R2 に書けなかったら 503。版と控えを元に戻し、同じ baseVersion でやり直せる（見かけ上の衝突にならない）', async () => {
      const { userId, token, username } = await newAccount();
      assert.equal((await publish(token, body(0))).status, 200);
      const failing = { DB: db, SNAPSHOTS: brokenBucket() } as Env;
      const response = await publish(token, body(1, { profile: { displayName: 'NotPublished', bio: 'x' } }), failing);
      assert.equal(response.status, 503);
      assert.equal((await response.text()).includes('SECRET'), false);
      const afterFailure = await row(userId);
      assert.equal(afterFailure!.version, 1);
      assert.equal(afterFailure!.display_name, 'Yu');
      assert.equal(afterFailure!.bio, 'I sing.');
      assert.equal(JSON.parse((await stored(username))!).version, 1);

      const retry = await publish(token, body(1, { profile: { displayName: 'Now', bio: '' } }));
      assert.equal(retry.status, 200);
      assert.equal(JSON.parse((await stored(username))!).version, 2);
    });

    it('最初の Publish が R2 に書けなかったとき、印は立てたまま（安全側）。Unpublish で直る', async () => {
      const { userId, token, username } = await newAccount();
      const failing = { DB: db, SNAPSHOTS: brokenBucket() } as Env;
      assert.equal((await publish(token, body(0), failing)).status, 503);
      const afterFailure = await row(userId);
      assert.equal(afterFailure!.version, 0);
      assert.notEqual(afterFailure!.published_at, null);
      assert.equal(await stored(username), null);

      const fixed = await unpublish(token);
      assert.equal(fixed.status, 200);
      assert.equal((await row(userId))!.published_at, null);
    });

    it('本文の組み立てが失敗しても、D1 には何も書かない（本文は版の予約より前に作る。CPU の打ち切りが予約のあとに来ないように）', async (t) => {
      const { userId, token, username } = await newAccount();
      const stringify = JSON.stringify;
      const mocked = t.mock.method(JSON, 'stringify', ((value: unknown, ...rest: unknown[]) => {
        // R2 に書く本文（スナップショット）だけ失敗させる。ほかの文字列化（応答など）は、そのまま通す。
        if (typeof value === 'object' && value !== null && 'schema' in value && 'songs' in value) throw new Error('boom');
        return (stringify as (...args: unknown[]) => string)(value, ...rest);
      }) as typeof JSON.stringify);
      try {
        // 例外は、Worker の入口では捕まえない（Workers の実行環境が、1101 として扱う）。
        await assert.rejects(publish(token, body(0)), /boom/);
      } finally {
        mocked.mock.restore();
      }
      // 予約より前に失敗したので、版・印・控えのどれも変わらず、R2 にも書かれていない。
      // （予約のあとに組み立てる順序だと、ここで印が立ったままになる: 上の「最初の Publish が R2 に書けなかったとき」と同じ状態。）
      const saved = await row(userId);
      assert.equal(saved!.version, 0);
      assert.equal(saved!.published_at, null);
      assert.equal(saved!.display_name, '');
      assert.equal(await stored(username), null);
      // 直したあとは、同じ baseVersion で Publish できる。
      assert.equal((await publish(token, body(0))).status, 200);
    });
  });

  describe('Unpublish', () => {
    it('R2 のスナップショットを消し、非公開にして、版を+1する。username と控えは残る', async () => {
      const { userId, token, username } = await newAccount();
      await publish(token, body(0));
      const response = await unpublish(token);
      assert.equal(response.status, 200);
      const { profile } = (await response.json()) as { profile: Record<string, unknown> };
      assert.deepEqual(profile, {
        username,
        version: 2,
        published: false,
        publishedAt: null,
        displayName: 'Yu',
        bio: 'I sing.',
      });
      assert.equal(await stored(username), null);
      assert.deepEqual(await row(userId), { username, version: 2, published_at: null, display_name: 'Yu', bio: 'I sing.' });
    });

    it('何度呼んでも同じ（すでに非公開なら、版は上がらない）。一度も Publish していなくても成功する', async () => {
      const { userId, token } = await newAccount();
      const first = await unpublish(token);
      assert.equal(first.status, 200);
      assert.equal((await row(userId))!.version, 0);
      await publish(token, body(0));
      await unpublish(token);
      const again = await unpublish(token);
      assert.equal(((await again.json()) as { profile: { version: number } }).profile.version, 2);
    });

    it('username が無ければ {"profile": null}', async () => {
      const { token } = await newAccount({ claim: false });
      const response = await unpublish(token);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { profile: null });
    });

    it('印が下りているのに R2 に残ったスナップショットも、消す（直す）', async () => {
      const { token, username } = await newAccount();
      await bucket.put(`public/${username}.json`, '{"orphan":true}');
      assert.equal((await unpublish(token)).status, 200);
      assert.equal(await stored(username), null);
    });

    it('R2 を消せなかったら 503。D1 は変えず、印は立てたまま。やり直せる', async () => {
      const { userId, token, username } = await newAccount();
      await publish(token, body(0));
      const failing = { DB: db, SNAPSHOTS: brokenBucket() } as Env;
      const response = await unpublish(token, failing);
      assert.equal(response.status, 503);
      assert.equal((await response.text()).includes('SECRET'), false);
      const afterFailure = await row(userId);
      assert.equal(afterFailure!.version, 1);
      assert.notEqual(afterFailure!.published_at, null);
      assert.notEqual(await stored(username), null);
      assert.equal((await unpublish(token)).status, 200);
      assert.equal(await stored(username), null);
    });

    it('Unpublish のあと、古い版のままの端末の Publish は 409（公開を勝手に戻さない）。最新の版なら公開し直せる', async () => {
      const { token, username } = await newAccount();
      await publish(token, body(0));
      await unpublish(token);
      const stale = await publish(token, body(1));
      assert.equal(stale.status, 409);
      const conflict = (await stale.json()) as { profile: { published: boolean; version: number } };
      assert.equal(conflict.profile.published, false);
      assert.equal(conflict.profile.version, 2);
      assert.equal(await stored(username), null);

      const again = await publish(token, body(2));
      assert.equal(again.status, 200);
      assert.notEqual(await stored(username), null);
    });
  });

  it('R2 のキーは username から作る（ユーザーIDではない）', async () => {
    const { userId, token, username } = await newAccount();
    await publish(token, body(0));
    assert.notEqual(await bucket.get(`public/${username}.json`), null);
    assert.equal(await bucket.get(`public/${userId}.json`), null);
    const { objects } = await bucket.list({ prefix: 'public/' });
    assert.equal(objects.some((object) => object.key.includes(userId)), false);
  });
});
