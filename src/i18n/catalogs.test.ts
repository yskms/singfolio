// 文言のカタログ（en / ja）の整合のテスト。キーの過不足は型が保証するので、ここでは、
// 型では分からない中身（空の文言・`{name}` の食い違い・件数の形）を見る。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES } from '../domain/types.ts';
import { ServiceError } from '../services/errors.ts';
import { catalogs, errorMessageKey, type MessageKey } from './index.ts';
import { en } from './en.ts';
import { placeholderNames } from './translate.ts';
import type { Message } from './types.ts';

const keys = Object.keys(en) as MessageKey[];

function forms(message: Message): string[] {
  return typeof message === 'string' ? [message] : Object.values(message);
}

describe('catalogs', () => {
  it('全言語が、English と同じキーを過不足なく持つ（型の保証が実行時にも成り立つ）', () => {
    for (const language of LANGUAGES) {
      assert.deepEqual(Object.keys(catalogs[language]).sort(), [...keys].sort(), language);
    }
  });

  it('空の文言が無い', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        for (const form of forms(catalogs[language][key])) {
          assert.notEqual(form.trim(), '', `${language}: ${key}`);
        }
      }
    }
  });

  it('English が件数の文言なら、他の言語も件数の文言（count を渡す呼び出しが、どの言語でも同じ）', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        assert.equal(
          typeof catalogs[language][key] === 'string',
          typeof catalogs.en[key] === 'string',
          `${language}: ${key}`,
        );
      }
    }
  });

  it('English の件数の文言は、one と other の両方を持つ', () => {
    for (const key of keys) {
      const message = catalogs.en[key];
      if (typeof message !== 'string') assert.ok(message.one && message.other, key);
    }
  });

  it('{name} の名前が、言語間で食い違わない（呼び出し側が渡す値は言語によらず同じ）', () => {
    const names = (message: Message) =>
      [...new Set(forms(message).flatMap(placeholderNames))].sort();
    for (const language of LANGUAGES) {
      for (const key of keys) {
        // 件数の文言は、言語によって使わない形がある（日本語の one など）ので、形ごとではなく
        // 文言全体で見る。
        assert.deepEqual(names(catalogs[language][key]), names(catalogs.en[key]), `${language}: ${key}`);
      }
    }
  });
});

describe('errorMessageKey', () => {
  it('利用者が入力で起こす失敗は、それぞれ専用の文言。それ以外は汎用', () => {
    assert.equal(errorMessageKey(new ServiceError('title-required')), 'error.titleRequired');
    assert.equal(errorMessageKey(new ServiceError('tag-name-duplicate')), 'error.tagNameDuplicate');
    assert.equal(errorMessageKey(new ServiceError('invalid-language')), 'error.unexpected');
  });

  it('ServiceError 以外（DBの失敗・undefined など）は汎用の文言', () => {
    assert.equal(errorMessageKey(new Error('disk full')), 'error.unexpected');
    assert.equal(errorMessageKey(undefined), 'error.unexpected');
  });
});

describe('app.json', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  const plugin = (expo.plugins as unknown[]).find(
    (entry): entry is [string, { supportedLocales?: { ios?: string[] } }] =>
      Array.isArray(entry) && entry[0] === 'expo-localization',
  );

  it('iOSの対応言語（CFBundleLocalizations）が、アプリの言語と同じ', () => {
    // 宣言が無いと、iOSの標準の文言（コピー/ペーストのメニューやダイアログのボタンなど）が、
    // 日本語の端末でも英語のまま。JSからは読めないので手で写していて、ここで食い違いを検出する。
    assert.deepEqual([...(plugin?.[1].supportedLocales?.ios ?? [])].sort(), [...LANGUAGES].sort());
  });
});
