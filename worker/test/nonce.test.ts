/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { consumeNonce, issueNonce, NONCE_TTL_MS, nonceHash, verifyNonce } from '../src/nonce.ts';
import { openLocalDatabase, type LocalDatabase } from './localDatabase.ts';

const SECRET = 'test-secret-value-0123456789abcdef';
const NOW = 1_700_000_000_000;
// 43字の base64url（SHA-256 の出力の形）。
const CHALLENGE = createHash('sha256').update('verifier').digest('base64url');

// 指定した位置の部品を書き換えた T を作る（署名はそのまま）。
const withPart = (nonce: string, index: number, value: string) =>
  nonce
    .split('.')
    .map((part, i) => (i === index ? value : part))
    .join('.');

describe('鍵（NONCE_HMAC_KEY）の検証', () => {
  it('32バイト未満・空・無い（undefined）鍵は、原因が分かるエラーにする', async () => {
    for (const secret of ['', 'short', 'x'.repeat(31), undefined as unknown as string]) {
      await assert.rejects(issueNonce(secret, { kind: 'native' }, NOW), /NONCE_HMAC_KEY/);
      await assert.rejects(verifyNonce(secret, 'v1.native.1.AAAAAAAAAAAAAAAAAAAAAA..AAAA', 'native', NOW), /NONCE_HMAC_KEY/);
    }
  });

  it('32バイトちょうどの鍵は使える（`openssl rand -base64 32` の44字も）', async () => {
    for (const secret of ['x'.repeat(32), Buffer.alloc(32, 7).toString('base64')]) {
      const { nonce } = await issueNonce(secret, { kind: 'native' }, NOW);
      assert.equal((await verifyNonce(secret, nonce, 'native', NOW)).ok, true);
    }
  });

  it('文字数ではなくバイト数で数える（日本語は1字が3バイト）', async () => {
    await assert.rejects(issueNonce('あ'.repeat(10), { kind: 'native' }, NOW), /NONCE_HMAC_KEY/); // 30バイト
    await assert.doesNotReject(issueNonce('あ'.repeat(11), { kind: 'native' }, NOW)); // 33バイト
  });
});

describe('issueNonce', () => {
  it('native: 期限は5分後で、challenge を含まない', async () => {
    const { nonce, expiresAt } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    assert.equal(expiresAt, NOW + NONCE_TTL_MS);
    assert.equal(NONCE_TTL_MS, 5 * 60 * 1000);
    const parts = nonce.split('.');
    assert.equal(parts.length, 6);
    assert.deepEqual(parts.slice(0, 3), ['v1', 'native', String(expiresAt)]);
    assert.equal(parts[4], '');
  });

  it('web: challenge を署名の対象に含む', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'web', challenge: CHALLENGE }, NOW);
    assert.equal(nonce.split('.')[4], CHALLENGE);
  });

  it('web: challenge の形が違えば、発行しない', async () => {
    await assert.rejects(issueNonce(SECRET, { kind: 'web', challenge: 'short' }, NOW));
  });

  it('毎回違う値になる', async () => {
    const a = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const b = await issueNonce(SECRET, { kind: 'native' }, NOW);
    assert.notEqual(a.nonce, b.nonce);
  });
});

describe('verifyNonce', () => {
  it('native: 通り、nonceHash は SHA-256(T) の base64url（43字）', async () => {
    const { nonce, expiresAt } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const result = await verifyNonce(SECRET, nonce, 'native', NOW + 1000);
    assert.deepEqual(result, {
      ok: true,
      nonceHash: createHash('sha256').update(nonce).digest('base64url'),
      expiresAt,
      challenge: null,
    });
    assert.equal(result.ok && result.nonceHash.length, 43);
  });

  it('web: 通り、challenge（C）を返す', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'web', challenge: CHALLENGE }, NOW);
    const result = await verifyNonce(SECRET, nonce, 'web', NOW);
    assert.equal(result.ok && result.challenge, CHALLENGE);
  });

  it('nonceHash 関数は、verifyNonce の nonceHash と同じ値を返す', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const result = await verifyNonce(SECRET, nonce, 'native', NOW);
    assert.equal(result.ok && result.nonceHash, await nonceHash(nonce));
  });

  it('期限: 期限の直前は通り、期限の時刻以降は expired', async () => {
    const { nonce, expiresAt } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    assert.equal((await verifyNonce(SECRET, nonce, 'native', expiresAt - 1)).ok, true);
    assert.deepEqual(await verifyNonce(SECRET, nonce, 'native', expiresAt), { ok: false, reason: 'expired' });
    assert.deepEqual(await verifyNonce(SECRET, nonce, 'native', expiresAt + 1), { ok: false, reason: 'expired' });
  });

  it('種別が違う T は、署名が正しくても拒否する（native ⇄ web）', async () => {
    const native = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const web = await issueNonce(SECRET, { kind: 'web', challenge: CHALLENGE }, NOW);
    assert.deepEqual(await verifyNonce(SECRET, native.nonce, 'web', NOW), { ok: false, reason: 'kind' });
    assert.deepEqual(await verifyNonce(SECRET, web.nonce, 'native', NOW), { ok: false, reason: 'kind' });
  });

  it('別の鍵で署名された T は拒否する', async () => {
    const { nonce } = await issueNonce('another-secret-0123456789abcdefghij', { kind: 'native' }, NOW);
    assert.deepEqual(await verifyNonce(SECRET, nonce, 'native', NOW), { ok: false, reason: 'signature' });
  });

  it('どの部品を書き換えても、署名で拒否する', async () => {
    const native = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const web = await issueNonce(SECRET, { kind: 'web', challenge: CHALLENGE }, NOW);
    const other = createHash('sha256').update('other').digest('base64url');
    const cases: [string, 'native' | 'web'][] = [
      [withPart(native.nonce, 1, 'web'), 'web'], // 種別を native → web に（native の T に C が無いので形が崩れる）
      [withPart(native.nonce, 2, String(native.expiresAt + 600_000)), 'native'], // 期限を延ばす
      [withPart(native.nonce, 3, 'AAAAAAAAAAAAAAAAAAAAAA'), 'native'], // 乱数
      [withPart(web.nonce, 4, other), 'web'], // C を差し替える
    ];
    for (const [tampered, kind] of cases) {
      const result = await verifyNonce(SECRET, tampered, kind, NOW);
      assert.equal(result.ok, false, tampered);
    }
    // 期限の書き換えと、C の差し替えは、署名の不一致として弾かれる（形は正しいため）。
    assert.deepEqual(await verifyNonce(SECRET, cases[1]![0], 'native', NOW), { ok: false, reason: 'signature' });
    assert.deepEqual(await verifyNonce(SECRET, cases[2]![0], 'native', NOW), { ok: false, reason: 'signature' });
    assert.deepEqual(await verifyNonce(SECRET, cases[3]![0], 'web', NOW), { ok: false, reason: 'signature' });
  });

  it('署名の末尾の1字をどの字に変えても拒否する（同じバイト列に復号される別の表記を許さない）', async () => {
    // 署名の最後の字は下位2ビットが余りなので、上位4ビットが同じ字に変えても、復号結果は同じになる。
    // 正規の形でない表記を受け付けると、1つの T が複数の文字列で通ってしまう。全64字で確かめる。
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (const kind of ['native', 'web'] as const) {
      const input = kind === 'native' ? { kind } : { kind, challenge: CHALLENGE };
      const { nonce } = await issueNonce(SECRET, input, NOW);
      const original = nonce.slice(-1);
      for (const char of alphabet) {
        if (char === original) continue;
        const result = await verifyNonce(SECRET, nonce.slice(0, -1) + char, kind, NOW);
        assert.equal(result.ok, false, `${kind}: 末尾を ${original} → ${char} に変えた T が通った`);
      }
      assert.equal((await verifyNonce(SECRET, nonce, kind, NOW)).ok, true);
    }
  });

  it('署名を切り詰める・伸ばすと拒否する', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    assert.equal((await verifyNonce(SECRET, nonce.slice(0, -1), 'native', NOW)).ok, false);
    assert.equal((await verifyNonce(SECRET, `${nonce}A`, 'native', NOW)).ok, false);
  });

  it('形が崩れた入力は malformed（例外にしない）', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const malformed = [
      '',
      'abc',
      '....',
      nonce + '.extra',
      nonce.split('.').slice(0, 5).join('.'),
      withPart(nonce, 0, 'v2'),
      withPart(nonce, 1, 'other'),
      withPart(nonce, 2, '12x'),
      withPart(nonce, 2, ''),
      withPart(nonce, 3, 'short'),
      withPart(nonce, 4, CHALLENGE), // native なのに C がある
      withPart(nonce, 5, '!!!!'),
      'x'.repeat(600),
    ];
    for (const input of malformed) {
      assert.deepEqual(await verifyNonce(SECRET, input, 'native', NOW), { ok: false, reason: 'malformed' }, input);
    }
  });

  it('web で C が無い・形が違う T は malformed', async () => {
    const { nonce } = await issueNonce(SECRET, { kind: 'web', challenge: CHALLENGE }, NOW);
    assert.deepEqual(await verifyNonce(SECRET, withPart(nonce, 4, ''), 'web', NOW), { ok: false, reason: 'malformed' });
    assert.deepEqual(await verifyNonce(SECRET, withPart(nonce, 4, 'short'), 'web', NOW), {
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('consumeNonce（D1）', () => {
  let local: LocalDatabase;
  let db: D1Database;
  before(async () => {
    local = await openLocalDatabase();
    db = local.db;
  });
  after(async () => {
    await local.dispose();
  });

  const count = async () =>
    (await db.prepare('SELECT COUNT(*) AS n FROM used_nonces').first<{ n: number }>())!.n;

  it('初めては true、同じ nonce の2回目は false（リプレイを弾く）', async () => {
    assert.equal(await consumeNonce(db, 'hash-replay', NOW + 1000, NOW), true);
    assert.equal(await consumeNonce(db, 'hash-replay', NOW + 1000, NOW), false);
    assert.equal(await consumeNonce(db, 'hash-replay', NOW + 1000, NOW), false);
  });

  it('別の nonce は独立している', async () => {
    assert.equal(await consumeNonce(db, 'hash-a', NOW + 1000, NOW), true);
    assert.equal(await consumeNonce(db, 'hash-b', NOW + 1000, NOW), true);
  });

  it('期限を過ぎた記録を消す（期限の時刻ちょうどのものは残す）', async () => {
    await consumeNonce(db, 'hash-old', NOW + 10, NOW);
    await consumeNonce(db, 'hash-edge', NOW + 20, NOW);
    await consumeNonce(db, 'hash-fresh', NOW + 1_000_000, NOW);
    const before = await count();
    // hash-old だけが期限切れ（expires_at < now）。edge は expires_at = now なので残る。
    assert.equal(await consumeNonce(db, 'hash-trigger', NOW + 2_000_000, NOW + 20), true);
    const rows = await db.prepare('SELECT nonce_hash FROM used_nonces').all<{ nonce_hash: string }>();
    const hashes = rows.results.map((row) => row.nonce_hash);
    assert.equal(hashes.includes('hash-old'), false);
    assert.equal(hashes.includes('hash-edge'), true);
    assert.equal(hashes.includes('hash-fresh'), true);
    assert.equal(await count(), before); // 1つ消えて、1つ増えた
  });

  it('期限が切れて消えた記録は、再び true になるが、その T は verifyNonce が期限切れで弾く', async () => {
    const { nonce, expiresAt } = await issueNonce(SECRET, { kind: 'native' }, NOW);
    const verified = await verifyNonce(SECRET, nonce, 'native', NOW);
    assert.ok(verified.ok);
    assert.equal(await consumeNonce(db, verified.nonceHash, expiresAt, NOW), true);
    const later = expiresAt + 1;
    await consumeNonce(db, 'hash-cleanup', later + 1000, later); // 掃除が走る
    assert.deepEqual(await verifyNonce(SECRET, nonce, 'native', later), { ok: false, reason: 'expired' });
  });
});
