/// <reference types="node" />
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import {
  escapeHtml,
  PAGE_SCRIPT,
  parsePublishedSnapshot,
  renderMessagePage,
  renderProfilePage,
} from '../src/publicPageRender.ts';
import { SNAPSHOT_SCHEMA, type PublishedSong, type Snapshot } from '../src/snapshot.ts';

const song = (n: number, overrides: Partial<PublishedSong> = {}): PublishedSong => ({
  id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
  title: `Song ${n}`,
  artist: 'Aoi Lane',
  publicTags: [],
  sortOrder: n,
  ...overrides,
});
const snapshotOf = (songs: PublishedSong[], profile = { displayName: 'Yu', bio: 'I sing.' }): Snapshot => ({
  schema: SNAPSHOT_SCHEMA,
  version: 3,
  publishedAt: 1_800_000_000_000,
  profile,
  songs,
});

describe('escapeHtml', () => {
  it('& < > " \' をエスケープする', () => {
    assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('エスケープの要らない文字列は、そのまま返す', () => {
    assert.equal(escapeHtml('さくら Sakura'), 'さくら Sakura');
  });
});

describe('parsePublishedSnapshot', () => {
  const valid = snapshotOf([song(1, { publicTags: ['Ballad'] })]);

  it('Publish が書いた形を読む', () => {
    assert.deepEqual(parsePublishedSnapshot(JSON.stringify(valid)), valid);
  });
  it('許可リストの外の項目は、持ち込まない（余分な項目が R2 にあっても、描画に渡らない）', () => {
    const tainted = JSON.stringify({
      ...valid,
      owner: 'x',
      profile: { ...valid.profile, privateNote: 'secret' },
      songs: [{ ...valid.songs[0], keyOffset: 3, privateNote: 'secret', status: 'ready' }],
    });
    const parsed = parsePublishedSnapshot(tainted);
    assert.deepEqual(parsed, valid);
    assert.equal(JSON.stringify(parsed).includes('secret'), false);
  });
  it('JSONでない・形の版が違う・形が違うものは null', () => {
    assert.equal(parsePublishedSnapshot('not json'), null);
    assert.equal(parsePublishedSnapshot('[]'), null);
    assert.equal(parsePublishedSnapshot(JSON.stringify({ ...valid, schema: 2 })), null);
    assert.equal(parsePublishedSnapshot(JSON.stringify({ ...valid, profile: null })), null);
    assert.equal(parsePublishedSnapshot(JSON.stringify({ ...valid, songs: {} })), null);
    assert.equal(parsePublishedSnapshot(JSON.stringify({ ...valid, songs: [{ ...valid.songs[0], title: 1 }] })), null);
    assert.equal(
      parsePublishedSnapshot(JSON.stringify({ ...valid, songs: [{ ...valid.songs[0], publicTags: 'Ballad' }] })),
      null,
    );
  });
});

describe('公開ページのHTML', () => {
  it('表示名・自己紹介・曲数・曲を出す', () => {
    const html = renderProfilePage(snapshotOf([song(1), song(2)]), 'yu_sings', 'en');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<h1>Yu<\/h1>/);
    assert.match(html, /<p class="bio">I sing\.<\/p>/);
    assert.match(html, /<p class="meta">2 songs<\/p>/);
    assert.match(html, /<span class="t">Song 1<\/span>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/singfolio\.app\/yu_sings">/);
    assert.match(html, /<meta name="robots" content="noindex">/);
  });

  it('利用者の入力は、すべてエスケープする（タグ・スクリプトを持ち込めない）', () => {
    const attack = `<script>alert(1)</script>"><img src=x onerror=alert(1)>`;
    const html = renderProfilePage(
      snapshotOf([song(1, { title: attack, artist: attack, publicTags: [attack] })], {
        displayName: attack,
        bio: attack,
      }),
      'yu_sings',
      'en',
    );
    assert.equal(html.includes('<script>alert'), false);
    assert.equal(html.includes('<img'), false);
    assert.equal(html.includes('onerror=alert(1)>'), false);
    // 本物のスクリプトは1つだけ（こちらが埋めたもの）。
    assert.equal(html.match(/<script/g)?.length, 1);
    assert.equal(html.match(/<style/g)?.length, 1);
  });

  it('連続する同じアーティストの曲を、1つの見出しにまとめる（曲数つき）', () => {
    const html = renderProfilePage(
      snapshotOf([song(1), song(2), song(3, { artist: 'Zed' }), song(4, { artist: 'Aoi Lane' })]),
      'yu_sings',
      'en',
    );
    const headings = [...html.matchAll(/<span class="name">([^<]*)<\/span><span class="n">(\d+)<\/span>/g)].map((m) => [m[1], m[2]]);
    // 並びはスナップショットのまま。離れた同じアーティストは、別の見出し。
    assert.deepEqual(headings, [['Aoi Lane', '2'], ['Zed', '1'], ['Aoi Lane', '1']]);
  });

  it('タグの絞り込み: 使われているタグだけを昇順に出し、曲には番号で結びつける', () => {
    const html = renderProfilePage(
      snapshotOf([song(1, { publicTags: ['Rock', 'ballad'] }), song(2, { publicTags: ['Ballad'] }), song(3)]),
      'yu_sings',
      'en',
    );
    const chips = [...html.matchAll(/<button type="button" class="chip" data-g="(\d*)" aria-pressed="(\w+)">([^<]*)<\/button>/g)].map(
      (m) => [m[1], m[2], m[3]],
    );
    // 大文字小文字を区別せずに並べる（同じ綴りの違いは、大文字が先）。
    assert.deepEqual(chips, [['', 'true', 'All'], ['0', 'false', 'Ballad'], ['1', 'false', 'ballad'], ['2', 'false', 'Rock']]);
    assert.match(html, /<li data-g="2 1"><span class="t">Song 1<\/span><span class="g">Rock · ballad<\/span><\/li>/);
    assert.match(html, /<li data-g="0"><span class="t">Song 2<\/span>/);
    assert.match(html, /<li><span class="t">Song 3<\/span><\/li>/);
  });

  it('タグが無ければ、タグのボタンは出さない', () => {
    const html = renderProfilePage(snapshotOf([song(1)]), 'yu_sings', 'en');
    assert.equal(html.includes('class="chips"'), false);
    assert.match(html, /id="q"/);
  });

  it('曲が無いときは、検索もスクリプトも出さず、その旨を出す', () => {
    const html = renderProfilePage(snapshotOf([]), 'yu_sings', 'en');
    assert.match(html, /No songs yet\./);
    assert.equal(html.includes('<script'), false);
    assert.equal(html.includes('id="q"'), false);
  });

  it('自己紹介が空なら、自己紹介の段落は出さない', () => {
    const html = renderProfilePage(snapshotOf([song(1)], { displayName: 'Yu', bio: '' }), 'yu_sings', 'en');
    assert.equal(html.includes('class="bio"'), false);
  });

  it('日本語: 文言と lang を切り替える', () => {
    const html = renderProfilePage(snapshotOf([song(1)]), 'yu_sings', 'ja');
    assert.match(html, /<html lang="ja">/);
    assert.match(html, /<p class="meta">1曲<\/p>/);
    assert.match(html, /placeholder="曲名・アーティストで検索"/);
    assert.match(html, /Singfolioで作成/);
  });

  it('英語の曲数は単数・複数を分ける', () => {
    assert.match(renderProfilePage(snapshotOf([song(1)]), 'yu_sings', 'en'), /1 song</);
    assert.match(renderProfilePage(snapshotOf([]), 'yu_sings', 'en'), /0 songs</);
  });

  it('説明文: 自己紹介の先頭160字（空白を詰める）。無ければ曲数', () => {
    const long = renderProfilePage(snapshotOf([song(1)], { displayName: 'Yu', bio: `${'あ'.repeat(200)}` }), 'yu_sings', 'en');
    assert.match(long, new RegExp(`<meta name="description" content="${'あ'.repeat(160)}…">`));
    const none = renderProfilePage(snapshotOf([song(1), song(2)], { displayName: 'Yu', bio: '' }), 'yu_sings', 'en');
    assert.match(none, /<meta name="description" content="2 songs">/);
    const lines = renderProfilePage(snapshotOf([song(1)], { displayName: 'Yu', bio: 'a\n\n  b' }), 'yu_sings', 'en');
    assert.match(lines, /<meta name="description" content="a b">/);
  });

  it('外部へ何も読みに行かない（http(s) の読み込み・外部の画像・フォント・スクリプトが無い）', () => {
    const html = renderProfilePage(snapshotOf([song(1, { publicTags: ['Rock'] })]), 'yu_sings', 'en');
    // 読み込みの属性（href は <a> のリンクと canonical、<link rel=icon> は data:）。
    assert.equal(/<(img|script|iframe|video|audio|source|embed|object)[^>]*\ssrc=/i.test(html), false);
    assert.equal(/<link[^>]*rel="(stylesheet|preload|prefetch|preconnect)"/i.test(html), false);
    assert.equal(/url\(|@import/i.test(html), false);
    assert.match(html, /<link rel="icon" href="data:image\/png;base64,/);
    // 紹介ページと通報のリンク（クリックされたときだけ開く）。
    const hrefs = [...html.matchAll(/ href="([^"]*)"/g)].map((m) => m[1] as string);
    assert.deepEqual(
      hrefs.map((href) => href.replace(/^data:.*/, 'data:').replace(/\?.*/, '')),
      ['https://singfolio.app/yu_sings', 'data:', 'https://yskms.github.io/singfolio/', 'mailto:yskms.studio@gmail.com'],
    );
  });

  it('通報のリンクの件名に、ページのアドレスを入れる', () => {
    const html = renderProfilePage(snapshotOf([song(1)]), 'yu_sings', 'en');
    assert.match(html, /mailto:yskms\.studio@gmail\.com\?subject=Singfolio%20page%20report%3A%20singfolio\.app%2Fyu_sings"/);
  });

  it('スクリプトは </script> を含まない（埋め込みが途切れない）', () => {
    assert.equal(PAGE_SCRIPT.toLowerCase().includes('</script'), false);
  });

  it('メッセージのページ: 公開の有無に触れず、スクリプトもタグ付きの値も無い', () => {
    const notFound = renderMessagePage('not_found', 'en');
    assert.match(notFound, /<h1>Page not found<\/h1>/);
    assert.equal(notFound.includes('<script'), false);
    assert.equal(notFound.includes('rel="canonical"'), false);
    assert.equal(notFound.includes('mailto:'), false);
    assert.match(renderMessagePage('unavailable', 'ja'), /<h1>一時的に表示できません<\/h1>/);
  });
});

// ---- ページのスクリプトの動作 ----
// ブラウザを使わず、描画したHTMLから最小のDOMを作って、スクリプトを実行する（HTMLの作りとスクリプトの食い違いを検出する）。
class FakeNode {
  hidden = false;
  value = '';
  readonly children: FakeNode[] = [];
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, (() => void)[]>();
  readonly tag: string;
  readonly classes: string[];
  textContent: string;
  constructor(tag: string, classes: string[] = [], textContent = '') {
    this.tag = tag;
    this.classes = classes;
    this.textContent = textContent;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  private descendants(): FakeNode[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  querySelectorAll(selector: string): FakeNode[] {
    return this.descendants().filter((node) => (selector.startsWith('.') ? node.classes.includes(selector.slice(1)) : node.tag === selector));
  }
  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const unescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function loadPage(snapshot: Snapshot) {
  const html = renderProfilePage(snapshot, 'yu_sings', 'en');
  const root = new FakeNode('document');
  const byId = new Map<string, FakeNode>();
  const add = (parent: FakeNode, node: FakeNode, id?: string) => {
    parent.children.push(node);
    if (id !== undefined) byId.set(id, node);
    return node;
  };
  const tools = add(root, new FakeNode('div', ['tools']), 'tools');
  tools.hidden = /id="tools"[^>]*\shidden/.test(html);
  const input = add(tools, new FakeNode('input'), 'q');
  const none = add(root, new FakeNode('p'), 'none');
  none.hidden = true;

  const chips = [...html.matchAll(/<button type="button" class="chip" data-g="(\d*)" aria-pressed="(\w+)">([^<]*)<\/button>/g)].map((m) => {
    const chip = add(root, new FakeNode('button', ['chip'], unescape(m[3] as string)));
    chip.setAttribute('data-g', m[1] as string);
    chip.setAttribute('aria-pressed', m[2] as string);
    return chip;
  });
  const groups = html.split('<section class="group">').slice(1).map((section) => {
    const group = add(root, new FakeNode('section', ['group']));
    const name = /<span class="name">([^<]*)<\/span><span class="n">(\d+)<\/span>/.exec(section) as RegExpExecArray;
    add(group, new FakeNode('span', ['name'], unescape(name[1] as string)));
    const count = add(group, new FakeNode('span', ['n'], name[2]));
    const rows = [...section.matchAll(/<li(?: data-g="([\d ]*)")?><span class="t">([^<]*)<\/span>/g)].map((m) => {
      const li = add(group, new FakeNode('li'));
      if (m[1] !== undefined) li.setAttribute('data-g', m[1]);
      add(li, new FakeNode('span', ['t'], unescape(m[2] as string)));
      return li;
    });
    return { group, count, rows };
  });

  const document = {
    getElementById: (id: string) => byId.get(id) ?? null,
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
  };
  vm.runInNewContext(PAGE_SCRIPT, { document, String, Array });
  return { tools, input, none, chips, groups };
}

const visibleTitles = (page: ReturnType<typeof loadPage>) =>
  page.groups.flatMap((g) => g.rows.filter((row) => !row.hidden).map((row) => row.querySelector('.t')?.textContent));

describe('公開ページのスクリプト（検索とタグの絞り込み）', () => {
  const page = () =>
    loadPage(
      snapshotOf([
        song(1, { title: 'チェリー', artist: 'スピッツ', publicTags: ['Ballad'] }),
        song(2, { title: 'ロビンソン', artist: 'スピッツ', publicTags: ['Rock'] }),
        song(3, { title: 'Blue Hour', artist: 'Aoi Lane', publicTags: ['Ballad', 'Rock'] }),
        song(4, { title: 'ＡＢＣ', artist: 'Aoi Lane' }),
      ]),
    );
  const type = (p: ReturnType<typeof loadPage>, value: string) => {
    p.input.value = value;
    p.input.fire('input');
  };

  it('起動すると、操作を表示する。最初はすべての曲が見える', () => {
    const p = page();
    assert.equal(p.tools.hidden, false);
    assert.deepEqual(visibleTitles(p), ['チェリー', 'ロビンソン', 'Blue Hour', 'ＡＢＣ']);
    assert.equal(p.none.hidden, true);
  });

  it('曲名で絞り込む。ひらがなでカタカナの曲を探せる', () => {
    const p = page();
    type(p, 'ちぇりー');
    assert.deepEqual(visibleTitles(p), ['チェリー']);
  });

  it('アーティストでも絞り込む。そのアーティストの曲がすべて残り、曲数が更新される', () => {
    const p = page();
    type(p, 'すぴっつ');
    assert.deepEqual(visibleTitles(p), ['チェリー', 'ロビンソン']);
    type(p, 'aoi');
    assert.deepEqual(visibleTitles(p), ['Blue Hour', 'ＡＢＣ']);
    // 曲が1つも残らない見出しは隠す。
    assert.deepEqual(p.groups.map((g) => g.group.hidden), [true, false]);
  });

  it('全角半角・大文字小文字を同一視する', () => {
    const p = page();
    type(p, 'abc');
    assert.deepEqual(visibleTitles(p), ['ＡＢＣ']);
    type(p, 'ＢＬＵＥ');
    assert.deepEqual(visibleTitles(p), ['Blue Hour']);
  });

  it('見出しの曲数は、絞り込んだあとの数', () => {
    const p = page();
    type(p, 'blue');
    assert.deepEqual(p.groups.map((g) => g.count.textContent), ['0', '1']);
  });

  it('一致する曲が無ければ、その旨を出す。消せば戻る', () => {
    const p = page();
    type(p, 'zzzz');
    assert.deepEqual(visibleTitles(p), []);
    assert.equal(p.none.hidden, false);
    type(p, '');
    assert.equal(p.none.hidden, true);
    assert.equal(visibleTitles(p).length, 4);
  });

  it('タグで絞り込む（1つだけ選べる。「All」で外す）。選んだボタンだけが押された状態', () => {
    const p = page();
    const [all, ballad, rock] = p.chips;
    ballad!.fire('click');
    assert.deepEqual(visibleTitles(p), ['チェリー', 'Blue Hour']);
    assert.deepEqual(p.chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'true', 'false']);
    rock!.fire('click');
    assert.deepEqual(visibleTitles(p), ['ロビンソン', 'Blue Hour']);
    all!.fire('click');
    assert.equal(visibleTitles(p).length, 4);
    assert.deepEqual(p.chips.map((c) => c.getAttribute('aria-pressed')), ['true', 'false', 'false']);
  });

  it('検索とタグは両方を満たす曲だけ', () => {
    const p = page();
    p.chips[2]!.fire('click'); // Rock
    type(p, 'スピッツ');
    assert.deepEqual(visibleTitles(p), ['ロビンソン']);
  });
});
