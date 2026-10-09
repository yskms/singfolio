// My Keyの入力の範囲・表記（keyOffset.ts）のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatSemitones, MAX_KEY_OFFSET, stepKeyOffset } from './keyOffset.ts';

describe('stepKeyOffset', () => {
  it('半音1つずつ上げ下げする（Originalをまたぐ）', () => {
    assert.equal(stepKeyOffset(0, 1), 1);
    assert.equal(stepKeyOffset(0, -1), -1);
    assert.equal(stepKeyOffset(-1, 1), 0);
    assert.equal(stepKeyOffset(1, -1), 0);
  });

  it('範囲の端では動かさない', () => {
    assert.equal(stepKeyOffset(MAX_KEY_OFFSET - 1, 1), MAX_KEY_OFFSET);
    assert.equal(stepKeyOffset(MAX_KEY_OFFSET, 1), MAX_KEY_OFFSET);
    assert.equal(stepKeyOffset(-MAX_KEY_OFFSET + 1, -1), -MAX_KEY_OFFSET);
    assert.equal(stepKeyOffset(-MAX_KEY_OFFSET, -1), -MAX_KEY_OFFSET);
    // 端でも、内側へは動く
    assert.equal(stepKeyOffset(MAX_KEY_OFFSET, -1), MAX_KEY_OFFSET - 1);
    assert.equal(stepKeyOffset(-MAX_KEY_OFFSET, 1), -MAX_KEY_OFFSET + 1);
  });

  it('範囲の外の値は、外へは動かさず、範囲へ向かって1つずつ動かす', () => {
    assert.equal(stepKeyOffset(15, 1), 15);
    assert.equal(stepKeyOffset(15, -1), 14);
    assert.equal(stepKeyOffset(-15, -1), -15);
    assert.equal(stepKeyOffset(-15, 1), -14);
  });
});

describe('formatSemitones', () => {
  it('正の値には + を付け、負の値は半角のハイフンで出す', () => {
    assert.equal(formatSemitones(2), '+2');
    assert.equal(formatSemitones(-2), '-2');
    assert.equal(formatSemitones(12), '+12');
  });
});
