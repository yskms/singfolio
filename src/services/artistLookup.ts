import type { WriteExecutor } from '../db/appDatabase.ts';
import type { Artist } from '../domain/types.ts';
import type { ArtistRepository } from '../repositories/artistRepository.ts';
import { ServiceError } from './errors.ts';
import { artistNameKey, normalizeReading, normalizeText } from './text.ts';

/**
 * 名前に対応するアーティストを返す。同じアーティスト（`artistNameKey` が同じ。大文字小文字・
 * 全角半角を区別しない）があればそれを、なければ作る。`tx`（`Database.transaction` の中）で呼ぶ。
 *
 * - 空の名前は `artist-required`。
 * - `reading` を渡すと、既存のアーティストの読みと違うとき、**アーティストの読みを書き換える**
 *   （そのアーティストの全曲に効く）。空は `artist-reading-required`。渡さなければ、既存のアーティスト
 *   の読みはそのまま、新しく作るときは名前を読みにする。
 * - 既存のアーティストの名前は書き換えない（表記の大文字小文字などを変えるのは、Artists 画面）。
 *
 * 曲の保存（`songService`）が、曲の書き込みと同じトランザクションの中で呼ぶ（保存が失敗したとき、
 * 作ったアーティストも残らないように。タグの `findOrCreateTag` と同じ）。
 */
export async function findOrCreateArtist(
  tx: WriteExecutor,
  artists: ArtistRepository,
  input: { name: string; reading?: string },
): Promise<Artist> {
  const name = normalizeText(input.name);
  if (name === '') throw new ServiceError('artist-required');
  const reading = input.reading === undefined ? undefined : normalizeReading(input.reading);
  if (reading === '') throw new ServiceError('artist-reading-required');

  const key = artistNameKey(name);
  const existing = (await artists.list(tx)).find((artist) => artistNameKey(artist.name) === key);
  if (!existing) {
    return artists.insert(tx, { name, reading: reading ?? (normalizeReading(name) || name) });
  }
  if (reading === undefined || reading === existing.reading) return existing;
  await artists.update(tx, existing.id, { name: existing.name, reading });
  return { ...existing, reading };
}
