// タグ名の正規化（text.ts）のテスト。`npm test` で実行する。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeTagName, tagNameKey } from './text.ts';

describe('normalizeTagName', () => {
  it('前後の空白（全角を含む）を除き、連続する空白を半角空白1つにする', () => {
    assert.equal(normalizeTagName('  J-Pop  '), 'J-Pop');
    assert.equal(normalizeTagName('　アニメ　'), 'アニメ');
    assert.equal(normalizeTagName('Hard   Rock'), 'Hard Rock');
    assert.equal(normalizeTagName('Hard　\tRock'), 'Hard Rock');
  });

  it('全角の英数字を半角に、半角カナを全角カナにする（NFKC）', () => {
    assert.equal(normalizeTagName('Ｒock'), 'Rock');
    assert.equal(normalizeTagName('ＪーＰｏｐ'), 'JーPop');
    assert.equal(normalizeTagName('ﾎﾞｶﾛ'), 'ボカロ');
  });

  it('濁点・半濁点は合成した形にそろえる（分解された入力も、半角カナの濁点も）', () => {
    // ホ + 結合用の濁点（U+3099）→ ボ。Hermesでは NFKC が合成しないため、
    // 実装は NFKD → NFC の2段階にしている（text.ts）。この差はNodeでは検出できず、
    // 実機（Hermes）でも確認が必要。
    assert.equal(normalizeTagName('ボ'), 'ボ');
    assert.equal(normalizeTagName('ﾎﾞ'), 'ボ');
    assert.equal(normalizeTagName('ﾊﾟ'), 'パ');
    assert.equal(normalizeTagName('ﾎﾞ'), 'ボ');
  });

  it('大文字小文字は変えない', () => {
    assert.equal(normalizeTagName('Rock'), 'Rock');
    assert.equal(normalizeTagName('rock'), 'rock');
  });

  it('空白だけの名前は空文字になる', () => {
    assert.equal(normalizeTagName(''), '');
    assert.equal(normalizeTagName(' 　 '), '');
  });
});

describe('tagNameKey', () => {
  it('大文字小文字・全角半角・空白の違いを同一視する', () => {
    const key = tagNameKey('Rock');
    assert.equal(tagNameKey('rock'), key);
    assert.equal(tagNameKey('ＲＯＣＫ'), key);
    assert.equal(tagNameKey('  rock '), key);
    assert.equal(tagNameKey('Hard  Rock'), tagNameKey('hard rock'));
  });

  it('ASCII以外の大文字小文字も同一視する（DBの NOCASE は同一視しない）', () => {
    assert.equal(tagNameKey('Ä'), tagNameKey('ä'));
  });

  it('ひらがなとカタカナは同一視しない', () => {
    assert.notEqual(tagNameKey('あにめ'), tagNameKey('アニメ'));
  });
});
