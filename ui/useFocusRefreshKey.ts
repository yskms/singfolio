import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

/**
 * タブの画面が、他の画面から戻って（タブを切り替えて）フォーカスされるたびに増える値。読み込みの
 * `useEffect` の依存に入れると、他の画面で変わった曲・タグを読み直せる（SongsとPracticeの一覧）。
 *
 * 数えるのは、フォーカスされていない状態から、フォーカスされた状態に変わったとき。マウントと同時に
 * フォーカスされていたとき（アプリの起動で最初に出るタブ）は、変わっていないので数えない（マウント時の
 * 読み込みと重なる）。マウントしたときにフォーカスされていないこともある。リンクで Song Detail を
 * 直接開くと、下のタブは、一度もフォーカスされないままマウントして読み込む。その最初のフォーカスは
 * Song Detail から戻ったときで、そこまでに曲が変わっているので、数える。「最初のフォーカスは
 * 読み直さない」と決め打ちしない。
 *
 * `useFocusEffect` は使わない。Expo Router の `useFocusEffect` は、ナビゲーションの状態が読み込まれた
 * あとの再描画で、初めてコールバックを呼ぶ。マウントと同時のフォーカスと、あとからのフォーカスを、
 * コールバックの側で見分けるには、その実行の順序に頼ることになる。
 */
export function useFocusRefreshKey(): number {
  const isFocused = useIsFocused();
  const [key, setKey] = useState(0);
  // 直前の描画でフォーカスされていたか。マウントと同時にフォーカスされていれば、最初から true。
  const wasFocused = useRef(isFocused);
  useEffect(() => {
    if (isFocused && !wasFocused.current) setKey((current) => current + 1);
    wasFocused.current = isFocused;
  }, [isFocused]);

  return key;
}
