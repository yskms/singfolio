// `username` の規則。URL（singfolio.app/<username>）と、R2のキー（public/<username>.json）に使う。
// 方針は docs/singfolio-publishing-backend.md §8「バックエンドが担当すること」「実装時に決めること」。
//
// 小文字の英数字と `_` の3〜20字。大文字は受け付けない（正規のURLは小文字。R2のキーは大文字と小文字を区別するので、
// 受け取った値を黙って小文字にすると、利用者が見ている名前と、確保される名前がずれる。アプリが小文字にして送る）。
// D1の `profiles.username` の CHECK（migrations/0004）と同じ規則。

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * 確保させない名前。公開ページ（`singfolio.app/<username>`）と同じ最上位のパスに置く、Workerのパス・サイトのパスと、
 * 運営や公式と取り違えやすい名前。3字未満の名前（`me` `ja` `en` など）は、そもそも規則で取れないが、書いてある。
 * 足すのはよい（まだ誰も取っていない名前だけが対象）。**外す・変えるときは、すでに確保された名前を確かめる**
 * （確保済みの名前が予約語になると、公開ページがそのパスのものに食われる）。
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Workerのパス（今ある /auth/ と /me/、これから足す API 関係）
  'api',
  'auth',
  'me',
  'oauth',
  'callback',
  'webhook',
  'webhooks',
  'publish',
  'unpublish',
  'profile',
  'profiles',
  'request',
  'requests',
  'username',
  'usernames',
  'user',
  'users',
  'account',
  'accounts',
  // サイトのパス（紹介ページ。docs/ の最上位）
  'ja',
  'en',
  'images',
  'static',
  'assets',
  'public',
  'privacy',
  'terms',
  'index',
  'home',
  'about',
  'app',
  'apps',
  'www',
  'docs',
  'blog',
  'news',
  'status',
  'search',
  'explore',
  'new',
  'edit',
  'delete',
  'login',
  'logout',
  'signin',
  'signup',
  'settings',
  // 運営・公式と取り違えやすい名前
  'singfolio',
  'admin',
  'administrator',
  'root',
  'system',
  'staff',
  'team',
  'support',
  'help',
  'contact',
  'security',
  'abuse',
  'legal',
  'official',
  'moderator',
  'mod',
  'null',
  'undefined',
]);

/** `invalid`: 規則に合わない。`reserved`: 規則には合うが、確保させない名前。 */
export type UsernameCheck = 'ok' | 'invalid' | 'reserved';

export function checkUsername(value: unknown): UsernameCheck {
  if (typeof value !== 'string' || !USERNAME_PATTERN.test(value)) return 'invalid';
  return RESERVED_USERNAMES.has(value) ? 'reserved' : 'ok';
}

/**
 * 公開スナップショットの R2 のキー（docs §8「バックエンドが担当すること」）。**`username` から作る**（ユーザーIDにしない。
 * 公開ページは `username` から直接引き、D1に触れない）。規則に合わない値からは作らない（キーを組み立てるパスに、
 * `../` や `/` が入らないようにする。D1の値は規則の CHECK を通っているが、ここでも確かめる）。
 */
export function snapshotKey(username: string): string {
  if (!USERNAME_PATTERN.test(username)) throw new Error('invalid username for snapshot key');
  return `public/${username}.json`;
}
