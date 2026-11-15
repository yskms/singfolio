// セッション（`POST /auth/login` が返す不透明な値）の端末内の保存先。SecureStore（iOSはKeychain、Androidは
// Keystoreで暗号化）にだけ置く。SQLite（ローカルDB）・settings・ログには置かない。
//
// 保存するのは、セッションの値と、どのログイン手段で入ったか（アカウントの削除の再認証と、画面の表示に
// 要る）と、**ローカルDBの識別子**（`settings.local_data_id`）。ユーザーID・メール・名前は端末に持たない
// （サーバーもクライアントから受け取らない）。識別子を一緒に置くのは、このセッションが、今のローカルDBに
// 属するかを確かめるため（`accountService`。iOSのKeychainは、アプリを削除しても残りうるので、再インストール
// のあと、ローカルは空なのにセッションだけが生きている状態を作らない）。
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
  /** 保存したときの、ローカルDBの識別子（`settings.local_data_id`） */
  localDataId: string;
}

/**
 * 保存先の読み取りの結果。`none`（項目が無い）と `unreadable`（読み取りに失敗した、壊れている、知らない版）を
 * 区別する。どちらも「サインインしていない」扱いだが、`unreadable` は、値が残っていてサーバーのセッションも
 * 生きているかもしれない（ログアウトで、失効を確認できたと言ってはいけない）。
 */
export type SessionRead =
  | { kind: 'none' }
  | { kind: 'unreadable' }
  | { kind: 'found'; value: StoredSession };

// SecureStore のキーは、英数字と `.`・`-`・`_` だけ。
const SESSION_KEY = 'singfolio.session';
/** 保存する形の版。読めない版（将来のアプリが保存したものなど）は `unreadable`。 */
const FORMAT_VERSION = 1;

function parse(raw: string): StoredSession | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { v, session, provider, localDataId } = data as Record<string, unknown>;
  if (v !== FORMAT_VERSION) return null;
  if (typeof session !== 'string' || session === '' || !isAuthProvider(provider)) return null;
  if (typeof localDataId !== 'string' || localDataId === '') return null;
  return { session, provider, localDataId };
}

export function createSessionRepository(storage: SecureStorage) {
  return {
    /**
     * 保存したセッション。読み取りの失敗（端末がロック中、Androidで鍵が失われた、など）も、壊れた値・知らない版も、
     * 投げずに `unreadable`（読めないことは、v1.0の機能を止める理由にならない）。読めない値は消さない
     * （一時的な失敗かもしれない）。次の `set` で上書きされる。
     */
    async read(): Promise<SessionRead> {
      let raw: string | null;
      try {
        raw = await storage.getItemAsync(SESSION_KEY);
      } catch {
        return { kind: 'unreadable' };
      }
      if (raw === null) return { kind: 'none' };
      const value = parse(raw);
      return value ? { kind: 'found', value } : { kind: 'unreadable' };
    },

    /** 保存する（上書き）。失敗したら投げる。 */
    async set(value: StoredSession): Promise<void> {
      await storage.setItemAsync(
        SESSION_KEY,
        JSON.stringify({
          v: FORMAT_VERSION,
          session: value.session,
          provider: value.provider,
          localDataId: value.localDataId,
        }),
      );
    },

    /**
     * 消す。無くても成功。消せていなければ投げる（黙って見逃さない）。iOSの `deleteItemAsync` は、Keychainの
     * 削除の結果を捨てて、失敗しても投げない（expo-secure-store のソース）。そこで、消したあとに読んで、
     * 残っていれば失敗にする。**読み戻しの失敗も投げる**（残っていないと確かめられない）。ログアウトが、
     * 端末の値が消えたことを保証するため。
     */
    async clear(): Promise<void> {
      await storage.deleteItemAsync(SESSION_KEY);
      if ((await storage.getItemAsync(SESSION_KEY)) !== null) {
        throw new Error('The stored session could not be removed');
      }
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
