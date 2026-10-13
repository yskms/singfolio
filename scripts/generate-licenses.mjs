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
//                 iOS は、Podfile.lock に、node_modules の外から入る Pod（CocoaPods の trunk など）があれば失敗にする
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

function checkAllowed(name, license) {
  if (typeof license !== 'string' || !ALLOWED_LICENSES.has(license)) {
    throw new Error(`${name}: 許可していないライセンス（${JSON.stringify(license)}）。条件を確認してから ALLOWED_LICENSES に足す`);
  }
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
    for (const module of Object.values(found)) dirs.add(module.path);
    const config = JSON.parse(
      run('npx', ['expo-modules-autolinking', 'react-native-config', '--platform', platform, '--json']),
    );
    for (const dependency of Object.values(config.dependencies)) dirs.add(dependency.root);
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
    const licenses = [...new Set(pomLicenses(group, artifact, version).map((license) => spdxFromPom(license.name)))];
    if (licenses.length !== 1 || licenses[0] === null) {
      throw new Error(`${coordinate}:${version}: POM からライセンスを1つに決められない（${JSON.stringify(licenses)}）`);
    }
    const found = families.get(family.name) ?? { family, license: licenses[0], artifacts: [] };
    if (found.license !== licenses[0]) {
      throw new Error(`${family.name}: 成果物でライセンスが違う（${found.license} と ${licenses[0]}。${coordinate}）`);
    }
    found.artifacts.push(`${group}:${artifact}:${version}`);
    families.set(family.name, found);
  }
  const entries = [...families.values()].map(({ family, license, artifacts }) => {
    checkAllowed(family.name, license);
    let text;
    if (family.file) text = textFile(family.file);
    else if (license === 'Apache-2.0') text = textFile('Apache-2.0.txt');
    else throw new Error(`${family.name}: ${license} の全文（file）が要る`);
    const versions = new Set(artifacts.map((artifact) => artifact.split(':')[2]));
    return {
      kind: 'native', name: family.name, license, text, platform: 'android',
      ...(versions.size === 1 ? { version: [...versions][0] } : {}),
      includes: artifacts.sort(),
    };
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

// iOS の Pod。React Native・Expo の Pod は、node_modules のもの（EXTERNAL SOURCES）と、codegen が作る
// コードとして入る。
// CocoaPods の trunk など、node_modules の外から入る Pod（例: expo-image が入れる SDWebImage）があれば、
// 載せるものが増えるので、失敗にする（`SPEC REPOS:` の節が出る）。
function checkIosPods() {
  const lock = path.join(root, 'ios/Podfile.lock');
  if (!existsSync(lock)) throw new Error('ios/Podfile.lock が無い。`npx expo prebuild --platform ios` で作ってから実行する');
  const text = readText(lock);
  const outside = [];
  const specRepos = text.match(/^SPEC REPOS:\n((?: {2,}.*\n)+)/m);
  if (specRepos) {
    outside.push(...[...specRepos[1].matchAll(/^ {4}- (\S+)/gm)].map((match) => `${match[1]}（SPEC REPOS）`));
  }
  const external = text.match(/^EXTERNAL SOURCES:\n((?: {2,}.*\n)+)/m);
  if (external) {
    for (const block of external[1].split(/^ {2}(?=\S)/m).filter(Boolean)) {
      const name = block.split(':')[0];
      const source = block.match(/:(?:path|podspec): "?([^"\n]+)"?/);
      // `build/generated/ios/` は、React Native の codegen がビルドで作る、このアプリのコード。
      const local = source && (source[1].includes('node_modules/') || source[1].startsWith('build/generated/ios/'));
      if (!local) outside.push(`${name}（${source ? source[1] : '出どころが読めない'}）`);
    }
  }
  if (outside.length > 0) {
    throw new Error(
      'node_modules の外から入る iOS の Pod がある: ' + outside.join(', ') +
        '\nライセンスの全文を調べて、RN_NATIVE_LIBS のような設定に足す（Pod の検査を緩める前に）',
    );
  }
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
 * - \`native\`: ネイティブのライブラリ（React Native の C++ の依存、Android の Maven の依存）
 */
export type ThirdPartyKind = 'npm' | 'bundled' | 'font' | 'native';

export interface ThirdPartyPackage {
  kind: ThirdPartyKind;
  /** 名前（npm のパッケージ名。それ以外は、プロジェクトの名前） */
  name: string;
  /** バージョン（無いもの・版が1つに決まらないものは省く） */
  version?: string;
  /** SPDX のライセンス識別子 */
  license: string;
  /** \`THIRD_PARTY_LICENSE_TEXTS\` の添字 */
  text: number;
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
  checkIosPods();
  const entries = [
    ...npm.entries,
    ...bundledEntries(bundledHits, npm.dirByName),
    ...fontEntries(assets, npm.dirByName),
    ...reactNativeNativeEntries(),
    ...mavenEntries(gradleResolvedArtifacts()),
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
