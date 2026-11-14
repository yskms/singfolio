// nonce の元になる値 T の発行・検証と、使用済みの記録。方式は
// docs/singfolio-publishing-backend.md §8「認証の方式」の「nonce（リプレイ対策）」。
//
// 発行は無状態で、D1に書かない（認証の要らないエンドポイントが書き込むと、Freeの書き込みの上限
// 10万行/日を使い切られる）。D1に書くのは、検証が通ったあとの `consumeNonce` だけ。

export type NonceKind = 'native' | 'web';

// 数分。Apple・Googleのアカウント選択の画面で待たれても足りて、盗まれた値の寿命は短い長さ。
export const NONCE_TTL_MS = 5 * 60 * 1000;

const VERSION = 'v1';
const encoder = new TextEncoder();

// 形式: `v1.<kind>.<expiresAt>.<random>.<challenge>.<signature>`（`.` 区切りの6つ）。
// `challenge` は `web` のときだけ入る（`native` は空）。signature は、先頭から challenge までの
// 文字列の HMAC-SHA256。値はすべて base64url か数字なので、`.` を含まない。
const SIGNED_PARTS = 5;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** アプリがIDトークンの `nonce` に渡す値と同じ、SHA-256(T) の base64url（43字）。 */
export async function nonceHash(nonce: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(nonce))));
}

// `web` で受け取る検証用の値のハッシュ C（SHA-256 の base64url。43字）。
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isChallenge(value: unknown): value is string {
  return typeof value === 'string' && CHALLENGE_PATTERN.test(value);
}

export interface IssuedNonce {
  nonce: string;
  expiresAt: number;
}

export async function issueNonce(
  secret: string,
  input: { kind: 'native' } | { kind: 'web'; challenge: string },
  now: number,
): Promise<IssuedNonce> {
  const challenge = input.kind === 'web' ? input.challenge : '';
  if (input.kind === 'web' && !isChallenge(challenge)) {
    throw new Error('challenge must be a 43-character base64url string');
  }
  const expiresAt = now + NONCE_TTL_MS;
  const random = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = [VERSION, input.kind, String(expiresAt), random, challenge].join('.');
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(payload));
  return { nonce: `${payload}.${toBase64Url(new Uint8Array(signature))}`, expiresAt };
}

export type NonceFailure = 'malformed' | 'signature' | 'kind' | 'expired';

export type VerifiedNonce =
  | { ok: true; nonceHash: string; expiresAt: number; challenge: string | null }
  | { ok: false; reason: NonceFailure };

// 署名 → 種別 → 期限の順に確かめる。D1には触れない（使用済みにするのは、IDトークンの `nonce` との
// 一致まで確かめたあとの `consumeNonce`）。種別が違う T は、署名が正しくても受け付けない
// （`native` の T は C を含まず、`web` のフローで `V` の照合が飛ばされるため）。
export async function verifyNonce(
  secret: string,
  nonce: string,
  expectedKind: NonceKind,
  now: number,
): Promise<VerifiedNonce> {
  if (nonce.length > 512) return { ok: false, reason: 'malformed' };
  const parts = nonce.split('.');
  if (parts.length !== SIGNED_PARTS + 1) return { ok: false, reason: 'malformed' };
  const [version, kind, expires, random, challenge, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION) return { ok: false, reason: 'malformed' };
  if (kind !== 'native' && kind !== 'web') return { ok: false, reason: 'malformed' };
  if (!/^[0-9]{1,16}$/.test(expires)) return { ok: false, reason: 'malformed' };
  if (!/^[A-Za-z0-9_-]{22}$/.test(random)) return { ok: false, reason: 'malformed' };
  if (kind === 'web' ? !isChallenge(challenge) : challenge !== '') return { ok: false, reason: 'malformed' };
  const signatureBytes = fromBase64Url(signature);
  if (signatureBytes === null) return { ok: false, reason: 'malformed' };
  // 署名は32バイト = 43字で、最後の字の下位2ビットは余り。末尾を「上位4ビットが同じ別の字」に変えた
  // 文字列も、同じバイト列に復号されて検証が通ってしまう。1つの T を表す文字列を1通りに保つため、
  // 再エンコードして一致しないもの（正規の形でないもの）は拒否する。
  if (toBase64Url(signatureBytes) !== signature) return { ok: false, reason: 'signature' };

  const payload = parts.slice(0, SIGNED_PARTS).join('.');
  // verify は、一定時間で比べる。
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signatureBytes, encoder.encode(payload));
  if (!valid) return { ok: false, reason: 'signature' };
  if (kind !== expectedKind) return { ok: false, reason: 'kind' };
  const expiresAt = Number(expires);
  if (now >= expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true, nonceHash: await nonceHash(nonce), expiresAt, challenge: kind === 'web' ? challenge : null };
}

/**
 * 使用済みとして記録する。初めてなら true、2回目以降（リプレイ）なら false。
 * 呼ぶのは、`verifyNonce` が通り、IDトークンの `nonce` が `nonceHash` と一致したことまで確かめたあと。
 * 期限を過ぎた記録は、同じバッチの中で消す（Cron Triggerは使わない）。期限切れのTは `verifyNonce` が
 * 弾くので、消しても、リプレイを許すことにはならない。
 */
export async function consumeNonce(db: D1Database, hash: string, expiresAt: number, now: number): Promise<boolean> {
  const [, insert] = await db.batch([
    db.prepare('DELETE FROM used_nonces WHERE expires_at < ?').bind(now),
    db
      .prepare('INSERT INTO used_nonces (nonce_hash, expires_at) VALUES (?, ?) ON CONFLICT (nonce_hash) DO NOTHING')
      .bind(hash, expiresAt),
  ]);
  return insert!.meta.changes === 1;
}
