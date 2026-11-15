// 入口。エンドポイントは 7.3.10 以降も足す。
import { handleLogin, handleLogout, handleNonce } from './auth.ts';
import { httpsRequiredResponse, isInsecureRequest } from './https.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 何よりも先に、HTTPSでないリクエストを、中身を見ずに拒否する（src/https.ts）。
    if (isInsecureRequest(request)) return httpsRequiredResponse();

    const { pathname } = new URL(request.url);
    if (pathname === '/auth/nonce') return handleNonce(request, env, Date.now());
    if (pathname === '/auth/login') return handleLogin(request, env, Date.now());
    if (pathname === '/auth/logout') return handleLogout(request, env);

    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler<Env>;
