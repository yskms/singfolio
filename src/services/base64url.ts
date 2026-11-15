// SHA-256 のダイジェスト（base64）を、base64url（パディングなし）にする。Workerが期待する `nonce` の形
// （`SHA-256(T)` の base64url。43字）は、docs/singfolio-publishing-backend.md §8「認証の方式」。
// ダイジェスト自体は、実行環境が計算する（アプリは expo-crypto。`services/index.ts`）。

/** base64 を base64url（`+` → `-`、`/` → `_`、末尾の `=` を除く）にする。 */
export function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
