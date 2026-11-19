/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import worker from '../src/index.ts';
import { resolveIdentity } from '../src/identity.ts';
import { claimUsername, getProfile } from '../src/profile.ts';
import { createSession } from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;

describe('公開プロフィール（GET /me/profile・PUT /me/username）', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let env: Env;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
    env = { DB: db } as Env;
  });
  after(async () => {
    await local.dispose();
  });

  let counter = 0;
  // テストごとに別のアカウント（互いに影響しない）とセッション。
  const newAccount = async () => {
    const { identityId, userId } = await resolveIdentity(db, 'apple', `profile-test-${counter++}`, NOW);
    const token = await createSession(db, identityId, NOW);
    assert.notEqual(token, null);
    return { userId, token: token! };
  };

  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    worker.fetch(
      new Request(`https://singfolio.app${path}`, {
        method,
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      }),
      env,
    );
  const claim = (token: string | null, username: unknown) => call('PUT', '/me/username', token, { username });
  const profileOf = async (token: string) => ((await (await call('GET', '/me/profile', token)).json()) as { profile: unknown }).profile;

  it('確保する前は profile が null', async () => {
    const { token } = await newAccount();
    const response = await call('GET', '/me/profile', token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { profile: null });
  });

  it('username を確保できる。確保したあとは、版0・非公開・空の控えで読める', async () => {
    const { token } = await newAccount();
    const response = await claim(token, 'singer_one');
    assert.equal(response.status, 200);
    const expected = {
      profile: { username: 'singer_one', version: 0, published: false, publishedAt: null, displayName: '', bio: '' },
    };
    assert.deepEqual(await response.json(), expected);
    assert.deepEqual({ profile: await profileOf(token) }, expected);
  });

  it('同じアカウントが同じ名前を確保し直しても成功する（何度呼んでも同じ。連打も）', async () => {
    const { token } = await newAccount();
    const results = await Promise.all([claim(token, 'tapper_a'), claim(token, 'tapper_a'), claim(token, 'tapper_a')]);
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
    assert.equal((await claim(token, 'tapper_a')).status, 200);
  });

  it('確保したあとに別の名前は取れない（変更しない）。元の名前は変わらない', async () => {
    const { token } = await newAccount();
    assert.equal((await claim(token, 'first_name')).status, 200);
    const response = await claim(token, 'second_name');
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'username_already_set' });
    assert.equal(((await profileOf(token)) as { username: string }).username, 'first_name');
  });

  it('ほかのアカウントが取った名前は取れない。取れなかったアカウントに行は残らない', async () => {
    const a = await newAccount();
    const b = await newAccount();
    assert.equal((await claim(a.token, 'popular_name')).status, 200);
    const response = await claim(b.token, 'popular_name');
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'username_unavailable' });
    assert.equal(await profileOf(b.token), null);
    // 取れなかったアカウントは、別の名前なら取れる。
    assert.equal((await claim(b.token, 'other_name')).status, 200);
  });

  it('同時に同じ名前を確保しても、勝つのは1つだけ', async () => {
    const accounts = await Promise.all([newAccount(), newAccount(), newAccount(), newAccount()]);
    const responses = await Promise.all(accounts.map((a) => claim(a.token, 'race_name')));
    const statuses = responses.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409]);
    const { results } = await db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE username = 'race_name'").all<{ n: number }>();
    assert.equal(results[0]!.n, 1);
  });

  it('削除したアカウントの名前（retired_usernames）は取れない', async () => {
    const { token } = await newAccount();
    await db.prepare("INSERT INTO retired_usernames (username, retired_at) VALUES ('gone_name', ?)").bind(NOW).run();
    const response = await claim(token, 'gone_name');
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'username_unavailable' });
    assert.equal(await profileOf(token), null);
  });

  it('予約語は取れない（409。規則に合わないものは400）', async () => {
    const { token } = await newAccount();
    for (const name of ['admin', 'api', 'singfolio']) {
      const response = await claim(token, name);
      assert.equal(response.status, 409, name);
      assert.deepEqual(await response.json(), { error: 'username_unavailable' });
    }
    for (const name of ['ab', 'Upper_Case', 'with-hyphen', 'a'.repeat(21), '', 'abc\n']) {
      const response = await claim(token, name);
      assert.equal(response.status, 400, JSON.stringify(name));
      assert.deepEqual(await response.json(), { error: 'username_invalid' });
    }
    assert.equal(await profileOf(token), null);
  });

  it('本文の不備は400（username が文字列でない・JSONでない・オブジェクトでない）', async () => {
    const { token } = await newAccount();
    for (const body of [{}, { username: 1 }, { username: null }, '[]', 'not json', '"abc"']) {
      assert.equal((await call('PUT', '/me/username', token, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(await profileOf(token), null);
  });

  it('認証: ヘッダーが無い・形が違う・無効なセッションは401（何も作らない）', async () => {
    const bogus = 'A'.repeat(43);
    for (const token of [null, 'short', bogus]) {
      assert.equal((await call('GET', '/me/profile', token)).status, 401);
      assert.equal((await claim(token, 'no_auth_name')).status, 401);
    }
    const { results } = await db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE username = 'no_auth_name'").all<{ n: number }>();
    assert.equal(results[0]!.n, 0);
  });

  it('本文の形の不備は、セッションの有効・無効に関わらず400（認証のためにD1に触れる前に断る。ヘッダーが無いのは先に401）', async () => {
    const bogus = 'A'.repeat(43);
    assert.equal((await claim(bogus, 'ab')).status, 400);
    assert.equal((await call('PUT', '/me/username', bogus, {})).status, 400);
    assert.equal((await claim(null, 'ab')).status, 401);
  });

  it('メソッドが違えば405', async () => {
    const { token } = await newAccount();
    const get = await call('POST', '/me/profile', token);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'GET');
    const put = await call('GET', '/me/username', token);
    assert.equal(put.status, 405);
    assert.equal(put.headers.get('allow'), 'PUT');
  });

  it('Publish した内容の控え（display_name・bio・version・published_at）を読める', async () => {
    const { userId, token } = await newAccount();
    assert.equal((await claim(token, 'published_one')).status, 200);
    // Publish（7.4.4）が書く列。ここでは、直接書いて、読み出しの形を確かめる。
    await db
      .prepare('UPDATE profiles SET display_name = ?, bio = ?, version = ?, published_at = ? WHERE user_id = ?')
      .bind('Yu', 'I sing.', 4, NOW + 1000, userId)
      .run();
    assert.deepEqual(await profileOf(token), {
      username: 'published_one',
      version: 4,
      published: true,
      publishedAt: NOW + 1000,
      displayName: 'Yu',
      bio: 'I sing.',
    });
  });

  it('claimUsername / getProfile: ほかのアカウントの行を返さない', async () => {
    const a = await newAccount();
    const b = await newAccount();
    assert.deepEqual(await claimUsername(db, a.userId, 'mine_only', NOW), {
      ok: true,
      profile: { username: 'mine_only', version: 0, published: false, publishedAt: null, displayName: '', bio: '' },
    });
    assert.equal(await getProfile(db, b.userId), null);
  });
});
