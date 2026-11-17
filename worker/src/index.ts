// 入口。エンドポイントは 7.3.10 以降も足す。
import { handleAppleNotification } from './appleNotification.ts';
import { handleAppleCallback, handleAppleWebLogin } from './appleWeb.ts';
import { handleLogin, handleLogout, handleLogoutOthers, handleNonce } from './auth.ts';
import { httpsRequiredResponse, isInsecureRequest } from './https.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 何よりも先に、HTTPSでないリクエストを、中身を見ずに拒否する（src/https.ts）。
    if (isInsecureRequest(request)) return httpsRequiredResponse();

    const { pathname } = new URL(request.url);
    if (pathname === '/auth/nonce') return handleNonce(request, env, Date.now());
    if (pathname === '/auth/login') return handleLogin(request, env, Date.now());
    if (pathname === '/auth/logout') return handleLogout(request, env);
    if (pathname === '/auth/logout-others') return handleLogoutOthers(request, env, Date.now());
    if (pathname === '/auth/apple/callback') return handleAppleCallback(request);
    if (pathname === '/auth/apple/notifications') return handleAppleNotification(request, env, Date.now());
    if (pathname === '/auth/apple/login') return handleAppleWebLogin(request, env, Date.now());

    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler<Env>;
