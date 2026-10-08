// 文言の置き換え・件数による形の選び方・必要な値の型のテスト。`npm test` で実行する。
// 型のテストは `@ts-expect-error`（型エラーにならないと、`npm run typecheck` が失敗する）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTranslator } from './translate.ts';
import type { Message } from './types.ts';

const catalog = {
  plain: 'Songs',
  hello: 'Hello, {name}!',
  twice: '{name} and {name}',
  both: '{name}: {count}',
  songs: { one: '{count} song', other: '{count} songs' },
  songsBy: { one: '{count} song by {artist}', other: '{count} songs by {artist}' },
  songsOnlyOther: { other: '{count}曲' },
  constructorName: '{constructor}',
} as const satisfies Record<string, Message>;

const en = createTranslator<typeof catalog>(catalog, 'en');
const ja = createTranslator<typeof catalog>(catalog, 'ja');

describe('createTranslator', () => {
  it('置き換えの要らない文言は、そのまま返す', () => {
    assert.equal(en('plain'), 'Songs');
  });

  it('{name} を値で置き換える。同じ名前が複数あれば、すべて置き換える。数も文字にする', () => {
    assert.equal(en('hello', { name: 'Ann' }), 'Hello, Ann!');
    assert.equal(en('twice', { name: 7 }), '7 and 7');
    assert.equal(en('both', { name: 'x', count: 3 }), 'x: 3');
  });

  it('値が空文字や 0 でも置き換える', () => {
    assert.equal(en('hello', { name: '' }), 'Hello, !');
    assert.equal(en('twice', { name: 0 }), '0 and 0');
  });

  it('値の中の {…} や $ は、解釈しない', () => {
    assert.equal(en('hello', { name: '{name}$&' }), 'Hello, {name}$&!');
  });

  it('Object のプロパティ名（constructor など）は、値として扱わない', () => {
    // @ts-expect-error constructor の値が無い
    assert.equal(en('constructorName', { name: 'a' }), '{constructor}');
  });

  it('English: 1 は one、それ以外（0 を含む）は other', () => {
    assert.equal(en('songs', { count: 1 }), '1 song');
    assert.equal(en('songs', { count: 0 }), '0 songs');
    assert.equal(en('songs', { count: 2 }), '2 songs');
    assert.equal(en('songs', { count: 84 }), '84 songs');
    assert.equal(en('songsBy', { count: 1, artist: 'Ann' }), '1 song by Ann');
  });

  it('日本語: 件数によらず other。other だけの文言も使える', () => {
    assert.equal(ja('songs', { count: 1 }), '1 songs');
    assert.equal(ja('songsOnlyOther', { count: 1 }), '1曲');
  });

  it('English でも、その形が無ければ other を使う', () => {
    assert.equal(en('songsOnlyOther', { count: 1 }), '1曲');
  });

  it('型で防いでいても、実行時は止めない: 値の足りない {name} はそのまま残す', () => {
    // @ts-expect-error name が要る
    assert.equal(en('hello'), 'Hello, {name}!');
    // @ts-expect-error name が要る（別の名前は置き換えに使わない）
    assert.equal(en('hello', { other: 'x' }), 'Hello, {name}!');
    // @ts-expect-error count が要る
    assert.equal(en('songs'), '{count} songs');
    // @ts-expect-error count は数
    assert.equal(en('songs', { count: '1' }), '1 songs');
  });

  it('型で防いでいても、実行時は止めない: カタログに無いキーは、キーそのものを返す', () => {
    // @ts-expect-error unknown は文言に無い
    assert.equal(en('unknown'), 'unknown');
  });

  it('Object のプロパティ名（constructor など）は、カタログのキーと見なさない', () => {
    // @ts-expect-error constructor は文言に無い
    assert.equal(en('constructor'), 'constructor');
    // @ts-expect-error toString は文言に無い
    assert.equal(en('toString', { name: 'x' }), 'toString');
    // @ts-expect-error __proto__ は文言に無い
    assert.equal(en('__proto__'), '__proto__');
  });
});

describe('t の引数の型', () => {
  // 実行しても何も検証しない。型エラーの有無（`@ts-expect-error`）が検証。
  it('必要な値を渡さない呼び出しは型エラー', () => {
    // @ts-expect-error name が要る
    en('hello');
    // @ts-expect-error 件数の文言は count が要る
    en('songs');
    // @ts-expect-error count だけでは足りない（artist が要る）
    en('songsBy', { count: 1 });
    // @ts-expect-error name が足りない（count だけ）
    en('both', { count: 1 });
  });

  it('値の要らない文言に値を渡すのは型エラー（キーの取り違えに気づける）', () => {
    // @ts-expect-error plain は値を取らない
    en('plain', { name: 'x' });
  });

  it('count は数でなければ型エラー。{name} は文字でも数でもよい', () => {
    // @ts-expect-error count は数
    en('songs', { count: '1' });
    en('hello', { name: 'x' });
    en('hello', { name: 1 });
  });

  it('キーが union のときは、どの文言にも足りる値を要求する（値の要る文言が混ざっていても素通りしない）', () => {
    const mixed = 'hello' as 'hello' | 'plain';
    // @ts-expect-error hello の name が要る
    en(mixed);
    en(mixed, { name: 'x' });
    const plurals = 'songs' as 'songs' | 'songsBy';
    // @ts-expect-error songsBy の artist が要る
    en(plurals, { count: 1 });
    en(plurals, { count: 1, artist: 'Ann' });
    // 値の要らない文言だけの union は、値なしで呼べる。
    const noParams = 'plain' as 'plain';
    en(noParams);
  });
});
