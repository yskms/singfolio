import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * タブの画面が、他の画面から戻って（タブを切り替えて）フォーカスされるたびに増える値。読み込みの
 * `useEffect` の依存に入れると、他の画面で変わった曲・タグを読み直せる（SongsとPracticeの一覧）。
 *
 * 増やさないのは、マウントと同時にフォーカスされていたときの、最初のフォーカスだけ（アプリの起動で
 * 最初に出るタブ。マウント時の読み込みと重なる）。マウントしたときにフォーカスされていないことも
 * ある。リンクで Song Detail を直接開くと、下のタブは、一度もフォーカスされないままマウントして
 * 読み込み、その最初のフォーカスは Song Detail から戻ったときで、そこまでに曲が変わっているので、
 * 読み直す。「最初のフォーカスは読み直さない」と決め打ちしない。
 */
export function useFocusRefreshKey(): number {
  const navigation = useNavigation();
  const [key, setKey] = useState(0);
  // 最初の描画の時点で決める（以降は変えない）。
  const skipNextFocus = useRef<boolean | null>(null);
  if (skipNextFocus.current === null) skipNextFocus.current = navigation.isFocused();

  useFocusEffect(
    useCallback(() => {
      const skip = skipNextFocus.current;
      skipNextFocus.current = false;
      if (!skip) setKey((current) => current + 1);
    }, []),
  );

  return key;
}
