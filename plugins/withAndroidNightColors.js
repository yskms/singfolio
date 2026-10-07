const { withAndroidColorsNight, AndroidConfig } = require('expo/config-plugins');

// Androidのウィンドウ背景（`android:windowBackground`）のダーク版を定義する。
//
// app.json の `backgroundColor` を設定すると、Expo（expo-system-ui）が
// `values/colors.xml` に `activityBackground` を作り、AppThemeの
// `android:windowBackground` から参照させる。しかし `values-night/colors.xml` には
// 何も作らないため、AppCompatがNightモードでも、ウィンドウ自体の背景はライトのまま
// になる。これは画面遷移中（各画面の `contentStyle` より下）に、一瞬ライトの帯として
// 見える。画面側（JS）の背景色では直らないので、ネイティブ側の値を埋める。
//
// Nightモードへの切り替え自体は、ui/theme.tsx の Appearance.setColorScheme()
// （Androidでは AppCompatDelegate.setDefaultNightMode()）が担う。ここはNightモードの
// ときに実際に出る色を定義する。
//
// 値は src/theme/colors.ts の darkColors.background と同じにする。このファイルは
// 設定の実行時にNodeで読まれ、TypeScriptを読めないため、手で写している。
// 食い違いは src/theme/nativeConfig.test.ts が検出する。
const DARK_ACTIVITY_BACKGROUND = '#111113';

const withAndroidNightColors = (config) =>
  withAndroidColorsNight(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: 'activityBackground',
      value: DARK_ACTIVITY_BACKGROUND,
    });
    return config;
  });

module.exports = withAndroidNightColors;
module.exports.DARK_ACTIVITY_BACKGROUND = DARK_ACTIVITY_BACKGROUND;
