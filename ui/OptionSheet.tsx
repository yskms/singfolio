import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { decorative } from './decorative';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * 画面の下から出す、選択肢の一覧（並び替えなど）。選んだら `onSelect` を呼ぶ（閉じるのは
 * 呼び出し側）。幕・Androidの戻る操作でも閉じる。
 *
 * `Alert.alert` のボタンは、Androidでは3つまでで、4つ以上の選択肢を出せない。
 * 文言・書体・配色をアプリで決めるためにも、自前のモーダルにしている。
 */
export function OptionSheet<Value extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly { value: Value; label: string }[];
  selected: Value;
  onSelect: (value: Value) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: 0.4 }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text role="heading" style={[styles.title, { color: colors.textSecondary }]}>
            {title}
          </Text>
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [styles.option, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text
                  style={[
                    isSelected ? styles.optionLabelSelected : styles.optionLabel,
                    { color: colors.textPrimary },
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={22} color={colors.primary} {...decorative} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  title: { paddingHorizontal: 20, paddingVertical: 12, fontSize: 13, lineHeight: 18 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  // fontWeight は、検査（src/theme/fonts.test.ts）のため、式ではなく文字列リテラルで書く。
  optionLabel: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  optionLabelSelected: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
