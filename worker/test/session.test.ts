/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { resolveIdentity } from '../src/identity.ts';
import {
  authenticateSession,
  createSession,
  isSessionToken,
  revokeSession,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  sessionTokenFromRequest,
} from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('セッション', () => {
  let local: LocalDatabase;
  let db: D1Database;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
  });
  after(async () => {
    await local.dispose();
  });

  let counter = 0;
  // テストごとに別のログイン手段（互いに影響しない）。
  const newIdentity = async (provider: 'apple' | 'google' = 'apple') =>
    resolveIdentity(db, provider, `session-test-${counter++}`, NOW);
  const hashOf = (token: string) => createHash('sha256').update(token).digest('base64url');
  const row = (token: string) =>
    db
      .prepare('SELECT token_hash, identity_id, created_at, last_used_at FROM sessions WHERE token_hash = ?')
      .bind(hashOf(token))
      .first<{ token_hash: string; identity_id: string; created_at: number; last_used_at: number }>();
  const sessionCount = async (identityId: string) =>
    (await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE identity_id = ?').bind(identityId).first<{ n: number }>())!.n;

  describe('発行', () => {
    it('値は43字のランダム値で、D1にはハッシュだけを置く（値そのものは置かない）', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);
      assert.equal(isSessionToken(token), true);
      assert.equal(token.length, 43);
      assert.deepEqual(await row(token), {
        token_hash: hashOf(token),
        identity_id: identityId,
        created_at: NOW,
        last_used_at: NOW,
      });
      // 値そのものは、どの列にも入っていない。
      const all = await db.prepare('SELECT * FROM sessions').all();
      assert.equal(JSON.stringify(all.results).includes(token), false);
    });

    it('発行のたびに別の値になり、同じログイン手段に複数持てる（端末ごと）', async () => {
      const { identityId } = await newIdentity();
      const tokens = new Set<string>();
      for (let i = 0; i < 5; i++) tokens.add(await createSession(db, identityId, NOW));
      assert.equal(tokens.size, 5);
      assert.equal(await sessionCount(identityId), 5);
    });

    it('同じログイン手段の、期限を過ぎたセッションだけを消す。他の手段の行は触らない', async () => {
      const mine = await newIdentity();
      const other = await newIdentity('google');
      const expired = await createSession(db, mine.identityId, NOW - SESSION_TTL_MS);
      const justExpired = await createSession(db, mine.identityId, NOW - SESSION_TTL_MS + 1);
      const otherExpired = await createSession(db, other.identityId, NOW - SESSION_TTL_MS - DAY);

      const fresh = await createSession(db, mine.identityId, NOW);
      assert.equal(await row(expired), null, '期限ちょうどの行は消える');
      assert.notEqual(await row(justExpired), null, '期限の1ミリ秒前の行は残る');
      assert.notEqual(await row(fresh), null);
      assert.notEqual(await row(otherExpired), null, '他のログイン手段の行は、消さない');
    });
  });

  describe('認証', () => {
    it('値から、ユーザー・ログイン手段・手段の種類を引く', async () => {
      const apple = await newIdentity('apple');
      const google = await newIdentity('google');
      assert.deepEqual(await authenticateSession(db, await createSession(db, apple.identityId, NOW), NOW), {
        userId: apple.userId,
        identityId: apple.identityId,
        provider: 'apple',
      });
      assert.deepEqual(await authenticateSession(db, await createSession(db, google.identityId, NOW), NOW), {
        userId: google.userId,
        identityId: google.identityId,
        provider: 'google',
      });
    });

    it('無い値・形が違う値は null（理由は区別しない）', async () => {
      assert.equal(await authenticateSession(db, 'A'.repeat(43), NOW), null);
      for (const bad of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}.`]) {
        assert.equal(await authenticateSession(db, bad, NOW), null, bad);
      }
      // 型が違う値が来ても落ちない
      assert.equal(await authenticateSession(db, undefined as unknown as string, NOW), null);
    });

    it('別の人の値でも、ハッシュが違えば通らない（値の一部だけ違う場合も）', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);
      const changed = `${token.slice(0, 42)}${token.endsWith('A') ? 'B' : 'A'}`;
      assert.equal(await authenticateSession(db, changed, NOW), null);
    });

    it('24時間たつまでは last_used_at を書かない。24時間以上たったら更新する', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);

      await authenticateSession(db, token, NOW + SESSION_TOUCH_INTERVAL_MS - 1);
      assert.equal((await row(token))!.last_used_at, NOW, '24時間未満は書かない');

      await authenticateSession(db, token, NOW + SESSION_TOUCH_INTERVAL_MS);
      assert.equal((await row(token))!.last_used_at, NOW + SESSION_TOUCH_INTERVAL_MS);

      // 更新の直後は、また書かない
      await authenticateSession(db, token, NOW + SESSION_TOUCH_INTERVAL_MS + 1000);
      assert.equal((await row(token))!.last_used_at, NOW + SESSION_TOUCH_INTERVAL_MS);
    });

    it('時計が戻っても（last_used_at より前の now）、通り、書かない', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);
      assert.notEqual(await authenticateSession(db, token, NOW - 5 * DAY), null);
      assert.equal((await row(token))!.last_used_at, NOW);
    });

    it('期限は、最後の利用から90日。ちょうど90日で切れ、行も消える', async () => {
      // 認証に通ると last_used_at が進むので、境目の確認はセッションを分ける。
      const { identityId } = await newIdentity();
      const justBefore = await createSession(db, identityId, NOW);
      assert.notEqual(await authenticateSession(db, justBefore, NOW + SESSION_TTL_MS - 1), null);

      const expiring = await createSession(db, identityId, NOW);
      assert.notEqual(await row(expiring), null);
      assert.equal(await authenticateSession(db, expiring, NOW + SESSION_TTL_MS), null);
      assert.equal(await row(expiring), null, '期限切れの行は、見つかった時点で消す');
      // 消えたあとも null
      assert.equal(await authenticateSession(db, expiring, NOW + SESSION_TTL_MS), null);
    });

    it('使い続けると期限が延びる（最後の利用から数える）', async () => {
      const { identityId } = await newIdentity();
      const day60 = NOW + 60 * DAY;
      // 発行から60日目に使った2つのセッション（使うと last_used_at が進むので、境目ごとに分ける）
      const stillValid = await createSession(db, identityId, NOW);
      const expiring = await createSession(db, identityId, NOW);
      for (const token of [stillValid, expiring]) {
        assert.notEqual(await authenticateSession(db, token, day60), null);
        assert.equal((await row(token))!.last_used_at, day60);
      }
      // 発行から90日を過ぎても、60日目に使ったので、まだ有効
      assert.notEqual(await authenticateSession(db, stillValid, NOW + SESSION_TTL_MS + DAY), null);
      // 60日目から90日たつと切れる（その間に使わなければ）
      assert.equal(await authenticateSession(db, expiring, day60 + SESSION_TTL_MS), null);
    });

    it('ログイン手段を削除すると、セッションも消えて通らない（外部キーのCASCADE）', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);
      await db.prepare('DELETE FROM identities WHERE id = ?').bind(identityId).run();
      assert.equal(await authenticateSession(db, token, NOW), null);
      assert.equal(await row(token), null);
    });
  });

  describe('失効（ログアウト）', () => {
    it('そのセッションの行だけを消す。同じログイン手段の他のセッションは残る', async () => {
      const { identityId } = await newIdentity();
      const first = await createSession(db, identityId, NOW);
      const second = await createSession(db, identityId, NOW);
      await revokeSession(db, first);
      assert.equal(await authenticateSession(db, first, NOW), null);
      assert.notEqual(await authenticateSession(db, second, NOW), null);
      assert.equal(await sessionCount(identityId), 1);
    });

    it('何度呼んでも同じ。無い値・形が違う値でも落ちない', async () => {
      const { identityId } = await newIdentity();
      const token = await createSession(db, identityId, NOW);
      await revokeSession(db, token);
      await revokeSession(db, token);
      await revokeSession(db, 'A'.repeat(43));
      await revokeSession(db, 'short');
      assert.equal(await sessionCount(identityId), 0);
    });
  });

  describe('Authorization ヘッダー', () => {
    const request = (authorization?: string) =>
      new Request('https://singfolio.app/', { headers: authorization === undefined ? {} : { authorization } });
    const token = 'A'.repeat(43);

    it('Bearer <43字> から値を取り出す（スキーム名の大文字小文字は問わない）', () => {
      assert.equal(sessionTokenFromRequest(request(`Bearer ${token}`)), token);
      assert.equal(sessionTokenFromRequest(request(`bearer ${token}`)), token);
      assert.equal(sessionTokenFromRequest(request(`BEARER ${token}`)), token);
    });

    it('無い・形が違うものは null', () => {
      for (const header of [
        undefined,
        '',
        token,
        `Basic ${token}`,
        `Bearer ${token.slice(1)}`,
        `Bearer ${token}A`,
        `Bearer  ${token}`,
        `Bearer ${token}, Bearer ${token}`,
        `Bearer ${'A'.repeat(42)}!`,
      ]) {
        assert.equal(sessionTokenFromRequest(request(header)), null, String(header));
      }
    });
  });
});
