/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import worker from '../src/index.ts';
import { negotiateLanguage, publicPageTarget } from '../src/publicPage.ts';
import { FAVICON_DATA_URI } from '../src/publicPageIcon.ts';
import { PAGE_SCRIPT, PAGE_STYLE } from '../src/publicPageRender.ts';
import { buildSnapshot, serializeSnapshot } from '../src/snapshot.ts';
import { snapshotKey } from '../src/username.ts';
import { openLocalDatabase, workerDir, type LocalDatabase } from './localDatabase.ts';

const NOW = 1_800_000_000_000;
const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

const content = {
  profile: { displayName: 'Yu & Co', bio: 'I sing.\nBallads.' },
  songs: [
    { id: '11111111-1111-4111-8111-111111111111', title: 'Blue Hour', artist: 'Aoi Lane', publicTags: ['Ballad'], sortOrder: 0 },
    { id: '22222222-2222-4222-8222-222222222222', title: 'さくら', artist: 'Aoi Lane', publicTags: [], sortOrder: 1 },
  ],
};

describe('publicPageTarget（パスの判定）', () => {
  it('小文字のユーザー名は正規形', () => {
    assert.deepEqual(publicPageTarget('/yskms'), { username: 'yskms', canonical: true });
    assert.deepEqual(publicPageTarget('/a_1'), { username: 'a_1', canonical: true });
  });
  it('大文字・末尾のスラッシュは、正規形でない（ユーザー名は小文字にする）', () => {
    assert.deepEqual(publicPageTarget('/Yskms'), { username: 'yskms', canonical: false });
    assert.deepEqual(publicPageTarget('/yskms/'), { username: 'yskms', canonical: false });
    assert.deepEqual(publicPageTarget('/YSKMS/'), { username: 'yskms', canonical: false });
  });
  it('ユーザー名の規則に合わないパスは、公開ページではない', () => {
    for (const p of ['/', '//', '/ab', '/a'.padEnd(23, 'b'), '/yskms//', '/yskms/x', '/ysk-ms', '/%79skms', '/yskms.json', '/robots.txt', '/日本語']) {
      assert.equal(publicPageTarget(p), null, p);
    }
  });
  it('予約語（Workerのパス・サイトのパス）は、公開ページではない', () => {
    for (const p of ['/auth', '/me', '/api', '/Auth', '/support', '/singfolio', '/images']) {
      assert.equal(publicPageTarget(p), null, p);
    }
  });
});

describe('negotiateLanguage（Accept-Language）', () => {
  it('日本語が最優先なら日本語。それ以外は英語', () => {
    assert.equal(negotiateLanguage('ja,en-US;q=0.9'), 'ja');
    assert.equal(negotiateLanguage('ja-JP'), 'ja');
    assert.equal(negotiateLanguage('en-US,en;q=0.9,ja;q=0.8'), 'en');
    assert.equal(negotiateLanguage('en;q=0.5, ja;q=0.9'), 'ja');
    assert.equal(negotiateLanguage('fr-FR,de;q=0.8'), 'en');
    assert.equal(negotiateLanguage('ja;q=0'), 'en');
    assert.equal(negotiateLanguage(null), 'en');
    assert.equal(negotiateLanguage('*'), 'en');
    assert.equal(negotiateLanguage('ja;q=abc,en'), 'en');
  });
});

describe('公開ページ（GET /<username>）', () => {
  let local: LocalDatabase;
  let bucket: R2Bucket;
  // D1 を渡さない: 公開ページは D1 に触れない（D1が止まっても表示できる）。触れれば例外になる。
  let env: Env;
  before(async () => {
    local = await openLocalDatabase();
    bucket = local.env.SNAPSHOTS;
    env = { SNAPSHOTS: bucket } as Env;
  });
  after(async () => {
    await local.dispose();
  });

  let counter = 0;
  const publishedPage = async (overrides: { body?: string } = {}) => {
    const username = `page_user_${counter++}`;
    await bucket.put(snapshotKey(username), overrides.body ?? serializeSnapshot(buildSnapshot(content, 2, NOW)));
    return username;
  };
  const get = (pathname: string, init: RequestInit = {}, testEnv: Env = env) =>
    worker.fetch(new Request(`https://singfolio.app${pathname}`, init), testEnv);

  it('R2のスナップショットから、HTMLを返す', async () => {
    const username = await publishedPage();
    const response = await get(`/${username}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    const html = await response.text();
    assert.match(html, /<h1>Yu &amp; Co<\/h1>/);
    assert.match(html, /<span class="t">Blue Hour<\/span>/);
    assert.match(html, /<span class="t">さくら<\/span>/);
    assert.match(html, new RegExp(`href="https://singfolio.app/${username}"`));
  });

  it('ヘッダー: 共有キャッシュに載せず毎回再確認・noindex・CSP・sniffing禁止・Referrerなし', async () => {
    const username = await publishedPage();
    const response = await get(`/${username}`);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.doesNotMatch(response.headers.get('cache-control') ?? '', /max-age|public|s-maxage/);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('vary'), 'Accept-Language');
    assert.equal(response.headers.get('content-language'), 'en');
    assert.equal(response.headers.has('set-cookie'), false);
  });

  it('CSP: 外へ何も読まず、インラインのCSS・スクリプトを、その内容のハッシュだけで許す', async () => {
    const username = await publishedPage();
    const csp = (await get(`/${username}`)).headers.get('content-security-policy') ?? '';
    assert.equal(
      csp,
      [
        "default-src 'none'",
        `style-src ${sha256(PAGE_STYLE)}`,
        `script-src ${sha256(PAGE_SCRIPT)}`,
        'img-src data:',
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    // 'unsafe-inline' も 'unsafe-eval' も使わない。
    assert.equal(csp.includes('unsafe'), false);
  });

  it('CSP のハッシュは、HTMLに埋め込まれた <style>・<script> の中身と一致する', async () => {
    const username = await publishedPage();
    const response = await get(`/${username}`);
    const csp = response.headers.get('content-security-policy') ?? '';
    const html = await response.text();
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    assert.equal(csp.includes(sha256(style)), true);
    assert.equal(csp.includes(sha256(script)), true);
  });

  it('曲が無いスナップショットは、スクリプトを載せず、CSP も script-src \'none\'', async () => {
    const username = `page_user_${counter++}`;
    await bucket.put(snapshotKey(username), serializeSnapshot(buildSnapshot({ ...content, songs: [] }, 1, NOW)));
    const response = await get(`/${username}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'none'/);
    assert.equal((await response.text()).includes('<script'), false);
  });

  it('D1 に触れない（D1 の無い環境でも表示できる）', async () => {
    const username = await publishedPage();
    const response = await get(`/${username}`, {}, { SNAPSHOTS: bucket } as Env);
    assert.equal(response.status, 200);
  });

  it('Accept-Language が日本語なら、日本語で返す。ETag は言語ごとに違う', async () => {
    const username = await publishedPage();
    const en = await get(`/${username}`);
    const ja = await get(`/${username}`, { headers: { 'accept-language': 'ja-JP,ja;q=0.9' } });
    assert.equal(ja.headers.get('content-language'), 'ja');
    assert.match(await ja.text(), /<html lang="ja">[\s\S]*2曲/);
    assert.notEqual(en.headers.get('etag'), ja.headers.get('etag'));
  });

  it('小文字へ寄せる: 大文字・末尾のスラッシュは 301（正規のURLへ）', async () => {
    const username = await publishedPage();
    for (const pathname of [`/${username.toUpperCase()}`, `/${username}/`, `/${username.toUpperCase()}/`]) {
      const response = await get(pathname);
      assert.equal(response.status, 301, pathname);
      assert.equal(response.headers.get('location'), `https://singfolio.app/${username}`);
    }
  });

  it('ETag で再確認できる: 一致すれば 304（本文なし）、変われば 200', async () => {
    const username = await publishedPage();
    const first = await get(`/${username}`);
    const etag = first.headers.get('etag') as string;
    assert.match(etag, /^"[0-9a-f]+\.\d+\.en"$/);

    const same = await get(`/${username}`, { headers: { 'if-none-match': etag } });
    assert.equal(same.status, 304);
    assert.equal(await same.text(), '');
    assert.equal(same.headers.get('etag'), etag);
    assert.equal(same.headers.get('cache-control'), 'no-cache');
    // 弱い比較の形・複数の候補・`*` でも一致する。
    assert.equal((await get(`/${username}`, { headers: { 'if-none-match': `W/${etag}` } })).status, 304);
    assert.equal((await get(`/${username}`, { headers: { 'if-none-match': `"x", ${etag}` } })).status, 304);
    assert.equal((await get(`/${username}`, { headers: { 'if-none-match': '*' } })).status, 304);

    // Publish で差し替わると、ETag が変わり、新しい内容が返る。
    await bucket.put(snapshotKey(username), serializeSnapshot(buildSnapshot({ ...content, profile: { displayName: 'New', bio: '' } }, 3, NOW + 1)));
    const changed = await get(`/${username}`, { headers: { 'if-none-match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.match(await changed.text(), /<h1>New<\/h1>/);
  });

  it('言語が違う ETag では 304 にしない', async () => {
    const username = await publishedPage();
    const etag = (await get(`/${username}`)).headers.get('etag') as string;
    const ja = await get(`/${username}`, { headers: { 'if-none-match': etag, 'accept-language': 'ja' } });
    assert.equal(ja.status, 200);
  });

  it('HEAD: ヘッダーだけ（本文なし）。ETag は GET と同じ', async () => {
    const username = await publishedPage();
    const getResponse = await get(`/${username}`);
    const head = await get(`/${username}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('etag'), getResponse.headers.get('etag'));
    assert.equal(head.headers.get('x-robots-tag'), 'noindex');
  });

  it('Unpublish（R2から消える）と、次のリクエストから 404。公開の有無は区別しない', async () => {
    const username = await publishedPage();
    assert.equal((await get(`/${username}`)).status, 200);
    await bucket.delete(snapshotKey(username));
    const gone = await get(`/${username}`);
    assert.equal(gone.status, 404);
    const never = await get('/never_published');
    assert.equal(never.status, 404);
    assert.equal(await gone.text(), await never.text());
    for (const response of [gone, never]) {
      assert.equal(response.headers.get('x-robots-tag'), 'noindex');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    // 取り下げたあとの再確認（古い ETag）も、304 にならない。
    const stale = await get(`/${username}`, { headers: { 'if-none-match': '*' } });
    assert.equal(stale.status, 404);
  });

  it('404 のページには、スクリプトも通報のリンクも無い。HEAD も 404', async () => {
    const response = await get('/never_published');
    const html = await response.text();
    assert.match(html, /<h1>Page not found<\/h1>/);
    assert.equal(html.includes('<script'), false);
    assert.equal(html.includes('mailto:'), false);
    assert.equal((await get('/never_published', { method: 'HEAD' })).status, 404);
  });

  it('壊れた・読めない版のスナップショットは 503（再試行を促す）。中身は出さない', async () => {
    const broken = await publishedPage({ body: '{"schema":1,"secret":"do-not-leak"' });
    const response = await get(`/${broken}`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.match(html, /Temporarily unavailable/);
    assert.equal(html.includes('do-not-leak'), false);

    const newer = await publishedPage({ body: JSON.stringify({ ...JSON.parse(serializeSnapshot(buildSnapshot(content, 1, NOW))), schema: 99 }) });
    assert.equal((await get(`/${newer}`)).status, 503);
  });

  it('R2 が失敗したときも 503（Cloudflareのエラーページにしない）', async () => {
    const failing = {
      SNAPSHOTS: {
        get: () => Promise.reject(new Error('r2 down')),
      },
    } as unknown as Env;
    const response = await get('/page_user_x', {}, failing);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '30');
  });

  it('GET・HEAD 以外は 405', async () => {
    const username = await publishedPage();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = await get(`/${username}`, { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });

  it('公開ページでないパスは、これまでどおりの 404（R2を引かない）', async () => {
    const spy = {
      SNAPSHOTS: {
        get: () => {
          throw new Error('R2 must not be read');
        },
      },
    } as unknown as Env;
    for (const pathname of ['/', '/robots.txt', '/favicon.ico', '/auth', '/me', '/yskms/extra', '/ab']) {
      const response = await get(pathname, {}, spy);
      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    }
  });

  it('既存の API のパスは、公開ページに食われない', async () => {
    const response = await get('/me/profile');
    assert.equal(response.status, 401);
  });

  it('ファビコンは docs/favicon.png と一致する（元画像を変えたら、base64 を作り直す）', () => {
    const png = readFileSync(path.join(workerDir, '..', 'docs', 'favicon.png'));
    assert.equal(FAVICON_DATA_URI, `data:image/png;base64,${png.toString('base64')}`);
  });
});

describe('HTTP で届いた公開ページ', () => {
  const env = {} as Env;
  const http = (pathname: string, method = 'GET') =>
    worker.fetch(new Request(`http://singfolio.app${pathname}`, { method }), env);

  it('GET・HEAD は、HTTPS の正規のURLへ 308（キャッシュしない）', async () => {
    for (const method of ['GET', 'HEAD']) {
      const response = await http('/Yskms/', method);
      assert.equal(response.status, 308, method);
      assert.equal(response.headers.get('location'), 'https://singfolio.app/yskms');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });

  it('クエリは引き継がない', async () => {
    const response = await http('/yskms?utm=1&code=secret');
    assert.equal(response.headers.get('location'), 'https://singfolio.app/yskms');
  });

  it('GET・HEAD 以外・公開ページでないパス・予約語は、これまでどおり 403（HTTPS required）', async () => {
    for (const [pathname, method] of [
      ['/yskms', 'POST'],
      ['/auth/nonce', 'GET'],
      ['/me/profile', 'GET'],
      ['/auth', 'GET'],
      ['/', 'GET'],
      ['/yskms/x', 'GET'],
    ] as const) {
      const response = await http(pathname, method);
      assert.equal(response.status, 403, `${method} ${pathname}`);
      assert.equal(await response.text(), 'HTTPS required\n');
    }
  });
});
