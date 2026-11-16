// SHA-256 のダイジェスト（base64）を、base64url（パディングなし）にする。Workerが期待する `nonce` の形
// （`SHA-256(T)` の base64url。43字）は、docs/singfolio-publishing-backend.md §8「認証の方式」。
// ダイジェスト自体は、実行環境が計算する（アプリは expo-crypto。`services/index.ts`）。

/** base64 を base64url（`+` → `-`、`/` → `_`、末尾の `=` を除く）にする。 */
export function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * バイト列を base64url（パディングなし）にする。32バイトなら43字。AndroidのAppleログイン（Web経由）の検証用の値 `V`
 * （乱数）に使う。`btoa` に頼らない（実行環境による差を避ける）。
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64URL_ALPHABET[(chunk >> 18) & 63] + BASE64URL_ALPHABET[(chunk >> 12) & 63];
    if (i + 1 < bytes.length) out += BASE64URL_ALPHABET[(chunk >> 6) & 63];
    if (i + 2 < bytes.length) out += BASE64URL_ALPHABET[chunk & 63];
  }
  return out;
}
