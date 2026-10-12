import type { ArtistGroup, ShowSong, ShowTag, Tag } from '../domain/types.ts';
import type { SongService } from './songService.ts';
import type { TagService } from './tagService.ts';

export interface ShowServiceDeps {
  songs: SongService;
  tags: TagService;
}

/** Show Mode の絞り込み。どちらも、Readyの曲の中での絞り込み。 */
export interface ShowQuery {
  /** 曲名またはアーティストに含まれる文字列（`songs.listSongs` の `search` と同じ） */
  search?: string;
  /** このタグが付いた曲だけ（1つのみ） */
  tagId?: string;
}

export interface ShowView {
  /** Readyの曲の総数（`query` に関係なく） */
  readyCount: number;
  /**
   * 絞り込みに使えるタグ。Readyの曲に付いているタグだけ（名前の昇順）。曲が付いていないタグや、
   * Ready以外の曲にだけ付いたタグは出さない（選んでも何も出ず、人に見せる画面に、見せない曲の
   * 手がかりも出る）。
   */
  tags: ShowTag[];
  /** 絞り込んだ曲を、アーティスト別にまとめたもの。アーティストの昇順、曲は曲名の昇順 */
  groups: ArtistGroup[];
}

/**
 * Show Mode（人に見せる、閲覧専用の画面）のためのService。Readyの曲だけを、管理用の情報
 * （My Key・Private Note・ステータス）を持たない形（`ShowSong`）で返す。Show Modeの画面は
 * `songs` ではなく、こちらを使う（画面が管理情報に触れないようにする。docs/singfolio-screen-flow.md
 * 「Show Mode」）。読み取りだけで、書き込まない。
 */
// `Tag` から、人に見せる項目だけを取り出す（`{ ...tag }` や `Pick` の型だけでは、余分な項目が実行時に
// 残る）。
function toShowTag(tag: Tag): ShowTag {
  return { id: tag.id, name: tag.name };
}

export function createShowService({ songs, tags }: ShowServiceDeps) {
  return {
    async getShowView(query: ShowQuery = {}): Promise<ShowView> {
      // アーティスト順・曲名順に読む（並びは Songs の「アーティスト順」と同じ。日本語は読み順に
      // ならない。docs/singfolio-data-model.md「曲の一覧」）。
      const base = { status: 'ready', sortBy: 'artist', direction: 'asc' } as const;
      const [ready, shown, allTags] = await Promise.all([
        songs.listSongs(base),
        // Ready以外を返さないよう、`query` の他の項目（型の外から来た `status` など）は渡さない。
        songs.listSongs({ search: query.search, tagId: query.tagId, ...base }),
        tags.listTags(),
      ]);

      const used = new Set(ready.flatMap((song) => song.tags.map((tag) => tag.id)));

      // アーティストは、登録された表記のまま（`MR.CHILDREN` と `Mr.Children` は別の見出しになる）。
      // 読んだ並びでは、同じアーティストの曲が間に別の表記の曲を挟んで並びうる（大文字小文字を
      // 区別しない並びのため）ので、隣り合う曲をまとめるのではなく、アーティストごとに集める
      // （見出しの位置は、最初の曲の位置）。
      const groups = new Map<string, ShowSong[]>();
      for (const song of shown) {
        const entry: ShowSong = { id: song.id, title: song.title, tags: song.tags.map(toShowTag) };
        const group = groups.get(song.artist);
        if (group) group.push(entry);
        else groups.set(song.artist, [entry]);
      }

      return {
        readyCount: ready.length,
        tags: allTags.filter((tag) => used.has(tag.id)).map(toShowTag),
        groups: [...groups].map(([artist, groupSongs]) => ({ artist, songs: groupSongs })),
      };
    },
  };
}

export type ShowService = ReturnType<typeof createShowService>;
