/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { verifyNonce } from '../src/nonce.ts';

const SECRET = 'test-secret-value-0123456789abcdef';
// D1 には触れないので、DB は渡さない（触れたら、テストが落ちる）。
const env = { NONCE_HMAC_KEY: SECRET } as Env;
const CHALLENGE = createHash('sha256').update('verifier').digest('base64url');

const post = (body: unknown, url = 'https://singfolio.app/auth/nonce') =>
  worker.fetch(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  );

describe('POST /auth/nonce', () => {
  it('native: 200 で、nonce と expiresAt を返し、キャッシュさせない', async () => {
    const before = Date.now();
    const response = await post({ kind: 'native' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    const body = (await response.json()) as { nonce: string; expiresAt: number };
    assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'nonce']);
    assert.ok(body.expiresAt >= before + 5 * 60 * 1000);
    // 返した T は、同じ鍵で検証できる。
    assert.equal((await verifyNonce(SECRET, body.nonce, 'native', Date.now())).ok, true);
  });

  it('web: challenge を T に結びつけて返す', async () => {
    const response = await post({ kind: 'web', challenge: CHALLENGE });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { nonce: string };
    const verified = await verifyNonce(SECRET, body.nonce, 'web', Date.now());
    assert.equal(verified.ok && verified.challenge, CHALLENGE);
  });

  it('web: challenge が無い・形が違うと 400', async () => {
    for (const body of [
      { kind: 'web' },
      { kind: 'web', challenge: 'short' },
      { kind: 'web', challenge: `${CHALLENGE}x` },
      { kind: 'web', challenge: 'a.'.repeat(21) + 'a' },
      { kind: 'web', challenge: 123 },
    ]) {
      const response = await post(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
  });

  it('native に challenge が付いていたら 400（取り違えを弾く）', async () => {
    assert.equal((await post({ kind: 'native', challenge: CHALLENGE })).status, 400);
  });

  it('kind が無い・知らない値・JSONでない・オブジェクトでないと 400', async () => {
    for (const body of [{}, { kind: 'other' }, { kind: 1 }, 'not json', '', '[]', 'null', '"native"', '1']) {
      assert.equal((await post(body)).status, 400, String(body));
    }
  });

  it('POST 以外は 405 で、Allow を返す', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await worker.fetch(new Request('https://singfolio.app/auth/nonce', { method }), env);
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'POST');
    }
  });

  it('本文が大きすぎると 413（Content-Length・実際の長さの両方）', async () => {
    const big = JSON.stringify({ kind: 'native', padding: 'x'.repeat(2000) });
    assert.equal((await post(big)).status, 413);
    const lying = new Request('https://singfolio.app/auth/nonce', {
      method: 'POST',
      headers: { 'content-length': '5000' },
      body: '{"kind":"native"}',
    });
    assert.equal((await worker.fetch(lying, env)).status, 413);
  });

  // Content-Length の無い（chunked の）本文。上限を超えたら、残りを読まずに止める。
  const streamOf = (chunks: number, chunkBytes: number, counter: { pulled: number }) =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        counter.pulled++;
        if (counter.pulled > chunks) controller.close();
        else controller.enqueue(new Uint8Array(chunkBytes).fill(0x20));
      },
    });
  const postStream = (body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
    worker.fetch(
      new Request('https://singfolio.app/auth/nonce', {
        method: 'POST',
        headers,
        body,
        duplex: 'half',
      } as RequestInit),
      env,
    );

  it('Content-Length が無くても、上限を超えた時点で読むのをやめて 413（全部は読まない）', async () => {
    const counter = { pulled: 0 };
    // 1KB × 20000 = 約20MB。上限（1KB）を超えるのは2チャンク目。
    const response = await postStream(streamOf(20000, 1024, counter));
    assert.equal(response.status, 413);
    assert.ok(counter.pulled < 10, `読み込みが止まらなかった: ${counter.pulled} チャンク`);
  });

  it('Content-Length が数値でなくても、実際の長さで判定する', async () => {
    const counter = { pulled: 0 };
    const big = await postStream(streamOf(20000, 1024, counter), { 'content-length': 'abc' });
    assert.equal(big.status, 413);
    assert.ok(counter.pulled < 10);
    const small = await worker.fetch(
      new Request('https://singfolio.app/auth/nonce', {
        method: 'POST',
        headers: { 'content-length': 'abc' },
        body: '{"kind":"native"}',
      }),
      env,
    );
    assert.equal(small.status, 200);
  });

  it('上限ちょうど(1024バイト)の本文は読める。1バイト超えると 413', async () => {
    const exact = JSON.stringify({ kind: 'native' }).padEnd(1024, ' ');
    assert.equal(new TextEncoder().encode(exact).length, 1024);
    assert.equal((await post(exact)).status, 200);
    assert.equal((await post(`${exact} `)).status, 413);
  });

  it('本文が無い POST は 400', async () => {
    const response = await worker.fetch(new Request('https://singfolio.app/auth/nonce', { method: 'POST' }), env);
    assert.equal(response.status, 400);
  });

  it('鍵が無い・短いときは、応答を作らずに例外になる（原因が分かる）', async () => {
    const request = () =>
      new Request('https://singfolio.app/auth/nonce', { method: 'POST', body: '{"kind":"native"}' });
    await assert.rejects(worker.fetch(request(), {} as Env), /NONCE_HMAC_KEY/);
    await assert.rejects(worker.fetch(request(), { NONCE_HMAC_KEY: 'short' } as Env), /NONCE_HMAC_KEY/);
  });

  it('HTTP は、本文を見る前に 403 で拒否する', async () => {
    const response = await post({ kind: 'native' }, 'http://singfolio.app/auth/nonce');
    assert.equal(response.status, 403);
    assert.equal(await response.text(), 'HTTPS required\n');
  });

  it('ローカル開発（http://localhost）では動く', async () => {
    assert.equal((await post({ kind: 'native' }, 'http://localhost:8787/auth/nonce')).status, 200);
  });
});

describe('入口', () => {
  it('知らないパスは 404（HTTPSのとき）、HTTP なら 403', async () => {
    assert.equal((await worker.fetch(new Request('https://singfolio.app/x'), env)).status, 404);
    assert.equal((await worker.fetch(new Request('https://singfolio.app/'), env)).status, 404);
    assert.equal((await worker.fetch(new Request('http://singfolio.app/x'), env)).status, 403);
  });

  it('/auth/nonce の別名（末尾のスラッシュ・大文字）は 404', async () => {
    for (const path of ['/auth/nonce/', '/Auth/Nonce', '/auth/nonce.json']) {
      const response = await worker.fetch(new Request(`https://singfolio.app${path}`, { method: 'POST' }), env);
      assert.equal(response.status, 404, path);
    }
  });
});
