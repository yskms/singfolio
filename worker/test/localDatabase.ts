// テスト用のローカルD1。本番・開発と同じ手順（`wrangler d1 migrations apply --local`）で
// migrations/ を適用した一時のDBを、getPlatformProxy で開く。SQLを自前で分割して流さない
// （D1の exec は1行1文なので、複数行の文が壊れる。適用の経路そのものも検査したい）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

export const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface LocalDatabase {
  db: D1Database;
  dispose(): Promise<void>;
}

export async function openLocalDatabase(): Promise<LocalDatabase> {
  // 必須の秘密情報（wrangler.jsonc の secrets.required）が無いと警告が出る。DBの検査には使わない。
  process.env.NONCE_HMAC_KEY ??= 'test-only-value';
  const stateDir = mkdtempSync(path.join(tmpdir(), 'singfolio-d1-'));
  const wrangler = path.join(workerDir, 'node_modules', '.bin', 'wrangler');
  execFileSync(wrangler, ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir], {
    cwd: workerDir,
    stdio: 'pipe',
  });
  const proxy = await getPlatformProxy<Env>({
    configPath: path.join(workerDir, 'wrangler.jsonc'),
    // CLIの --persist-to は、指定したディレクトリの下に v3/ を作って置く。getPlatformProxy は、
    // 指定をそのまま使う。
    persist: { path: path.join(stateDir, 'v3') },
  });
  return {
    db: proxy.env.DB,
    async dispose() {
      await proxy.dispose();
      rmSync(stateDir, { recursive: true, force: true });
    },
  };
}
