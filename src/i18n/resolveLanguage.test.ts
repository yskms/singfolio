// 表示言語の決め方のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveLanguage } from './resolveLanguage.ts';

describe('resolveLanguage', () => {
  it('利用者が選んだ言語があれば、端末の言語によらずそれを使う', () => {
    assert.equal(resolveLanguage('en', ['ja-JP']), 'en');
    assert.equal(resolveLanguage('ja', ['en-US']), 'ja');
    assert.equal(resolveLanguage('ja', []), 'ja');
  });

  it('選んでいなければ、端末の言語（地域つきも）から決める', () => {
    assert.equal(resolveLanguage(null, ['ja-JP']), 'ja');
    assert.equal(resolveLanguage(null, ['ja']), 'ja');
    assert.equal(resolveLanguage(null, ['en-GB']), 'en');
  });

  it('端末の優先順で、最初に対応している言語を使う', () => {
    assert.equal(resolveLanguage(null, ['fr-FR', 'ja-JP', 'en-US']), 'ja');
    assert.equal(resolveLanguage(null, ['en-US', 'ja-JP']), 'en');
  });

  it('どれも対応していなければ English', () => {
    assert.equal(resolveLanguage(null, ['fr-FR', 'de-DE']), 'en');
    assert.equal(resolveLanguage(null, []), 'en');
  });

  it('大文字小文字・区切りの違い（ja_JP、JA-jp）や、スクリプトつきのタグを扱える', () => {
    assert.equal(resolveLanguage(null, ['ja_JP']), 'ja');
    assert.equal(resolveLanguage(null, ['JA-jp']), 'ja');
    assert.equal(resolveLanguage(null, ['ja-Jpan-JP']), 'ja');
  });

  it('言語コードが前方一致するだけの別の言語は、対応言語にしない', () => {
    // jv = ジャワ語、enm = 中英語。
    assert.equal(resolveLanguage(null, ['jv-ID']), 'en');
    assert.equal(resolveLanguage(null, ['enm', 'ja']), 'ja');
  });
});
