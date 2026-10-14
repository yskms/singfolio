// 読みの入力の規則のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultReading, readingProblem } from './readingRules.ts';

describe('readingProblem', () => {
  it('空（空白だけを含む）は、どの言語でも不可', () => {
    for (const language of ['ja', 'en'] as const) {
      assert.equal(readingProblem('', language), 'required');
      assert.equal(readingProblem(' \u3000 ', language), 'required');
    }
  });

  it('日本語の設定: ひらがな・カタカナ・長音・中点・空白・数字・記号は使える', () => {
    for (const reading of ['くいーん', 'クイーン', 'ミスター・チルドレン', 'まるーん ふぁいぶ', 'マルーン5', 'ｱｲｳ', 'ゝ', 'ー']) {
      assert.equal(readingProblem(reading, 'ja'), undefined, reading);
    }
    assert.equal(readingProblem('えぬえむ&ぴー!', 'ja'), undefined);
  });

  it('日本語の設定: 漢字を含むと不可（kana-only）', () => {
    for (const reading of ['米津玄師', 'よねづ玄師', '々', '〇', '𠮷野家']) {
      assert.equal(readingProblem(reading, 'ja'), 'kana-only', reading);
    }
  });

  it('日本語の設定: 英字（全角を含む）を含むと不可（kana-only）', () => {
    for (const reading of ['Queen', 'くいーんQ', 'ＥＬＬ', 'café']) {
      assert.equal(readingProblem(reading, 'ja'), 'kana-only', reading);
    }
  });

  it('英語の設定: 空でなければ何でもよい（The を除くなど）', () => {
    for (const reading of ['Beatles', 'くいーん', '米津玄師', 'ELLEGARDEN', '1']) {
      assert.equal(readingProblem(reading, 'en'), undefined, reading);
    }
  });
});

describe('defaultReading', () => {
  it('英語は、いつも名前そのもの（正規化した形）', () => {
    assert.equal(defaultReading('The Beatles', 'en'), 'The Beatles');
    assert.equal(defaultReading('米津玄師', 'en'), '米津玄師');
    assert.equal(defaultReading('ＥＬＬＥＧＡＲＤＥＮ', 'en'), 'ELLEGARDEN');
  });

  it('日本語は、かなだけの名前ならそのまま、漢字・英字を含む名前は空（入力してもらう）', () => {
    assert.equal(defaultReading('スピッツ', 'ja'), 'スピッツ');
    assert.equal(defaultReading('あいみょん', 'ja'), 'あいみょん');
    assert.equal(defaultReading('米津玄師', 'ja'), '');
    assert.equal(defaultReading('Queen', 'ja'), '');
    assert.equal(defaultReading('Mrs. GREEN APPLE', 'ja'), '');
  });
});
