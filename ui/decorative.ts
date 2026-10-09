/**
 * 装飾のアイコン（`Ionicons` など）を、読み上げから外すための props（`{...decorative}`）。
 * アイコンは文字（フォントの字形）で描かれるため、外さないと、意味のない文字
 * （`` など）が、読み上げの対象のツリーに出る（iOSのアクセシビリティツリーで確認）。
 * 意味を持つアイコンは、親のボタンなどに `accessibilityLabel` を付けて伝える。
 */
export const decorative = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
