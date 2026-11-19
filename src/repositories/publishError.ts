// 公開（Public Profile・Publish・Unpublish）の失敗のうち、**サーバーが理由を返して断ったもの**と、アプリ側の前提の不備。
// 通信の失敗（`network`・`unavailable`・`unauthorized`・`invalid-response`）は、アカウントと同じ `AuthError`
// （`accountService` の `withSession` が、401 のときだけ端末のセッションを捨てるのは、`AuthError` の `unauthorized` を見るため）。
// 失敗の種類は `message` ではなく `code` で区別する（`message` はログ用の英語。曲名などの値は載せない）。
import type { PublicProfile } from '../domain/types.ts';

export type PublishErrorCode =
  /** `username` を確保していない（Publish より前に確保する） */
  | 'username-required'
  /** `username` の形が規則に合わない（小文字の英数字と `_` の3〜20字） */
  | 'username-invalid'
  /** `username` が使えない（取られている・削除したアカウントの名前・予約語。理由は区別されない） */
  | 'username-unavailable'
  /** このアカウントは、すでに別の `username` を確保している（変更できない） */
  | 'username-already-set'
  /**
   * 版が食い違う（別の端末が Publish した、または非公開にした。再インストール後の空のローカルからの Publish を含む）。
   * `profile` が今の公開内容。置き換えるなら、その `version` を `baseVersion` にして送り直す
   */
  | 'version-conflict'
  /** Display Name が空（公開には要る） */
  | 'display-name-required'
  /** 公開する曲が上限（`PUBLISH_LIMITS.songs`）を超えている。Publishを断る */
  | 'too-many-songs'
  /** サーバーがスナップショットの検証で断った（アプリの組み立ての不具合。値は載せない） */
  | 'invalid-snapshot'
  /** 本文が大きすぎて断られた（曲数の上限の範囲でも、長い文字列が多いとき） */
  | 'too-large';

export class PublishError extends Error {
  readonly code: PublishErrorCode;
  /** `version-conflict` のときだけ: サーバーの今の公開内容 */
  readonly profile?: PublicProfile;
  /** `too-many-songs` のときだけ: 公開しようとした曲の数 */
  readonly songCount?: number;

  constructor(code: PublishErrorCode, extra: { profile?: PublicProfile; songCount?: number } = {}) {
    super(code);
    this.name = 'PublishError';
    this.code = code;
    if (extra.profile !== undefined) this.profile = extra.profile;
    if (extra.songCount !== undefined) this.songCount = extra.songCount;
  }
}
