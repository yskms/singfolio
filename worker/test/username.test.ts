/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkUsername, RESERVED_USERNAMES, USERNAME_PATTERN } from '../src/username.ts';

describe('username の規則', () => {
  it('小文字の英数字と _ の3〜20字は通る', () => {
    for (const value of ['abc', 'yskms', 'a_b', '___', '123', 'a'.repeat(20), 'user_01', '0_0']) {
      assert.equal(checkUsername(value), 'ok', value);
    }
  });

  it('2字以下・21字以上・大文字・記号・空白・日本語は通らない', () => {
    const bad = [
      '',
      'a',
      'ab',
      'a'.repeat(21),
      'Abc',
      'ABC',
      'a-b',
      'a.b',
      'a b',
      ' abc',
      'abc ',
      'abc\n',
      'あいう',
      'ａｂｃ',
      '../x',
      'a/b',
      'abc%2e',
    ];
    for (const value of bad) assert.equal(checkUsername(value), 'invalid', JSON.stringify(value));
  });

  it('文字列でない値は通らない', () => {
    for (const value of [undefined, null, 1, true, {}, [], ['abc']]) assert.equal(checkUsername(value), 'invalid');
  });

  it('末尾の改行を許さない（R2のキーやURLに改行が入らない。JSの $ は末尾の改行に一致しない）', () => {
    assert.equal(USERNAME_PATTERN.test('abc\n'), false);
  });

  it('予約語は、規則に合っても確保させない', () => {
    for (const value of ['api', 'auth', 'admin', 'singfolio', 'images', 'login']) {
      assert.equal(checkUsername(value), 'reserved', value);
    }
  });

  it('予約語は、すべて小文字（確保できる形の名前と、大文字小文字で食い違わない）', () => {
    for (const value of RESERVED_USERNAMES) assert.match(value, /^[a-z0-9_]+$/, value);
  });

  it('Workerが今使うパス（/auth/・/me/）の最上位は、予約語に入っている', () => {
    for (const value of ['auth', 'me']) assert.equal(RESERVED_USERNAMES.has(value), true, value);
  });
});
