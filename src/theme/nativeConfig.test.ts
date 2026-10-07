// ネイティブ設定（app.json、config plugin）に手で写した色が、src/theme/colors.ts と
// 一致していることのテスト。これらはJSから色を読めない（ビルド時・起動直後の、JSが動く
// 前の色）ため、定数と別に持っている。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { brand, darkColors, lightColors } from './colors.ts';

const root = new URL('../../', import.meta.url);
const { expo } = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
const require = createRequire(import.meta.url);

type PluginEntry = string | [string, Record<string, any>];
const splash = (
  (expo.plugins as PluginEntry[]).find(
    (plugin): plugin is [string, Record<string, any>] => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  ) ?? assert.fail('app.json に expo-splash-screen の設定が無い')
)[1];

describe('app.json', () => {
  it('ルートの背景色（Androidのウィンドウ背景）は、ライトの背景色', () => {
    assert.equal(expo.backgroundColor, lightColors.background);
  });

  it('スプラッシュの背景色は、ライト・ダークそれぞれの背景色（起動画面から最初の画面へ色が跳ばない）', () => {
    assert.equal(splash.backgroundColor, lightColors.background);
    assert.equal(splash.dark?.backgroundColor, darkColors.background);
  });

  it('端末のライト/ダークに従う（Appearanceの設定で上書きするため、固定しない）', () => {
    assert.equal(expo.userInterfaceStyle, 'automatic');
  });

  it('Androidのアダプティブアイコンの背景は、Mint', () => {
    assert.equal(expo.android.adaptiveIcon.backgroundColor, brand.mint);
  });
});

describe('plugins/withAndroidNightColors.js', () => {
  it('ダークのウィンドウ背景は、ダークの背景色', () => {
    const plugin = require('../../plugins/withAndroidNightColors.js');
    assert.equal(plugin.DARK_ACTIVITY_BACKGROUND, darkColors.background);
  });

  it('app.json から読み込まれている', () => {
    assert.ok((expo.plugins as PluginEntry[]).includes('./plugins/withAndroidNightColors.js'));
  });
});
