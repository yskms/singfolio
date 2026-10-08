// 文言のカタログ（en / ja）の整合のテスト。キーの過不足は型が保証するので、ここでは、
// 型では分からない中身（空の文言・`{name}` の食い違い・件数の形）を見る。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES } from '../domain/types.ts';
import { DatabaseTooNewError, ServiceError } from '../services/errors.ts';
import { catalogs, createAppTranslator, errorMessageKey, errorScreenContent, type MessageKey } from './index.ts';
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

  it('波括弧は {name}（英数字と _ だけの名前）の形だけ。型の読み取りと実行時の置き換えが食い違わない', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        for (const form of forms(catalogs[language][key])) {
          assert.doesNotMatch(form.replace(/\{\w+\}/g, ''), /[{}]/, `${language}: ${key}`);
        }
      }
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

describe('createAppTranslator', () => {
  it('言語ごとの文言を返す', () => {
    assert.equal(createAppTranslator('en')('tabs.songs'), 'Songs');
    assert.equal(createAppTranslator('ja')('tabs.songs'), '曲');
  });

  it('必要な値の型は、English の文言のリテラル型（as const）から決まる', () => {
    // en.ts の `as const` を外すと、文言が string に広がり、`t` が値を要求できなくなる。
    // 下の代入が型エラーになるので、`npm run typecheck` が検出する。
    const songs: 'Songs' = en['tabs.songs'];
    assert.equal(songs, 'Songs');
    const t = createAppTranslator('en');
    // @ts-expect-error 値の要らない文言に値は渡せない
    t('tabs.songs', { count: 1 });
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

describe('errorScreenContent', () => {
  it('アプリより新しいDBは、再試行ではなくアプリの更新を促す（やり直しても開けない）', () => {
    assert.deepEqual(errorScreenContent(new DatabaseTooNewError(99, 1)), {
      titleKey: 'errorScreen.updateTitle',
      messageKey: 'errorScreen.updateMessage',
      canRetry: false,
    });
  });

  it('それ以外（DBを開けない・描画の失敗・Error以外の値）は、汎用の文言で、やり直せる', () => {
    for (const error of [new Error('disk full'), new ServiceError('song-not-found'), undefined, 'x']) {
      assert.deepEqual(errorScreenContent(error), {
        titleKey: 'errorScreen.title',
        messageKey: 'errorScreen.message',
        canRetry: true,
      });
    }
  });
});

describe('app.json', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  const plugin = (expo.plugins as unknown[]).find(
    (entry): entry is [string, { supportedLocales?: { ios?: string[]; android?: string[] } }] =>
      Array.isArray(entry) && entry[0] === 'expo-localization',
  );
  const supported = plugin?.[1].supportedLocales;
  const sorted = (values: readonly string[]) => [...values].sort();

  it('iOSの対応言語（CFBundleLocalizations）が、アプリの言語と同じ', () => {
    // 宣言が無いと、iOSの標準の文言（コピー/ペーストのメニューなど）が日本語の端末でも
    // 英語のままになる（Appleの説明による。このアプリでは未確認）。JSからは読めないので
    // 手で写していて、ここで食い違いを検出する。
    assert.deepEqual(sorted(supported?.ios ?? []), sorted(LANGUAGES));
  });

  it('Androidは宣言しない（OSのアプリごとの言語を出さず、言語の操作をアプリ内に一本化する）。宣言するなら、アプリの言語と同じ', () => {
    assert.deepEqual(sorted(supported?.android ?? LANGUAGES), sorted(LANGUAGES));
  });
});
