/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { base64ToBase64Url, bytesToBase64Url } from './base64url.ts';

describe('base64ToBase64Url', () => {
  it('+ と / を - と _ にし、末尾の = を除く', () => {
    assert.equal(base64ToBase64Url('a+b/c=='), 'a-b_c');
    assert.equal(base64ToBase64Url('abc'), 'abc');
  });

  it('SHA-256("abc") の base64 が、Workerと同じ43字の base64url になる', () => {
    const base64 = createHash('sha256').update('abc').digest('base64');
    assert.equal(base64, 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    const url = base64ToBase64Url(base64);
    assert.equal(url, 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
    assert.equal(url.length, 43);
    assert.equal(url, createHash('sha256').update('abc').digest('base64url'));
  });
});

describe('bytesToBase64Url', () => {
  const cases: Array<[number[], string]> = [
    [[], ''],
    [[0], 'AA'],
    [[255], '_w'],
    [[0, 0], 'AAA'],
    [[251, 255], '-_8'],
    [[1, 2, 3], 'AQID'],
    [[250, 251, 252, 253], '-vv8_Q'],
  ];
  for (const [bytes, expected] of cases) {
    it(`[${bytes.join(', ')}] は ${JSON.stringify(expected)}`, () => {
      assert.equal(bytesToBase64Url(Uint8Array.from(bytes)), expected);
    });
  }

  it('Nodeの base64url と一致する（ランダムな長さ・値）。32バイトは43字（パディング・+・/ を含まない）', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + length * 11) & 255;
      assert.equal(bytesToBase64Url(bytes), Buffer.from(bytes).toString('base64url'));
    }
    const random = bytesToBase64Url(Uint8Array.from({ length: 32 }, (_, i) => 255 - i));
    assert.equal(random.length, 43);
    assert.match(random, /^[A-Za-z0-9_-]{43}$/);
  });
});
