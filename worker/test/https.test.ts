/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { httpsRequiredResponse, isInsecureRequest } from '../src/https.ts';

const insecure = (url: string, headers?: Record<string, string>) => isInsecureRequest(new Request(url, { headers }));

describe('isInsecureRequest', () => {
  it('https は通す', () => {
    assert.equal(insecure('https://singfolio.app/auth/nonce'), false);
  });

  it('http は拒否する（本番のホスト名）', () => {
    assert.equal(insecure('http://singfolio.app/auth/nonce'), true);
    assert.equal(insecure('http://singfolio.app/'), true);
  });

  it('ローカルの開発（localhost・127.0.0.1・[::1]）の http だけ通す', () => {
    assert.equal(insecure('http://localhost:8787/auth/nonce'), false);
    assert.equal(insecure('http://127.0.0.1:8787/auth/nonce'), false);
    assert.equal(insecure('http://[::1]:8787/auth/nonce'), false);
  });

  it('localhost に似たホスト名は通さない（完全一致だけ）', () => {
    assert.equal(insecure('http://localhost.evil.example/'), true);
    assert.equal(insecure('http://singfolio.app.localhost/'), true);
    assert.equal(insecure('http://127.0.0.1.evil.example/'), true);
    assert.equal(insecure('http://evil.example/localhost'), true);
  });

  it('X-Forwarded-Proto が http なら、URLが https でも拒否する', () => {
    assert.equal(insecure('https://singfolio.app/', { 'x-forwarded-proto': 'http' }), true);
    assert.equal(insecure('https://singfolio.app/', { 'x-forwarded-proto': 'HTTP' }), true);
    assert.equal(insecure('https://singfolio.app/', { 'x-forwarded-proto': 'https, http' }), true);
  });

  it('X-Forwarded-Proto が https、または無いときは、URLに従う', () => {
    assert.equal(insecure('https://singfolio.app/', { 'x-forwarded-proto': 'https' }), false);
    assert.equal(insecure('https://singfolio.app/'), false);
    // https と書いてあっても、URLが http なら拒否する（URLの信号を打ち消さない）。
    assert.equal(insecure('http://singfolio.app/', { 'x-forwarded-proto': 'https' }), true);
  });
});

describe('httpsRequiredResponse', () => {
  it('403 で、リダイレクトしない・キャッシュさせない', async () => {
    const response = httpsRequiredResponse();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), 'HTTPS required\n');
  });
});
