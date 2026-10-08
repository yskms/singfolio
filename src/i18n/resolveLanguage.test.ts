// 表示言語の決め方のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveLanguage } from './resolveLanguage.ts';

describe('resolveLanguage', () => {
  it('言語が選ばれていれば、端末の言語によらずそれを使う', () => {
    assert.equal(resolveLanguage('en', ['ja-JP']), 'en');
    assert.equal(resolveLanguage('ja', ['en-US']), 'ja');
    assert.equal(resolveLanguage('ja', []), 'ja');
  });

  it('system なら、端末の言語（地域つきも）から決める', () => {
    assert.equal(resolveLanguage('system', ['ja-JP']), 'ja');
    assert.equal(resolveLanguage('system', ['ja']), 'ja');
    assert.equal(resolveLanguage('system', ['en-GB']), 'en');
  });

  it('端末の優先順で、最初に対応している言語を使う', () => {
    assert.equal(resolveLanguage('system', ['fr-FR', 'ja-JP', 'en-US']), 'ja');
    assert.equal(resolveLanguage('system', ['en-US', 'ja-JP']), 'en');
  });

  it('どれも対応していなければ English', () => {
    assert.equal(resolveLanguage('system', ['fr-FR', 'de-DE']), 'en');
    assert.equal(resolveLanguage('system', []), 'en');
  });

  it('大文字小文字・区切りの違い（ja_JP、JA-jp）や、スクリプトつきのタグを扱える', () => {
    assert.equal(resolveLanguage('system', ['ja_JP']), 'ja');
    assert.equal(resolveLanguage('system', ['JA-jp']), 'ja');
    assert.equal(resolveLanguage('system', ['ja-Jpan-JP']), 'ja');
  });

  it('言語コードが前方一致するだけの別の言語は、対応言語にしない', () => {
    // jv = ジャワ語、enm = 中英語。
    assert.equal(resolveLanguage('system', ['jv-ID']), 'en');
    assert.equal(resolveLanguage('system', ['enm', 'ja']), 'ja');
  });
});
