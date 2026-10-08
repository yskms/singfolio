// フォントの設定が、ネイティブ側（app.json の expo-font）・画面のコードと食い違っていないことの
// テスト。フォントファイルはネイティブに埋め込み、JSからは名前（`fontFamily`）と太さで
// 指すだけなので、食い違うと、起動はするが、OSの既定の書体で表示される（エラーにならない）。
// `npm test` で実行する。
//
// 画面のコードの検査は、ソースの文字列を見る簡易なもの。見えない書き方もある
// （`fontWeight` を変数で渡す、`require('react-native')` で取る、他のライブラリの `Text`
// など）。今のコードにそうした書き方は無いので、足すときは、この検査も直す。
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

// 書体がOS既定になる部品。代わりに、ui/ の同名の部品（書体と includeFontPadding を設定する）を使う。
// それぞれ、自分自身の定義ファイルだけが、React Native のものを使ってよい。
const WRAPPED = { Text: 'ui/Text.tsx', TextInput: 'ui/TextInput.tsx' } as const;
// ラッパーが無く、OSの書体で出るもの。`Pressable` と、`Text` で組む。
const FORBIDDEN = ['Button'];

/** 書体の使い方の違反を、メッセージにして返す。 */
function fontUsageViolations(path: string, text: string): string[] {
  const violations: string[] = [];
  // `import ... from 'react-native'`（シングル・ダブルクォートの両方）
  for (const [, clause] of text.matchAll(/import\s+([^;]*?)\s+from\s*['"]react-native['"]/gs)) {
    if (/^type\s/.test(clause)) continue;
    if (/\*\s*as\s/.test(clause)) {
      violations.push(`${path}: react-native を名前空間でimportしている（Text などを個別に確認できない）`);
      continue;
    }
    const names = (clause.match(/\{([^}]*)\}/)?.[1] ?? '')
      .split(',')
      .map((specifier) => specifier.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
      .filter(Boolean);
    for (const [name, wrapper] of Object.entries(WRAPPED)) {
      if (names.includes(name) && path !== wrapper) {
        violations.push(`${path}: react-native から ${name} をimportしている（${wrapper} の ${name} を使う）`);
      }
    }
    for (const name of FORBIDDEN) {
      if (names.includes(name)) violations.push(`${path}: react-native の ${name} は使わない（OSの書体になる）`);
    }
  }
  // `Animated.Text`（react-native / react-native-reanimated）は、書体を設定しない
  if (/\bAnimated\.Text(Input)?\b/.test(text)) {
    violations.push(`${path}: Animated.Text は使わない（書体が設定されない）`);
  }
  // fontWeight は、同梱した太さの文字列リテラルだけ
  const allowed = FONT_WEIGHTS.map(String);
  for (const [, weight] of text.matchAll(/fontWeight:\s*['"`]?(\w+)['"`]?/g)) {
    if (!allowed.includes(weight)) {
      violations.push(`${path}: fontWeight ${weight} は同梱していない（${allowed.join(' / ')}）`);
    }
  }
  return violations;
}

describe('画面のコード', () => {
  it('書体がOS既定になる部品を使わない・fontWeight は同梱した太さだけ', () => {
    const violations = sourceFiles().flatMap(({ path, text }) => fontUsageViolations(path, text));
    assert.deepEqual(violations, []);
  });
});

describe('画面のコードの検査（検査自体のテスト）', () => {
  const violations = (text: string, path = 'app/x.tsx') => fontUsageViolations(path, text);

  it('問題の無い書き方は通す（type付きのimport、ラッパー、同梱した太さ）', () => {
    assert.deepEqual(
      violations(`import { Pressable, type TextProps } from 'react-native';
import { Text } from '../ui/Text';
const s = { fontWeight: '700', other: { fontWeight: "400" } };`),
      [],
    );
    assert.deepEqual(violations(`import type { Text } from 'react-native';`), []);
  });

  it('Text・TextInput・Button のimportを検出する（ダブルクォート、別名、複数行も）', () => {
    assert.equal(violations(`import { Text } from 'react-native';`).length, 1);
    assert.equal(violations(`import { View, TextInput } from "react-native";`).length, 1);
    assert.equal(violations(`import { Text as RNText } from 'react-native';`).length, 1);
    assert.equal(violations(`import {\n  View,\n  Button,\n} from 'react-native';`).length, 1);
    assert.equal(violations(`import { Text, TextInput, Button } from 'react-native';`).length, 3);
  });

  it('ラッパー自身は、自分の部品をimportしてよい。他のラッパーは不可', () => {
    assert.deepEqual(violations(`import { Text as NativeText } from 'react-native';`, 'ui/Text.tsx'), []);
    assert.deepEqual(violations(`import { TextInput as N } from 'react-native';`, 'ui/TextInput.tsx'), []);
    assert.equal(violations(`import { TextInput } from 'react-native';`, 'ui/Text.tsx').length, 1);
  });

  it('名前空間のimportと Animated.Text を検出する', () => {
    assert.equal(violations(`import * as RN from 'react-native';`).length, 1);
    assert.equal(violations(`const A = Animated.Text;`).length, 1);
    assert.equal(violations(`<Animated.TextInput />`).length, 1);
  });

  it('同梱していない fontWeight を検出する（ダブルクォート、数値、キーワードも）', () => {
    assert.equal(violations(`const s = { fontWeight: '600' };`).length, 1);
    assert.equal(violations(`const s = { fontWeight: "500" };`).length, 1);
    assert.equal(violations(`const s = { fontWeight: 'bold' };`).length, 1);
    assert.equal(violations(`const s = { fontWeight: 600 };`).length, 1);
  });
});
