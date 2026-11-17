/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { resolveIdentity } from '../src/identity.ts';
import {
  authenticateSession,
  createSession as tryCreateSession,
  isSessionToken,
  revokeOtherSessions,
  revokeSession,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  sessionTokenFromRequest,
} from '../src/session.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// 発行できるはずの場面で使う（発行しない場合は、`tryCreateSession` を直接呼ぶ）。
async function createSession(db: D1Database, identityId: string, now: number): Promise<string> {
  const token = await tryCreateSession(db, identityId, now);
  assert.notEqual(token, null);
  return token!;
}

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
  const newIdentity = async (provider: 'apple' | 'google' = 'apple') => {
    const sub = `session-test-${counter++}`;
    return { ...(await resolveIdentity(db, provider, sub, NOW)), sub };
  };
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

  describe('発行しない場合（Appleの通知との競合。migrations/0002）', () => {
    const setRevokedAt = (identityId: string, at: number | null) =>
      db.prepare('UPDATE identities SET consent_revoked_at = ? WHERE id = ?').bind(at, identityId).run();

    it('取り消しの時刻が、ログインの開始時刻より後なら、発行しない（行も作らない）', async () => {
      const { identityId } = await newIdentity();
      await setRevokedAt(identityId, NOW + 1);
      assert.equal(await tryCreateSession(db, identityId, NOW), null);
      assert.equal(await sessionCount(identityId), 0);
    });

    it('取り消しの時刻が、開始時刻と同じか前なら、発行する（取り消しのあとに、あらためてサインインした場合）', async () => {
      const { identityId } = await newIdentity();
      await setRevokedAt(identityId, NOW);
      assert.notEqual(await tryCreateSession(db, identityId, NOW), null);
      await setRevokedAt(identityId, NOW - DAY);
      assert.notEqual(await tryCreateSession(db, identityId, NOW), null);
      assert.equal(await sessionCount(identityId), 2);
    });

    it('取り消しの記録が無ければ（NULL）、発行する', async () => {
      const { identityId } = await newIdentity();
      assert.notEqual(await tryCreateSession(db, identityId, NOW), null);
    });

    it('ログイン手段の行が無ければ、例外にせず発行しない（直前に account-deleted で消えた場合）', async () => {
      const { identityId } = await newIdentity();
      await db.prepare('DELETE FROM identities WHERE id = ?').bind(identityId).run();
      assert.equal(await tryCreateSession(db, identityId, NOW), null);
      assert.equal(await sessionCount(identityId), 0);
    });

    it('発行しなくても、期限を過ぎたセッションの掃除は同じバッチで行う（バッチは1つ）', async () => {
      const { identityId } = await newIdentity();
      const old = await createSession(db, identityId, NOW - SESSION_TTL_MS);
      await setRevokedAt(identityId, NOW + 1);
      assert.equal(await tryCreateSession(db, identityId, NOW), null);
      assert.equal(await row(old), null);
    });
  });

  describe('認証', () => {
    it('値から、ユーザー・ログイン手段・手段の種類を引く', async () => {
      const apple = await newIdentity('apple');
      const google = await newIdentity('google');
      assert.deepEqual(await authenticateSession(db, await createSession(db, apple.identityId, NOW), NOW), {
        userId: apple.userId,
        identityId: apple.identityId,
        sub: apple.sub,
        provider: 'apple',
      });
      assert.deepEqual(await authenticateSession(db, await createSession(db, google.identityId, NOW), NOW), {
        userId: google.userId,
        identityId: google.identityId,
        sub: google.sub,
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

  describe('ほかの端末をすべてログアウト', () => {
    it('認証済みのセッション以外の、同じユーザーのセッションをすべて消す（ログイン手段をまたぐ）', async () => {
      const apple = await newIdentity('apple');
      // 同じユーザーに、Googleのログイン手段をつなぐ（アカウントのつなぎ方。v1で画面を作るかは未定）。
      const googleIdentity = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?1, ?2, 'google', ?3, ?4, ?4)`,
        )
        .bind(googleIdentity, apple.userId, `linked-${counter++}`, NOW)
        .run();
      const current = await createSession(db, apple.identityId, NOW);
      const otherApple = await createSession(db, apple.identityId, NOW);
      const otherGoogle = await createSession(db, googleIdentity, NOW);

      await revokeOtherSessions(db, apple.userId, current);
      assert.notEqual(await authenticateSession(db, current, NOW), null, '認証済みのセッションは残る');
      assert.equal(await authenticateSession(db, otherApple, NOW), null);
      assert.equal(await authenticateSession(db, otherGoogle, NOW), null);
      assert.equal(await sessionCount(apple.identityId), 1);
      assert.equal(await sessionCount(googleIdentity), 0);
    });

    it('ほかのユーザーのセッションは消さない', async () => {
      const mine = await newIdentity();
      const theirs = await newIdentity();
      const current = await createSession(db, mine.identityId, NOW);
      const mineOther = await createSession(db, mine.identityId, NOW);
      const theirSession = await createSession(db, theirs.identityId, NOW);
      await revokeOtherSessions(db, mine.userId, current);
      assert.equal(await authenticateSession(db, mineOther, NOW), null);
      assert.notEqual(await authenticateSession(db, theirSession, NOW), null);
    });

    it('消すものが無くても落ちない。何度呼んでも同じ', async () => {
      const { identityId, userId } = await newIdentity();
      const current = await createSession(db, identityId, NOW);
      await revokeOtherSessions(db, userId, current);
      await revokeOtherSessions(db, userId, current);
      assert.equal(await sessionCount(identityId), 1);
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
