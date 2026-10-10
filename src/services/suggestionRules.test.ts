// 候補の並べ方・結合の規則のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CatalogSong } from '../repositories/songCatalogRepository.ts';
import {
  isCollaboration,
  isContinuation,
  isVariant,
  mergeArtistSuggestions,
  pairKey,
  rankArtistNames,
  rankSongSuggestions,
} from './suggestionRules.ts';

const song = (title: string, artist: string, genre: string | null = null): CatalogSong => ({
  title,
  artist,
  genre,
});

describe('isVariant', () => {
  it('Live・Cover・Karaoke・オルゴールなど、版の表記を含むものを見分ける', () => {
    for (const title of [
      'Pretender (Live)',
      '夜に駆ける (Cover)',
      '夜に駆ける - From THE FIRST TAKE',
      '夜に駆ける (初音ミク Ver.)',
      '紅蓮華(原曲歌手:LiSA)[ガイド無しカラオケ]',
      '夜に駆ける (オルゴール)',
      'Take Me Home Country Roads (Remastered 2022)',
      'Bohemian Rhapsody (Live Aid)',
      'ひとり (single version)',
    ]) {
      assert.equal(isVariant(title, null), true, title);
    }
  });

  it('原曲は版とみなさない。英単語の一部（Alive の live）には反応しない', () => {
    for (const title of ['紅蓮華', 'Pretender', 'Alive', 'Deliver Us', 'Forever', '夜に駆ける']) {
      assert.equal(isVariant(title, 'J-Pop'), false, title);
    }
  });

  it('ジャンルがインストゥルメンタル・カラオケなら版とみなす', () => {
    assert.equal(isVariant('ひとり', 'インストゥルメンタル'), true);
    assert.equal(isVariant('Hitori', 'Karaoke'), true);
    assert.equal(isVariant('ひとり', 'J-Pop'), false);
  });
});

describe('isContinuation', () => {
  it('打ち足した・消して戻したときは続き。別の語に打ち直したら続きではない', () => {
    assert.equal(isContinuation('ぐれんげ', 'ぐれ'), true);
    assert.equal(isContinuation('ぐれ', 'ぐれんげ'), true);
    assert.equal(isContinuation('ぐれんげ', 'ぐれんげ'), true);
    assert.equal(isContinuation('', 'ぐれんげ'), true);
    assert.equal(isContinuation('yoruni', 'gurenge'), false);
    assert.equal(isContinuation('よ', 'ぐれんげ'), false);
    assert.equal(isContinuation('紅蓮華', 'ぐれんげ'), false); // 変換で別の字になった
  });
});

describe('rankSongSuggestions', () => {
  it('同じ（曲名, アーティスト）は1つにする（全角半角・大文字小文字・かなの違いも同一視）', () => {
    const ranked = rankSongSuggestions(
      [song('Lemon', '米津玄師'), song('ＬＥＭＯＮ', '米津玄師'), song('lemon', '米津玄師')],
      new Set(),
    );
    assert.deepEqual(ranked, [{ title: 'Lemon', artist: '米津玄師', registered: false }]);
  });

  it('同名異曲（アーティストが違う）は残す', () => {
    const ranked = rankSongSuggestions(
      [song('ひとり', 'ゴスペラーズ'), song('ひとり', '中島 美嘉'), song('ひとり', '中島みゆき')],
      new Set(),
    );
    assert.deepEqual(
      ranked.map((s) => s.artist),
      ['ゴスペラーズ', '中島 美嘉', '中島みゆき'],
    );
  });

  it('版の表記を含むものは、削らずに後ろへ回す。それ以外の並びは保つ', () => {
    const ranked = rankSongSuggestions(
      [
        song('夜に駆ける (初音ミク Ver.)', 'Ayase'),
        song('夜に駆ける', 'YOASOBI'),
        song('夜に駆ける - From THE FIRST TAKE', 'YOASOBI'),
        song('夜に駆ける', '山下誠一郎'),
      ],
      new Set(),
    );
    assert.deepEqual(
      ranked.map((s) => `${s.title}/${s.artist}`),
      [
        '夜に駆ける/YOASOBI',
        '夜に駆ける/山下誠一郎',
        '夜に駆ける (初音ミク Ver.)/Ayase',
        '夜に駆ける - From THE FIRST TAKE/YOASOBI',
      ],
    );
  });

  it('候補の文字列は整形しない（括弧や版の表記をそのまま残す）が、前後の空白は除く', () => {
    const [first] = rankSongSuggestions([song('  紅蓮華 (『鬼滅の刃』 OP)  ', ' LiSA ')], new Set());
    assert.deepEqual(first, { title: '紅蓮華 (『鬼滅の刃』 OP)', artist: 'LiSA', registered: false });
  });

  it('曲名かアーティストが空のものは除く', () => {
    assert.deepEqual(rankSongSuggestions([song('', 'LiSA'), song('紅蓮華', '  ')], new Set()), []);
  });

  it('既に曲にある組には registered を付ける（表記の揺れを同一視して比べる）', () => {
    const registered = new Set([pairKey('ぐれんげ', 'lisa')]);
    const ranked = rankSongSuggestions([song('グレンゲ', 'LiSA'), song('グレンゲ', '別の人')], registered);
    assert.deepEqual(
      ranked.map((s) => s.registered),
      [true, false],
    );
  });

  it('最大の件数で切る', () => {
    const many = Array.from({ length: 12 }, (_, i) => song(`曲${i}`, 'A'));
    assert.equal(rankSongSuggestions(many, new Set()).length, 5);
    assert.equal(rankSongSuggestions(many, new Set(), 3).length, 3);
  });
});

describe('isCollaboration / rankArtistNames', () => {
  it('共演の表記を見分ける', () => {
    for (const name of ['米津玄師 & 菅田 将暉', 'DAOKO×米津玄師', 'A feat. B', 'suis with ヨルシカ', '東京, 大阪']) {
      assert.equal(isCollaboration(name), true, name);
    }
    for (const name of ['米津玄師', 'Official髭男dism', 'ヨルシカ', 'back number']) {
      assert.equal(isCollaboration(name), false, name);
    }
  });

  it('重複を除き、共演の表記は削らずに後ろへ回す。元の並びは保つ', () => {
    assert.deepEqual(
      rankArtistNames(['米津玄師 & 宇多田ヒカル', '米津玄師', 'DAOKO×米津玄師', '米津玄師', 'ヨルシカ', '  ']),
      ['米津玄師', 'ヨルシカ', '米津玄師 & 宇多田ヒカル', 'DAOKO×米津玄師'],
    );
  });
});

describe('mergeArtistSuggestions', () => {
  it('登録済みを先に、外部を後に。searchKey が同じものは先の表記を残す', () => {
    assert.deepEqual(
      mergeArtistSuggestions(['YOASOBI'], ['Yoasobi', 'ヨルシカ'], 'yo'),
      ['YOASOBI', 'ヨルシカ'],
    );
  });

  it('入力欄と同じ文字列は出さない。違う表記（ひらがな・ローマ字）は出す', () => {
    assert.deepEqual(mergeArtistSuggestions(['ヨルシカ'], ['ヨルシカ'], 'ヨルシカ'), []);
    assert.deepEqual(mergeArtistSuggestions(['ヨルシカ'], ['yorushika'], 'ヨルシカ'), ['yorushika']);
    assert.deepEqual(mergeArtistSuggestions([], ['ヨルシカ'], 'よるしか'), ['ヨルシカ']);
  });

  it('最大の件数で切る', () => {
    const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
    assert.equal(mergeArtistSuggestions(names, [], 'a').length, 4);
    assert.equal(mergeArtistSuggestions(names, [], 'a', 2).length, 2);
  });
});
