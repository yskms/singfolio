// 公開スナップショットの検証（src/snapshot.ts）のCPU時間を、Nodeで測る。
// 上限（SNAPSHOT_LIMITS）を変えるときに、実測し直すためのもの。使い方: `npm run bench:snapshot -- 1000`（曲数）。
// 結果の読み方と、workerd での測り方は docs/singfolio-publishing-backend.md §8「公開スナップショットの形と上限」。
import { buildSnapshot, parseSnapshotContent, serializeSnapshot } from '../src/snapshot.ts';

const count = Number(process.argv[2] ?? 1000);
const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const pick = (seed, length) => Array.from({ length }, (_, k) => kana[(seed * 7 + k * 3) % kana.length]).join('');
// 架空の曲名。日本語中心で、公開タグを2つ付けた、ふつうの大きさの曲。
const body = JSON.stringify({
  profile: { displayName: 'ゆう', bio: '歌うのが好きです。\nバラード中心。' },
  songs: Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
    title: `${pick(i, 15)} ${i % 3 === 0 ? 'Remix' : ''}`.trim(),
    artist: pick(i + 11, 10),
    publicTags: ['バラード', '90年代'],
    sortOrder: count - i,
  })),
});

const ms = (from, to) => Number(to - from) / 1e6;
function run() {
  const t0 = process.hrtime.bigint();
  const input = JSON.parse(body);
  const t1 = process.hrtime.bigint();
  const result = parseSnapshotContent({ profile: input.profile, songs: input.songs });
  if (!result.ok) throw new Error(`検証に失敗: ${result.problem.reason}`);
  const t2 = process.hrtime.bigint();
  serializeSnapshot(buildSnapshot(result.content, 1, 0));
  const t3 = process.hrtime.bigint();
  return [ms(t0, t1), ms(t1, t2), ms(t2, t3)];
}
const format = (row) => `parse ${row[0].toFixed(2)}ms / 検証 ${row[1].toFixed(2)}ms / 文字列化 ${row[2].toFixed(2)}ms / 合計 ${row.reduce((a, b) => a + b).toFixed(2)}ms`;

console.log(`曲 ${count}、本文 ${Buffer.byteLength(body)} バイト`);
// 1回目は、JITが温まっていない状態（Publishは、まれなので、この状態を基準にする）。
console.log(`初回: ${format(run())}`);
for (let i = 0; i < 30; i += 1) run();
const warm = Array.from({ length: 20 }, run);
console.log(`温まったあと(平均): ${format([0, 1, 2].map((k) => warm.reduce((sum, row) => sum + row[k], 0) / warm.length))}`);
