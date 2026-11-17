/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolveIdentity } from '../src/identity.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;

describe('resolveIdentity', () => {
  let local: LocalDatabase;
  let db: D1Database;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
  });
  after(async () => {
    await local.dispose();
  });

  const count = async (table: string) =>
    (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  const lastSignIn = async (identityId: string) =>
    (await db.prepare('SELECT last_sign_in_at AS t FROM identities WHERE id = ?').bind(identityId).first<{ t: number }>())!.t;

  it('初めての sub: ユーザーとログイン手段を作る（保存するのは provider と sub だけ）', async () => {
    const result = await resolveIdentity(db, 'apple', 'apple-sub-1', NOW);
    assert.equal(result.created, true);
    const row = await db.prepare('SELECT * FROM identities WHERE id = ?').bind(result.identityId).first();
    assert.deepEqual(row, {
      id: result.identityId,
      user_id: result.userId,
      provider: 'apple',
      sub: 'apple-sub-1',
      created_at: NOW,
      last_sign_in_at: NOW,
      consent_revoked_at: null,
    });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(result.userId).first();
    assert.deepEqual(user, { id: result.userId, created_at: NOW, last_active_at: NOW });
  });

  it('同じ sub: 同じユーザー・ログイン手段を返し、増やさない。最後のサインインだけ進める', async () => {
    const first = await resolveIdentity(db, 'google', 'google-sub-1', NOW);
    const users = await count('users');
    const identities = await count('identities');

    const second = await resolveIdentity(db, 'google', 'google-sub-1', NOW + 5000);
    assert.deepEqual(second, { identityId: first.identityId, userId: first.userId, created: false });
    assert.equal(await count('users'), users);
    assert.equal(await count('identities'), identities);
    assert.equal(await lastSignIn(first.identityId), NOW + 5000);
  });

  it('時計が戻っても、最後のサインインを後戻りさせない', async () => {
    const first = await resolveIdentity(db, 'google', 'google-sub-clock', NOW + 10_000);
    await resolveIdentity(db, 'google', 'google-sub-clock', NOW);
    assert.equal(await lastSignIn(first.identityId), NOW + 10_000);
  });

  it('provider が違えば、sub が同じでも別のユーザー（自動ではつながない）', async () => {
    const apple = await resolveIdentity(db, 'apple', 'shared-sub', NOW);
    const google = await resolveIdentity(db, 'google', 'shared-sub', NOW);
    assert.equal(apple.created, true);
    assert.equal(google.created, true);
    assert.notEqual(apple.userId, google.userId);
    assert.notEqual(apple.identityId, google.identityId);
  });

  it('同じ人の同時の初回ログイン: ユーザーは1人だけ作られ、孤立したユーザーが残らない', async () => {
    const before = { users: await count('users'), identities: await count('identities') };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveIdentity(db, 'apple', 'racing-sub', NOW)),
    );
    assert.equal(new Set(results.map((r) => r.userId)).size, 1);
    assert.equal(new Set(results.map((r) => r.identityId)).size, 1);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(await count('users'), before.users + 1);
    assert.equal(await count('identities'), before.identities + 1);
    // identities の無いユーザーが無い
    const orphans = await db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE id NOT IN (SELECT user_id FROM identities)')
      .first<{ n: number }>();
    assert.equal(orphans!.n, 0);
  });

  it('空の sub は、スキーマが拒否する（検証の側で先に弾くが、保存の側でも守る）', async () => {
    await assert.rejects(resolveIdentity(db, 'apple', '', NOW));
    // 失敗したバッチは、ユーザーを残さない
    const orphans = await db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE id NOT IN (SELECT user_id FROM identities)')
      .first<{ n: number }>();
    assert.equal(orphans!.n, 0);
  });
});
