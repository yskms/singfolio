import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createDatabase } from '../db/appDatabase.ts';
import { getDatabase } from '../db/database.ts';
import { createSessionRepository, type SecureStorage } from '../repositories/sessionRepository.ts';
import { base64ToBase64Url } from './base64url.ts';
import { createServices, type Services } from './createServices.ts';

export type { Services } from './createServices.ts';
export {
  AuthError,
  DatabaseTooNewError,
  isTemporaryAuthError,
  ServiceError,
  type AuthErrorCode,
  type ServiceErrorCode,
} from './errors.ts';
export type { ArtistShowView, ShowQuery, ShowView, TitleShowView } from './showService.ts';
export type { NewSongInput, SongInput } from './songService.ts';

// セッションの保存先。Keychainの項目は、この端末の中でだけ使えて（`THIS_DEVICE_ONLY`。バックアップ・
// 端末の引っ越しで別の端末へ移らない。移った先は、ログアウトの状態から始まる）、端末のロックが
// 解けている間だけ読める。expo-secure-store の config plugin は、app.json に足さない（理由は CLAUDE.md）。
const secureStorage: SecureStorage = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

let servicesPromise: Promise<Services> | null = null;

/**
 * 画面が使う Service を返す。初回呼び出し時にDBを開いてマイグレーションを実行し、
 * 以降は同じものを返す。失敗した場合は次の呼び出しで再試行する。
 * （`createDatabase` は接続ごとに1つだけ作る必要があるため、ここで使い回す。）
 */
export function getServices(): Promise<Services> {
  servicesPromise ??= getDatabase({
    // DBを新しく作るとき（初回起動・再インストール）は、保存済みのセッションを捨てる。iOSの
    // Keychainは、アプリを削除しても残りうる（保証はされない）。残ったままだと、ローカルは空なのに
    // セッションだけが生きている。捨てられなければ、起動の失敗にする（次の起動でやり直す）。
    onNewDatabase: () => createSessionRepository(secureStorage).clear(),
  })
    .then((raw) =>
      createServices(
        createDatabase(raw),
        { newId: randomUUID, now: Date.now },
        {
          // 曲名・アーティストの候補の外部検索。ここで渡さなければ無効になる。
          catalogFetch: fetch,
          // アカウントの通信・保存。各社のサインイン（`idTokenProviders`）は 7.3.7 以降で足す。
          // 画面が呼ぶまで、何も送らない。
          auth: {
            fetch,
            storage: secureStorage,
            sha256Base64Url: async (text) =>
              base64ToBase64Url(
                await digestStringAsync(CryptoDigestAlgorithm.SHA256, text, {
                  encoding: CryptoEncoding.BASE64,
                }),
              ),
          },
        },
      ),
    )
    .catch((error) => {
      servicesPromise = null;
      throw error;
    });
  return servicesPromise;
}
