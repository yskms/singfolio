// Repositoryが、IDと時刻を作るために使う。テストで差し替えられるよう注入する。
export interface RepositoryEnv {
  /** 新しいUUIDを返す */
  newId(): string;
  /** 現在時刻（Unixエポックのミリ秒） */
  now(): number;
}
