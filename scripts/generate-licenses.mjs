#!/usr/bin/env node
// アプリに入る第三者のソフトウェアのライセンスの一覧を生成する。
//
//     node scripts/generate-licenses.mjs           # src/legal/thirdPartyLicenses.ts を作り直す
//     node scripts/generate-licenses.mjs --check   # 作り直した結果が、今のファイルと同じかを確かめる（提出前など）
//     node scripts/generate-licenses.mjs --check --apk <app.apk|app.aab>
//                                                  # 上に加えて、APK・AAB の .so が、把握しているものだけかを確かめる
//
// 出力  src/legal/thirdPartyLicenses.ts（About > Open source licenses が出す。手で編集しない。
//       依存を更新・追加したら、必ず作り直す）
// 前提  node_modules・ios/・android/ があること（`npx expo prebuild` 済み。Android の依存は Gradle で調べる）
//
// 「アプリに入るもの」は、package.json の dependencies を機械的にたどらず、実際に入るものから決める
// （Expoの依存には、@expo/cli・babel など、ビルドにしか使わないものが大量に含まれるため）。
//   1. npm      : `expo export` の JS バンドルの sourcemap に出るパッケージ（iOS・Android）と、
//                 autolinking が取り込むパッケージ（JSから使わなくても、ネイティブのコードが入る）
//   2. bundled  : npm パッケージの中に取り込まれた（vendored・forked の）別のプロジェクトのコード。
//                 パッケージ自身の LICENSE には、元の著作権者の表記が無い（BUNDLED）。sourcemap に
//                 `vendor/`・`fork/`・`react-navigation/` の下のファイルが出たら、設定が無い限り失敗にする
//   3. font     : アプリに入る .ttf（`expo export` のアセット）のうち、npm の依存と別のライセンスを持つもの
//   4. native   : React Native が同梱する C++ のライブラリ（Hermes・Folly など。版は React Native の
//                 マニフェストから読む）と、Android の Maven の依存（Gradle の releaseRuntimeClasspath。
//                 POM のライセンスから、プロジェクトごとにまとめる）、Maven の成果物（AAR）が .so に
//                 埋め込んでいる C/C++ のライブラリ（Fresco の libjpeg-turbo・libwebp・giflib、zstd-kmp の zstd。
//                 APK の .so で確かめたもの。MAVEN_EMBEDDED_LIBS）
//                 iOS の Pod（Podfile.lock）。node_modules の中のもの（React Native・Expo）と、自前のローカルモジュール
//                 （`modules/`）は載せない。CocoaPods の trunk から入る Pod は、IOS_TRUNK_PODS に挙げたもの（Googleの
//                 サインインとその依存）だけを、Pods/<名前>/LICENSE の全文で載せる。挙げていない Pod が入ったら失敗にする
//   5. terms    : 全文を載せられない・載せない依存。今は、Android Software Development Kit License で配布される
//                 Googleの依存（Play services・googleid）だけ。ALLOWED_LICENSES には足さず、groupId を個別に許可して、
//                 ライセンスの名前と規約のURLだけを載せる（About の別枠。ANDROID_SDK_LICENSE）。これとは別に、その AAR が
//                 持つ OSS の表記（third_party_licenses。Google の oss-licenses plugin の入力）のうち、載せると決めた
//                 ものを、全文つきで載せる（GOOGLE_AAR_NOTICES。名前は「<名前> (Google Play services)」）
// 自前のコード（`modules/` のローカルモジュール）は、第三者ではないので載せない。
// 載せていないもの: OS・NDK が提供する実行時のライブラリ（libc++ など。LLVM の例外で、バイナリでの表記は
// 不要）、SQLite（パブリックドメイン）、OkHttp の public suffix のリスト（APK の中に出典とライセンスの
// NOTICE がある）。上の Maven の成果物の中を、これ以上は掘り下げない。release の APK・AAB に、把握して
// いない .so が入っていないかは、`--apk` で確かめる。
//
// ライセンスの全文は、パッケージ直下の LICENSE をそのまま使う。見つからないときや、許可していない
// 種類のライセンスのときは、黙って流さず、失敗にする（新しい依存が入ったら、下の設定に足すかどうかを
// 人が決める）。上流から写した全文は、scripts/license-texts/ に置く（取得元は各設定の `source`）。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src/legal/thirdPartyLicenses.ts');
const textsDir = path.join(root, 'scripts/license-texts');

// 載せてよいライセンス（SPDX）。ここに無いものが依存に入ったら失敗にして、条件（著作権表示の方法、
// 配布の条件）を確認してから足す。
const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-3-Clause',
  'BSL-1.0',
  // libjpeg-turbo。IJG の条件は、文書に「この製品は Independent JPEG Group の仕事に一部基づく」と書くことを求める
  'IJG AND BSD-3-Clause AND Zlib',
]);

// iOS の Pod（IOS_TRUNK_PODS）にだけ許す、複合のライセンス。ALLOWED_LICENSES（npm・Maven にも効く）には足さない:
// 足すと、このSPDXを持つ別のパッケージが入っても、黙って通る。
// GoogleUtilities は、LICENSE が、Apache-2.0 の全文に、MIT（Landon J. Fuller の著作権表示）の全文を続けた形。
// MIT は、著作権表示と許諾表示を含めることを求める（LICENSE の全文をそのまま載せて満たす）。
const IOS_POD_ALLOWED_LICENSES = new Set([...ALLOWED_LICENSES, 'Apache-2.0 AND MIT']);

// Android Software Development Kit License（https://developer.android.com/studio/terms）。Play services と
// googleid の POM が、この名前を書いている。**ALLOWED_LICENSES には足さない**: 無条件に許すのではなく、
// 対象の groupId だけを個別に許可する（MAVEN_FAMILIES の `androidSdkLicense`）。アプリへの表示・帰属表示の義務は
// 規約に書かれていない（2021-07-27 版を読んだ）ので、全文は載せず、名前と規約の URL を、About の別枠に載せる。
// 3.4（SDK の redistribute の禁止）などの扱いは、docs §8「Googleのサインイン」。
const ANDROID_SDK_LICENSE = 'Android Software Development Kit License';
const ANDROID_SDK_LICENSE_URL = 'https://developer.android.com/studio/terms';

// ---------------------------------------------------------------------------------------------
// npm
// ---------------------------------------------------------------------------------------------

// パッケージ直下に LICENSE が無いもの。リポジトリのルートの LICENSE を使う（同じリポジトリの、
// LICENSE を持つパッケージの文を借りる。上流のルートの LICENSE と同じことを確認済み）。
// 値が `{ file }` のものは、パッケージもリポジトリのルートも写しを持たず、上流の LICENSE を
// scripts/license-texts/ に置いている。
const LICENSE_FALLBACKS = {
  'expo-router': { from: 'expo' }, // expo/expo のルートの LICENSE
  '@expo/ui': { from: 'expo' },
  '@react-native/assets-registry': { from: 'react-native' }, // facebook/react-native のルートの LICENSE
  '@react-native/js-polyfills': { from: 'react-native' },
  '@react-native/normalize-colors': { from: 'react-native' },
  '@react-native/virtualized-lists': { from: 'react-native' },
  'standard-navigation': {
    file: 'standard-navigation.txt',
    source: 'https://github.com/react-navigation/standard-navigation/blob/main/LICENSE',
  },
};

// package.json の `license` が、パッケージ自身のライセンスと違うもの。
const LICENSE_OVERRIDES = {
  // "MIT AND Apache-2.0"。MIT はこのパッケージ（Expoのコード）、Apache-2.0 はフォント（下の ICON_FONTS）。
  '@expo-google-fonts/material-symbols': 'MIT',
};

// ---------------------------------------------------------------------------------------------
// bundled（npm パッケージの中に取り込まれた別のプロジェクトのコード）
// ---------------------------------------------------------------------------------------------

// `in` のパッケージの `paths` の下のコードが、別のプロジェクトから取り込まれたもの。
const BUNDLED = [
  {
    // expo-router は React Navigation を `build/react-navigation/`（core・native・routers・elements・
    // bottom-tabs・native-stack）に取り込み、一部を `build/fork/` に改変して持つ（ヘッダーの戻る・閉じるの
    // アイコン画像は `assets/react-navigation/`）。アプリの Stack・Tabs が使うのはこのコード。パッケージの
    // LICENSE（Expo）には、React Navigation の著作権表示が無い。
    name: 'React Navigation (bundled in expo-router)',
    in: 'expo-router',
    paths: ['build/react-navigation/', 'build/fork/', 'assets/react-navigation/'],
    license: 'MIT',
    file: 'react-navigation.txt',
    source: 'https://github.com/react-navigation/react-navigation/blob/main/packages/core/LICENSE',
  },
];

// 取り込みの置き場に見えるが、そのパッケージ自身の LICENSE で足りているもの。
const BUNDLED_COVERED = [
  { in: 'react-native', paths: ['Libraries/vendor/'] }, // Meta のコード（react-native の LICENSE）
  { in: '@expo/vector-icons', paths: ['build/vendor/'] }, // react-native-vector-icons（LICENSE に Joel Arvidsson の表記）
];

// 取り込まれたコードの置き場に見えるパス（パッケージの中の相対パス）。
const BUNDLED_HINT = /(^|\/)(vendor|vendored|fork|forks|react-navigation|third[-_]?party)\//i;

// ---------------------------------------------------------------------------------------------
// font
// ---------------------------------------------------------------------------------------------

// アプリに入るアイコンフォントのうち、npmの依存の LICENSE とは別のライセンスを持つもの。
// `asset` は、`expo export` のアセットに出る .ttf のパス（これが出なくなったら失敗にする）。
const ICON_FONTS = [
  {
    name: 'Ionicons (icon font)',
    license: 'MIT',
    asset: '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
    // @expo/vector-icons の LICENSE は、そのコードのもの（react-native-vector-icons・Expo）で、
    // フォント（Ionic）の著作権表示ではない。依存の中に写しが無いので、上流の LICENSE を置いている。
    file: 'Ionicons.txt',
    source: 'https://github.com/ionic-team/ionicons/blob/main/LICENSE',
  },
  {
    name: 'Material Symbols (icon font)',
    license: 'Apache-2.0',
    asset: '@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf',
    // パッケージの LICENSE_FONT（Apache License 2.0）。
    packageFile: ['@expo-google-fonts/material-symbols', 'LICENSE_FONT'],
  },
];

// ---------------------------------------------------------------------------------------------
// native: React Native が同梱する C++ のライブラリ
// ---------------------------------------------------------------------------------------------

// `rn` は、版の読み先（React Native のマニフェスト）。全文は、`textVersion` の版の上流から写した。
// React Native がその版を変えたら失敗にする（ライセンスが変わっていないかを確かめて、textVersion を更新する）。
const RN_NATIVE_LIBS = [
  { name: 'Hermes', rn: 'hermes', textVersion: '0.17.0', license: 'MIT', file: 'Hermes.txt',
    source: 'https://github.com/facebook/hermes/blob/main/LICENSE' },
  { name: 'Folly', rn: 'toml:folly', textVersion: '2024.11.18.00', license: 'Apache-2.0', file: 'folly.txt',
    source: 'https://github.com/facebook/folly/blob/v2024.11.18.00/LICENSE' },
  { name: 'glog', rn: 'toml:glog', textVersion: '0.3.5', license: 'BSD-3-Clause', file: 'glog.txt',
    source: 'https://github.com/google/glog/blob/v0.3.5/COPYING' },
  { name: 'double-conversion', rn: 'toml:doubleconversion', textVersion: '1.1.6', license: 'BSD-3-Clause',
    file: 'double-conversion.txt', source: 'https://github.com/google/double-conversion/blob/v1.1.6/LICENSE' },
  // iOS（1.84.0）と Android（1.83.0）で版が違い、ライセンスは同じ。版は載せない。
  { name: 'Boost', rn: null, license: 'BSL-1.0', file: 'boost.txt',
    source: 'https://github.com/boostorg/boost/blob/boost-1.84.0/LICENSE_1_0.txt' },
  { name: '{fmt}', rn: 'toml:fmt', textVersion: '12.1.0', license: 'MIT', file: 'fmt.txt',
    source: 'https://github.com/fmtlib/fmt/blob/12.1.0/LICENSE' },
  // MIT・Apache-2.0・BSL-1.0 のどれでも使える。MIT を選んでいる。
  { name: 'fast_float', rn: 'toml:fastFloat', textVersion: '8.0.0', license: 'MIT', file: 'fast_float-MIT.txt',
    source: 'https://github.com/fastfloat/fast_float/blob/v8.0.0/LICENSE-MIT' },
  { name: 'SocketRocket', rn: 'socketrocket', textVersion: '0.7.1', license: 'BSD-3-Clause', platform: 'ios',
    file: 'SocketRocket.txt', source: 'https://github.com/facebookincubator/SocketRocket/blob/0.7.1/LICENSE' },
];

// ---------------------------------------------------------------------------------------------
// native: Android の Maven の依存
// ---------------------------------------------------------------------------------------------

// npm のパッケージ（上で載せている）や React Native 自身のため、ここでは載せない groupId。
const MAVEN_EXCLUDED_GROUPS = /^(expo\.modules(\..*)?|host\.exp\.exponent|com\.facebook\.(react|hermes))$/;

// groupId ごとに、プロジェクトの名前にまとめる。ここに無い groupId が入ったら失敗にする。
// `file` は、そのプロジェクトのライセンスの全文（Apache-2.0 以外は必須。Apache-2.0 は標準の全文）。
const MAVEN_FAMILIES = [
  { match: /^androidx(\..+)?$/, name: 'AndroidX' },
  { match: /^com\.google\.android\.material$/, name: 'Material Components for Android' },
  { match: /^org\.jetbrains\.kotlin$/, name: 'Kotlin' },
  { match: /^org\.jetbrains\.kotlinx$/, name: 'kotlinx (coroutines, serialization)' },
  { match: /^org\.jetbrains$/, name: 'JetBrains Annotations' },
  { match: /^com\.squareup\.okhttp3$/, name: 'OkHttp' },
  { match: /^com\.squareup\.okio$/, name: 'Okio' },
  { match: /^com\.squareup\.zstd$/, name: 'zstd-kmp' },
  { match: /^com\.facebook\.fresco$/, name: 'Fresco', file: 'Fresco.txt',
    source: 'https://github.com/facebook/fresco/blob/main/LICENSE' },
  { match: /^com\.facebook\.soloader$/, name: 'SoLoader' },
  { match: /^com\.facebook\.fbjni$/, name: 'fbjni' },
  { match: /^com\.facebook\.infer\.annotation$/, name: 'Infer Annotations', file: 'Infer.txt',
    source: 'https://github.com/facebook/infer/blob/main/LICENSE' },
  { match: /^com\.facebook\.yoga$/, name: 'Yoga', file: 'Yoga.txt',
    source: 'https://github.com/facebook/yoga/blob/main/LICENSE' },
  { match: /^com\.parse\.bolts$/, name: 'Bolts-Android', file: 'Bolts-Android.txt',
    source: 'https://github.com/BoltsFramework/Bolts-Android/blob/1.4.0/LICENSE' },
  { match: /^io\.github\.lukmccall\.pika$/, name: 'Pika', file: 'Pika.txt',
    source: 'https://github.com/lukmccall/pika/blob/main/LICENSE.txt' },
  { match: /^com\.google\.code\.gson$/, name: 'Gson' },
  { match: /^com\.google\.guava$/, name: 'Guava (listenablefuture)' },
  { match: /^com\.google\.code\.findbugs$/, name: 'JSR 305' },
  { match: /^com\.google\.errorprone$/, name: 'Error Prone Annotations' },
  { match: /^javax\.inject$/, name: 'javax.inject' },
  { match: /^commons-(codec|io)$/, name: 'Apache Commons' },
  { match: /^org\.brotli$/, name: 'Brotli', file: 'Brotli.txt', source: 'https://github.com/google/brotli/blob/master/LICENSE' },
  { match: /^org\.jspecify$/, name: 'JSpecify' },
  // Googleのサインイン（Credential Manager）の依存。androidx.credentials は AndroidX（上）。以下の2つは
  // Android Software Development Kit License で配布される（POM の名前が ANDROID_SDK_LICENSE と一致しなければ失敗）。
  { match: /^com\.google\.android\.gms$/, name: 'Google Play services', androidSdkLicense: true },
  { match: /^com\.google\.android\.libraries\.identity\.googleid$/, name: 'Google Identity (googleid)',
    androidSdkLicense: true },
];

// Maven の成果物（AAR）が .so に埋め込んでいる C/C++ のライブラリ。APK の `lib/` の .so で、入っていることを
// 確かめたもの（libnative-imagetranscoder.so に libjpeg-turbo 2.1.5.1 の版の文字列。libstatic-webp.so に
// WebPDecode など。libgifimage.so に DGifOpen など。libzstd-kmp.so に ZSTD_ の関数）。版は、成果物の
// ソースの記述から読んだ（Fresco 3.6.0 の gradle.properties の LIBJPEG_TURBO_VERSION・LIBWEBP_VERSION・
// GIFLIB_VERSION。zstd-kmp 0.4.0 の zstd のサブモジュールの zstd.h）。`in` の成果物の版が変わったら
// 失敗にする（埋め込みの版とライセンスを確かめ直して、全文と `inVersion` を更新する）。
// `in` は Maven の成果物（nativeimagetranscoder → libnative-imagetranscoder.so、webpsupport → libstatic-webp.so、
// animated-gif → libgifimage.so）。libpng は、Fresco のソースにあるが、libstatic-webp.so にはリンクされて
// いない（符号・文字列が無い）。
const MAVEN_EMBEDDED_LIBS = [
  { name: 'libjpeg-turbo', version: '2.1.5.1', license: 'IJG AND BSD-3-Clause AND Zlib', file: 'libjpeg-turbo.txt',
    source: 'https://github.com/libjpeg-turbo/libjpeg-turbo/blob/2.1.5.1/LICENSE.md',
    in: 'com.facebook.fresco:nativeimagetranscoder', inVersion: '3.6.0' },
  { name: 'libwebp', version: '1.3.2', license: 'BSD-3-Clause', file: 'libwebp.txt',
    source: 'https://github.com/webmproject/libwebp/blob/v1.3.2/COPYING',
    in: 'com.facebook.fresco:webpsupport', inVersion: '3.6.0' },
  { name: 'giflib', version: '5.2.1', license: 'MIT', file: 'giflib.txt',
    source: 'https://sourceforge.net/p/giflib/code/ci/5.2.1/tree/COPYING',
    in: 'com.facebook.fresco:animated-gif', inVersion: '3.6.0' },
  // zstd-kmp 0.4.0 が持つ zstd は、1.5.7 の後の開発中のコミット（1dbc2e0。zstd.h は 1.5.8）。版は載せない。
  { name: 'Zstandard', license: 'BSD-3-Clause', file: 'zstd.txt',
    source: 'https://github.com/facebook/zstd/blob/1dbc2e09084e843f6c0dcc2d0791610015c50979/LICENSE',
    in: 'com.squareup.zstd:zstd-kmp-android', inVersion: '0.4.0' },
];

// CocoaPods の trunk から入る iOS の Pod（node_modules の外）。GoogleSignIn とその依存。ここに無い Pod が
// Podfile.lock の SPEC REPOS に出たら失敗にする。全文は、入っている Pod の Pods/<名前>/LICENSE をそのまま使う
// （版は Podfile.lock から読む）。`license` は、その LICENSE を読んで確かめる:
//   Apache-2.0           標準の Apache-2.0 の全文（scripts/license-texts/Apache-2.0.txt）と一致する
//   Apache-2.0 AND MIT   標準の Apache-2.0 の全文に、MIT の全文（著作権表示を含む）が続く
// どれも NOTICE ファイルは無い（Apache-2.0 の 4(d)）。版が上がって LICENSE が変わったら失敗にする。
const IOS_TRUNK_PODS = [
  { name: 'GoogleSignIn', license: 'Apache-2.0' },
  { name: 'AppAuth', license: 'Apache-2.0' },
  { name: 'GTMAppAuth', license: 'Apache-2.0' },
  { name: 'GTMSessionFetcher', license: 'Apache-2.0' },
  { name: 'AppCheckCore', license: 'Apache-2.0' },
  { name: 'GoogleUtilities', license: 'Apache-2.0 AND MIT' },
  { name: 'PromisesObjC', license: 'Apache-2.0' },
  { name: 'PromisesSwift', license: 'Apache-2.0' },
  { name: 'RecaptchaInterop', license: 'Apache-2.0' },
];

// Play services・googleid の AAR が持つ、OSS の表記（AAR 直下の third_party_licenses.json・.txt。Google の
// oss-licenses plugin が、一覧に含める元のデータ）。Googleの資料（Include open source notices）は、Play services の
// 各ライブラリを作るのに使ったOSSの全文も、アプリが表示する一覧に含まれる、アプリが使うOSSの表記の責任は開発者に
// ある、としている。ただし、この一覧は、実際の同梱より広い（J2ObjC は、Android の AAR に入らない iOS 向けの
// runtime の GPL・APSL・ICU などの全文を持つ）。classes.jar に、Guava 由来（`com.google.common.base.Strings`）や
// protobuf-lite 由来のコードが、難読化名（zz*）で入っていることは確かめた。そこで、名前ごとに、載せるか・載せない
// かを決める（知らない名前が出たら失敗にする）:
//   載せる   : `license` は、全文を読んで確かめる（Apache-2.0 は標準の本文だけ。MIT・BSD-3-Clause は著作権表示つき）
//   covered  : すでに別の行で載せているプロジェクト（AndroidX・Kotlin・kotlinx・JSpecify・Error Prone）
//   skipped  : 載せない理由がある
const GOOGLE_AAR_NOTICES = [
  { name: 'Animal Sniffer', license: 'MIT' },
  { name: 'apksig', license: 'Apache-2.0' },
  { name: 'chrome_sync', license: 'BSD-3-Clause' },
  { name: 'Checker Framework Annotations', license: 'MIT' },
  { name: 'checker_framework_util', license: 'MIT' },
  { name: 'Dagger', license: 'Apache-2.0' },
  { name: 'Google Auto', license: 'Apache-2.0' },
  { name: 'Guava JDK5', license: 'Apache-2.0' },
  { name: 'Guava JDK7', license: 'Apache-2.0' },
  { name: 'gsfclient', license: 'Apache-2.0' },
  { name: 'HighwayHash', license: 'Apache-2.0' },
  { name: 'java_annotations', license: 'Apache-2.0' },
  { name: 'JSR 250', license: 'Apache-2.0' },
  { name: 'JSR 305', license: 'BSD-3-Clause' },
  { name: 'JSR 330', license: 'Apache-2.0' },
  { name: 'JsInterop Annotations', license: 'Apache-2.0' },
  { name: 'mobiledatadownload', license: 'Apache-2.0' },
  { name: 'Protocol Buffers for Java', license: 'BSD-3-Clause' },
  { name: 'SafeParcelable library', license: 'Apache-2.0' },
  { name: 'Tink', license: 'Apache-2.0' },
];
const GOOGLE_AAR_NOTICES_COVERED =
  /^(AndroidX .+|Kotlin|Kotlin coroutines|kotlinx_atomicfu|kotlinx_serialization|JSpecify|Error Prone)$/;
const GOOGLE_AAR_NOTICES_SKIPPED = {
  // 全文は、J2ObjC の runtime（iOS 向け）の GPL・APSL・ICU などを含む。Android の AAR に入るのは、注釈だけ
  // （Apache-2.0）で、注釈は、Guava の依存として挙がっているだけ。
  J2ObjC: 'iOS向けのruntimeの全文を含み、AndroidのAARには入らない',
  // Android Software Development Kit License の全文そのもの（ここでは、名前と規約のURLだけを載せる）。
  'Android SDK Platforms': 'ANDROID_SDK_LICENSE',
};
// 載せるものの、ライセンスの種類を、全文から確かめる。
const NOTICE_KIND_CHECKS = {
  'Apache-2.0': (text) =>
    /Apache License\s+Version 2\.0/.test(text) && text.length < 20000 && !/GNU General Public License|Apple Public Source/.test(text),
  MIT: (text) => /Permission is hereby granted, free of charge/.test(text),
  'BSD-3-Clause': (text) =>
    /Redistribution and use in source and binary forms/.test(text) && /Neither the name of/.test(text),
};

// APK・AAB の `lib/<abi>/` に入っていてよい .so（`--apk`）。理由は、一覧に載せている・載せなくてよい、のどちらか。
const KNOWN_SO = [
  /^libappmodules$/, /^libreact_codegen_.+$/, /^libreactnative$/, /^libjsi$/, /^libhermesvm$/, /^libhermestooling$/,
  /^libfbjni$/, // React Native・Hermes・fbjni（載せている）
  /^libexpo-modules-core$/, /^libexpo-sqlite$/, /^libgesturehandler$/, /^libreanimated$/, /^librnscreens$/,
  /^libworklets$/, /^libandroidx\.graphics\.path$/, // npm のパッケージ・AndroidX（載せている）
  /^libimagepipeline$/, /^libnative-filters$/, // Fresco 自身のコード（Fresco を載せている）
  /^libnative-imagetranscoder$/, /^libstatic-webp$/, /^libgifimage$/, /^libzstd-kmp$/, // MAVEN_EMBEDDED_LIBS
  /^libc\+\+_shared$/, // NDK の libc++（LLVM の例外で、バイナリでの表記は不要）
];

// POM のライセンスの名前 → SPDX。
function spdxFromPom(name) {
  if (/apache/i.test(name)) return 'Apache-2.0';
  if (/^(the )?mit\b/i.test(name)) return 'MIT';
  if (/^bsd/i.test(name)) return 'BSD-3-Clause';
  return null;
}

// ---------------------------------------------------------------------------------------------

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, CI: '1' },
    ...options,
  });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readText(file) {
  return readFileSync(file, 'utf8');
}

function normalizeText(text) {
  // 行末の空白と、先頭・末尾の空行を除く（行頭の字下げは残す。src/legal/fontLicenses.ts と同じ扱い）。
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\s+$/, '');
}

function textFile(name) {
  const file = path.join(textsDir, name);
  if (!existsSync(file)) throw new Error(`${file} が無い`);
  return normalizeText(readText(file));
}

function checkAllowed(name, license, allowed = ALLOWED_LICENSES) {
  if (typeof license !== 'string' || !allowed.has(license)) {
    throw new Error(`${name}: 許可していないライセンス（${JSON.stringify(license)}）。条件を確認してから ALLOWED_LICENSES に足す`);
  }
}

// 自前のローカルモジュール（`modules/`）か。
const ownModulesDir = path.join(root, 'modules') + path.sep;
function isOwnModule(dir) {
  return typeof dir === 'string' && (dir + path.sep).startsWith(ownModulesDir);
}

// 'a/b/node_modules/@scope/name/lib/x.js' → { dir: 'a/b/node_modules/@scope/name', rel: 'lib/x.js' }
function packageOf(file) {
  const marker = 'node_modules/';
  const at = file.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = file.slice(at + marker.length).split('/');
  const depth = parts[0].startsWith('@') ? 2 : 1;
  return {
    dir: file.slice(0, at + marker.length) + parts.slice(0, depth).join('/'),
    rel: parts.slice(depth).join('/'),
  };
}

// ---------------------------------------------------------------------------------------------
// 収集
// ---------------------------------------------------------------------------------------------

function collectNpm() {
  const dirs = new Set();
  const bundledHits = []; // 取り込まれたコードの置き場に見えるパス: { dir, rel }
  const exportDir = mkdtempSync(path.join(tmpdir(), 'singfolio-licenses-'));
  let assets;
  try {
    console.log('expo export（JSバンドルのsourcemapを取る）...');
    run('npx', [
      'expo', 'export', '--platform', 'ios', '--platform', 'android',
      '--output-dir', exportDir, '--dump-sourcemap', '--dump-assetmap',
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    for (const platform of ['ios', 'android']) {
      const jsDir = path.join(exportDir, '_expo/static/js', platform);
      const mapName = readdirSync(jsDir).find((name) => name.endsWith('.map'));
      if (!mapName) throw new Error(`${platform}: sourcemap が出ていない`);
      for (const source of readJson(path.join(jsDir, mapName)).sources) {
        // sourcemap の sources は、プロジェクトのルートからの `/node_modules/...`。
        const found = packageOf(source);
        if (!found) continue;
        dirs.add(path.join(root, found.dir));
        if (BUNDLED_HINT.test(found.rel)) bundledHits.push(found);
      }
    }
    // アセットの一覧（JSON）は、形に依らず、パスが含まれているかだけを見る。
    assets = readText(path.join(exportDir, 'assetmap.json'));
  } finally {
    rmSync(exportDir, { recursive: true, force: true });
  }

  console.log('autolinking（ネイティブのパッケージを調べる）...');
  for (const platform of ['ios', 'android']) {
    const found = JSON.parse(run('npx', ['expo-modules-autolinking', 'search', '--platform', platform, '--json']));
    for (const module of Object.values(found)) {
      // 自前のローカルモジュール（`modules/`。package.json も無い）は、第三者のコードではない。
      if (isOwnModule(module.path)) continue;
      dirs.add(module.path);
    }
    const config = JSON.parse(
      run('npx', ['expo-modules-autolinking', 'react-native-config', '--platform', platform, '--json']),
    );
    for (const dependency of Object.values(config.dependencies)) {
      if (!isOwnModule(dependency.root)) dirs.add(dependency.root);
    }
  }
  return { dirs, assets, bundledHits };
}

function findLicenseFile(dir) {
  const files = readdirSync(dir).filter((name) => LICENSE_FILE.test(name));
  if (files.length > 1) throw new Error(`${dir}: ライセンスのファイルが複数ある（${files.join(', ')}）`);
  return files[0] ? path.join(dir, files[0]) : null;
}

function npmEntries(dirs) {
  const infos = new Map();
  for (const dir of dirs) {
    const pkg = readJson(path.join(dir, 'package.json'));
    // 同じ名前・版が複数の場所に入っていても、1つにする（版が違えば別に載せる）。
    infos.set(`${pkg.name}@${pkg.version}`, { dir, name: pkg.name, version: pkg.version, license: pkg.license });
  }
  const dirByName = new Map([...infos.values()].map((info) => [info.name, info.dir]));

  const entries = [];
  for (const info of infos.values()) {
    const license = LICENSE_OVERRIDES[info.name] ?? info.license;
    checkAllowed(`${info.name}@${info.version}`, license);
    let file = findLicenseFile(info.dir);
    if (!file) {
      const fallback = LICENSE_FALLBACKS[info.name];
      if (!fallback) throw new Error(`${info.name}@${info.version}: LICENSE が無い。LICENSE_FALLBACKS に足す`);
      if (fallback.file) {
        file = path.join(textsDir, fallback.file);
      } else {
        const fromDir = dirByName.get(fallback.from);
        file = fromDir && findLicenseFile(fromDir);
        if (!file) throw new Error(`${info.name}: 借りる先 ${fallback.from} の LICENSE が見つからない`);
      }
    }
    entries.push({
      kind: 'npm', name: info.name, version: info.version, license, text: normalizeText(readText(file)),
    });
  }
  return { entries, dirByName };
}

function bundledEntries(bundledHits, dirByName) {
  const covered = (hit, rules) =>
    rules.some((rule) => {
      const dir = dirByName.get(rule.in);
      return dir && path.join(root, hit.dir) === dir && rule.paths.some((prefix) => hit.rel.startsWith(prefix));
    });
  const unknown = bundledHits.filter((hit) => !covered(hit, BUNDLED) && !covered(hit, BUNDLED_COVERED));
  if (unknown.length > 0) {
    const sample = [...new Set(unknown.map((hit) => `${hit.dir.replace(/^.*node_modules\//, '')}/${hit.rel}`))];
    throw new Error(
      '取り込まれた（vendored・forked の）コードに見えるファイルが、バンドルに入っている:\n  ' +
        sample.slice(0, 8).join('\n  ') +
        '\n元のプロジェクトのライセンスが要るかを確認して、BUNDLED か BUNDLED_COVERED に足す',
    );
  }
  return BUNDLED.map((bundled) => {
    if (!bundledHits.some((hit) => covered(hit, [bundled]))) {
      throw new Error(`${bundled.name}: バンドルに、${bundled.in} の ${bundled.paths.join(' / ')} が出ない。BUNDLED を見直す`);
    }
    checkAllowed(bundled.name, bundled.license);
    return { kind: 'bundled', name: bundled.name, license: bundled.license, text: textFile(bundled.file) };
  });
}

function fontEntries(assets, dirByName) {
  return ICON_FONTS.map((font) => {
    if (!assets.includes(font.asset)) {
      throw new Error(`${font.name}: アプリに入るアセットに ${font.asset} が無い。ICON_FONTS を見直す`);
    }
    checkAllowed(font.name, font.license);
    const text = font.file
      ? textFile(font.file)
      : normalizeText(readText(path.join(dirByName.get(font.packageFile[0]) ?? '', font.packageFile[1])));
    return { kind: 'font', name: font.name, license: font.license, text };
  });
}

// React Native のマニフェストから、同梱する C++ のライブラリの版を読む。
function readRnVersions() {
  const rn = path.join(root, 'node_modules/react-native');
  const toml = readText(path.join(rn, 'gradle/libs.versions.toml'));
  const hermes = readText(path.join(rn, 'sdks/hermes-engine/version.properties'));
  const helpers = readText(path.join(rn, 'scripts/cocoapods/helpers.rb'));
  const pick = (source, pattern, label) => {
    const match = source.match(pattern);
    if (!match) throw new Error(`React Native のマニフェストから ${label} の版を読めない`);
    return match[1];
  };
  return {
    hermes: pick(hermes, /^HERMES_VERSION_NAME=(.+)$/m, 'Hermes'),
    socketrocket: pick(helpers, /@@socket_rocket_config\s*=\s*\{\s*:version\s*=>\s*'([^']+)'/, 'SocketRocket'),
    toml: (key) => pick(toml, new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'), key),
  };
}

function reactNativeNativeEntries() {
  const versions = readRnVersions();
  return RN_NATIVE_LIBS.map((lib) => {
    checkAllowed(lib.name, lib.license);
    let version;
    if (lib.rn) {
      version = lib.rn.startsWith('toml:') ? versions.toml(lib.rn.slice(5)) : versions[lib.rn];
      if (version !== lib.textVersion) {
        throw new Error(
          `${lib.name}: React Native の版が ${version} に変わった（全文は ${lib.textVersion} から写した）。` +
            'ライセンスが変わっていないかを確かめて、全文と textVersion を更新する',
        );
      }
    }
    return {
      kind: 'native', name: lib.name, version, license: lib.license, text: textFile(lib.file),
      ...(lib.platform ? { platform: lib.platform } : {}),
    };
  });
}

// --- Android の Maven の依存 ---

function gradleResolvedArtifacts() {
  const android = path.join(root, 'android');
  if (!existsSync(path.join(android, 'gradlew'))) {
    throw new Error('android/ が無い。`npx expo prebuild --platform android` で作ってから実行する');
  }
  console.log('Gradle（Androidの依存を調べる）...');
  const env = { ...process.env };
  if (!env.JAVA_HOME) {
    try {
      env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' }).trim();
    } catch {
      // JAVA_HOME が決まらなければ、Gradle の失敗に任せる
    }
  }
  const output = execFileSync(
    'nice',
    ['-n', '10', './gradlew', ':app:dependencies', '--configuration', 'releaseRuntimeClasspath', '-q'],
    { cwd: android, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'], env },
  );
  const artifacts = new Map(); // 'group:artifact' → 解決された版
  for (const line of output.split('\n')) {
    const tree = line.match(/^[|\s]*(?:\+---|\\---) (.+)$/);
    if (!tree) continue;
    const parsed = parseGradleDependency(tree[1]);
    if (parsed) artifacts.set(`${parsed.group}:${parsed.artifact}`, parsed.version);
  }
  if (artifacts.size === 0) throw new Error('Gradle の出力から、依存を1つも読めない');
  return artifacts;
}

// 依存の木の1行（`+--- ` の後ろ）。読めない形は、黙って流さず、失敗にする。
//   group:artifact:version [-> resolved] [(*)]    group:artifact -> resolved    group:artifact:{strictly v} -> resolved
//   group:artifact -> group2:artifact2:version（モジュールの置き換え）    project :name
// 制約（`(c)`）は、依存ではないので読み飛ばす。
function parseGradleDependency(body) {
  let rest = body.trim();
  if (rest.startsWith('project ')) return null;
  if (/ \(c\)$/.test(rest)) return null;
  rest = rest.replace(/ \((\*|n)\)$/, '');
  const [left, right, ...extra] = rest.split(' -> ');
  if (extra.length > 0) throw new Error(`Gradle の依存の行を読めない: ${body}`);
  // `{strictly 1.0}`・`{require 1.0}` などは、中の版だけ残す。
  const parts = left.replace(/\{[a-z]+ ([^}\s]+)\}/g, '$1').split(':');
  const coordinate = /^[\w.+-]+$/;
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => coordinate.test(part))) {
    throw new Error(`Gradle の依存の行を読めない: ${body}`);
  }
  let [group, artifact, version] = parts;
  if (right !== undefined) {
    const resolved = right.split(':');
    if (resolved.length === 3 && resolved.every((part) => coordinate.test(part))) {
      [group, artifact, version] = resolved; // 置き換え先
    } else if (resolved.length === 1 && coordinate.test(resolved[0])) {
      version = resolved[0];
    } else {
      throw new Error(`Gradle の依存の行を読めない: ${body}`);
    }
  }
  if (!version) throw new Error(`Gradle の依存の行に版が無い: ${body}`);
  return { group, artifact, version };
}

// Gradle のキャッシュの POM から、ライセンス（なければ親の POM をたどる）。
function pomLicenses(group, artifact, version, depth = 0) {
  const cache = path.join(process.env.GRADLE_USER_HOME ?? path.join(homedir(), '.gradle'), 'caches/modules-2/files-2.1');
  const base = path.join(cache, group, artifact, version);
  if (!existsSync(base)) return [];
  const sub = readdirSync(base).find((hash) => existsSync(path.join(base, hash, `${artifact}-${version}.pom`)));
  if (!sub) return [];
  const pom = readText(path.join(base, sub, `${artifact}-${version}.pom`));
  const licenses = [...pom.matchAll(/<license>([\s\S]*?)<\/license>/g)].map((block) => ({
    name: (block[1].match(/<name>([^<]*)<\/name>/) ?? [])[1]?.trim() ?? '',
  }));
  if (licenses.length > 0 || depth >= 3) return licenses;
  const parent = pom.match(/<parent>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/);
  return parent ? pomLicenses(parent[1].trim(), parent[2].trim(), parent[3].trim(), depth + 1) : [];
}

function mavenEntries(resolved) {
  const families = new Map(); // name → { family, license, artifacts: [] }
  for (const [coordinate, version] of resolved) {
    const [group, artifact] = coordinate.split(':');
    if (MAVEN_EXCLUDED_GROUPS.test(group)) continue;
    const family = MAVEN_FAMILIES.find((candidate) => candidate.match.test(group));
    if (!family) throw new Error(`${coordinate}:${version}: MAVEN_FAMILIES に無い groupId。プロジェクトの名前を決めて足す`);
    const pomNames = pomLicenses(group, artifact, version).map((license) => license.name);
    let license;
    if (family.androidSdkLicense) {
      // 個別に許可した groupId。POM が Android Software Development Kit License と書いていなければ失敗にする
      // （同じ groupId に、別のライセンスの成果物が混ざったときに、黙って通さない）。
      if (pomNames.length === 0 || pomNames.some((name) => name !== ANDROID_SDK_LICENSE)) {
        throw new Error(
          `${coordinate}:${version}: POM のライセンスが ${ANDROID_SDK_LICENSE} ではない（${JSON.stringify(pomNames)}）。` +
            'POM が読めないときは `./gradlew :app:dependencies --configuration releaseRuntimeClasspath --refresh-dependencies`',
        );
      }
      license = ANDROID_SDK_LICENSE;
    } else {
      const licenses = [...new Set(pomNames.map((name) => spdxFromPom(name)))];
      if (licenses.length !== 1 || licenses[0] === null) {
        throw new Error(`${coordinate}:${version}: POM からライセンスを1つに決められない（${JSON.stringify(licenses)}）`);
      }
      license = licenses[0];
    }
    const found = families.get(family.name) ?? { family, license, artifacts: [] };
    if (found.license !== license) {
      throw new Error(`${family.name}: 成果物でライセンスが違う（${found.license} と ${license}。${coordinate}）`);
    }
    found.artifacts.push(`${group}:${artifact}:${version}`);
    families.set(family.name, found);
  }
  const entries = [...families.values()].map(({ family, license, artifacts }) => {
    const versions = new Set(artifacts.map((artifact) => artifact.split(':')[2]));
    const common = {
      kind: 'native', name: family.name, license, platform: 'android',
      ...(versions.size === 1 ? { version: [...versions][0] } : {}),
      includes: artifacts.sort(),
    };
    // 全文を載せない依存（terms）。ライセンスの名前と、規約の URL だけ。
    if (family.androidSdkLicense) return { ...common, licenseUrl: ANDROID_SDK_LICENSE_URL };
    checkAllowed(family.name, license);
    let text;
    if (family.file) text = textFile(family.file);
    else if (license === 'Apache-2.0') text = textFile('Apache-2.0.txt');
    else throw new Error(`${family.name}: ${license} の全文（file）が要る`);
    return { ...common, text };
  });

  for (const lib of MAVEN_EMBEDDED_LIBS) {
    const host = resolved.get(lib.in);
    if (host !== lib.inVersion) {
      throw new Error(
        `${lib.name}: 埋め込み先の ${lib.in} の版が ${host ?? '(無い)'} になった（確かめたのは ${lib.inVersion}）。` +
          '埋め込みの版とライセンスを確かめ直して、全文と inVersion を更新する',
      );
    }
    checkAllowed(lib.name, lib.license);
    entries.push({
      kind: 'native', name: lib.name, ...(lib.version ? { version: lib.version } : {}), license: lib.license,
      text: textFile(lib.file), platform: 'android',
    });
  }
  return entries;
}

// Gradle のキャッシュの AAR（`files-2.1/<group>/<artifact>/<version>/<hash>/<artifact>-<version>.aar`）。
function findAar(group, artifact, version) {
  const cache = path.join(process.env.GRADLE_USER_HOME ?? path.join(homedir(), '.gradle'), 'caches/modules-2/files-2.1');
  const base = path.join(cache, group, artifact, version);
  const hash = existsSync(base)
    ? readdirSync(base).find((sub) => existsSync(path.join(base, sub, `${artifact}-${version}.aar`)))
    : undefined;
  if (!hash) throw new Error(`${group}:${artifact}:${version} の AAR が Gradle のキャッシュに無い（--refresh-dependencies を試す）`);
  return path.join(base, hash, `${artifact}-${version}.aar`);
}

// 全文の全行が `//` のコメント行（chrome_sync の BSD の全文は、ソースのヘッダーのまま）なら、コメントの記号を外す。
// 記号は、ライセンスの本文ではない。外さないと、画面で行を詰めたとき、記号が本文の途中に残る。
function stripLineComments(text) {
  const lines = text.split('\n');
  if (!lines.every((line) => line.trim() === '' || /^\s*\/\/ ?/.test(line))) return text;
  return normalizeText(lines.map((line) => line.replace(/^\s*\/\/ ?/, '')).join('\n'));
}

// Google の依存（androidSdkLicense の groupId）の AAR が持つ、OSS の表記。上の GOOGLE_AAR_NOTICES を参照。
function googleAarNoticeEntries(resolved) {
  const found = new Map(); // 名前 → { text, from: [成果物] }
  for (const [coordinate, version] of resolved) {
    const [group, artifact] = coordinate.split(':');
    const family = MAVEN_FAMILIES.find((candidate) => candidate.match.test(group));
    if (!family?.androidSdkLicense) continue;
    const aar = findAar(group, artifact, version);
    const read = (name) =>
      execFileSync('unzip', ['-p', aar, name], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    let index;
    let raw;
    try {
      index = JSON.parse(read('third_party_licenses.json').toString('utf8'));
      raw = read('third_party_licenses.txt');
    } catch {
      continue; // この AAR は、表記を持たない
    }
    for (const [name, range] of Object.entries(index)) {
      if (GOOGLE_AAR_NOTICES_COVERED.test(name) || name in GOOGLE_AAR_NOTICES_SKIPPED) continue;
      if (!GOOGLE_AAR_NOTICES.some((notice) => notice.name === name)) {
        throw new Error(
          `${coordinate}:${version} の third_party_licenses に、知らない名前（${name}）がある。載せる・covered・skipped の` +
            'どれかを決めて、GOOGLE_AAR_NOTICES・GOOGLE_AAR_NOTICES_COVERED・GOOGLE_AAR_NOTICES_SKIPPED に足す',
        );
      }
      const text = stripLineComments(normalizeText(raw.subarray(range.start, range.start + range.length).toString('utf8')));
      const previous = found.get(name);
      if (previous && previous.text !== text) {
        throw new Error(`${name}: AAR ごとに全文が違う（${previous.from[0]} と ${coordinate}）。内容を確かめる`);
      }
      found.set(name, { text, from: [...(previous?.from ?? []), coordinate] });
    }
  }
  if (found.size === 0) throw new Error('Google の AAR から、OSS の表記を1つも読めない');
  return GOOGLE_AAR_NOTICES.map((notice) => {
    const entry = found.get(notice.name);
    if (!entry) throw new Error(`${notice.name}: AAR の third_party_licenses から消えた。GOOGLE_AAR_NOTICES を見直す`);
    if (!NOTICE_KIND_CHECKS[notice.license](entry.text)) {
      throw new Error(`${notice.name}: 全文が、${notice.license} の想定した形ではない。内容を確かめる`);
    }
    checkAllowed(notice.name, notice.license);
    return {
      kind: 'native', name: `${notice.name} (Google Play services)`, license: notice.license, text: entry.text,
      platform: 'android',
    };
  });
}

// iOS の Pod。Podfile.lock から、載せるものを決める。
// - node_modules の中のもの（EXTERNAL SOURCES。React Native・Expo）と、codegen が作るコード（`build/generated/ios/`）、
//   自前のローカルモジュール（`../modules/`）は、載せない（前の2つは npm・React Native の項目で載せている）。
// - CocoaPods の trunk から入る Pod（`SPEC REPOS:` の節）は、IOS_TRUNK_PODS に挙げたものだけを載せる。
//   挙げていない Pod（例: expo-image が入れる SDWebImage）が入ったら、載せるものが増えるので、失敗にする。
function iosPodEntries() {
  const lock = path.join(root, 'ios/Podfile.lock');
  if (!existsSync(lock)) throw new Error('ios/Podfile.lock が無い。`npx expo prebuild --platform ios` で作ってから実行する');
  const text = readText(lock);
  const outside = [];
  const external = text.match(/^EXTERNAL SOURCES:\n((?: {2,}.*\n)+)/m);
  if (external) {
    for (const block of external[1].split(/^ {2}(?=\S)/m).filter(Boolean)) {
      const name = block.split(':')[0];
      const source = block.match(/:(?:path|podspec): "?([^"\n]+)"?/);
      const local =
        source &&
        (source[1].includes('node_modules/') ||
          source[1].startsWith('build/generated/ios/') ||
          source[1].startsWith('../modules/'));
      if (!local) outside.push(`${name}（${source ? source[1] : '出どころが読めない'}）`);
    }
  }
  const specRepos = text.match(/^SPEC REPOS:\n((?: {2,}.*\n)+)/m);
  const trunk = specRepos ? [...specRepos[1].matchAll(/^ {4}- (\S+)/gm)].map((match) => match[1]) : [];
  for (const name of trunk) {
    if (!IOS_TRUNK_PODS.some((pod) => pod.name === name)) outside.push(`${name}（SPEC REPOS）`);
  }
  if (outside.length > 0) {
    throw new Error(
      'node_modules の外から入る iOS の Pod で、把握していないものがある: ' + outside.join(', ') +
        '\nライセンスの全文を調べて、IOS_TRUNK_PODS に足す（Pod の検査を緩める前に）',
    );
  }

  const standard = textFile('Apache-2.0.txt');
  const mitMarker = /Permission is hereby granted, free of charge/;
  return IOS_TRUNK_PODS.map((pod) => {
    if (!trunk.includes(pod.name)) {
      throw new Error(`${pod.name}: Podfile.lock の SPEC REPOS に無い。IOS_TRUNK_PODS を見直す`);
    }
    // `- AppAuth (3.0.0):` のほか、`- GTMSessionFetcher/Core (5.3.1)` のように、サブスペックだけが出る Pod もある。
    const versions = new Set(
      [...text.matchAll(new RegExp(`^ {2}- ${pod.name}(?:/\\S+)? \\(([^)]+)\\)`, 'gm'))].map((match) => match[1]),
    );
    if (versions.size !== 1) {
      throw new Error(`${pod.name}: Podfile.lock から版を1つに決められない（${[...versions].join(', ') || '無い'}）`);
    }
    const [version] = versions;
    const dir = path.join(root, 'ios/Pods', pod.name);
    const files = existsSync(dir) ? readdirSync(dir).filter((name) => LICENSE_FILE.test(name)) : [];
    const notices = existsSync(dir) ? readdirSync(dir).filter((name) => /^notice(\.(md|txt))?$/i.test(name)) : [];
    if (files.length !== 1) {
      throw new Error(`${pod.name}: ios/Pods/${pod.name} の LICENSE を1つに決められない（${files.join(', ') || '無い'}）。\`pod install\` を確かめる`);
    }
    if (notices.length > 0) {
      throw new Error(`${pod.name}: NOTICE ファイル（${notices.join(', ')}）がある。Apache-2.0 の 4(d) の扱いを決めてから、この検査を直す`);
    }
    const licenseText = normalizeText(readText(path.join(dir, files[0])));
    let license;
    if (licenseText === standard) license = 'Apache-2.0';
    else if (licenseText.startsWith(standard) && mitMarker.test(licenseText.slice(standard.length))) {
      license = 'Apache-2.0 AND MIT';
    } else {
      throw new Error(`${pod.name}@${version}: LICENSE が、想定した形（標準の Apache-2.0、または Apache-2.0 に MIT が続く形）ではない。内容を確かめる`);
    }
    if (license !== pod.license) {
      throw new Error(`${pod.name}@${version}: LICENSE の種類が ${license} になった（確かめたのは ${pod.license}）。条件を確認して IOS_TRUNK_PODS を更新する`);
    }
    checkAllowed(pod.name, license, IOS_POD_ALLOWED_LICENSES);
    return { kind: 'native', name: pod.name, version, license, text: licenseText, platform: 'ios' };
  });
}

// `--apk`: APK・AAB の `lib/<abi>/` の .so が、把握しているものだけかを確かめる。
function checkApk(file) {
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\n')
    .map((entry) => entry.match(/(?:^|\/)lib\/[^/]+\/([^/]+)\.so$/))
    .filter(Boolean)
    .map((match) => match[1]);
  if (names.length === 0) throw new Error(`${file}: lib/ の .so が1つも無い。APK・AAB のパスを確かめる`);
  const unknown = [...new Set(names)].filter((name) => !KNOWN_SO.some((known) => known.test(name)));
  if (unknown.length > 0) {
    throw new Error(
      `把握していない .so が入っている: ${unknown.sort().join(', ')}\n` +
        '埋め込まれたライブラリのライセンスを調べて、MAVEN_EMBEDDED_LIBS・KNOWN_SO に足す',
    );
  }
  console.log(`${file}: .so ${new Set(names).size} 種、すべて把握しているもの`);
}

// ---------------------------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------------------------

function render(entries) {
  // 同じ全文は1つにまとめる（MIT の全文は、著作権表示の行が同じなら、多くのパッケージで共通）。
  const texts = [];
  const textIndex = new Map();
  const packages = entries
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.version ?? '').localeCompare(b.version ?? ''))
    .map(({ text, ...entry }) => {
      // 全文を載せない依存（licenseUrl だけ）。
      if (text === undefined) return entry;
      if (!textIndex.has(text)) {
        textIndex.set(text, texts.length);
        texts.push(text);
      }
      return { ...entry, text: textIndex.get(text) };
    });

  const header = `// 生成物。手で編集しない。\`node scripts/generate-licenses.mjs\` で作り直す（依存を更新・追加した
// ら、必ず作り直す。載せるものの決め方は、そのスクリプトの先頭を見る）。
// 食い違いの一部は \`npm test\`（thirdPartyLicenses.test.ts）が検出する。バンドルに入るものが増えても
// （インストール済みの依存を、新しく import したなど）、テストは気づけない。提出の前に
// \`node scripts/generate-licenses.mjs --check\` で確かめる。

/**
 * - \`npm\`: npm のパッケージ
 * - \`bundled\`: npm のパッケージの中に取り込まれた、別のプロジェクトのコード
 * - \`font\`: アイコンフォント
 * - \`native\`: ネイティブのライブラリ（React Native の C++ の依存、Android の Maven の依存、iOS の Pod）
 */
export type ThirdPartyKind = 'npm' | 'bundled' | 'font' | 'native';

export interface ThirdPartyPackage {
  kind: ThirdPartyKind;
  /** 名前（npm のパッケージ名。それ以外は、プロジェクトの名前） */
  name: string;
  /** バージョン（無いもの・版が1つに決まらないものは省く） */
  version?: string;
  /**
   * SPDX のライセンス識別子。\`licenseUrl\` を持つものだけは、SPDX にない名前（Android Software Development Kit License）
   */
  license: string;
  /** \`THIRD_PARTY_LICENSE_TEXTS\` の添字。全文を載せないもの（\`licenseUrl\` を持つもの）には無い */
  text?: number;
  /**
   * 全文を載せず、規約の URL だけを載せるもの（Android Software Development Kit License で配布される Google の
   * 依存。Open source ではない）。\`text\` とはどちらか一方だけを持つ。画面は別枠に出す
   */
  licenseUrl?: string;
  /** その OS のアプリにだけ入るもの。無ければ両方 */
  platform?: 'ios' | 'android';
  /** まとめたものの中身（Maven の成果物の \`group:artifact:version\`） */
  includes?: string[];
}
`;
  const body =
    `\n/** ライセンスの全文（先頭付近に著作権表示を含む）。同じ文は1つにまとめてある。 */\n` +
    `export const THIRD_PARTY_LICENSE_TEXTS: readonly string[] = ${JSON.stringify(texts, null, 2)};\n` +
    `\nexport const THIRD_PARTY_PACKAGES: readonly ThirdPartyPackage[] = ${JSON.stringify(packages, null, 2)};\n`;
  return { content: header + body, count: packages.length, textCount: texts.length };
}

function main() {
  const apkAt = process.argv.indexOf('--apk');
  const apk = apkAt >= 0 ? process.argv[apkAt + 1] : undefined;
  if (apkAt >= 0 && (!apk || apk.startsWith('--'))) throw new Error('--apk には、APK・AAB のパスを渡す');
  if (apk && !process.argv.includes('--check')) throw new Error('--apk は --check と一緒に使う');

  const { dirs, assets, bundledHits } = collectNpm();
  const npm = npmEntries(dirs);
  const resolvedAndroid = gradleResolvedArtifacts();
  const androidEntries = [...mavenEntries(resolvedAndroid), ...googleAarNoticeEntries(resolvedAndroid)];
  const entries = [
    ...npm.entries,
    ...bundledEntries(bundledHits, npm.dirByName),
    ...fontEntries(assets, npm.dirByName),
    ...reactNativeNativeEntries(),
    ...iosPodEntries(),
    ...androidEntries,
  ];
  const { content, count, textCount } = render(entries);
  const relative = path.relative(root, outFile);
  if (process.argv.includes('--check')) {
    if (!existsSync(outFile) || readText(outFile) !== content) {
      console.error(`${relative} が、今の依存と食い違っている。\`node scripts/generate-licenses.mjs\` で作り直す`);
      process.exit(1);
    }
    console.log(`${relative}: 今の依存と同じ（${count} 件）`);
    if (apk) checkApk(apk);
    return;
  }
  writeFileSync(outFile, content);
  console.log(`${relative}: ${count} 件、全文 ${textCount} 種`);
}

// 直接実行したときだけ動かす（`parseGradleDependency` は、確認のために import できる）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { parseGradleDependency };
