import type { Database } from '../db/appDatabase.ts';
import type { Artist, ArtistSummary } from '../domain/types.ts';
import type { ArtistRepository } from '../repositories/artistRepository.ts';
import { ServiceError } from './errors.ts';
import { artistNameKey, normalizeReading, normalizeText, sortKey } from './text.ts';

export interface ArtistServiceDeps {
  db: Database;
  artists: ArtistRepository;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// 書き込みは必ず `db.transaction` の中で行う（理由は db/appDatabase.ts）。
// 重複の確認から保存までが他の書き込みに割り込まれないのも、これによる。
export function createArtistService({ db, artists }: ArtistServiceDeps) {
  return {
    /**
     * 全アーティストを、読みの五十音順（`sortKey`）に返す。同順位は、名前・IDの順。曲が1つも無い
     * アーティストは無い（曲が無くなると自動で消える）ので、`songCount` は1以上。
     */
    async listArtists(): Promise<ArtistSummary[]> {
      const list = await artists.list(db);
      const keyed = list.map((artist) => ({
        artist,
        reading: sortKey(artist.reading),
        name: sortKey(artist.name),
      }));
      keyed.sort(
        (a, b) =>
          compareText(a.reading, b.reading) ||
          compareText(a.name, b.name) ||
          compareText(a.artist.id, b.artist.id),
      );
      return keyed.map(({ artist }) => artist);
    },

    /**
     * 名前と読みを変える（Artists 画面）。そのアーティストの全曲に効く。曲の `updatedAt` は
     * 変わらない。
     * - 空の名前は `artist-name-required`、空の読みは `artist-reading-required`。
     * - 別のアーティストと同じ名前（大文字小文字・全角半角を区別しない）は `artist-name-duplicate`。
     *   大文字小文字だけを変える（`queen` → `Queen`）のは、重複にならない。
     * - 存在しないIDは `artist-not-found`。
     * 読みの言語ごとの規則（日本語は、かなだけ）は、画面が `readingProblem` で確認する。
     */
    async updateArtist(id: string, input: { name: string; reading: string }): Promise<Artist> {
      const name = normalizeText(input.name);
      if (name === '') throw new ServiceError('artist-name-required');
      const reading = normalizeReading(input.reading);
      if (reading === '') throw new ServiceError('artist-reading-required');

      return db.transaction(async (tx) => {
        const current = await artists.get(tx, id);
        if (!current) throw new ServiceError('artist-not-found');

        const key = artistNameKey(name);
        const duplicate = (await artists.list(tx)).some(
          (artist) => artist.id !== id && artistNameKey(artist.name) === key,
        );
        if (duplicate) throw new ServiceError('artist-name-duplicate');

        if (name === current.name && reading === current.reading) return current;
        await artists.update(tx, id, { name, reading });
        return { ...current, name, reading };
      });
    },
  };
}

export type ArtistService = ReturnType<typeof createArtistService>;
