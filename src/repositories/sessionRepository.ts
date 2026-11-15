// セッション（`POST /auth/login` が返す不透明な値）の端末内の保存先。SecureStore（iOSはKeychain、Androidは
// Keystoreで暗号化）にだけ置く。SQLite（ローカルDB）・settings・ログには置かない。
//
// 保存するのは、セッションの値と、どのログイン手段で入ったか（アカウントの削除の再認証と、画面の表示に
// 要る）。ユーザーID・メール・名前は端末に持たない（サーバーもクライアントから受け取らない）。
//
// `SecureStorage` は注入する（`services/index.ts` が expo-secure-store を渡す）。Nodeのテストは
// メモリ上の偽物で動かす。
import { isAuthProvider, type AuthProvider } from '../domain/types.ts';

/** expo-secure-store のうち、ここで使う部分。 */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface StoredSession {
  /** セッションの値（不透明。`Authorization: Bearer` で送る。画面・ログに出さない） */
  session: string;
  provider: AuthProvider;
}

// SecureStore のキーは、英数字と `.`・`-`・`_` だけ。
const SESSION_KEY = 'singfolio.session';
/** 保存する形の版。読めない版（将来のアプリが保存したものなど）は、サインインしていない扱い。 */
const FORMAT_VERSION = 1;

function parse(raw: string): StoredSession | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { v, session, provider } = data as Record<string, unknown>;
  if (v !== FORMAT_VERSION) return null;
  if (typeof session !== 'string' || session === '' || !isAuthProvider(provider)) return null;
  return { session, provider };
}

export function createSessionRepository(storage: SecureStorage) {
  return {
    /**
     * 保存したセッション。無い・読めない・形が違うときは `null`（サインインしていない扱い）。
     * 読み取りの失敗（端末がロック中、Androidで鍵が失われた、など）も `null` にして、投げない:
     * 読めないことは「サインインしていない」と同じにしか扱えず、v1.0の機能を止める理由にならない。
     * 読めない値は消さない（一時的な失敗かもしれない）。次の `set` で上書きされる。
     */
    async get(): Promise<StoredSession | null> {
      let raw: string | null;
      try {
        raw = await storage.getItemAsync(SESSION_KEY);
      } catch {
        return null;
      }
      return raw === null ? null : parse(raw);
    },

    /** 保存する（上書き）。失敗したら投げる。 */
    async set(value: StoredSession): Promise<void> {
      await storage.setItemAsync(
        SESSION_KEY,
        JSON.stringify({ v: FORMAT_VERSION, session: value.session, provider: value.provider }),
      );
    },

    /** 消す。無くても成功。失敗したら投げる（消せていないことを黙って見逃さない）。 */
    async clear(): Promise<void> {
      await storage.deleteItemAsync(SESSION_KEY);
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
