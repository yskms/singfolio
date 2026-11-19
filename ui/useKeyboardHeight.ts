import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Android のキーボードの高さ（出ていなければ 0）。iOS は常に 0（`ScrollView` の `automaticallyAdjustKeyboardInsets` が行う）。
 *
 * Android は、エッジ・ツー・エッジのため、キーボードが出ても画面（ScrollView）が縮まず、下にある入力欄が隠れる。この高さの分を
 * 末尾の余白に足してスクロールできるようにする（`SongForm` と同じ理由）。高さには、下端のナビゲーションバーの分が
 * 含まれないので、呼ぶ側が `insets.bottom` を足す。
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
