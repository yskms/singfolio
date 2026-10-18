// アーティストの読みの辞書の引き方のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  cleanDictionaryReading,
  isDictionaryReading,
  isPlausibleReading,
  lookupReading,
} from './artistReadingDictionary.ts';
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

  it('読みは、日本語の設定の規則を満たし、含められる字（かな・長音・中点・数字・=）だけ', () => {
    for (const line of lines) {
      const reading = line.split('\t')[1] as string;
      assert.equal(readingProblem(reading, 'ja'), undefined, line);
      // 括弧・カンマ・感嘆符・空白・ゼロ幅の文字・英字・漢字は、含めない。
      assert.ok(isDictionaryReading(reading), `含められない字がある: ${line}`);
    }
  });

  it('キーと読みの長さが釣り合う（読みが、愛称・名前の一部のものは、入れない）', () => {
    for (const line of lines) {
      const [key, reading] = line.split('\t') as [string, string];
      assert.ok(isPlausibleReading(key, reading), `長さが釣り合わない: ${key} → ${reading}`);
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

describe('cleanDictionaryReading', () => {
  it('末尾の注記の括弧を除く（ザ・同名の区別）', () => {
    assert.equal(cleanDictionaryReading('ビートルズ(ザ)'), 'ビートルズ');
    assert.equal(cleanDictionaryReading('アルフィー(ジ)'), 'アルフィー');
    assert.equal(cleanDictionaryReading('アヴィシャイ・コーエン(ベーシスト)'), 'アヴィシャイ・コーエン');
    assert.equal(cleanDictionaryReading('ひゃくパーセント(100%)'), 'ひゃくパーセント');
    assert.equal(cleanDictionaryReading('アルフィー（ジ）'), 'アルフィー');
  });

  it('姓と名のカンマ・句読点・感嘆符は除いて、つなぐ', () => {
    assert.equal(cleanDictionaryReading('くぼた,あきゆき'), 'くぼたあきゆき');
    assert.equal(cleanDictionaryReading('ペラルタ、オースティン'), 'ペラルタオースティン');
    assert.equal(cleanDictionaryReading('ハロー!プロジェクト'), 'ハロープロジェクト');
    assert.equal(cleanDictionaryReading('にじゅうごじ、ナイトコードで。'), 'にじゅうごじナイトコードで');
    assert.equal(cleanDictionaryReading('アリ&ギップ'), 'アリギップ');
  });

  it('空白・ゼロ幅の文字を詰める。全角の数字は半角にする。波ダッシュは長音にする', () => {
    assert.equal(cleanDictionaryReading('つ\u200bち\u200bや の ぞ み'), 'つちやのぞみ');
    assert.equal(cleanDictionaryReading('モンゴル８００'), 'モンゴル800');
    assert.equal(cleanDictionaryReading('ふぉ〜ゆ〜'), 'ふぉーゆー');
  });

  it('許す字の外が残るもの（英字・漢字・閉じていない括弧・顔文字・?）は null', () => {
    for (const text of ['Queen', '米津玄師', 'アリギップ)', '(\u0301・д・)ノ', 'ザ・ディラン?x', '(ザ)', '', '   ', 'abc', '!!']) {
      assert.equal(cleanDictionaryReading(text), null, text);
    }
  });

  it('読みに残してよい字: 長音・中点・数字・=', () => {
    assert.equal(cleanDictionaryReading('リムスキー＝コルサコフ'), 'リムスキー=コルサコフ');
    assert.equal(cleanDictionaryReading('ミセス・グリーン・アップル'), 'ミセス・グリーン・アップル');
    assert.equal(cleanDictionaryReading('ﾐｽﾀｰ'), 'ミスター');
  });
});

describe('isPlausibleReading', () => {
  it('英字は3字につき、かな1字以上。漢字は1字につき、かな1字以上', () => {
    assert.equal(isPlausibleReading('ellegarden', 'エルレガーデン'), true);
    assert.equal(isPlausibleReading('lisa', 'リサ'), true);
    assert.equal(isPlausibleReading('boa', 'ボア'), true);
    assert.equal(isPlausibleReading('米津玄師', 'よねづけんし'), true);
    assert.equal(isPlausibleReading('嵐', 'あらし'), true);
    assert.equal(isPlausibleReading('aimer', 'エメ'), true);
  });

  it('読みが、愛称・名前の一部・別の名前のものは、釣り合わない', () => {
    assert.equal(isPlausibleReading('aya ohnishi', 'あや'), false);
    assert.equal(isPlausibleReading('ana coppola', 'アナ'), false);
    assert.equal(isPlausibleReading('beat of angel', 'ボア'), false);
    assert.equal(isPlausibleReading('mitsuo terada', 'つんく'), false);
    assert.equal(isPlausibleReading('新美太祐', 'みく'), false);
  });

  it('長音は、かなの数に入れる。中点・数字・= は入れない', () => {
    assert.equal(isPlausibleReading('xyz abc', 'エーエー'), true); // 6字 → 2字以上
    assert.equal(isPlausibleReading('abcdefghi', '・・・12='), false); // 9字 → 3字以上。かなが無い
  });

  it('英字・漢字以外のキー（ハングルなど）は、確かめない', () => {
    assert.equal(isPlausibleReading('요아소비', 'ヨ'), true);
  });
});
