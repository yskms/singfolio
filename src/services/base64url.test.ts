/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { base64ToBase64Url } from './base64url.ts';

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
