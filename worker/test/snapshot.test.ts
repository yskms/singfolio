/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSnapshot,
  parseSnapshotContent,
  serializeSnapshot,
  SNAPSHOT_LIMITS,
  SNAPSHOT_SCHEMA,
} from '../src/snapshot.ts';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';

const profile = { displayName: 'Yu', bio: 'I sing.\nMostly ballads.' };
const song = (overrides: Record<string, unknown> = {}) => ({
  id: ID_1,
  title: 'Blue Hour',
  artist: 'Aoi Lane',
  publicTags: ['Ballad'],
  sortOrder: 0,
  ...overrides,
});
const input = (songs: unknown[] = [song()], overrides: Record<string, unknown> = {}) => ({ profile, songs, ...overrides });

const problemOf = (value: unknown) => {
  const result = parseSnapshotContent(value);
  assert.equal(result.ok, false);
  return result.ok ? null : result.problem;
};

describe('parseSnapshotContent: 公開してよい項目だけを取り出す', () => {
  it('正しい入力は、そのまま公開内容になる', () => {
    const result = parseSnapshotContent(input([song(), song({ id: ID_2, title: 'Red Line', sortOrder: 1, publicTags: [] })]));
    assert.deepEqual(result, {
      ok: true,
      content: {
        profile,
        songs: [
          { id: ID_1, title: 'Blue Hour', artist: 'Aoi Lane', publicTags: ['Ballad'], sortOrder: 0 },
          { id: ID_2, title: 'Red Line', artist: 'Aoi Lane', publicTags: [], sortOrder: 1 },
        ],
      },
    });
  });

  it('My Key・Private Note・ステータスなど、送られてきた余分な項目は、保存する形に載らない', () => {
    const extras = {
      keyOffset: -2,
      key: 'C#',
      privateNote: 'SECRET-NOTE',
      status: 'ready',
      tags: [{ id: 't1', name: 'LocalOnlyTag' }],
      createdAt: 1,
      __proto__: { inherited: 'SECRET-PROTO' },
    };
    const result = parseSnapshotContent({
      profile: { ...profile, email: 'secret@example.com' },
      songs: [song(extras)],
      privateNote: 'SECRET-TOP',
      account: { sub: 'SECRET-SUB' },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const text = serializeSnapshot(buildSnapshot(result.content, 1, 1_700_000_000_000));
    for (const secret of ['SECRET', 'secret@', 'keyOffset', 'privateNote', 'status', 'LocalOnlyTag', 'createdAt', 'inherited']) {
      assert.equal(text.includes(secret), false, `${secret} が保存する文字列に入っている`);
    }
    // 曲の項目は、許可リストの5つだけ。プロフィールは2つだけ。
    assert.deepEqual(Object.keys(result.content.songs[0]!).sort(), ['artist', 'id', 'publicTags', 'sortOrder', 'title']);
    assert.deepEqual(Object.keys(result.content.profile).sort(), ['bio', 'displayName']);
    assert.deepEqual(Object.keys(result.content).sort(), ['profile', 'songs']);
  });

  it('文字列の前後の空白を落とす。改行は自己紹介だけに残る（\\r\\n は \\n にそろえる）', () => {
    const result = parseSnapshotContent({
      profile: { displayName: '  Yu  ', bio: '  line1\r\nline2  ' },
      songs: [song({ title: ' Blue Hour ', artist: ' Aoi Lane', publicTags: [' Ballad '] })],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.profile, { displayName: 'Yu', bio: 'line1\nline2' });
    assert.deepEqual(result.content.songs[0], {
      id: ID_1,
      title: 'Blue Hour',
      artist: 'Aoi Lane',
      publicTags: ['Ballad'],
      sortOrder: 0,
    });
  });

  it('曲は sortOrder の昇順に並べ、0から振り直す（同じ値は、送られた順。欠番・重複があっても揺れない）', () => {
    const result = parseSnapshotContent(
      input([
        song({ id: ID_1, title: 'C', sortOrder: 50 }),
        song({ id: ID_2, title: 'A', sortOrder: 3 }),
        song({ id: ID_3, title: 'B', sortOrder: 3 }),
      ]),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.content.songs.map((s) => [s.title, s.sortOrder]),
      [
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ],
    );
  });

  it('曲が0件でも通る（公開は、Readyの曲が無くてもできる）', () => {
    const result = parseSnapshotContent(input([]));
    assert.equal(result.ok, true);
  });

  it('入力のオブジェクトを書き換えず、同じ入力から同じ結果になる', () => {
    const body = input([song({ id: ID_2, sortOrder: 9 }), song({ id: ID_1, sortOrder: 2 })]);
    const before = JSON.stringify(body);
    const first = parseSnapshotContent(body);
    const second = parseSnapshotContent(body);
    assert.equal(JSON.stringify(body), before);
    assert.deepEqual(first, second);
  });
});

describe('parseSnapshotContent: 不正な入力の拒否（値は結果に載せない）', () => {
  it('オブジェクトでない・プロフィールが無い', () => {
    for (const value of [null, undefined, 1, 'x', [], { songs: [] }, { profile: null, songs: [] }, { profile: [], songs: [] }]) {
      assert.deepEqual(problemOf(value), { reason: 'profile' });
    }
  });

  it('表示名: 無い・空・空白だけ・長すぎ・制御文字・文字の向きの制御・対になっていないサロゲート', () => {
    const bad = [undefined, 1, '', '   ', 'x'.repeat(SNAPSHOT_LIMITS.displayNameChars + 1), 'a\nb', 'a\tb', 'a\u0000b', 'a\u202Eb', 'a\u2028b', '\ud83d'];
    for (const displayName of bad) {
      assert.deepEqual(problemOf({ profile: { displayName, bio: '' }, songs: [] }), { reason: 'display_name' }, String(displayName));
    }
  });

  it('表示名は、上限ちょうどまで通る。数えるのはコードポイント（絵文字も1文字）', () => {
    const max = SNAPSHOT_LIMITS.displayNameChars;
    for (const displayName of ['x'.repeat(max), '😀'.repeat(max), 'あ'.repeat(max)]) {
      assert.equal(parseSnapshotContent({ profile: { displayName, bio: '' }, songs: [] }).ok, true);
    }
    assert.equal(parseSnapshotContent({ profile: { displayName: '😀'.repeat(max + 1), bio: '' }, songs: [] }).ok, false);
  });

  it('自己紹介: 文字列でない・長すぎ・改行以外の制御文字（空は通る）', () => {
    for (const bio of [undefined, null, 1, 'x'.repeat(SNAPSHOT_LIMITS.bioChars + 1), 'a\rb', 'a\tb', 'a\u0000b', 'a\u202Db']) {
      assert.deepEqual(problemOf({ profile: { displayName: 'Yu', bio }, songs: [] }), { reason: 'bio' }, String(bio));
    }
    for (const bio of ['', '   ', 'x'.repeat(SNAPSHOT_LIMITS.bioChars), '1\n2\n3']) {
      assert.equal(parseSnapshotContent({ profile: { displayName: 'Yu', bio }, songs: [] }).ok, true);
    }
  });

  it('曲の一覧: 配列でない・多すぎ', () => {
    assert.deepEqual(problemOf({ profile, songs: {} }), { reason: 'songs' });
    assert.deepEqual(problemOf({ profile }), { reason: 'songs' });
    const many = Array.from({ length: SNAPSHOT_LIMITS.songs + 1 }, () => song());
    assert.deepEqual(problemOf(input(many)), { reason: 'too_many_songs' });
  });

  it('曲: オブジェクトでない・ID（UUIDの小文字）・重複', () => {
    assert.deepEqual(problemOf(input([song(), null])), { reason: 'song', index: 1 });
    assert.deepEqual(problemOf(input([[]])), { reason: 'song', index: 0 });
    for (const id of [undefined, 1, '', 'abc', 'ABCDEF01-2345-4678-9ABC-DEF012345678', `${ID_1} `, ID_1.slice(1), '../../etc/passwd']) {
      assert.deepEqual(problemOf(input([song({ id })])), { reason: 'song_id', index: 0 }, String(id));
    }
    assert.deepEqual(problemOf(input([song(), song({ title: 'other' })])), { reason: 'duplicate_song_id', index: 1 });
  });

  it('曲名・アーティスト: 無い・空・長すぎ・改行', () => {
    for (const field of ['title', 'artist'] as const) {
      const limit = field === 'title' ? SNAPSHOT_LIMITS.titleChars : SNAPSHOT_LIMITS.artistChars;
      for (const value of [undefined, null, 1, '', ' ', 'x'.repeat(limit + 1), 'a\nb']) {
        assert.deepEqual(problemOf(input([song(), song({ id: ID_2, [field]: value })])), { reason: field, index: 1 }, `${field}: ${String(value)}`);
      }
      assert.equal(parseSnapshotContent(input([song({ [field]: 'x'.repeat(limit) })])).ok, true);
    }
  });

  it('公開タグ: 配列でない・多すぎ・空・長すぎ・重複', () => {
    const tooMany = Array.from({ length: SNAPSHOT_LIMITS.tagsPerSong + 1 }, (_, i) => `t${i}`);
    for (const publicTags of [undefined, 'Ballad', tooMany, [''], [1], ['x'.repeat(SNAPSHOT_LIMITS.tagChars + 1)], ['a', 'a'], ['a', ' a '], ['a\nb']]) {
      assert.deepEqual(problemOf(input([song({ publicTags })])), { reason: 'tags', index: 0 }, JSON.stringify(publicTags));
    }
    const max = Array.from({ length: SNAPSHOT_LIMITS.tagsPerSong }, (_, i) => `t${i}`);
    assert.equal(parseSnapshotContent(input([song({ publicTags: max })])).ok, true);
  });

  it('sortOrder: 整数でない・負・大きすぎ', () => {
    for (const sortOrder of [undefined, '1', 1.5, -1, NaN, Infinity, 1_000_001, Number.MAX_SAFE_INTEGER + 1]) {
      assert.deepEqual(problemOf(input([song({ sortOrder })])), { reason: 'sort_order', index: 0 }, String(sortOrder));
    }
  });

  it('拒否の結果に、入力の値（曲名・ID・表示名）を載せない', () => {
    const problem = problemOf(input([song({ id: ID_1, title: 'SECRET-TITLE', artist: '' })]));
    assert.equal(JSON.stringify(problem).includes('SECRET'), false);
    assert.equal(JSON.stringify(problem).includes(ID_1), false);
  });
});

describe('上限', () => {
  it('曲数と本文の上限は、実測して決めた値のまま（上げるときは docs §8 の手順で実測し直して、ここも直す）', () => {
    // Free の CPU 時間（10ms）に、初回でも収まる値。3000曲は、初回に10msを超えた。
    assert.equal(SNAPSHOT_LIMITS.songs, 1000);
    assert.equal(SNAPSHOT_LIMITS.requestBytes, 512 * 1024);
  });
});

describe('スナップショットの組み立て', () => {
  it('内容に、形の版・版・時刻を足す。JSONにして読み戻せる', () => {
    const parsed = parseSnapshotContent(input());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const snapshot = buildSnapshot(parsed.content, 3, 1_700_000_000_000);
    assert.equal(snapshot.schema, SNAPSHOT_SCHEMA);
    assert.deepEqual(JSON.parse(serializeSnapshot(snapshot)), snapshot);
    assert.deepEqual(Object.keys(snapshot).sort(), ['profile', 'publishedAt', 'schema', 'songs', 'version']);
  });

  it('上限いっぱいの曲数でも通る（本文の上限は別に、エンドポイントが 413 にする）', () => {
    const songs = Array.from({ length: SNAPSHOT_LIMITS.songs }, (_, i) => ({
      id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      title: `曲${i}`,
      artist: 'アーティスト',
      publicTags: ['a', 'b'],
      sortOrder: SNAPSHOT_LIMITS.songs - i,
    }));
    const result = parseSnapshotContent(input(songs));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.content.songs.length, SNAPSHOT_LIMITS.songs);
    assert.equal(result.content.songs[0]!.title, `曲${SNAPSHOT_LIMITS.songs - 1}`);
  });
});
