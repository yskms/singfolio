// Apple の `client_secret`（ES256 の JWT）を作る。AndroidのAppleログイン（Web経由）で、認可コードを
// `https://appleid.apple.com/auth/token` で交換するときに要る。方式は
// docs/singfolio-publishing-backend.md §8「アカウントの削除とAppleのトークン失効」「AndroidのAppleログイン（Web経由）」。
//
// 秘密鍵（`APPLE_PRIVATE_KEY`。.p8 の中身）は、Workerの秘密情報。リクエストごとに署名する（ES256 の署名は軽く、
// キャッシュは持たない）。鍵・JWT の全文は、エラーにもログにも出さない。
import { importPKCS8, SignJWT } from 'jose';

// `exp` は短く取る（Appleは最大6か月先まで許す。リクエストごとに作るので、数分で足りる）。
export const CLIENT_SECRET_TTL_SECONDS = 5 * 60;
const APPLE_AUDIENCE = 'https://appleid.apple.com';

export interface AppleClientSecretConfig {
  /** Apple の Team ID（10文字） */
  teamId: string;
  /** Sign in with Apple の鍵の Key ID（10文字） */
  keyId: string;
  /** `sub` になる。トークンの交換では、`client_id`（Services ID）と同じ値。 */
  clientId: string;
  /** .p8 の中身（PKCS#8 の PEM）。改行が `\n` の2文字で渡されても読む（.dev.vars の1行表記） */
  privateKey: string;
}

/** 設定が足りない・鍵が読めないときの例外（秘密情報の設定の不備。呼び出し側は、投げたままにする）。 */
export class AppleClientSecretConfigError extends Error {}

export async function createAppleClientSecret(config: AppleClientSecretConfig, now: number): Promise<string> {
  const { teamId, keyId, clientId, privateKey } = config;
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    throw new AppleClientSecretConfigError('APPLE_PRIVATE_KEY is missing');
  }
  let key;
  try {
    key = await importPKCS8(privateKey.replace(/\\n/g, '\n').trim(), 'ES256');
  } catch {
    // 例外には、鍵の内容は入らないが、元の例外は載せない。
    throw new AppleClientSecretConfigError('APPLE_PRIVATE_KEY is not a PKCS#8 EC (P-256) private key');
  }
  const issuedAt = Math.floor(now / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CLIENT_SECRET_TTL_SECONDS)
    .sign(key);
}
