// 日付の書き方のテスト。`npm test` で実行する。日付は、実行する環境のタイムゾーンに依らないよう、
// ローカルの日時（`new Date(年, 月, 日, 時, 分)`）から作る。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDay } from './formatDay.ts';

const at = (year: number, month: number, day: number, hour = 12, minute = 0): number =>
  new Date(year, month - 1, day, hour, minute).getTime();

const NOW = at(2026, 10, 11, 15, 30);

describe('formatDay', () => {
  it('今と同じ日は null（時刻が違っても、日の始まりと終わりでも）', () => {
    assert.equal(formatDay(NOW, NOW, 'en'), null);
    assert.equal(formatDay(at(2026, 10, 11, 0, 0), NOW, 'en'), null);
    assert.equal(formatDay(at(2026, 10, 11, 23, 59), NOW, 'ja'), null);
  });

  it('日付をまたぐと、直前でも別の日', () => {
    assert.equal(formatDay(at(2026, 10, 10, 23, 59), NOW, 'en'), 'Oct 10');
    assert.equal(formatDay(at(2026, 10, 12, 0, 0), NOW, 'en'), 'Oct 12');
  });

  it('同じ年は年を書かない', () => {
    assert.equal(formatDay(at(2026, 9, 28), NOW, 'en'), 'Sep 28');
    assert.equal(formatDay(at(2026, 9, 28), NOW, 'ja'), '9月28日');
    assert.equal(formatDay(at(2026, 1, 1), NOW, 'en'), 'Jan 1');
    assert.equal(formatDay(at(2026, 12, 31), NOW, 'ja'), '12月31日');
  });

  it('年が違うときは年を書く（月日が同じでも、年が違えば今日ではない）', () => {
    assert.equal(formatDay(at(2025, 9, 28), NOW, 'en'), 'Sep 28, 2025');
    assert.equal(formatDay(at(2025, 9, 28), NOW, 'ja'), '2025年9月28日');
    assert.equal(formatDay(at(2025, 10, 11), NOW, 'en'), 'Oct 11, 2025');
  });

  it('年末と年始をまたぐと、年が違う', () => {
    const newYear = at(2027, 1, 1, 0, 0);
    assert.equal(formatDay(at(2026, 12, 31, 23, 59), newYear, 'en'), 'Dec 31, 2026');
  });
});
