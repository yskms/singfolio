import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { signInWithGoogle } from '../../modules/singfolio-google-signin/index.ts';
import { createDatabase } from '../db/appDatabase.ts';
import { getDatabase } from '../db/database.ts';
import { createAppleSignInRepository } from '../repositories/appleSignInRepository.ts';
import { createGoogleSignInRepository } from '../repositories/googleSignInRepository.ts';
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
    // Keychainは、アプリを削除しても残りうる（保証はされない）。**後始末で、失敗しても起動を止めない**
    // （ログインを要求しないので、SecureStoreの不調で、v1.0の機能まで使えなくしない）。残ったセッションは、
    // ローカルDBの識別子が合わないので、サインイン中として扱われない（`accountService`）。
    onNewDatabase: async () => {
      try {
        await createSessionRepository(secureStorage).clear();
      } catch {
        // 握りつぶす。ここに依存して、セッションが生きないようにはしていない
      }
    },
  })
    .then((raw) =>
      createServices(
        createDatabase(raw),
        { newId: randomUUID, now: Date.now },
        {
          // 曲名・アーティストの候補の外部検索。ここで渡さなければ無効になる。
          catalogFetch: fetch,
          // アカウントの通信・保存と、各社のサインイン（`idTokenProviders`）。画面が呼ぶまで、何も送らない。
          // Appleのネイティブのサインインは iOS だけ（AndroidのAppleは Web 経由。7.3.9）。Googleは両OS
          // （自作のExpoモジュール。ネイティブ側が無いビルドでも、importでは落ちず、呼んだときに失敗する）。
          auth: {
            idTokenProviders: {
              google: createGoogleSignInRepository({ signInWithGoogle }),
              ...(Platform.OS === 'ios' ? { apple: createAppleSignInRepository(AppleAuthentication) } : {}),
            },
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
