import { useEffect, useState } from 'react';

/**
 * 画面を出すためのデータを読み込む。読み込み中は `undefined`。失敗は、画面の描画の失敗と同じく、
 * ルートのErrorBoundary（エラー画面）に任せるため、描画の中で例外として投げる（Errorでない値は
 * 包む。`app/_layout.tsx` と同じ理由）。
 *
 * `load` は、画面を開いたときと、`deps`（`useEffect` の依存と同じ。`load` が使う値を並べる）が
 * 変わったときに呼ぶ。`load` 自体は毎回別の関数でよい（それだけでは読み直さない）。`deps` が
 * 変わったら、読み込み中に戻る（前の値を出し続けない）。画面が開いたまま、パラメータだけが変わる
 * ことがあるため（同じ画面へ別のIDで移動したときなど）。
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setValue(undefined);
    load().then(
      (loaded) => {
        if (!cancelled) setValue(loaded);
      },
      (error) => {
        if (!cancelled) setFailure({ error });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` は、依存に入れない（上のとおり、`deps` で決める）。
  }, deps);

  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));
  return value;
}
