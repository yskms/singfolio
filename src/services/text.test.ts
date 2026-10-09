// タグ名の正規化（text.ts）のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeTagName, normalizeText, searchKey, tagNameKey } from './text.ts';

describe('normalizeText（曲名・アーティスト）', () => {
  it('前後の空白（全角を含む）を除く', () => {
    assert.equal(normalizeText('  チェリー\u3000'), 'チェリー');
    assert.equal(normalizeText(' \u3000 '), '');
  });

  it('分解された濁点（NFD）を、合成した形（NFC）にそろえる', () => {
    assert.equal(normalizeText('ホ\u3099ウイ'), 'ボウイ');
    assert.equal(normalizeText('e\u0301'), 'é');
  });

  it('全角半角・大文字小文字・内側の空白は変えない', () => {
    assert.equal(normalizeText('Ｔ.Ｍ.Revolution'), 'Ｔ.Ｍ.Revolution');
    assert.equal(normalizeText('ﾎﾞｶﾛ'), 'ﾎﾞｶﾛ');
    assert.equal(normalizeText('Hard   Rock'), 'Hard   Rock');
  });
});

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

  it('NFKCは互換文字も変換する（タグ名ではこれを許容する）', () => {
    assert.equal(normalizeTagName('①'), '1');
    assert.equal(normalizeTagName('™'), 'TM');
    assert.equal(normalizeTagName('㈱'), '(株)');
    assert.equal(normalizeTagName('½'), '1\u20442');
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

describe('searchKey', () => {
  it('大文字小文字を同一視する（ASCII以外も）', () => {
    assert.equal(searchKey('HANABI'), searchKey('hanabi'));
    assert.equal(searchKey('Ä'), searchKey('ä'));
  });

  it('全角半角を同一視する', () => {
    assert.equal(searchKey('ＲＯＣＫ'), searchKey('rock'));
    assert.equal(searchKey('Ｔ.Ｍ.Revolution'), searchKey('T.M.Revolution'));
    assert.equal(searchKey('ﾁｪﾘｰ'), searchKey('チェリー'));
  });

  it('半角カナの濁点・半濁点、分解された濁点も合成する（Hermesの NFKC は合成しない）', () => {
    assert.equal(searchKey('ﾎﾞｶﾛ'), searchKey('ボカロ'));
    assert.equal(searchKey('ﾊﾟ'), searchKey('パ'));
    assert.equal(searchKey('ホ\u3099カロ'), searchKey('ボカロ'));
  });

  it('ひらがなとカタカナを同一視する（長音・小書き・濁点を含む）', () => {
    assert.equal(searchKey('ちぇりー'), searchKey('チェリー'));
    assert.equal(searchKey('ぼからいど'), searchKey('ボカライド'));
    assert.equal(searchKey('ゔぁ'), searchKey('ヴァ'));
    assert.equal(searchKey('ゝ'), searchKey('ヽ'));
  });

  it('長音（ー）や、ひらがな・カタカナ以外の字は変えない', () => {
    assert.equal(searchKey('チェリー'), 'ちぇりー');
    assert.notEqual(searchKey('チェリー'), searchKey('ちぇりい'));
    assert.equal(searchKey('天体観測'), '天体観測');
    // 区切りの中黒（U+30FB）や、ヷ・ヺ（ひらがなに対応する字が無い）は、そのまま。
    assert.equal(searchKey('・'), '・');
  });

  it('空白は、全角も含めて連続を1つにし、前後を除く', () => {
    assert.equal(searchKey('  BUMP\u3000 OF   CHICKEN '), 'bump of chicken');
    assert.equal(searchKey(' \u3000 '), '');
  });

  it('漢字の読みは同一視しない（読みのデータが無い）', () => {
    assert.notEqual(searchKey('桜'), searchKey('さくら'));
  });
});
