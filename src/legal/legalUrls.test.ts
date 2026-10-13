// 法務のページのURL（`legalUrls.ts`）が、公開するページ（`docs/`）と対応していることのテスト。
// `npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PRIVACY_POLICY_URL } from './legalUrls.ts';

const docs = new URL('../../docs/', import.meta.url);

describe('PRIVACY_POLICY_URL', () => {
  it('https で、GitHub Pages の docs/privacy-policy.md（公開すると .html になる）を指す', () => {
    const url = new URL(PRIVACY_POLICY_URL);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'yskms.github.io');
    assert.equal(url.pathname, '/singfolio/privacy-policy.html');
    assert.ok(existsSync(new URL('privacy-policy.md', docs)));
  });

  it('ストア掲載情報（docs/singfolio-store-listing.md）に書いたURLと同じ', () => {
    const listing = readFileSync(new URL('singfolio-store-listing.md', docs), 'utf8');
    assert.ok(listing.includes(PRIVACY_POLICY_URL));
  });
});
