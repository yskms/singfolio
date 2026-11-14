// HTTPSでないリクエストを拒否する。理由と、確かめたこと・確かめていないことは
// docs/singfolio-publishing-backend.md §8「Workerの構成と運用」の「HTTPS」。
// Always Use HTTPS（ゾーンの設定）に置き換えない。外さない。

// ローカルの開発（wrangler dev は http://localhost:8787）だけを通す。本番の singfolio.app への
// リクエストは、Host が localhost になることはない（Custom Domain は一致するホスト名だけを受ける）。
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isInsecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (LOCAL_HOSTNAMES.has(url.hostname)) return false;
  if (url.protocol !== 'https:') return true;
  // Cloudflareは、クライアントが使ったプロトコルを X-Forwarded-Proto に入れる（資料）。Workerから
  // このヘッダーが見えるかは資料に無いので、見えたときだけ使う。`http` と書いてあれば拒否する
  // （どちらの信号も、拒否する向きにだけ効かせる）。
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded !== null) {
    return forwarded.split(',').some((value) => value.trim().toLowerCase() === 'http');
  }
  return false;
}

export function httpsRequiredResponse(): Response {
  // リダイレクトしない。リダイレクトは、最初の1通（秘密を含みうる）が平文で出た後の話で、守れない。
  return new Response('HTTPS required\n', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
