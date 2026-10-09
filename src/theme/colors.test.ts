// 色の定数のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { brand, colorsByScheme, type ThemeColors } from './colors.ts';

// WCAG 2.x の相対輝度とコントラスト比。
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('colors', () => {
  it('全部が #RRGGBB（ネイティブ設定へ写すときに、そのまま使える形）', () => {
    for (const color of [...Object.values(brand), ...Object.values(colorsByScheme).flatMap((c) => Object.values(c))]) {
      assert.match(color, /^#[0-9A-F]{6}$/);
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    const colors = colorsByScheme[scheme];
    for (const text of ['textPrimary', 'textSecondary'] as const satisfies (keyof ThemeColors)[]) {
      for (const base of ['background', 'surface'] as const satisfies (keyof ThemeColors)[]) {
        it(`${scheme}: ${text} は ${base} の上でAA（4.5:1）を満たす`, () => {
          assert.ok(contrast(colors[text], colors[base]) >= 4.5, `${colors[text]} on ${colors[base]}`);
        });
      }
    }
  }

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: onPrimary は primary の上でAA（4.5:1）を満たす（Purpleの面の上の文字）`, () => {
      const colors = colorsByScheme[scheme];
      assert.ok(contrast(colors.onPrimary, colors.primary) >= 4.5, `${colors.onPrimary} on ${colors.primary}`);
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: Purpleは、背景・面の上で、アイコン等の非テキスト（3:1）を満たす`, () => {
      const colors = colorsByScheme[scheme];
      assert.ok(contrast(colors.primary, colors.background) >= 3);
      assert.ok(contrast(colors.primary, colors.surface) >= 3);
    });
  }
});

describe('選択中の色（selected）', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const colors = colorsByScheme[scheme];

    it(`${scheme}: onSelected は selected の上でAA（4.5:1）を満たす（件数タイル・チップの文字）`, () => {
      assert.ok(contrast(colors.onSelected, colors.selected) >= 4.5, `${colors.onSelected} on ${colors.selected}`);
    });

    it(`${scheme}: 縁（primary）は selected・background・surface の上で非テキスト（3:1）を満たす`, () => {
      for (const base of ['selected', 'background', 'surface'] as const) {
        assert.ok(contrast(colors.primary, colors[base]) >= 3, `primary on ${base}`);
      }
    });
  }
});
