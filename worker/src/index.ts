// 入口。エンドポイントは 7.3.10 以降も足す。
import { handleAppleNotification } from './appleNotification.ts';
import { handleAppleCallback, handleAppleWebLogin } from './appleWeb.ts';
import { handleDeleteAccount } from './deleteAccount.ts';
import { handleLogin, handleLogout, handleLogoutOthers, handleNonce } from './auth.ts';
import { httpsRequiredResponse, isInsecureRequest } from './https.ts';
import { runInactiveAccountDeletion } from './inactiveAccounts.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 何よりも先に、HTTPSでないリクエストを、中身を見ずに拒否する（src/https.ts）。
    if (isInsecureRequest(request)) return httpsRequiredResponse();

    const { pathname } = new URL(request.url);
    if (pathname === '/auth/nonce') return handleNonce(request, env, Date.now());
    if (pathname === '/auth/login') return handleLogin(request, env, Date.now());
    if (pathname === '/auth/logout') return handleLogout(request, env, Date.now());
    if (pathname === '/auth/logout-others') return handleLogoutOthers(request, env, Date.now());
    if (pathname === '/auth/delete') return handleDeleteAccount(request, env, Date.now());
    if (pathname === '/auth/apple/callback') return handleAppleCallback(request);
    if (pathname === '/auth/apple/notifications') return handleAppleNotification(request, env, Date.now());
    if (pathname === '/auth/apple/login') return handleAppleWebLogin(request, env, Date.now());

    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },

  // 毎日1回（wrangler.jsonc の triggers.crons）。未使用のアカウントの自動削除（src/inactiveAccounts.ts）。
  // 失敗は投げる（実行が失敗として記録される）。翌日にやり直す（冪等）。
  // `waitUntil` に回さず待つ（失敗が、この実行の失敗として記録される）。
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runInactiveAccountDeletion(env.DB, Date.now());
  },
} satisfies ExportedHandler<Env>;
