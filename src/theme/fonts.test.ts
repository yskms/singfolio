// フォントの設定が、ネイティブ側（app.json の expo-font）・画面のコードと食い違っていないことの
// テスト。フォントファイルはネイティブに埋め込み、JSからは名前（`fontFamily`）と太さで
// 指すだけなので、食い違うと、起動はするが、OSの既定の書体で表示される（エラーにならない）。
// `npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES } from '../domain/types.ts';
import { FONT_WEIGHTS, fontFamilies, navigationFonts } from './fonts.ts';

const root = new URL('../../', import.meta.url);
const { expo } = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));

type FontEntry = { fontFamily: string; fontDefinitions: { path: string; weight: number; style?: string }[] };
type PluginEntry = string | [string, Record<string, any>];
const fontPlugin = (
  (expo.plugins as PluginEntry[]).find(
    (plugin): plugin is [string, Record<string, any>] => Array.isArray(plugin) && plugin[0] === 'expo-font',
  ) ?? assert.fail('app.json に expo-font の設定が無い')
)[1];
const androidFonts: FontEntry[] = fontPlugin.android?.fonts ?? [];
const iosFonts: string[] = fontPlugin.ios?.fonts ?? [];

describe('fontFamilies', () => {
  it('全ての言語に、別々の書体を割り当てている', () => {
    assert.deepEqual(Object.keys(fontFamilies).sort(), [...LANGUAGES].sort());
    assert.equal(new Set(Object.values(fontFamilies)).size, LANGUAGES.length);
  });
});

describe('navigationFonts', () => {
  it('書体は渡したもの、太さは同梱した太さだけ', () => {
    for (const font of Object.values(navigationFonts('Inter'))) {
      assert.equal(font.fontFamily, 'Inter');
      assert.ok(FONT_WEIGHTS.some((weight) => String(weight) === font.fontWeight), font.fontWeight);
    }
  });
});

describe('app.json の expo-font（Android）', () => {
  it('書体は fontFamilies の値と同じ（過不足なし）', () => {
    assert.deepEqual(androidFonts.map((font) => font.fontFamily).sort(), Object.values(fontFamilies).sort());
  });

  it('どの書体も、同梱する太さ（FONT_WEIGHTS）を過不足なく持つ', () => {
    for (const font of androidFonts) {
      const weights = font.fontDefinitions.map((definition) => definition.weight).sort((a, b) => a - b);
      assert.deepEqual(weights, [...FONT_WEIGHTS], font.fontFamily);
      for (const definition of font.fontDefinitions) {
        assert.ok(!definition.style || definition.style === 'normal', `${definition.path}: イタリックは同梱しない`);
      }
    }
  });

  it('フォントファイルがある（scripts/generate-fonts.py で生成）', () => {
    for (const font of androidFonts) {
      for (const { path } of font.fontDefinitions) {
        assert.ok(statSync(new URL(path, root)).isFile(), path);
      }
    }
  });
});

describe('app.json の expo-font（iOS）', () => {
  it('Androidと同じフォントファイルを埋め込む（iOSは、ファイルの中の名前で書体を指す）', () => {
    const android = androidFonts.flatMap((font) => font.fontDefinitions.map((definition) => definition.path));
    assert.deepEqual([...iosFonts].sort(), android.sort());
  });
});

// app/ と ui/ の全ソース。
function sourceFiles(): { path: string; text: string }[] {
  return ['app', 'ui'].flatMap((dir) =>
    (readdirSync(new URL(`${dir}/`, root), { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => ({ path: `${dir}/${file}`, text: readFileSync(new URL(`${dir}/${file}`, root), 'utf8') })),
  );
}

describe('画面のコード', () => {
  it('React Native の Text を直接importしない（OS既定の書体になる。ui/Text.tsx の Text を使う）', () => {
    for (const { path, text } of sourceFiles()) {
      if (path === 'ui/Text.tsx') continue;
      for (const [, specifiers] of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react-native'/g)) {
        const names = specifiers.split(',').map((specifier) => specifier.trim().split(/\s+as\s+/)[0]);
        assert.ok(!names.includes('Text'), `${path}: react-native から Text をimportしている`);
      }
    }
  });

  it('fontWeight は、同梱した太さ（FONT_WEIGHTS）だけを使う', () => {
    const allowed = FONT_WEIGHTS.map(String);
    for (const { path, text } of sourceFiles()) {
      for (const [, weight] of text.matchAll(/fontWeight:\s*['"`]?(\w+)['"`]?/g)) {
        assert.ok(allowed.includes(weight), `${path}: fontWeight ${weight} は同梱していない（${allowed.join(' / ')}）`);
      }
    }
  });
});
