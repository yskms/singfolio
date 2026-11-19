/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDateTime } from './dateTime.ts';

describe('formatDateTime', () => {
  it('端末のタイムゾーンの YYYY-MM-DD HH:mm にする（0埋め）', () => {
    // 組み立てもローカルの時刻で行い、実行するマシンのタイムゾーンに依らない。
    assert.equal(formatDateTime(new Date(2026, 10, 19, 14, 5).getTime()), '2026-11-19 14:05');
    assert.equal(formatDateTime(new Date(2026, 0, 2, 3, 4).getTime()), '2026-01-02 03:04');
  });
});
