import { useEffect, useState } from 'react';

/**
 * 画面を出すためのデータを一度だけ読み込む。読み込み中は `undefined`。失敗は、画面の描画の
 * 失敗と同じく、ルートのErrorBoundary（エラー画面）に任せるため、描画の中で例外として投げる
 * （Errorでない値は包む。`app/_layout.tsx` と同じ理由）。
 */
export function useLoad<T>(load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  // reject の値が undefined などでも失敗を検知できるよう、包んで保持する。
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    let cancelled = false;
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
    // 画面を開いたときの一度だけ読む（呼び出し側が毎回別の関数を渡しても、読み直さない）。
  }, []);

  if (failure) throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));
  return value;
}
