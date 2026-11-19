/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { USERNAME_PATTERN as WORKER_PATTERN } from '../../worker/src/username.ts';
import { isValidUsername, normalizeUsernameInput, publicAddress, USERNAME_PATTERN } from './username.ts';

describe('username', () => {
  it('規則は Worker と同じ（別に持つ値の食い違いを検出する）', () => {
    assert.equal(USERNAME_PATTERN.source, WORKER_PATTERN.source);
    assert.equal(USERNAME_PATTERN.flags, WORKER_PATTERN.flags);
  });

  it('入力は、前後の空白を落として小文字にする', () => {
    assert.equal(normalizeUsernameInput('  Karaoke_Fan '), 'karaoke_fan');
  });

  it('形の確認: 3〜20字の小文字の英数字と _', () => {
    for (const ok of ['abc', 'karaoke_fan', 'a_1', 'x'.repeat(20), '___']) assert.equal(isValidUsername(ok), true, ok);
    for (const ng of ['', 'ab', 'x'.repeat(21), 'Karaoke', 'a-b', 'a b', 'あいう', 'ａｂｃ', 'a.b']) {
      assert.equal(isValidUsername(ng), false, ng);
    }
  });

  it('大文字で入力された名前は、小文字にすれば通る（確認は小文字にしたあと）', () => {
    assert.equal(isValidUsername(normalizeUsernameInput('Karaoke_Fan')), true);
  });

  it('公開ページのアドレスは、ホスト名と名前をつなぐ', () => {
    assert.equal(publicAddress('karaoke_fan'), 'singfolio.app/karaoke_fan');
  });
});
