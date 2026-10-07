// 文言の置き換え・件数による形の選び方のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTranslator } from './translate.ts';
import type { Message } from './types.ts';

const catalog = {
  plain: 'Songs',
  hello: 'Hello, {name}!',
  twice: '{name} and {name}',
  songs: { one: '{count} song', other: '{count} songs' },
  songsOnlyOther: { other: '{count}曲' },
} satisfies Record<string, Message>;

describe('createTranslator', () => {
  it('置き換えの要らない文言は、そのまま返す（値を渡しても変わらない）', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('plain'), 'Songs');
    assert.equal(t('plain', { name: 'x' }), 'Songs');
  });

  it('{name} を値で置き換える。同じ名前が複数あれば、すべて置き換える。数も文字にする', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('hello', { name: 'Ann' }), 'Hello, Ann!');
    assert.equal(t('twice', { name: 7 }), '7 and 7');
  });

  it('値の足りない {name} は、そのまま残す。値が空文字や 0 でも置き換える', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('hello'), 'Hello, {name}!');
    assert.equal(t('hello', { other: 'x' }), 'Hello, {name}!');
    assert.equal(t('hello', { name: '' }), 'Hello, !');
    assert.equal(t('twice', { name: 0 }), '0 and 0');
  });

  it('値の中の {…} や $ は、解釈しない', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('hello', { name: '{name}$&' }), 'Hello, {name}$&!');
  });

  it('Object のプロパティ名（constructor など）は、値として扱わない', () => {
    const t = createTranslator({ x: '{constructor}' }, 'en');
    assert.equal(t('x', { name: 'a' }), '{constructor}');
  });

  it('English: 1 は one、それ以外（0 を含む）は other', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('songs', { count: 1 }), '1 song');
    assert.equal(t('songs', { count: 0 }), '0 songs');
    assert.equal(t('songs', { count: 2 }), '2 songs');
    assert.equal(t('songs', { count: 84 }), '84 songs');
  });

  it('日本語: 件数によらず other。other だけの文言も使える', () => {
    const t = createTranslator(catalog, 'ja');
    assert.equal(t('songs', { count: 1 }), '1 songs');
    assert.equal(t('songsOnlyOther', { count: 1 }), '1曲');
  });

  it('English でも、その形が無ければ other を使う', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('songsOnlyOther', { count: 1 }), '1曲');
  });

  it('件数の文言に count が無い（または数でない）ときは other。止めない', () => {
    const t = createTranslator(catalog, 'en');
    assert.equal(t('songs'), '{count} songs');
    assert.equal(t('songs', { count: '1' }), '1 songs');
  });
});
