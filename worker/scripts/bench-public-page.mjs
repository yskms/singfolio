// 公開ページのHTMLを作るCPU時間（src/publicPageRender.ts の parse + 描画）を、Nodeで測る。
// 曲数や描画を変えるときに、実測し直すためのもの。使い方: `npm run bench:page -- 1000`（曲数）。
// 結果の読み方と、workerd での測り方は docs/singfolio-publishing-backend.md §8「公開ページ（7.5）」。
import { parsePublishedSnapshot, renderProfilePage } from '../src/publicPageRender.ts';
import { buildSnapshot, serializeSnapshot } from '../src/snapshot.ts';

const count = Number(process.argv[2] ?? 1000);
const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const pick = (seed, length) => Array.from({ length }, (_, k) => kana[(seed * 7 + k * 3) % kana.length]).join('');
// 架空の曲名。日本語中心で、公開タグを2つ付けた、ふつうの大きさの曲。アーティストは、5曲ごとに変わる。
const body = serializeSnapshot(
  buildSnapshot(
    {
      profile: { displayName: 'ゆう', bio: '歌うのが好きです。\nバラード中心。' },
      songs: Array.from({ length: count }, (_, i) => ({
        id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
        title: `${pick(i, 15)} ${i % 3 === 0 ? 'Remix' : ''}`.trim(),
        artist: pick(Math.floor(i / 5) + 11, 10),
        publicTags: ['バラード', '90年代'],
        sortOrder: i,
      })),
    },
    1,
    0,
  ),
);

const ms = (from, to) => Number(to - from) / 1e6;
function run() {
  const t0 = process.hrtime.bigint();
  const snapshot = parsePublishedSnapshot(body);
  if (snapshot === null) throw new Error('スナップショットを読めない');
  const t1 = process.hrtime.bigint();
  const html = renderProfilePage(snapshot, 'yu_sings', 'ja');
  const t2 = process.hrtime.bigint();
  return [ms(t0, t1), ms(t1, t2), html.length];
}
const format = (row) => `読み取り ${row[0].toFixed(2)}ms / 描画 ${row[1].toFixed(2)}ms / 合計 ${(row[0] + row[1]).toFixed(2)}ms（HTML ${(row[2] / 1024).toFixed(0)}KiB）`;

console.log(`曲 ${count}、スナップショット ${Buffer.byteLength(body)} バイト`);
// 1回目は、JITが温まっていない状態。公開ページは、閲覧のたびに作る（共有キャッシュに載せない）ので、初回も温まった状態も見る。
console.log(`初回: ${format(run())}`);
for (let i = 0; i < 30; i += 1) run();
const warm = Array.from({ length: 20 }, run);
console.log(`温まったあと(平均): ${format([0, 1, 2].map((k) => warm.reduce((sum, row) => sum + row[k], 0) / warm.length))}`);
