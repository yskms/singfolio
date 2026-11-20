// 公開ページ（singfolio.app/<username>）のHTMLを作る。R2にもD1にも触れない純粋な関数だけを置く
// （R2を読む側と、URL・ヘッダーの扱いは src/publicPage.ts）。方針は docs/singfolio-publishing-backend.md §8「公開ページ（7.5）」。
//
// - 入力は、R2のスナップショット（許可リストで作った、公開してよい項目だけ）。My Key・Private Note・status は持っていない。
// - すべての値を `escapeHtml` を通して出す（曲名・アーティスト・タグ・表示名・自己紹介は、利用者が入力した任意の文字列）。
//   HTMLの文字列に、利用者の値を、エスケープせずに足さない。
// - 外部へ何も読みに行かない（フォント・画像・スクリプト・解析のタグ）。CSS・スクリプトは、このファイルの定数で、
//   インラインで埋める（CSP は、その内容のハッシュで許可する。src/publicPage.ts）。**`PAGE_STYLE`・`PAGE_SCRIPT` は、
//   `<style>`・`<script>` の中身そのものを、1文字違わず埋める**（ハッシュが変わる。ハッシュは実行時に計算するので、書き換えてよい）。
// - JavaScript が無くても、曲の一覧は読める（検索とタグの絞り込みは、あれば使える）。

import { FAVICON_DATA_URI } from './publicPageIcon.ts';
import { SNAPSHOT_SCHEMA, type PublishedSong, type Snapshot } from './snapshot.ts';

export type PageLanguage = 'en' | 'ja';

/** 正規のURLの起点（`<link rel="canonical">`・`og:url`）。Custom Domain の `singfolio.app`。 */
export const PUBLIC_ORIGIN = 'https://singfolio.app';

/** 公開ページの通報（取り下げの依頼）の宛先。プライバシーポリシーの連絡先と同じ。 */
export const REPORT_EMAIL = 'yskms.studio@gmail.com';

/** 紹介ページ（GitHub Pages）。アプリを知らない視聴者が、ここからアプリを知る。 */
const INTRO_URL: Record<PageLanguage, string> = {
  en: 'https://yskms.github.io/singfolio/',
  ja: 'https://yskms.github.io/singfolio/ja/',
};
// 紹介ページと同じ画像（リンクのプレビュー用。視聴者のブラウザは読まない）。
const OG_IMAGE = 'https://yskms.github.io/singfolio/images/og.jpg';

const MESSAGES = {
  en: {
    search: 'Search songs or artists',
    all: 'All',
    tags: 'Tags',
    none: 'No songs match your search.',
    empty: 'No songs yet.',
    madeWith: 'Made with Singfolio',
    report: 'Report this page',
    notFoundTitle: 'Page not found',
    notFoundBody: "This page doesn't exist, or its owner has stopped sharing it.",
    unavailableTitle: 'Temporarily unavailable',
    unavailableBody: 'Please try again in a little while.',
    songs: (count: number) => (count === 1 ? '1 song' : `${count} songs`),
  },
  ja: {
    search: '曲名・アーティストで検索',
    all: 'すべて',
    tags: 'タグ',
    none: '一致する曲がありません。',
    empty: '公開中の曲はまだありません。',
    madeWith: 'Singfolioで作成',
    report: 'このページを報告',
    notFoundTitle: 'ページが見つかりません',
    notFoundBody: 'このページは存在しないか、持ち主が公開をやめています。',
    unavailableTitle: '一時的に表示できません',
    unavailableBody: 'しばらくしてから、もう一度お試しください。',
    songs: (count: number) => `${count}曲`,
  },
} as const satisfies Record<PageLanguage, unknown>;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NEEDS_ESCAPE = /[&<>"']/;
const ESCAPE_ALL = /[&<>"']/g;

/** 要素の中身・属性の値（ダブルクォート・シングルクォートのどちらでも）に入れてよい形にする。 */
export function escapeHtml(value: string): string {
  return NEEDS_ESCAPE.test(value) ? value.replace(ESCAPE_ALL, (char) => ESCAPES[char] as string) : value;
}

// 色は docs/site.css（紹介ページ）と同じ値（CLAUDE.md「ブランド」節）。Purple は小さな文字の色に使わない
// （線・塗り・下線にだけ使う）。
export const PAGE_STYLE = `:root{color-scheme:light dark;--bg:#fff;--surface:#f7f7f8;--border:#e4e4e7;--text:#17171a;--muted:#71717a;--purple:#9c70fe;--sel:#c9fced;--on-sel:#17171a}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--surface:#1c1c1f;--border:#2e2e33;--text:#f4f4f5;--muted:#a1a1aa;--sel:#1d3b34;--on-sel:#c9fced}}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif}
.wrap{width:min(720px,calc(100% - 32px));margin:0 auto}
a{color:inherit;text-decoration-color:var(--purple);text-decoration-thickness:2px;text-underline-offset:3px}
a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--purple);outline-offset:2px}
.top{padding:36px 0 16px}
.brand{margin:0 0 20px;font-size:.875rem;font-weight:700;letter-spacing:.02em}
.brand span{display:inline-block;padding:2px 10px;border-radius:999px;background:var(--sel);color:var(--on-sel)}
h1{margin:0 0 8px;font-size:1.75rem;line-height:1.3;overflow-wrap:anywhere;text-wrap:balance}
.bio{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}
.meta{margin:0;color:var(--muted);font-size:.875rem}
.tools{position:sticky;top:0;z-index:1;padding:12px 0;background:var(--bg);border-bottom:1px solid var(--border)}
#q{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chip{padding:4px 12px;border:1px solid var(--border);border-radius:999px;background:var(--bg);color:var(--text);font:inherit;font-size:.875rem;cursor:pointer}
.chip[aria-pressed=true]{background:var(--sel);color:var(--on-sel);border-color:var(--purple)}
.group{margin-top:8px}
h2{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:24px 0 4px;font-size:1.125rem;line-height:1.4}
.name{overflow-wrap:anywhere}
.n{flex:none;color:var(--muted);font-size:.875rem;font-weight:400}
ul{margin:0;padding:0;list-style:none}
li{padding:8px 0;border-bottom:1px solid var(--border)}
.t{display:block;overflow-wrap:anywhere}
.g{display:block;color:var(--muted);font-size:.8125rem;line-height:1.4;overflow-wrap:anywhere}
.note{margin:32px 0;color:var(--muted)}
.foot{margin:48px auto 32px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}
.foot p{margin:0 0 4px}
`;

// 検索とタグの絞り込み。キーは、アプリの検索（src/services/text.ts の searchKey）と同じ同一視（大文字小文字・
// 全角半角・ひらがな/カタカナ・空白の量）。アプリとコードは共有しないので、同じ規則をここに書く。
// 検索は、曲名またはアーティストに含まれる文字列。タグは1つだけ選べる（「すべて」で外す）。
// `String.raw`: 正規表現の `\s` や `ァ` を、そのまま残す。この中に、バッククォートと「ドル＋波括弧」を書かない。
export const PAGE_SCRIPT = String.raw`(function(){
var input=document.getElementById('q'),tools=document.getElementById('tools'),none=document.getElementById('none');
if(!input||!tools||!none)return;
function key(s){return s.normalize('NFKD').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim().replace(/[ァ-ヶヽヾ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-96)})}
function all(root,sel){return Array.prototype.slice.call(root.querySelectorAll(sel))}
var chips=all(document,'.chip'),tag='';
var groups=all(document,'.group').map(function(el){return{el:el,artist:key(el.querySelector('.name').textContent),count:el.querySelector('.n'),rows:all(el,'li').map(function(li){var g=li.getAttribute('data-g');return{el:li,title:key(li.querySelector('.t').textContent),tags:g?g.split(' '):[]}})}});
function apply(){
var q=key(input.value),total=0;
groups.forEach(function(g){
var n=0,hit=q===''||g.artist.indexOf(q)!==-1;
g.rows.forEach(function(r){var ok=(hit||r.title.indexOf(q)!==-1)&&(tag===''||r.tags.indexOf(tag)!==-1);r.el.hidden=!ok;if(ok)n++});
g.el.hidden=n===0;g.count.textContent=String(n);total+=n});
none.hidden=total!==0}
chips.forEach(function(chip){chip.addEventListener('click',function(){tag=chip.getAttribute('data-g')||'';chips.forEach(function(c){c.setAttribute('aria-pressed',c===chip?'true':'false')});apply()})});
input.addEventListener('input',apply);
tools.hidden=false})();`;

/**
 * 公開ページに、スクリプトを載せるか。曲があるときだけ（曲が無い・メッセージのページには、載せない。
 * CSP も `script-src 'none'` にできる）。
 */
export function pageHasScript(snapshot: Snapshot | null): boolean {
  return snapshot !== null && snapshot.songs.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * R2から読んだ文字列を、描画できるスナップショットにする。読めない（JSONでない・形の版が違う・形が違う）ときは `null`。
 * R2に置くのは、Publish が検証した本文だけなので、ここは防御（別の版・壊れた本文で、描画が例外になるのを防ぐ）。
 * 検証の規則（長さ・文字）は繰り返さない。値の型だけ確かめ、描画は、すべての値をエスケープする。
 */
export function parsePublishedSnapshot(text: string): Snapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.schema !== SNAPSHOT_SCHEMA) return null;
  const { version, publishedAt, profile, songs } = value;
  if (typeof version !== 'number' || typeof publishedAt !== 'number') return null;
  if (!isRecord(profile) || typeof profile.displayName !== 'string' || typeof profile.bio !== 'string') return null;
  if (!Array.isArray(songs)) return null;

  const parsed: PublishedSong[] = [];
  for (const song of songs as unknown[]) {
    if (!isRecord(song)) return null;
    const { id, title, artist, publicTags, sortOrder } = song;
    if (typeof id !== 'string' || typeof title !== 'string' || typeof artist !== 'string') return null;
    if (!isStringArray(publicTags) || typeof sortOrder !== 'number') return null;
    parsed.push({ id, title, artist, publicTags, sortOrder });
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    version,
    publishedAt,
    profile: { displayName: profile.displayName, bio: profile.bio },
    songs: parsed,
  };
}

/** 説明文（`description`・`og:description`）。自己紹介の先頭（空白を詰めて160字まで）、無ければ曲数。 */
function describe(snapshot: Snapshot, lang: PageLanguage): string {
  const bio = snapshot.profile.bio.replace(/\s+/g, ' ').trim();
  if (bio === '') return MESSAGES[lang].songs(snapshot.songs.length);
  const chars = Array.from(bio);
  return chars.length > 160 ? `${chars.slice(0, 160).join('')}…` : bio;
}

interface Head {
  title: string;
  description?: string;
  /** 正規のURL。メッセージのページには付けない。 */
  canonical?: string;
}

function renderPage(lang: PageLanguage, head: Head, body: string, script: boolean): string {
  const title = escapeHtml(head.title);
  const social =
    head.canonical === undefined || head.description === undefined
      ? ''
      : `<link rel="canonical" href="${escapeHtml(head.canonical)}">
<meta name="description" content="${escapeHtml(head.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Singfolio">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${escapeHtml(head.description)}">
<meta property="og:url" content="${escapeHtml(head.canonical)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary">
`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${title}</title>
${social}<link rel="icon" href="${FAVICON_DATA_URI}">
<style>${PAGE_STYLE}</style>
</head>
<body>
${body}${script ? `<script>${PAGE_SCRIPT}</script>\n` : ''}</body>
</html>
`;
}

function brand(): string {
  return '<p class="brand"><span>Singfolio</span></p>';
}

function footer(lang: PageLanguage, username: string | null): string {
  const t = MESSAGES[lang];
  const report =
    username === null
      ? ''
      : `<p><a href="mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Singfolio page report: ${username}`)}">${t.report}</a></p>\n`;
  return `<footer class="wrap foot">
<p><a href="${INTRO_URL[lang]}">${t.madeWith}</a></p>
${report}</footer>
`;
}

/** 曲の一覧。連続する同じアーティストの曲を、1つの見出しにまとめる（並びは、スナップショットの並びのまま）。 */
function renderGroups(songs: PublishedSong[], tagIndex: Map<string, number>): string {
  const parts: string[] = [];
  let index = 0;
  while (index < songs.length) {
    const artist = (songs[index] as PublishedSong).artist;
    let end = index;
    while (end < songs.length && (songs[end] as PublishedSong).artist === artist) end += 1;

    parts.push(
      `<section class="group"><h2><span class="name">${escapeHtml(artist)}</span><span class="n">${end - index}</span></h2><ul>`,
    );
    for (let i = index; i < end; i += 1) {
      const song = songs[i] as PublishedSong;
      const indices = song.publicTags.map((tag) => tagIndex.get(tag)).join(' ');
      const tags =
        song.publicTags.length === 0
          ? ''
          : `<span class="g">${song.publicTags.map(escapeHtml).join(' · ')}</span>`;
      parts.push(
        `<li${indices === '' ? '' : ` data-g="${indices}"`}><span class="t">${escapeHtml(song.title)}</span>${tags}</li>`,
      );
    }
    parts.push('</ul></section>');
    index = end;
  }
  return parts.join('\n');
}

/** 使われているタグの名前（昇順）。タグの絞り込みのボタンの並び。 */
function collectTags(songs: PublishedSong[]): string[] {
  const names = new Set<string>();
  for (const song of songs) for (const tag of song.publicTags) names.add(tag);
  return [...names].sort((a, b) => {
    const left = a.toLowerCase();
    const right = b.toLowerCase();
    if (left !== right) return left < right ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** 公開ページのHTML。 */
export function renderProfilePage(snapshot: Snapshot, username: string, lang: PageLanguage): string {
  const t = MESSAGES[lang];
  const { displayName, bio } = snapshot.profile;
  const songs = snapshot.songs;
  const tagNames = collectTags(songs);
  const tagIndex = new Map(tagNames.map((name, position) => [name, position]));

  const header = `<header class="wrap top">
${brand()}
<h1>${escapeHtml(displayName)}</h1>
${bio === '' ? '' : `<p class="bio">${escapeHtml(bio)}</p>\n`}<p class="meta">${t.songs(songs.length)}</p>
</header>
`;

  let main: string;
  if (songs.length === 0) {
    main = `<main class="wrap"><p class="note">${t.empty}</p></main>\n`;
  } else {
    const chips =
      tagNames.length === 0
        ? ''
        : `<div class="chips" role="group" aria-label="${t.tags}"><button type="button" class="chip" data-g="" aria-pressed="true">${t.all}</button>${tagNames
            .map(
              (name, position) =>
                `<button type="button" class="chip" data-g="${position}" aria-pressed="false">${escapeHtml(name)}</button>`,
            )
            .join('')}</div>\n`;
    // 操作は、スクリプトが動くときだけ出す（`hidden` を、スクリプトが外す）。
    main = `<div id="tools" class="tools" hidden><div class="wrap"><input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${t.search}" aria-label="${t.search}">
${chips}</div></div>
<main class="wrap">
${renderGroups(songs, tagIndex)}
<p id="none" class="note" role="status" hidden>${t.none}</p>
</main>
`;
  }

  return renderPage(
    lang,
    {
      title: `${displayName} - Singfolio`,
      description: describe(snapshot, lang),
      canonical: `${PUBLIC_ORIGIN}/${username}`,
    },
    `${header}${main}${footer(lang, username)}`,
    pageHasScript(snapshot),
  );
}

/** 「見つからない」「一時的に表示できない」のページ。持ち主・公開の有無に触れない文面にする。 */
export function renderMessagePage(kind: 'not_found' | 'unavailable', lang: PageLanguage): string {
  const t = MESSAGES[lang];
  const title = kind === 'not_found' ? t.notFoundTitle : t.unavailableTitle;
  const message = kind === 'not_found' ? t.notFoundBody : t.unavailableBody;
  return renderPage(
    lang,
    { title: `${title} - Singfolio` },
    `<header class="wrap top">
${brand()}
<h1>${title}</h1>
<p class="bio">${message}</p>
</header>
${footer(lang, null)}`,
    false,
  );
}
