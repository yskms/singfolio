// 端末の言語から表示言語を決める関数のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deviceLanguage } from './deviceLanguage.ts';

describe('deviceLanguage', () => {
  it('端末の言語（地域つきも）から決める', () => {
    assert.equal(deviceLanguage(['ja-JP']), 'ja');
    assert.equal(deviceLanguage(['ja']), 'ja');
    assert.equal(deviceLanguage(['en-GB']), 'en');
  });

  it('端末の優先順で、最初に対応している言語を使う', () => {
    assert.equal(deviceLanguage(['fr-FR', 'ja-JP', 'en-US']), 'ja');
    assert.equal(deviceLanguage(['en-US', 'ja-JP']), 'en');
  });

  it('どれも対応していなければ English', () => {
    assert.equal(deviceLanguage(['fr-FR', 'de-DE']), 'en');
    assert.equal(deviceLanguage([]), 'en');
  });

  it('大文字小文字・区切りの違い（ja_JP、JA-jp）や、スクリプトつきのタグを扱える', () => {
    assert.equal(deviceLanguage(['ja_JP']), 'ja');
    assert.equal(deviceLanguage(['JA-jp']), 'ja');
    assert.equal(deviceLanguage(['ja-Jpan-JP']), 'ja');
  });

  it('言語コードが前方一致するだけの別の言語は、対応言語にしない', () => {
    // jv = ジャワ語、enm = 中英語。
    assert.equal(deviceLanguage(['jv-ID']), 'en');
    assert.equal(deviceLanguage(['enm', 'ja']), 'ja');
  });
});
