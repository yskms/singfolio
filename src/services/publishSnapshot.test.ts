// Publish のリクエストの組み立て（純粋な関数）のテスト。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Workerの検証と食い違わないことの確認だけに使う（アプリの実行時のコードは、Workerとコードを共有しない）。
import { parseSnapshotContent, SNAPSHOT_LIMITS } from '../../worker/src/snapshot.ts';
import {
  buildPublishBody,
  buildPublishSongs,
  countSongChanges,
  PUBLISH_LIMITS,
  songContentHash,
  type PublishBody,
  type PublishSongSource,
} from './publishSnapshot.ts';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const song = (n: number, extra: Partial<PublishSongSource> = {}): PublishSongSource => ({
  id: ID(n),
  title: `曲${n}`,
  artist: 'アーティスト',
  publicTags: [],
  ...extra,
});

function build(songs: PublishSongSource[], input: { displayName?: string; bio?: string; baseVersion?: number } = {}) {
  return buildPublishBody({
    baseVersion: input.baseVersion ?? 0,
    displayName: input.displayName ?? 'Karaoke Fan',
    bio: input.bio ?? '',
    songs,
  });
}

function bodyOf(result: ReturnType<typeof build>): PublishBody {
  assert.ok(result.ok, JSON.stringify(result));
  return result.body;
}

describe('buildPublishBody: 形', () => {
  it('曲の並びが sortOrder（0から連番）になり、baseVersion とプロフィールが載る', () => {
    const body = bodyOf(build([song(1), song(2), song(3)], { baseVersion: 7, displayName: ' Karaoke Fan ', bio: ' hi ' }));
    assert.equal(body.baseVersion, 7);
    assert.deepEqual(body.profile, { displayName: 'Karaoke Fan', bio: 'hi' });
    assert.deepEqual(
      body.songs.map((s) => [s.id, s.title, s.sortOrder]),
      [
        [ID(1), '曲1', 0],
        [ID(2), '曲2', 1],
        [ID(3), '曲3', 2],
      ],
    );
  });

  it('曲が0件でも作れる（Ready の曲が無い）', () => {
    assert.deepEqual(bodyOf(build([])).songs, []);
  });

  it('許可リストの項目だけを載せる（My Key・Private Note・status が混ざった入力でも、本文に出ない）', () => {
    const dirty = {
      ...song(1, { publicTags: ['ballad'] }),
      keyOffset: -3,
      privateNote: 'ひみつのメモ',
      status: 'ready',
      tags: [{ id: 't', name: 'x' }],
    } as PublishSongSource;
    const body = bodyOf(build([dirty]));
    assert.deepEqual(Object.keys(body.songs[0]!).sort(), ['artist', 'id', 'publicTags', 'sortOrder', 'title']);
    const text = JSON.stringify(body);
    for (const leaked of ['keyOffset', 'privateNote', 'ひみつのメモ', 'status']) {
      assert.equal(text.includes(leaked), false, leaked);
    }
  });

  it('入力を書き換えない', () => {
    const input = [song(1, { title: '  padded  ', publicTags: ['a', 'a'] })];
    const copy = JSON.stringify(input);
    build(input);
    assert.equal(JSON.stringify(input), copy);
  });
});

describe('buildPublishBody: 断る場合', () => {
  it('Display Name が空・空白だけ・使えない文字だけなら display-name-required', () => {
    for (const displayName of ['', '   ', '\n\t', '\u202E']) {
      assert.deepEqual(build([song(1)], { displayName }), { ok: false, reason: 'display-name-required' });
    }
  });

  it('曲が上限を超えたら断る（切り詰めない）。ちょうど上限なら通る', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => song(i + 1));
    assert.deepEqual(build(many(PUBLISH_LIMITS.songs + 1)), {
      ok: false,
      reason: 'too-many-songs',
      songCount: PUBLISH_LIMITS.songs + 1,
    });
    assert.equal(bodyOf(build(many(PUBLISH_LIMITS.songs))).songs.length, PUBLISH_LIMITS.songs);
  });

  it('曲名かアーティストが、整えたあとで空になる曲は外す。外した分を詰めて sortOrder を振る', () => {
    const body = bodyOf(build([song(1), song(2, { title: '\u0001\u0002' }), song(3, { artist: '  ' }), song(4)]));
    assert.deepEqual(
      body.songs.map((s) => [s.id, s.sortOrder]),
      [
        [ID(1), 0],
        [ID(4), 1],
      ],
    );
  });
});

describe('buildPublishBody: 文字の整え方', () => {
  it('1行の項目の改行・タブ・制御文字・向きの制御は空白になり、前後の空白は落ちる', () => {
    const body = bodyOf(build([song(1, { title: 'a\nb\tc\u202Ed', artist: ' x\r\ny ' })]));
    assert.equal(body.songs[0]!.title, 'a b c d');
    assert.equal(body.songs[0]!.artist, 'x y');
  });

  it('対になっていないサロゲートは取り除き、対になっているもの（絵文字・𠮷）は残す', () => {
    const title = (text: string) => bodyOf(build([song(1, { title: text })])).songs[0]!.title;
    assert.equal(title('a\uD800b\uDC00c'), 'abc');
    assert.equal(title('a😀b𠮷'), 'a😀b𠮷');
    assert.equal(title('x\uD800'), 'x'); // 末尾の上位だけ
    assert.equal(title('\uDC00x'), 'x'); // 先頭の下位だけ
    assert.equal(title('\uD800\uD83D\uDE00'), '\uD83D\uDE00'); // 上位が2つ続いたあとの対は残る
    assert.equal(title('\uD83D\uDE00\uDE00'), '\uD83D\uDE00'); // 対のあとの下位だけは取り除く
  });

  it('正規表現の後読み（Hermesで解釈できるか未確認）を、ソースに書かない', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./publishSnapshot.ts', import.meta.url), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    assert.equal(/\(\?<[!=]/.test(code), false);
  });

  it('長いものは切り詰める。サロゲートペア（絵文字・𠮷）の途中では切らない', () => {
    const title = '𠮷'.repeat(PUBLISH_LIMITS.titleChars + 5);
    const body = bodyOf(build([song(1, { title, artist: '🎤'.repeat(300) })], { displayName: '😀'.repeat(60) }));
    assert.equal(Array.from(body.songs[0]!.title).length, PUBLISH_LIMITS.titleChars);
    assert.equal(Array.from(body.songs[0]!.artist).length, PUBLISH_LIMITS.artistChars);
    assert.equal(Array.from(body.profile.displayName).length, PUBLISH_LIMITS.displayNameChars);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body.songs[0]!.title));
  });

  it('切り詰めたあとの末尾の空白は落とす', () => {
    const title = `${'a'.repeat(PUBLISH_LIMITS.titleChars - 1)} b`;
    assert.equal(bodyOf(build([song(1, { title })])).songs[0]!.title, 'a'.repeat(PUBLISH_LIMITS.titleChars - 1));
  });

  it('Bio は改行を残し、CRLF・CR は LF にそろえ、制御文字は空白にして、500字に切る', () => {
    const bio = bodyOf(build([], { bio: 'one\r\ntwo\rthree\u0000four' })).profile.bio;
    assert.equal(bio, 'one\ntwo\nthree four');
    const long = bodyOf(build([], { bio: 'あ'.repeat(600) })).profile.bio;
    assert.equal(Array.from(long).length, PUBLISH_LIMITS.bioChars);
  });

  it('Bio は空でもよい', () => {
    assert.equal(bodyOf(build([], { bio: '  \n ' })).profile.bio, '');
  });
});

describe('buildPublishBody: 公開タグ', () => {
  it('空・重複を落とし、1曲10個までに切り、長いタグは50字に切る', () => {
    const tags = ['', '  ', 'a', 'a', ...Array.from({ length: 12 }, (_, i) => `t${i}`), 'x'.repeat(80)];
    const body = bodyOf(build([song(1, { publicTags: tags })]));
    assert.deepEqual(body.songs[0]!.publicTags, ['a', ...Array.from({ length: 9 }, (_, i) => `t${i}`)]);
    const long = bodyOf(build([song(1, { publicTags: ['x'.repeat(80)] })])).songs[0]!.publicTags[0]!;
    assert.equal(long.length, PUBLISH_LIMITS.tagChars);
  });

  it('切り詰めて同じになったタグは1つにする', () => {
    const body = bodyOf(build([song(1, { publicTags: ['x'.repeat(60), 'x'.repeat(70)] })]));
    assert.equal(body.songs[0]!.publicTags.length, 1);
  });
});

describe('Workerとの整合', () => {
  it('上限の数字がWorkerの SNAPSHOT_LIMITS と同じ', () => {
    for (const key of Object.keys(PUBLISH_LIMITS) as (keyof typeof PUBLISH_LIMITS)[]) {
      assert.equal(PUBLISH_LIMITS[key], SNAPSHOT_LIMITS[key], key);
    }
  });

  it('整えた本文は、Workerの検証をそのまま通る（極端な入力でも）', () => {
    const nasty = '\u0000\u0007\n\r\t\u2028\u2029\u202A\u202E\u2066\u2069𐀀\uDFFF 😀𠮷a\u200Eb';
    const songs = [
      song(1, { title: nasty, artist: nasty, publicTags: [nasty, 'x'.repeat(80), nasty] }),
      song(2, { title: 'あ'.repeat(500), artist: '🎤'.repeat(500) }),
      song(3, { publicTags: Array.from({ length: 30 }, (_, i) => `tag${i}`) }),
    ];
    const body = bodyOf(build(songs, { displayName: nasty.repeat(10), bio: `${nasty}\n${nasty}`.repeat(50) }));
    const parsed = parseSnapshotContent({ profile: body.profile, songs: body.songs });
    assert.ok(parsed.ok, JSON.stringify(parsed));
    // Workerが整え直しても、同じ内容（アプリが整えたものが、そのまま公開される）。
    assert.deepEqual(parsed.content.songs, body.songs);
    assert.deepEqual(parsed.content.profile, body.profile);
  });
});

describe('songContentHash', () => {
  const base = { title: 'チェリー', artist: 'スピッツ', publicTags: ['a', 'b'] };

  it('同じ内容は同じ値、違う内容は違う値（曲名・アーティスト・タグのどれが変わっても）', () => {
    assert.equal(songContentHash(base), songContentHash({ ...base, publicTags: [...base.publicTags] }));
    assert.notEqual(songContentHash(base), songContentHash({ ...base, title: 'チェリ' }));
    assert.notEqual(songContentHash(base), songContentHash({ ...base, artist: 'スピッツ ' }));
    assert.notEqual(songContentHash(base), songContentHash({ ...base, publicTags: ['a'] }));
    assert.notEqual(songContentHash(base), songContentHash({ ...base, publicTags: ['b', 'a'] }));
  });

  it('項目の境目を取り違えない（"ab" + "c" と "a" + "bc"）', () => {
    assert.notEqual(
      songContentHash({ title: 'ab', artist: 'c', publicTags: [] }),
      songContentHash({ title: 'a', artist: 'bc', publicTags: [] }),
    );
  });

  it('sortOrder は含めない（曲を足してあとの曲の番号がずれても、内容は変わらない）', () => {
    const a = bodyOf(build([song(1), song(2)])).songs[1]!;
    const b = bodyOf(build([song(0), song(1), song(2)])).songs[2]!;
    assert.notEqual(a.sortOrder, b.sortOrder);
    assert.equal(songContentHash(a), songContentHash(b));
  });

  it('1000曲分の値が、ほぼ衝突しない', () => {
    const hashes = new Set(Array.from({ length: 1000 }, (_, i) => songContentHash({ ...base, title: `曲${i}` })));
    assert.equal(hashes.size, 1000);
  });
});

describe('buildPublishSongs / countSongChanges（未公開の変更の数え方）', () => {
  const hashesOf = (sources: PublishSongSource[]) =>
    new Map(buildPublishSongs(sources).map((s) => [s.id, songContentHash(s)]));
  const count = (published: Map<string, string>, sources: PublishSongSource[]) =>
    countSongChanges(published, buildPublishSongs(sources));

  it('buildPublishSongs は、buildPublishBody の曲と同じ（Publish と数え方が同じ整え方を使う）', () => {
    const sources = [song(1, { title: '  長い\n曲名  ', publicTags: ['a', 'a', ' b '] }), song(2, { title: '   ' }), song(3)];
    assert.deepEqual(buildPublishSongs(sources), bodyOf(build(sources)).songs);
  });

  it('曲数の上限は見ない（上限を超えていても数えられる）', () => {
    const many = Array.from({ length: PUBLISH_LIMITS.songs + 5 }, (_, i) => song(i));
    assert.equal(buildPublishSongs(many).length, PUBLISH_LIMITS.songs + 5);
  });

  it('変更が無ければ 0（公開した内容と同じ）', () => {
    const sources = [song(1), song(2, { publicTags: ['a'] })];
    assert.deepEqual(count(hashesOf(sources), sources), { added: 0, changed: 0, removed: 0, total: 0 });
  });

  it('加わった曲・変わった曲・無くなった曲を、1曲に1つずつ数える', () => {
    const published = hashesOf([song(1), song(2), song(3), song(4)]);
    const now = [
      song(1), // そのまま
      song(2, { title: '別の曲名' }), // 曲名
      song(3, { publicTags: ['new'] }), // 公開タグ
      // 4 は無い（Ready でなくなった、削除された）
      song(5), // 加わった
      song(6, { artist: '別の人' }), // 加わった（アーティストが違っても新しい曲）
    ];
    assert.deepEqual(count(published, now), { added: 2, changed: 2, removed: 1, total: 5 });
  });

  it('曲名・アーティスト・タグを同時に変えても、その曲は1つ', () => {
    const published = hashesOf([song(1)]);
    assert.deepEqual(count(published, [song(1, { title: 'x', artist: 'y', publicTags: ['z'] })]).total, 1);
  });

  it('並びが変わっても数えない（曲を足してあとの曲の番号がずれても、足した1曲だけ）', () => {
    const published = hashesOf([song(1), song(2), song(3)]);
    assert.deepEqual(count(published, [song(0), song(1), song(2), song(3)]), { added: 1, changed: 0, removed: 0, total: 1 });
    assert.deepEqual(count(published, [song(3), song(2), song(1)]).total, 0);
  });

  it('公開した曲が空（非公開・初めて）なら、今の曲は全部「加わった」', () => {
    assert.deepEqual(count(new Map(), [song(1), song(2)]), { added: 2, changed: 0, removed: 0, total: 2 });
  });

  it('整えたあとの値が同じなら、変更ではない（前後の空白だけの違い）', () => {
    const published = hashesOf([song(1, { title: '曲' })]);
    assert.equal(count(published, [song(1, { title: ' 曲 ' })]).total, 0);
  });
});
