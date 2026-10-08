import { randomUUID } from 'expo-crypto';

import { createDatabase } from '../db/appDatabase.ts';
import { getDatabase } from '../db/database.ts';
import { createServices, type Services } from './createServices.ts';

export type { Services } from './createServices.ts';
export { DatabaseTooNewError, ServiceError, type ServiceErrorCode } from './errors.ts';
export type { NewSongInput, SongInput } from './songService.ts';

let servicesPromise: Promise<Services> | null = null;

/**
 * 画面が使う Service を返す。初回呼び出し時にDBを開いてマイグレーションを実行し、
 * 以降は同じものを返す。失敗した場合は次の呼び出しで再試行する。
 * （`createDatabase` は接続ごとに1つだけ作る必要があるため、ここで使い回す。）
 */
export function getServices(): Promise<Services> {
  servicesPromise ??= getDatabase()
    .then((raw) =>
      createServices(createDatabase(raw), { newId: randomUUID, now: Date.now }),
    )
    .catch((error) => {
      servicesPromise = null;
      throw error;
    });
  return servicesPromise;
}
