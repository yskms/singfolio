// Apple・GoogleのIDトークンの検証。方式は docs/singfolio-publishing-backend.md §8「IDトークンの検証」。
//
// 署名・`iss`・`aud`・`exp` の検証は jose（`jwtVerify`）に任せ、ここで持つのは、公開鍵（JWKS）の取得と
// キャッシュ、jose が既定では見ない点（`exp` と `sub` の必須化、`nonce`）、失敗の分類だけ。
//
// 結果にも、例外にも、トークンの全文とクレームの値（`email`・`name` など）を載せない。返すのは `sub` だけ
// （jose の `JWTClaimValidationFailed` は `payload` を持つので、捕まえたら理由だけを取り出して捨てる）。
import { createLocalJWKSet, errors, jwtVerify, type JWSHeaderParameters } from 'jose';
import type { NonceKind } from './nonce.ts';

export type IdTokenProvider = 'apple' | 'google';

export interface ProviderSettings {
  /** `iss` として受け付ける値。Googleは2通りの表記を使う。 */
  issuers: readonly string[];
  jwksUrl: string;
}

export const PROVIDERS: Readonly<Record<IdTokenProvider, ProviderSettings>> = {
  apple: { issuers: ['https://appleid.apple.com'], jwksUrl: 'https://appleid.apple.com/auth/keys' },
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  },
};

// 失敗の理由。呼び出し側（ログインのエンドポイント）は、`unavailable` だけを503にし、残りは同じ401にする
// （どの検査で落ちたかを、呼んだ側に教えない）。
export type IdTokenFailure =
  | 'malformed' // トークンの形が不正・許可していない `alg`・大きすぎる
  | 'signature' // 署名が合わない
  | 'unknown_key' // `kid` に合う公開鍵が無い（鍵を取り直しても）
  | 'issuer'
  | 'audience'
  | 'expired'
  | 'claims' // `sub`・`exp` などの欠落や不正（`nbf` が先の時刻、など）
  | 'nonce'
  | 'unavailable'; // 公開鍵を取得できず、使える古い鍵も無い（トークンの問題ではない）

export type IdTokenResult = { ok: true; sub: string } | { ok: false; reason: IdTokenFailure };

// 公開鍵の取り扱い（時間はミリ秒）。
// - FRESH: この間は取り直さない。AppleとGoogleは鍵を入れ替えるが、古い鍵もしばらく残す。
// - STALE: 取り直しに失敗しても、取得から（FRESH を超えて）この時間までは、前の鍵で検証を続ける。
//   それを超えたら、古すぎる鍵は使わず `unavailable` にする。
// - COOLDOWN: 取得を試みてから、この間は次の取得を試みない（失敗した試みも数える）。知らない `kid` を付けた
//   偽のトークンや、落ちている発行元への取得の連打で、外部への呼び出しが増えないようにする（認証の要らない経路
//   なので）。鍵を一度も取れていない間（isolateの起動直後に発行元が落ちている）も同じで、冷却の間は、取りに行かず
//   すぐ `unavailable` にする（毎回取りに行くと、そのたびに最大5秒待つ）。
export const JWKS_FRESH_MS = 60 * 60 * 1000;
export const JWKS_STALE_MS = 24 * 60 * 60 * 1000;
export const JWKS_COOLDOWN_MS = 60 * 1000;
const JWKS_TIMEOUT_MS = 5000;

// 発行元と、このWorkerの時計のずれを許す秒数（`exp`・`nbf`）。
const CLOCK_TOLERANCE_SECONDS = 30;
// 実際のIDトークンは1〜2KB。
const MAX_TOKEN_LENGTH = 8192;
// Googleの `sub` は最大255字。Appleは約44字。
const MAX_SUB_LENGTH = 255;

export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

type LocalKeys = ReturnType<typeof createLocalJWKSet>;

interface CachedKeys {
  keys: LocalKeys;
  /** 取得に成功した時刻。 */
  fetchedAt: number;
}

// 公開鍵が使えないこと。IDトークンの問題ではないので、`unavailable` に分類する。
class KeysUnavailable extends Error {}

export interface VerifyIdTokenInput {
  provider: IdTokenProvider;
  idToken: string;
  /** 受け付ける `aud`。呼び出し側が、`audienceFor` で決める。 */
  audience: string;
  /** IDトークンの `nonce` が一致するべき値（SHA-256(T) の base64url。`verifyNonce` の `nonceHash`）。 */
  nonce: string;
  /** 現在時刻（ミリ秒）。 */
  now: number;
}

export interface IdTokenVerifier {
  verify(input: VerifyIdTokenInput): Promise<IdTokenResult>;
}

/**
 * 公開鍵のキャッシュを持つ検証器を作る。キャッシュは、この検証器の中（メモリ）だけにある。
 * Workerでは、モジュールで1つ作って、同じisolateの間は使い回す（`getIdTokenVerifier`）。
 *
 * リクエストをまたいで取得の Promise を共有しない（同時の取得を1つにまとめない）。workerd は、別の
 * リクエストの入出力（fetch の応答など）を待つことを許さない。共有するのは、取得し終えた鍵（ただのデータ）だけ。
 * jose の `createRemoteJWKSet` を使わないのは、取得に失敗したとき、前の鍵に落ちられないため。
 */
export function createIdTokenVerifier(
  options: { fetch?: FetchFunction; providers?: Readonly<Record<IdTokenProvider, ProviderSettings>> } = {},
): IdTokenVerifier {
  const fetchFunction: FetchFunction = options.fetch ?? ((url, init) => fetch(url, init));
  const providers = options.providers ?? PROVIDERS;
  const cache = new Map<IdTokenProvider, CachedKeys>();
  // 最後に取得を試みた時刻（失敗を含む）。鍵が無くても持つ（冷却のため）。取得の完了のあとに書く
  // （試みの最中に書くと、同時に来た別のリクエストが、取得の途中なのに `unavailable` になる）。
  // 同時の取得が前後して終わると、少し古い時刻が残りうるが、冷却が数秒ずれるだけなので、後勝ちにする。
  const attemptedAt = new Map<IdTokenProvider, number>();
  // 取得を始めた順番。遅れて終わった取得が、あとから始めた取得の鍵を上書きしないために使う。
  // 時刻（`now`）で比べない: 時計が戻ったとき、新しい鍵がいつまでも保存されなくなる。
  let fetchCount = 0;
  const appliedFetch = new Map<IdTokenProvider, number>();

  async function fetchKeys(provider: IdTokenProvider, now: number): Promise<CachedKeys> {
    const response = await fetchFunction(providers[provider].jwksUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      // リダイレクトには従わない（200以外は失敗）。
      redirect: 'manual',
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (response.status !== 200) throw new Error('unexpected status');
    // 形が不正なら、ここで例外になる（前の鍵を捨てない）。
    const keys = createLocalJWKSet(await response.json());
    return { keys, fetchedAt: now };
  }

  // 取得し直す。失敗したら、使える前の鍵があればそれを返し、無ければ例外にする。成功も失敗も、試みた時刻を残す。
  async function refresh(provider: IdTokenProvider, previous: CachedKeys | undefined, now: number): Promise<CachedKeys> {
    const ticket = ++fetchCount;
    let next: CachedKeys | undefined;
    try {
      next = await fetchKeys(provider, now);
    } catch {
      next = undefined;
    }
    attemptedAt.set(provider, now);
    if (next !== undefined) {
      // あとから始めた取得がすでに反映されていたら、遅れて終わったこの結果では上書きしない（このリクエストは、
      // 自分が取った鍵をそのまま使う）。失敗した取得は反映の順番を進めないので、先に始めた取得の成功は捨てない。
      if (ticket > (appliedFetch.get(provider) ?? 0)) {
        appliedFetch.set(provider, ticket);
        cache.set(provider, next);
      }
      return next;
    }
    if (previous === undefined) throw new KeysUnavailable();
    return previous;
  }

  async function resolveKey(
    provider: IdTokenProvider,
    header: JWSHeaderParameters,
    now: number,
  ): ReturnType<LocalKeys> {
    // `kid` を必須にする。無いと、jose は「合う鍵が1本だけ」のときに、その鍵で検証してしまう（鍵の本数で挙動が変わる）。
    // 鍵の取得より前に弾く（認証の要らない経路で、`kid` の無い偽のトークンに外部への取得を使わせない）。
    if (typeof header.kid !== 'string' || header.kid === '') throw new errors.JWSInvalid('missing kid');

    let cached = cache.get(provider);
    // 取得を試みたことが無い、または前の試みから冷却の時間がたっている。
    const cooledDown = () => {
      const attempted = attemptedAt.get(provider);
      return attempted === undefined || now - attempted >= JWKS_COOLDOWN_MS;
    };

    if (cached === undefined) {
      // 鍵を一度も取れていない。冷却の間は、取りに行かない（取りに行くと、落ちている発行元を毎回5秒待つ）。
      if (!cooledDown()) throw new KeysUnavailable();
      cached = await refresh(provider, undefined, now);
    } else if (now - cached.fetchedAt >= JWKS_FRESH_MS && cooledDown()) {
      // 古いときは、冷却が済んでいれば取り直す。
      cached = await refresh(provider, cached, now);
    }
    if (now - cached.fetchedAt >= JWKS_FRESH_MS + JWKS_STALE_MS) throw new KeysUnavailable();

    try {
      return await cached.keys(header);
    } catch (error) {
      // 知らない `kid` は、鍵が入れ替わったのかもしれないので、冷却が済んでいれば1回だけ取り直す。
      if (!(error instanceof errors.JWKSNoMatchingKey) || !cooledDown()) throw error;
    }
    cached = await refresh(provider, cached, now);
    return cached.keys(header);
  }

  return {
    async verify({ provider, idToken, audience, nonce, now }) {
      if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH) {
        return { ok: false, reason: 'malformed' };
      }
      let payload;
      try {
        ({ payload } = await jwtVerify(idToken, (header) => resolveKey(provider, header, now), {
          // AppleもGoogleもRS256。許可を絞って、`none` や、公開鍵を共通鍵として使う `HS256` を拒否する。
          algorithms: ['RS256'],
          issuer: [...providers[provider].issuers],
          audience,
          // jose は、`exp` が無いトークンを（期限なしとして）通す。`iss`・`aud` は、検証の指定で必須になる。
          requiredClaims: ['exp', 'sub'],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          currentDate: new Date(now),
        }));
      } catch (error) {
        return { ok: false, reason: classify(error) };
      }

      const { sub } = payload;
      if (typeof sub !== 'string' || sub === '' || sub.length > MAX_SUB_LENGTH) return { ok: false, reason: 'claims' };
      // AppleもGoogleも `nonce` をそのまま返す（Appleは実機で確かめる。7.3.7）。ハッシュされて返るなら、
      // ここで同じ処理をして比べる。無い・文字列でない場合も拒否する（`nonce_supported` が偽のときなど）。
      if (typeof payload.nonce !== 'string' || payload.nonce !== nonce) return { ok: false, reason: 'nonce' };
      return { ok: true, sub };
    },
  };
}

// joseの例外を、理由だけに落とす。例外（`payload` にクレームが入っている）は、ここで捨てる。
// 想定外の例外（バグ）は、検証の失敗に見せかけず、そのまま投げる。
function classify(error: unknown): IdTokenFailure {
  if (error instanceof KeysUnavailable) return 'unavailable';
  if (error instanceof errors.JWTExpired) return 'expired';
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === 'iss') return 'issuer';
    if (error.claim === 'aud') return 'audience';
    return 'claims';
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'signature';
  if (error instanceof errors.JWKSNoMatchingKey) return 'unknown_key';
  if (error instanceof errors.JOSEError) return 'malformed';
  throw error;
}

let shared: IdTokenVerifier | undefined;

/** Workerが使う検証器（公開鍵のキャッシュを、同じisolateの間で共有する）。 */
export function getIdTokenVerifier(): IdTokenVerifier {
  return (shared ??= createIdTokenVerifier());
}

/**
 * `T` の種別とログイン手段から、受け付ける `aud` を決める。無い組み合わせは null（拒否する）。
 * - Apple（iOSのネイティブ）: アプリのバンドルID。
 * - Apple（AndroidのWeb経由）: Services ID。
 * - Google（iOS・Android）: サーバー用（Web）のクライアントID。両OSとも、`aud` はこれになる。
 * 種別ごとに1つへ絞る（両方を受け入れない）。取り違えた `T` とトークンの組み合わせを通さないため。
 */
export function audienceFor(
  // `Env` の vars はリテラル型になるので、string で受ける（テストで別の値を渡せるように）。
  env: { APPLE_BUNDLE_ID: string; APPLE_SERVICES_ID: string; GOOGLE_WEB_CLIENT_ID: string },
  provider: IdTokenProvider,
  kind: NonceKind,
): string | null {
  if (provider === 'apple') return kind === 'native' ? env.APPLE_BUNDLE_ID : env.APPLE_SERVICES_ID;
  return kind === 'native' ? env.GOOGLE_WEB_CLIENT_ID : null;
}
