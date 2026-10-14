// アーティストの読みの辞書の引き方のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { lookupReading } from './artistReadingDictionary.ts';
import { readingProblem } from './readingRules.ts';
import { artistNameKey } from './text.ts';

const DATA = ['ellegarden\tえるれがーでん', 'mr.children\tみすたーちるどれん', '米津玄師\tよねづけんし'].join('\n') + '\n';

describe('lookupReading', () => {
  it('名前から、読みを引く（大文字小文字・全角半角を区別しない）', () => {
    assert.equal(lookupReading(DATA, 'ELLEGARDEN'), 'えるれがーでん');
    assert.equal(lookupReading(DATA, 'Ｍｒ．Ｃｈｉｌｄｒｅｎ'), 'みすたーちるどれん');
    assert.equal(lookupReading(DATA, '  米津玄師 '), 'よねづけんし');
  });

  it('先頭の行・最後の行も引ける', () => {
    assert.equal(lookupReading(DATA, 'ellegarden'), 'えるれがーでん');
    assert.equal(lookupReading(DATA, '米津玄師'), 'よねづけんし');
    assert.equal(lookupReading(DATA.trimEnd(), '米津玄師'), 'よねづけんし');
  });

  it('見つからなければ undefined。キーの一部や、読みの側とは一致しない', () => {
    assert.equal(lookupReading(DATA, 'Queen'), undefined);
    assert.equal(lookupReading(DATA, 'ellegard'), undefined);
    assert.equal(lookupReading(DATA, 'garden'), undefined);
    assert.equal(lookupReading(DATA, 'えるれがーでん'), undefined);
    assert.equal(lookupReading('', 'ellegarden'), undefined);
  });

  it('空・タブ・改行を含む名前は引かない', () => {
    assert.equal(lookupReading(DATA, ''), undefined);
    assert.equal(lookupReading(DATA, '   '), undefined);
    assert.equal(lookupReading(DATA, 'a\tb'), undefined);
    assert.equal(lookupReading(DATA, 'a\nb'), undefined);
  });
});

// 同梱の辞書（`scripts/build-artist-readings.mjs` の生成物）。手で直さない。形が崩れていないこと
// （キーが今の `artistNameKey` と同じ形、読みが日本語の設定の規則を満たす）を確かめる。
describe('assets/artist-readings.json', () => {
  const asset = JSON.parse(
    readFileSync(new URL('../../assets/artist-readings.json', import.meta.url), 'utf8'),
  ) as { source: string; entries: number; data: string };
  const lines = asset.data.split('\n').filter((line) => line !== '');

  it('出どころと件数を持ち、件数が行数と合う', () => {
    assert.match(asset.source, /^MusicBrainz core data \(CC0\), mbdump\.tar\.bz2 \d{8}-\d{6}$/);
    assert.equal(asset.entries, lines.length);
    assert.ok(lines.length > 10_000, `行数が少なすぎる: ${lines.length}`);
    assert.ok(asset.data.endsWith('\n'));
  });

  it('各行は `キー<TAB>読み`。キーは今の artistNameKey の形で、キーでソート済み・重複なし', () => {
    let previous = '';
    for (const line of lines) {
      const parts = line.split('\t');
      assert.equal(parts.length, 2, line);
      const [key, reading] = parts as [string, string];
      assert.equal(artistNameKey(key), key, `キーが artistNameKey の形ではない: ${key}`);
      assert.ok(reading !== '', line);
      assert.ok(key > previous, `ソート済み・重複なしではない: ${previous} → ${key}`);
      previous = key;
    }
  });

  it('読みは、日本語の設定の規則（かなだけ）を満たし、空白を含まない', () => {
    for (const line of lines) {
      const reading = line.split('\t')[1] as string;
      assert.equal(readingProblem(reading, 'ja'), undefined, line);
      assert.ok(!/\s/.test(reading), `読みに空白がある: ${line}`);
    }
  });

  it('かなだけの名前は入れない（辞書が無くても、名前が読みになる）', () => {
    for (const line of lines) {
      const key = line.split('\t')[0] as string;
      assert.notEqual(readingProblem(key, 'ja'), undefined, `かなだけのキー: ${key}`);
    }
  });

  it('実在のアーティストを引ける（英字・漢字の名前から、かなの読み）', () => {
    assert.equal(lookupReading(asset.data, 'ELLEGARDEN'), 'エルレガーデン');
    assert.equal(lookupReading(asset.data, 'Mrs. GREEN APPLE'), 'ミセス・グリーン・アップル');
    assert.equal(lookupReading(asset.data, '米津玄師'), 'よねづけんし');
    assert.equal(lookupReading(asset.data, 'Queen'), 'クイーン');
  });

  it('特別な用途のアーティストの別名（[theatre] など）は入れない', () => {
    assert.equal(lookupReading(asset.data, 'various artists'), undefined);
    assert.equal(lookupReading(asset.data, '[unknown]'), undefined);
    assert.equal(lookupReading(asset.data, '[theatre]'), undefined);
  });
});
