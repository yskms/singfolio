// 「新規タグ」欄の入力の扱い（tagInput.ts）のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Tag } from '../domain/types.ts';
import { resolveTagInput } from './tagInput.ts';

const tag = (id: string, name: string): Tag => ({ id, name, createdAt: 0 });
const tags = [tag('1', 'Rock'), tag('2', 'アニメ')];

describe('resolveTagInput', () => {
  it('空・空白だけは何もしない', () => {
    assert.deepEqual(resolveTagInput('', tags, []), { type: 'none' });
    assert.deepEqual(resolveTagInput('  　 ', tags, []), { type: 'none' });
  });

  it('新しい名前は、正規化した形で返す', () => {
    assert.deepEqual(resolveTagInput('  J-Pop ', tags, []), { type: 'new', name: 'J-Pop' });
    assert.deepEqual(resolveTagInput('Ｊ-Ｐｏｐ', tags, []), { type: 'new', name: 'J-Pop' });
    assert.deepEqual(resolveTagInput('Hard   Rock', tags, []), { type: 'new', name: 'Hard Rock' });
  });

  it('既存のタグと同じ名前は、新しく作らず既存のタグを返す（大文字小文字・全角半角を同一視）', () => {
    assert.deepEqual(resolveTagInput('Rock', tags, []), { type: 'existing', tag: tags[0] });
    assert.deepEqual(resolveTagInput('rock', tags, []), { type: 'existing', tag: tags[0] });
    assert.deepEqual(resolveTagInput('Ｒock', tags, []), { type: 'existing', tag: tags[0] });
    assert.deepEqual(resolveTagInput('アニメ', tags, []), { type: 'existing', tag: tags[1] });
  });

  it('ひらがなとカタカナは別のタグ（Serviceの重複の判定と同じ）', () => {
    assert.deepEqual(resolveTagInput('あにめ', tags, []), { type: 'new', name: 'あにめ' });
  });

  it('追加済みの新しい名前と同じなら、何もしない（二重に足さない）', () => {
    assert.deepEqual(resolveTagInput('J-Pop', tags, ['J-Pop']), { type: 'none' });
    assert.deepEqual(resolveTagInput('j-pop', tags, ['J-Pop']), { type: 'none' });
    assert.deepEqual(resolveTagInput('Ballad', tags, ['J-Pop']), { type: 'new', name: 'Ballad' });
  });
});
