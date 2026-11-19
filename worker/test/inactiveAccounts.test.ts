/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  AUTO_DELETE_EXEMPT_SQL,
  deleteInactiveUserStatement,
  INACTIVE_ACCOUNT_TTL_MS,
  markUserActiveStatement,
  retireInactiveUsernameStatement,
} from '../src/account.ts';
import { resolveIdentity } from '../src/identity.ts';
import { deleteInactiveAccounts, MAX_DELETIONS_PER_RUN } from '../src/inactiveAccounts.ts';
import worker from '../src/index.ts';
import { authenticateSession, createSession, revokeSession, SESSION_TTL_MS } from '../src/session.ts';
import { openLocalDatabase, workerDir, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_900_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const YEAR = INACTIVE_ACCOUNT_TTL_MS;

describe('未使用のアカウントの自動削除', () => {
  let local: LocalDatabase;
  let db: D1Database;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
  });
  after(async () => {
    await local.dispose();
  });
  beforeEach(async () => {
    await db.prepare('DELETE FROM users').run();
  });

  let seq = 0;
  /** ログイン手段とセッションを持つユーザーを直接作る（`lastActive` が null なら NULL のまま）。 */
  const addUser = async (lastActive: number | null, createdAt = 1) => {
    const userId = `user-${++seq}`;
    const identityId = `identity-${seq}`;
    await db.batch([
      db.prepare('INSERT INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)').bind(userId, createdAt, lastActive),
      db
        .prepare('INSERT INTO identities (id, user_id, provider, sub, created_at, last_sign_in_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(identityId, userId, 'apple', `sub-${seq}`, 1, 1),
      db
        .prepare('INSERT INTO sessions (token_hash, identity_id, created_at, last_used_at) VALUES (?, ?, ?, ?)')
        .bind(`hash-${seq}`, identityId, 1, 1),
    ]);
    return { userId, identityId };
  };
  const count = async (table: string) =>
    (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  const exists = async (userId: string) =>
    (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(userId).first<{ n: number }>())!.n === 1;
  const lastActive = async (userId: string) =>
    (await db.prepare('SELECT last_active_at AS t FROM users WHERE id = ?').bind(userId).first<{ t: number | null }>())!.t;

  describe('消す対象', () => {
    it('最後に使ってから1年を過ぎたアカウントを消す。ログイン手段とセッションも一緒に消える', async () => {
      const stale = await addUser(NOW - YEAR - 1);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 1, skipped: 0 });
      assert.equal(await exists(stale.userId), false);
      assert.equal(await count('identities'), 0);
      assert.equal(await count('sessions'), 0);
    });

    it('ちょうど1年（基準の時刻）と、1年以内は消さない', async () => {
      const exactly = await addUser(NOW - YEAR);
      const recent = await addUser(NOW - YEAR + 1);
      const fresh = await addUser(NOW);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 0, skipped: 0 });
      for (const user of [exactly, recent, fresh]) assert.equal(await exists(user.userId), true);
    });

    it('last_active_at が NULL のアカウントは消さない（created_at が古くても）', async () => {
      const unknown = await addUser(null, 1);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 0, skipped: 0 });
      assert.equal(await exists(unknown.userId), true);
    });

    it('他のアカウントには触れない', async () => {
      const stale = await addUser(NOW - YEAR - DAY);
      const active = await addUser(NOW - DAY);
      await deleteInactiveAccounts(db, NOW);
      assert.equal(await exists(stale.userId), false);
      assert.equal(await exists(active.userId), true);
      assert.equal(await count('identities'), 1);
      assert.equal(await count('sessions'), 1);
    });

    it('1回の実行で消すのは上限まで。残りは次の実行で消える（冪等）', async () => {
      const extra = 5;
      await db.batch(
        Array.from({ length: MAX_DELETIONS_PER_RUN + extra }, (_, i) =>
          db.prepare('INSERT INTO users (id, created_at, last_active_at) VALUES (?, ?, ?)').bind(`bulk-${i}`, 1, NOW - YEAR - 1),
        ),
      );
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: MAX_DELETIONS_PER_RUN, skipped: 0 });
      assert.equal(await count('users'), extra);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: extra, skipped: 0 });
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 0, skipped: 0 });
    });
  });

  describe('公開ページのあるアカウントは対象外（7.4.5）', () => {
    // `profiles` の行。`publishedAt` が null なら非公開（印が下りている）。
    const addProfile = (userId: string, username: string, publishedAt: number | null) =>
      db
        .prepare('INSERT INTO profiles (user_id, username, published_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, username, publishedAt, 1)
        .run();
    const retired = async () =>
      (await db.prepare('SELECT username FROM retired_usernames ORDER BY username').all<{ username: string }>()).results.map(
        (row) => row.username,
      );
    beforeEach(async () => {
      await db.prepare('DELETE FROM retired_usernames').run();
    });

    it('Publish済み（印が立っている）は、1年たっても消さない。ほかの古いアカウントは消える', async () => {
      const published = await addUser(NOW - YEAR - DAY);
      await addProfile(published.userId, 'pub_account', NOW - 2 * YEAR);
      const plain = await addUser(NOW - YEAR - DAY);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 1, skipped: 0 });
      assert.equal(await exists(published.userId), true);
      assert.equal(await exists(plain.userId), false);
      assert.deepEqual(await retired(), []);
      // 何度走らせても、対象外のまま。
      assert.deepEqual(await deleteInactiveAccounts(db, NOW + 10 * YEAR), { deleted: 0, skipped: 0 });
      assert.equal(await exists(published.userId), true);
    });

    it('Unpublish（印が下りた）か、username だけ確保して Publish していないアカウントは、対象に戻る。username は再利用できなくなる', async () => {
      const unpublished = await addUser(NOW - YEAR - DAY);
      await addProfile(unpublished.userId, 'was_published', null);
      const claimedOnly = await addUser(NOW - YEAR - DAY);
      await addProfile(claimedOnly.userId, 'claimed_only', null);
      assert.deepEqual(await deleteInactiveAccounts(db, NOW), { deleted: 2, skipped: 0 });
      assert.equal(await exists(unpublished.userId), false);
      assert.equal(await exists(claimedOnly.userId), false);
      assert.equal(await count('profiles'), 0);
      assert.deepEqual(await retired(), ['claimed_only', 'was_published']);
    });

    it('消す文も同じ条件: 候補に選んだあとに Publish したアカウントは、消えず、username も移らない（消す瞬間にも見る）', async () => {
      const user = await addUser(NOW - YEAR - DAY);
      await addProfile(user.userId, 'late_publisher', null);
      const cutoff = NOW - YEAR;
      // 候補に選ばれたあとに、Publish で印が立つ。
      await db.prepare('UPDATE profiles SET published_at = ? WHERE user_id = ?').bind(NOW, user.userId).run();
      const [retire, remove] = await db.batch([
        retireInactiveUsernameStatement(db, user.userId, cutoff, NOW),
        deleteInactiveUserStatement(db, user.userId, cutoff),
      ]);
      assert.equal(retire!.meta.changes, 0);
      assert.equal(remove!.meta.changes, 0);
      assert.equal(await exists(user.userId), true);
      assert.equal(await count('profiles'), 1);
      assert.deepEqual(await retired(), []);
    });

    it('username を移す文は、消さないアカウント（まだ使われている）では何も移さない', async () => {
      const active = await addUser(NOW - DAY);
      await addProfile(active.userId, 'still_active', null);
      const result = await retireInactiveUsernameStatement(db, active.userId, NOW - YEAR, NOW).run();
      assert.equal(result.meta.changes, 0);
      assert.deepEqual(await retired(), []);
    });

    it('移した username は、ユーザーIDと結びつかない（retired_usernames は username と時刻だけ）', async () => {
      const user = await addUser(NOW - YEAR - DAY);
      await addProfile(user.userId, 'no_link_name', null);
      await deleteInactiveAccounts(db, NOW);
      const row = await db.prepare('SELECT * FROM retired_usernames WHERE username = ?').bind('no_link_name').first();
      assert.deepEqual(row, { username: 'no_link_name', retired_at: NOW });
    });

    it('対象外の条件は、候補の SELECT と消す文が同じ式（AUTO_DELETE_EXEMPT_SQL）を使う', () => {
      const source = readFileSync(path.join(workerDir, 'src', 'inactiveAccounts.ts'), 'utf8');
      const account = readFileSync(path.join(workerDir, 'src', 'account.ts'), 'utf8');
      assert.match(source, /NOT \$\{AUTO_DELETE_EXEMPT_SQL\}/);
      assert.equal((account.match(/NOT \$\{AUTO_DELETE_EXEMPT_SQL\}/g) ?? []).length, 2);
      // 式そのものは1か所にだけ書く。
      assert.equal((account.match(/p\.published_at IS NOT NULL/g) ?? []).length, 1);
      assert.match(AUTO_DELETE_EXEMPT_SQL, /published_at IS NOT NULL/);
    });
  });

  describe('候補に選んだあとに使われたアカウント', () => {
    it('消す文は条件つき: 使われたあとなら、変更行数は 0 で、アカウントは残る', async () => {
      const user = await addUser(NOW - YEAR - 1);
      const cutoff = NOW - YEAR;
      // 候補に選ばれたあとに、ログインなどで最後に使った時刻が進む。
      await markUserActiveStatement(db, user.userId, NOW).run();
      const result = await deleteInactiveUserStatement(db, user.userId, cutoff).run();
      assert.equal(result.meta.changes, 0);
      assert.equal(await exists(user.userId), true);
      assert.equal(await count('identities'), 1);
      assert.equal(await count('sessions'), 1);
    });

    it('条件に合えば、変更行数は 0 より大きい（カスケードで消えた行を数えるかは、環境に依らない見方にする）', async () => {
      const user = await addUser(NOW - YEAR - 1);
      const result = await deleteInactiveUserStatement(db, user.userId, NOW - YEAR).run();
      // ローカルの D1 では 3(ユーザー1行 + ログイン手段1行 + セッション1行)で、カスケードの行も数える。本番は未確認。
      // 1 でも 3 でも成り立つ見方(0 より大きい)に固定する: 「1 のとき成功」にしない。
      assert.ok(result.meta.changes > 0);
      assert.equal(await exists(user.userId), false);
    });

    it('バッチの中に、選んだあとに使われたものがあっても、そのアカウントだけ残る（skipped に数える）', async () => {
      const stale = await addUser(NOW - YEAR - 1);
      const revived = await addUser(NOW - YEAR - 1);
      // `deleteInactiveAccounts` の SELECT と batch の間に、revived が使われた状況を、同じ文で再現する。
      const cutoff = NOW - YEAR;
      await markUserActiveStatement(db, revived.userId, NOW).run();
      const outcomes = await db.batch([
        deleteInactiveUserStatement(db, stale.userId, cutoff),
        deleteInactiveUserStatement(db, revived.userId, cutoff),
      ]);
      assert.deepEqual(
        outcomes.map((outcome) => outcome.meta.changes > 0),
        [true, false],
      );
      assert.equal(await exists(stale.userId), false);
      assert.equal(await exists(revived.userId), true);
    });
  });

  describe('最後に使った時刻を進める操作', () => {
    it('ログイン: ユーザーを作るとき入れる。既存のアカウントのログインで進める。時計が戻る値は書かない', async () => {
      const first = await resolveIdentity(db, 'apple', 'active-1', NOW);
      assert.equal(await lastActive(first.userId), NOW);
      await resolveIdentity(db, 'apple', 'active-1', NOW + 5 * DAY);
      assert.equal(await lastActive(first.userId), NOW + 5 * DAY);
      await resolveIdentity(db, 'apple', 'active-1', NOW);
      assert.equal(await lastActive(first.userId), NOW + 5 * DAY);
    });

    it('ログイン: 埋め漏れ（NULL）のアカウントは埋める', async () => {
      const { userId } = await addUser(null);
      await resolveIdentity(db, 'apple', 'sub-' + seq, NOW);
      assert.equal(await lastActive(userId), NOW);
    });

    it('認証済みのリクエスト: セッションの更新（24時間に1回）と一緒に進める。24時間以内は書かない', async () => {
      const { userId, identityId } = await resolveIdentity(db, 'apple', 'active-2', NOW);
      const token = (await createSession(db, identityId, NOW))!;
      await authenticateSession(db, token, NOW + DAY / 2);
      assert.equal(await lastActive(userId), NOW);
      await authenticateSession(db, token, NOW + 3 * DAY);
      assert.equal(await lastActive(userId), NOW + 3 * DAY);
    });

    it('認証に通らないセッション（期限切れ）は、進めない', async () => {
      const { userId, identityId } = await resolveIdentity(db, 'apple', 'active-3', NOW);
      const token = (await createSession(db, identityId, NOW))!;
      assert.equal(await authenticateSession(db, token, NOW + 100 * DAY), null);
      assert.equal(await lastActive(userId), NOW);
    });

    it('ログアウト: セッションを消す前に進める。無い値では何も進めない', async () => {
      const { userId, identityId } = await resolveIdentity(db, 'apple', 'active-4', NOW);
      const token = (await createSession(db, identityId, NOW))!;
      await revokeSession(db, 'A'.repeat(43), NOW + 2 * DAY);
      assert.equal(await lastActive(userId), NOW);
      await revokeSession(db, token, NOW + 3 * DAY);
      assert.equal(await lastActive(userId), NOW + 3 * DAY);
      assert.equal(await authenticateSession(db, token, NOW + 3 * DAY), null);
      // 2回目（セッションは無い）は、何も進めない。
      await revokeSession(db, token, NOW + 9 * DAY);
      assert.equal(await lastActive(userId), NOW + 3 * DAY);
    });

    it('ログアウト: 期限切れ（90日以上使っていない）のセッションでは進めない。行は消える', async () => {
      const { userId, identityId } = await resolveIdentity(db, 'apple', 'active-6', NOW);
      const token = (await createSession(db, identityId, NOW))!;
      // authenticateSession が期限切れでは進めないのと揃える。
      await revokeSession(db, token, NOW + SESSION_TTL_MS);
      assert.equal(await lastActive(userId), NOW);
      assert.equal(
        (await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE identity_id = ?').bind(identityId).first<{ n: number }>())!.n,
        0,
      );
      // 期限の1ミリ秒前なら、まだ有効なセッション: 進める。
      const live = (await createSession(db, identityId, NOW))!;
      await revokeSession(db, live, NOW + SESSION_TTL_MS - 1);
      assert.equal(await lastActive(userId), NOW + SESSION_TTL_MS - 1);
    });

    it('11か月使って、ログアウトした1か月後には消えない。ログアウトの1年後に消える', async () => {
      const { userId, identityId } = await resolveIdentity(db, 'apple', 'active-5', NOW);
      const elevenMonths = NOW + 330 * DAY;
      // 11か月後にログインして、すぐログアウトする（ログアウトでセッションの行は消える）。
      const token = (await createSession(db, identityId, elevenMonths))!;
      await revokeSession(db, token, elevenMonths);
      // 登録から1年と少し（最後の使用の1か月後）: 消えない。
      assert.deepEqual(await deleteInactiveAccounts(db, NOW + YEAR + 5 * DAY), { deleted: 0, skipped: 0 });
      assert.equal(await exists(userId), true);
      // ログアウトの1年後を過ぎたら、消える。
      assert.deepEqual(await deleteInactiveAccounts(db, elevenMonths + YEAR + 1), { deleted: 1, skipped: 0 });
      assert.equal(await exists(userId), false);
    });
  });

  describe('マイグレーション 0003 のバックフィル', () => {
    // 0003 の UPDATE 文を、そのまま流す（ファイルから取り出す）。既存のユーザーを、作成・最後のサインイン・
    // セッションの最後の利用の最大で埋める。
    const backfill = readFileSync(path.join(workerDir, 'migrations', '0003_user_last_active.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('--'))
      .join('\n')
      .match(/UPDATE users SET[\s\S]*?;/)![0];

    it('作成時刻・最後のサインイン・セッションの最後の利用のうち、最も新しい時刻で埋める', async () => {
      const created = await addUser(null, 100);
      const signedIn = await addUser(null, 100);
      const used = await addUser(null, 100);
      // ログイン手段もセッションも持たないユーザー
      await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('lonely', 50).run();
      await db.batch([
        db.prepare('UPDATE identities SET last_sign_in_at = 500 WHERE id = ?').bind(signedIn.identityId),
        db.prepare('UPDATE identities SET last_sign_in_at = 200 WHERE id = ?').bind(used.identityId),
        db.prepare('UPDATE sessions SET last_used_at = 900 WHERE token_hash = ?').bind(`hash-${seq}`),
        db.prepare('UPDATE identities SET last_sign_in_at = 1 WHERE id = ?').bind(created.identityId),
      ]);
      await db.prepare(backfill.replace(/;$/, '')).run();
      assert.equal(await lastActive(created.userId), 100);
      assert.equal(await lastActive(signedIn.userId), 500);
      assert.equal(await lastActive(used.userId), 900);
      assert.equal(await lastActive('lonely'), 50);
    });
  });

  describe('Cron Trigger の入口（scheduled）', () => {
    it('呼ぶと、1年を過ぎたアカウントを消す', async () => {
      const stale = await addUser(Date.now() - YEAR - DAY);
      const active = await addUser(Date.now());
      const logs: string[] = [];
      const log = console.log;
      console.log = (message: string) => logs.push(message);
      try {
        await worker.scheduled(
          { scheduledTime: Date.now(), cron: '17 3 * * *', noRetry() {} } as ScheduledController,
          { DB: db } as unknown as Env,
        );
      } finally {
        console.log = log;
      }
      assert.equal(await exists(stale.userId), false);
      assert.equal(await exists(active.userId), true);
      // ログに出すのは件数だけ（ユーザーIDを出さない）
      assert.deepEqual(logs, ['inactive account deletion: deleted=1 skipped=0']);
    });
  });
});
