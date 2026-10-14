import { useEffect, useState } from 'react';

let loaded: string | null = null;

/**
 * アーティストの読みの辞書（`assets/artist-readings.json` の `data`。引き方は
 * `src/services/artistReadingDictionary.ts`）。**必要になるまで読み込まない**（`enabled` が
 * `true` になったときに、1回だけ読む。約1.5MBのJSONの解析を、アプリの起動や、辞書を使わない
 * 画面で行わないため）。読み込み前は `null`。一度読んだら、保持して使い回す。
 *
 * `require` を関数の中に置くのは、Metroが、最初に呼ばれたときに初めてそのモジュールを実行する
 * ため（先頭の `import` にすると、起動時に実行される）。
 */
export function useArtistReadingDictionary(enabled: boolean): string | null {
  const [data, setData] = useState<string | null>(loaded);
  useEffect(() => {
    if (!enabled || data !== null) return;
    // 同期の `require` だが、画面の描画の後（effect）に実行する。
    const json = require('../assets/artist-readings.json') as { data: string };
    loaded = json.data;
    setData(json.data);
  }, [enabled, data]);
  return data;
}
