/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

describe('D1のスキーマ（migrations/）', () => {
  let local: LocalDatabase;
  let db: D1Database;
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;

  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
  });
  after(async () => {
    await local.dispose();
  });

  const addUser = async (userId = id('user')) => {
    await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(userId, 1).run();
    return userId;
  };
  const addIdentity = async (userId: string, provider = 'apple', sub = id('sub')) => {
    const identityId = id('identity');
    await db
      .prepare(
        'INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(identityId, userId, provider, sub, 1, 1)
      .run();
    return identityId;
  };
  const addSession = async (identityId: string, tokenHash = id('hash')) => {
    await db
      .prepare('INSERT INTO sessions (token_hash, identity_id, created_at, last_used_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, identityId, 1, 1)
      .run();
    return tokenHash;
  };
  const count = async (table: string, where: string, value: string) => {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where} = ?`)
      .bind(value)
      .first<{ n: number }>();
    return row?.n;
  };

  it('4つのテーブルがある（wranglerの管理用のテーブルを除く）', async () => {
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ name: string }>();
    const names = results
      .map((row) => row.name)
      .filter((name) => name !== 'd1_migrations' && !name.startsWith('sqlite_') && !name.startsWith('_cf_'));
    assert.deepEqual(names, ['identities', 'sessions', 'used_nonces', 'users']);
  });

  it('identities: provider は apple か google だけ', async () => {
    const userId = await addUser();
    await assert.rejects(addIdentity(userId, 'facebook'), /CHECK constraint failed/);
    await addIdentity(userId, 'apple');
    await addIdentity(userId, 'google');
  });

  it('identities: sub は空にできない', async () => {
    const userId = await addUser();
    await assert.rejects(addIdentity(userId, 'apple', ''), /CHECK constraint failed/);
  });

  it('identities: (provider, sub) は重複できない。providerが違えば同じ sub でもよい', async () => {
    const userId = await addUser();
    const other = await addUser();
    const sub = id('sub');
    await addIdentity(userId, 'apple', sub);
    await assert.rejects(addIdentity(other, 'apple', sub), /UNIQUE constraint failed/);
    await addIdentity(other, 'google', sub);
  });

  it('外部キーが有効: 存在しないユーザーのIDは作れない', async () => {
    await assert.rejects(addIdentity('no-such-user'), /FOREIGN KEY constraint failed/);
  });

  it('外部キーが有効: 存在しないIDのセッションは作れない', async () => {
    await assert.rejects(addSession('no-such-identity'), /FOREIGN KEY constraint failed/);
  });

  it('users の行を消すと、identities と sessions も消える（アカウントの削除）', async () => {
    const userId = await addUser();
    const identityA = await addIdentity(userId, 'apple');
    const identityB = await addIdentity(userId, 'google');
    const hashA = await addSession(identityA);
    await addSession(identityB);
    const bystander = await addUser();
    const bystanderIdentity = await addIdentity(bystander);
    const bystanderHash = await addSession(bystanderIdentity);

    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    assert.equal(await count('identities', 'user_id', userId), 0);
    assert.equal(await count('sessions', 'identity_id', identityA), 0);
    assert.equal(await count('sessions', 'identity_id', identityB), 0);
    assert.equal(await count('sessions', 'token_hash', hashA), 0);
    // 別のユーザーには影響しない。
    assert.equal(await count('identities', 'user_id', bystander), 1);
    assert.equal(await count('sessions', 'token_hash', bystanderHash), 1);
  });

  // Appleの `consent-revoked`: その手段のセッションだけを消す。identities の行は残す
  // （行が持つ last_sign_in_at で、重複・古い通知を見分けるため。消すと、次のサインインで
  // 別のユーザーが作られ、以前の username とスナップショットから切り離される）。
  it('consent-revoked: セッションだけを消し、identities の行（last_sign_in_at）と他の手段は残す', async () => {
    const userId = await addUser();
    const apple = await addIdentity(userId, 'apple');
    const google = await addIdentity(userId, 'google');
    await addSession(apple);
    await addSession(google);

    await db.prepare('DELETE FROM sessions WHERE identity_id = ?').bind(apple).run();

    assert.equal(await count('sessions', 'identity_id', apple), 0);
    assert.equal(await count('sessions', 'identity_id', google), 1);
    assert.equal(await count('identities', 'id', apple), 1);
    assert.equal(await count('users', 'id', userId), 1);
  });

  // Appleの `account-deleted`: その identities の行を消す。セッションも一緒に消える。
  it('account-deleted: identities の行を消すと、その手段のセッションも消え、他の手段は残る', async () => {
    const userId = await addUser();
    const apple = await addIdentity(userId, 'apple');
    const google = await addIdentity(userId, 'google');
    await addSession(apple);
    await addSession(google);

    await db.prepare('DELETE FROM identities WHERE id = ?').bind(apple).run();

    assert.equal(await count('identities', 'id', apple), 0);
    assert.equal(await count('sessions', 'identity_id', apple), 0);
    assert.equal(await count('sessions', 'identity_id', google), 1);
    assert.equal(await count('users', 'id', userId), 1);
  });

  it('sessions: token_hash は重複できない', async () => {
    const identityId = await addIdentity(await addUser());
    const hash = await addSession(identityId);
    await assert.rejects(addSession(identityId, hash), /UNIQUE constraint failed/);
  });

  it('used_nonces: 同じ nonce は2回記録できない（リプレイを弾く）', async () => {
    const nonce = id('nonce');
    const insert = () =>
      db.prepare('INSERT INTO used_nonces (nonce_hash, expires_at) VALUES (?, ?)').bind(nonce, 1).run();
    await insert();
    await assert.rejects(insert(), /UNIQUE constraint failed/);
  });

  it('STRICT: 時刻の列に文字列は入らない', async () => {
    await assert.rejects(
      db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id('user'), 'yesterday').run(),
      /cannot store TEXT value in INTEGER column/,
    );
  });

  it('identities.consent_revoked_at（0002）: 既定は NULL（取り消されたことが無い）。整数だけ入る', async () => {
    const userId = id('user');
    const identityId = id('identity');
    await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(userId, 1).run();
    await db
      .prepare('INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(identityId, userId, 'apple', id('sub'), 1, 1)
      .run();
    const read = () =>
      db.prepare('SELECT consent_revoked_at FROM identities WHERE id = ?').bind(identityId).first<{ consent_revoked_at: number | null }>();
    assert.deepEqual(await read(), { consent_revoked_at: null });
    await db.prepare('UPDATE identities SET consent_revoked_at = ? WHERE id = ?').bind(123, identityId).run();
    assert.deepEqual(await read(), { consent_revoked_at: 123 });
    await assert.rejects(
      db.prepare('UPDATE identities SET consent_revoked_at = ? WHERE id = ?').bind('yesterday', identityId).run(),
      /cannot store TEXT value in INTEGER column/,
    );
  });
});
