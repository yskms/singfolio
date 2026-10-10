import { useEffect, useRef, useState } from 'react';

const NONE: readonly never[] = [];

/**
 * 入力中の候補を読む（Add / Edit Song）。`active` の間、`queryKey`（検索の中身を表す文字列）
 * が変わるたびに、`delayMs` だけ待ってから `load` を呼ぶ。入力が続くあいだは待ち直す。
 *
 * - **古い結果は捨てる**。`queryKey` の変更・`active` が false になる（フォーカスが外れた・
 *   候補を選んだ）・画面を閉じる、のいずれでも、まだ返っていない `load` の結果は出さない。
 *   通信そのものは止めない（止めても、相手には数えられるため）。
 * - `active` が false の間は何も返さず、読み込んだ候補も捨てる。
 * - 新しい結果が返るまでは、直前の候補を出し続ける（打つたびに候補が消えてちらつくのを
 *   避ける）。`load` が失敗したら、候補を空にする。
 */
export function useSuggestions<T>({
  active,
  queryKey,
  delayMs,
  load,
}: {
  active: boolean;
  queryKey: string;
  delayMs: number;
  load: () => Promise<readonly T[]>;
}): readonly T[] {
  const [items, setItems] = useState<readonly T[]>(NONE);
  // 最新の `load` を、effect を作り直さずに呼ぶ（`load` は毎回作り直される）。
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!active) {
      setItems((current) => (current.length === 0 ? current : NONE));
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      loadRef.current().then(
        (result) => {
          if (!stale) setItems(result);
        },
        () => {
          if (!stale) setItems(NONE);
        },
      );
    }, delayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active, queryKey, delayMs]);

  return active ? items : NONE;
}
