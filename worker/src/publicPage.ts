// 公開ページ（GET singfolio.app/<username>）。R2のスナップショットだけから表示し、D1に触れない
// （D1の障害・日次上限でも、最後にPublishした状態を表示できる。docs/singfolio-publishing-backend.md §8「公開ページの可用性」）。
// HTMLの組み立ては src/publicPageRender.ts。ここは、URLの正規化・R2の読み取り・キャッシュ・ヘッダー。
//
// 決めたこと（理由は docs §8「公開ページ（7.5）」）:
// - 反映は即時。公開ページは共有キャッシュに載せず、ブラウザには毎回再確認させる（`private, no-cache` と ETag）。
//   Unpublish・アカウントの削除でR2から消えたら、次のリクエストから 404 になる。**`max-age` を足さない**
//   （足すと、取り下げたページが、その間、見え続ける）。
// - `noindex`（ヘッダーとメタ）。取り下げたページが検索結果に残るのは、こちらから消せないため。robots.txt では塞がない
//   （塞ぐと、クローラーが noindex を読めない）。
// - URLの正規形は `/<小文字のusername>`。大文字・末尾のスラッシュは 301 で正規形へ。
// - 存在しない名前・Unpublish済み・予約語は、どれも同じ 404（公開の有無を教えない）。
// - 外部へ何も読みに行かない。CSP は、インラインのCSS・スクリプトのハッシュだけを許可する。

import {
  PAGE_SCRIPT,
  PAGE_STYLE,
  parsePublishedSnapshot,
  renderMessagePage,
  renderProfilePage,
  type PageLanguage,
} from './publicPageRender.ts';
import { methodNotAllowed } from './http.ts';
import { RESERVED_USERNAMES, snapshotKey } from './username.ts';

export interface PublicPageTarget {
  username: string;
  /** リクエストのパスが、正規形（`/<小文字のusername>`）そのままか。 */
  canonical: boolean;
}

// 大文字は、正規形へ寄せるために受け付ける（R2のキーは小文字）。
const PAGE_PATH = /^\/([A-Za-z0-9_]{3,20})$/;

/**
 * 公開ページのパスか。`/<username>` か、その大文字・末尾のスラッシュ違い。予約語（Workerのパス・サイトのパス）は
 * 公開ページではない（確保されないので、R2も引かない）。
 */
export function publicPageTarget(pathname: string): PublicPageTarget | null {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const match = PAGE_PATH.exec(trimmed);
  if (match === null) return null;
  const username = (match[1] as string).toLowerCase();
  if (RESERVED_USERNAMES.has(username)) return null;
  return { username, canonical: pathname === `/${username}` };
}

/** `Accept-Language` から、ページの文言の言語を決める（日本語か英語。どちらも無ければ英語）。 */
export function negotiateLanguage(header: string | null): PageLanguage {
  if (header === null) return 'en';
  let best: PageLanguage = 'en';
  let bestQuality = 0;
  for (const part of header.slice(0, 500).split(',')) {
    const [range, ...params] = part.split(';');
    const primary = (range ?? '').trim().toLowerCase().split('-')[0];
    if (primary !== 'ja' && primary !== 'en') continue;
    let quality = 1;
    for (const param of params) {
      // `q=` の値が数字でなければ、その言語は数えない（読み違えて優先しない）。
      if (!/^\s*q\s*=/i.test(param)) continue;
      const match = /^\s*q\s*=\s*([0-9]+(?:\.[0-9]*)?)\s*$/i.exec(param);
      quality = match === null ? Number.NaN : Number(match[1]);
    }
    if (Number.isNaN(quality) || quality <= bestQuality) continue;
    best = primary;
    bestQuality = quality;
  }
  return best;
}

// CSP に載せるインラインのCSS・スクリプトのハッシュ。内容は定数なので、最初の1回だけ計算して持つ
// （値を持つだけ。Promise は、リクエストをまたいで共有しない）。
let cachedHashes: { style: string; script: string } | undefined;

async function sha256Base64(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** CSP。外部へ何も読みに行かない。スクリプトは、載せるときだけ、その内容のハッシュで許可する。 */
export async function contentSecurityPolicy(withScript: boolean): Promise<string> {
  cachedHashes ??= { style: await sha256Base64(PAGE_STYLE), script: await sha256Base64(PAGE_SCRIPT) };
  const script = withScript ? `'sha256-${cachedHashes.script}'` : "'none'";
  return [
    "default-src 'none'",
    `style-src 'sha256-${cachedHashes.style}'`,
    `script-src ${script}`,
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

let cachedAssetsTag: string | undefined;

/**
 * ETag に入れる、CSS・スクリプト・CSP の指紋（CSP のハッシュ付きの文字列の SHA-256 の先頭）。
 * **これを ETag に入れないと、CSS・スクリプトを変えたとき、版の上げ忘れで、ページが壊れる**: 304 のヘッダー（新しい CSP）は
 * ブラウザが保存済みの応答に反映するので、保存済みの古い HTML のインラインの `<style>`・`<script>` が、新しい CSP のハッシュと
 * 合わず、止まる（Chrome で確認。docs §8「公開ページ（7.5）」）。値を持つだけで、Promise は共有しない。
 */
async function assetsTag(): Promise<string> {
  cachedAssetsTag ??= (await sha256Base64(await contentSecurityPolicy(true)))
    .slice(0, 8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return cachedAssetsTag;
}

function pageHeaders(csp: string, lang: PageLanguage, extra: Record<string, string> = {}): Headers {
  return new Headers({
    'content-type': 'text/html; charset=utf-8',
    'content-language': lang,
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    // 取り下げたページが検索結果に残るのは、こちらから消せない。インデックスさせない。
    'x-robots-tag': 'noindex',
    'referrer-policy': 'no-referrer',
    // 言語で本文が変わる。
    vary: 'Accept-Language',
    ...extra,
  });
}

async function messageResponse(
  kind: 'not_found' | 'unavailable',
  lang: PageLanguage,
  head: boolean,
): Promise<Response> {
  const csp = await contentSecurityPolicy(false);
  const status = kind === 'not_found' ? 404 : 503;
  const extra: Record<string, string> = { 'cache-control': 'no-store' };
  if (kind === 'unavailable') extra['retry-after'] = '30';
  return new Response(head ? null : renderMessagePage(kind, lang), {
    status,
    headers: pageHeaders(csp, lang, extra),
  });
}

// 共有キャッシュには載せず（`private`）、ブラウザには毎回再確認させる（`no-cache`）。`max-age` を足さない。
const PAGE_CACHE_CONTROL = 'private, no-cache';

// ETag は、スナップショット（R2のetag）・言語・ページの作り（テンプレートの版）・CSS/スクリプト/CSP の指紋で決まる。
// CSS・スクリプト・CSP の変更は指紋が拾うので、版は要らない。**HTML の構造・文言を変えたら、版を上げる**
// （上げないと、ブラウザが 304 で古い作りのページを使い続ける。古いだけで、動きは壊れない）。
export const PAGE_TEMPLATE_VERSION = 1;

function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/** `/<username>` への GET・HEAD。 */
export async function handlePublicPage(request: Request, env: Env, target: PublicPageTarget): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
  const head = request.method === 'HEAD';

  if (!target.canonical) {
    // 正規のURLへ。ユーザー名は変更も再利用もされないので、恒久的なリダイレクトにしてよい。
    return new Response(null, {
      status: 301,
      headers: { location: new URL(`/${target.username}`, request.url).toString(), 'cache-control': PAGE_CACHE_CONTROL },
    });
  }

  const lang = negotiateLanguage(request.headers.get('accept-language'));

  let object: R2ObjectBody | null;
  try {
    object = await env.SNAPSHOTS.get(snapshotKey(target.username));
  } catch {
    return messageResponse('unavailable', lang, head);
  }
  if (object === null) return messageResponse('not_found', lang, head);

  const etag = `"${object.etag}.${PAGE_TEMPLATE_VERSION}.${lang}.${await assetsTag()}"`;
  // 本文はまだ読んでいない。再確認が一致するときは、読まずに 304（R2からの転送を止める）。
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    object.body.cancel().catch(() => {});
    // 本文を読まないので、曲の有無が分からない。スクリプトを許可する側の CSP を返す（曲が無いページでは、保存済みの応答の
    // `script-src 'none'` が、ハッシュの許可に置き換わる。そのページにスクリプトは無いので、動きは変わらない）。
    const csp = await contentSecurityPolicy(true);
    return new Response(null, {
      status: 304,
      headers: pageHeaders(csp, lang, { etag, 'cache-control': PAGE_CACHE_CONTROL }),
    });
  }

  let html: string;
  let withScript: boolean;
  try {
    const snapshot = parsePublishedSnapshot(await object.text());
    if (snapshot === null) {
      // 本文の中身は出さない（名前も、曲名も）。
      console.error('public page: unreadable snapshot');
      return messageResponse('unavailable', lang, head);
    }
    html = renderProfilePage(snapshot, target.username, lang);
    withScript = snapshot.songs.length > 0;
  } catch {
    console.error('public page: render failed');
    return messageResponse('unavailable', lang, head);
  }
  const csp = await contentSecurityPolicy(withScript);
  // HEAD も、GET と同じ道を通って（読めない本文なら 503、CSP も GET と同じ）、本文だけを返さない。
  return new Response(head ? null : html, {
    status: 200,
    headers: pageHeaders(csp, lang, { etag, 'cache-control': PAGE_CACHE_CONTROL }),
  });
}

/**
 * HTTP で届いた、公開ページの GET・HEAD を、HTTPS の正規のURLへ移す（308）。それ以外の HTTP は、これまでどおり 403
 * （src/https.ts）。公開ページには秘密が無く（パスにユーザー名があるだけ）、リダイレクトで守れないものが無い。
 * ブラウザは、`.app` が HSTS の preload リストにあるため、HTTP を送らない。HTTP で届くのは、リンクのプレビューの取得などの
 * ブラウザ以外のクライアント。`/auth/`・`/me/` など、公開ページのパスでないものは、リダイレクトしない。
 */
export function insecurePublicPageRedirect(request: Request): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  // URL が既に https: のときは移さない（`X-Forwarded-Proto: http` で「平文」と判定された場合。移し先が同じURLで、
  // ヘッダーが付き続けるクライアントでは、同じURLへのリダイレクトが繰り返される）。これまでどおり 403。
  if (url.protocol === 'https:') return null;
  const target = publicPageTarget(url.pathname);
  if (target === null) return null;
  const secure = new URL(`/${target.username}`, url);
  secure.protocol = 'https:';
  return new Response(null, { status: 308, headers: { location: secure.toString(), 'cache-control': 'no-store' } });
}
