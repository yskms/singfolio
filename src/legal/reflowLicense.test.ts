// ライセンスを画面に出す形に詰め直す処理（`reflowLicense`）のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FONT_LICENSES } from './fontLicenses.ts';
import { reflowLicense } from './reflowLicense.ts';
import { THIRD_PARTY_LICENSE_TEXTS } from './thirdPartyLicenses.ts';

describe('reflowLicense', () => {
  it('段落の中の改行を、空白にする。段落の区切り（空行）は残す', () => {
    assert.equal(reflowLicense('a b\nc d\n\ne\nf'), 'a b c d\n\ne f');
  });

  it('段落の先頭の、短い大文字だけの行は、見出しとして残す（後ろの本文は詰める）', () => {
    assert.equal(
      reflowLicense('PREAMBLE\nThe goals\nof the OFL.'),
      'PREAMBLE\nThe goals of the OFL.',
    );
    assert.equal(
      reflowLicense('PERMISSION & CONDITIONS\nPermission is\ngranted.'),
      'PERMISSION & CONDITIONS\nPermission is granted.',
    );
  });

  it('大文字だけの本文（DISCLAIMER の文）は、見出しとみなさず、詰める', () => {
    assert.equal(
      reflowLicense('DISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED "AS IS",\nWITHOUT WARRANTY OF ANY KIND,'),
      'DISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,',
    );
  });

  it('罫線を含む段落は、そのまま残す', () => {
    const title = '-----\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----';
    assert.equal(reflowLicense(title), title);
  });

  it('同梱のライセンスは、文字（空白を除く）を変えない。本文には、元の長さの行が残らない', () => {
    const squash = (text: string) => text.replace(/\s+/g, '');
    for (const { name, text } of FONT_LICENSES) {
      const reflowed = reflowLicense(text);
      assert.equal(squash(reflowed), squash(text), name);
      assert.ok(reflowed.split('\n').length < text.split('\n').length / 2, name);
      assert.match(reflowed, /^PREAMBLE\n/m, name);
    }
  });

  it('続けて並ぶ Copyright の行（共著）は、1行ずつ残す。文の途中の行は、詰める', () => {
    assert.equal(
      reflowLicense('MIT License\n\nCopyright (c) 2015 A\nCopyright (c) 2020 B\n\nPermission is\nhereby granted'),
      'MIT License\n\nCopyright (c) 2015 A\nCopyright (c) 2020 B\n\nPermission is hereby granted',
    );
    // 本文の行が折り返されて、行頭が Copyright になっても、前の行が Copyright でなければ詰める。
    assert.equal(
      reflowLicense('released by the\nCopyright Holder(s) under this license'),
      'released by the Copyright Holder(s) under this license',
    );
  });

  it('行頭の字下げは、詰めるときに除く（Apache License の題や条項）', () => {
    assert.equal(
      reflowLicense('   1. Definitions.\n\n      "License" shall mean\n      the terms.'),
      '1. Definitions.\n\n"License" shall mean the terms.',
    );
  });

  it('npmの依存・アイコンフォントのライセンスも、文字（空白を除く）を変えない。字下げの空白が、本文の途中に残らない', () => {
    const squash = (text: string) => text.replace(/\s+/g, '');
    for (const text of THIRD_PARTY_LICENSE_TEXTS) {
      const reflowed = reflowLicense(text);
      assert.equal(squash(reflowed), squash(text), text.slice(0, 60));
      assert.doesNotMatch(reflowed, /\S {3,}\S/, text.slice(0, 60));
    }
  });
});
