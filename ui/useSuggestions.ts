import { useEffect, useRef, useState } from 'react';

import { isContinuation } from '../src/services/suggestionRules';

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
 *   避ける）。`load` が `null`（今回は探せなかった。予算切れ・一時停止中・通信の失敗）を返したときも、
 *   直前の候補を残す。ただし、残すのは、検索語（`term`）が、候補を読んだときの検索語に続けて打った
 *   ものである間だけ。別の語に打ち直したら、すぐ捨てる（別の曲の候補が残って、押し間違えるのを
 *   防ぐ。曲名を消して打ち直すと、待ち時間のあいだに検索語が確定しないので、変わった時点で見る）。
 *   空配列（0件・探さない条件）なら空にする（検索語が短くなったときも、これで消える）。
 *   `load` が例外で失敗したら、候補を空にする。
 */
export function useSuggestions<T>({
  active,
  term,
  queryKey,
  delayMs,
  load,
}: {
  active: boolean;
  /** 入力欄の文字（候補が、この続きかを見る） */
  term: string;
  /** 検索の中身を表す文字列（`term` のほか、言語・添えるアーティストなど） */
  queryKey: string;
  delayMs: number;
  load: () => Promise<readonly T[] | null>;
}): readonly T[] {
  const [items, setItems] = useState<readonly T[]>(NONE);
  // `items` を読んだときの `term`（無ければ `null`）。
  const itemsTermRef = useRef<string | null>(null);
  // 最新の `load` を、effect を作り直さずに呼ぶ（`load` は毎回作り直される）。
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!active) {
      itemsTermRef.current = null;
      setItems((current) => (current.length === 0 ? current : NONE));
      return;
    }
    const loaded = itemsTermRef.current;
    if (loaded !== null && !isContinuation(term, loaded)) {
      itemsTermRef.current = null;
      setItems(NONE);
    }
    let stale = false;
    const timer = setTimeout(() => {
      loadRef.current().then(
        (result) => {
          if (stale || result === null) return;
          itemsTermRef.current = term;
          setItems(result);
        },
        () => {
          if (stale) return;
          itemsTermRef.current = null;
          setItems(NONE);
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
