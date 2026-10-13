#!/usr/bin/env node
// アプリに入る第三者のソフトウェア（npmの依存と、アイコンフォント）のライセンスの一覧を生成する。
//
//     node scripts/generate-licenses.mjs
//
// 出力  src/legal/thirdPartyLicenses.ts（About > Open source licenses が出す。手で編集せず、
//       このスクリプトで再生成する。依存を更新・追加したら、必ず作り直す）
//
// 「アプリに入るもの」は、package.json の dependencies を機械的にたどらず、実際に入るものから
// 決める（Expoの依存には、@expo/cli・babel など、ビルドにしか使わないものが大量に含まれるため）。
//   1. JSバンドル: `expo export` の sourcemap に出る node_modules 配下のパッケージ（iOS・Android）
//   2. ネイティブ: autolinking が取り込むパッケージ（Expoのモジュールと、React Nativeの
//      ネイティブモジュール）。JSから使わなくても、ネイティブのコードがアプリに入る
//   3. アイコンフォント: アプリに入る .ttf（`expo export` のアセット）のうち、npmの依存と
//      別のライセンスを持つもの（下の ICON_FONTS）
// 載せる範囲はnpmパッケージとアイコンフォントまで。React Native・Hermes がネイティブに含む
// C++ などのライブラリ（CocoaPods・Gradle経由）は、この一覧には含まれない。
//
// ライセンスの全文は、パッケージ直下の LICENSE をそのまま使う。見つからないときや、
// 許可していない種類のライセンスのときは、黙って流さず、失敗にする（新しい依存が入ったら、
// 下の設定に足すかどうかを人が決める）。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src/legal/thirdPartyLicenses.ts');
const textsDir = path.join(root, 'scripts/license-texts');

// 載せてよいライセンス（package.json の `license`、SPDX）。ここに無いものが依存に入ったら失敗にして、
// 条件（著作権表示の方法、配布の条件）を確認してから足す。
const ALLOWED_LICENSES = new Set(['MIT', 'ISC', 'Apache-2.0']);

// パッケージ直下に LICENSE が無いもの。リポジトリのルートの LICENSE を使う（同じリポジトリの、
// LICENSE を持つパッケージの文を借りる。上流のルートの LICENSE と同じことを確認済み）。
// 値が `{ file }` のものは、パッケージもリポジトリのルートも写しを持たず、上流の LICENSE を
// scripts/license-texts/ に置いている（取得元は each の source）。
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

// 'a/b/node_modules/@scope/name/lib/x.js' → 'a/b/node_modules/@scope/name'
function packageDirOf(file) {
  const marker = 'node_modules/';
  const at = file.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = file.slice(at + marker.length).split('/');
  const depth = rest[0].startsWith('@') ? 2 : 1;
  return file.slice(0, at + marker.length) + rest.slice(0, depth).join('/');
}

function collect() {
  const dirs = new Set();
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
        const dir = packageDirOf(source);
        if (dir) dirs.add(path.join(root, dir));
      }
    }
    // アセットの一覧（JSON）は、形に依らず、パスが含まれているかだけを見る。
    assets = readFileSync(path.join(exportDir, 'assetmap.json'), 'utf8');
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
  return { dirs, assets };
}

function normalizeText(text) {
  // 行末の空白と、先頭・末尾の空行を除く（行頭の字下げは残す。src/legal/fontLicenses.ts と同じ扱い）。
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\s+$/, '');
}

function findLicenseFile(dir) {
  const files = readdirSync(dir).filter((name) => LICENSE_FILE.test(name));
  if (files.length > 1) throw new Error(`${dir}: ライセンスのファイルが複数ある（${files.join(', ')}）`);
  return files[0] ? path.join(dir, files[0]) : null;
}

function main() {
  const { dirs, assets } = collect();

  const byName = new Map();
  const infos = [...dirs].map((dir) => {
    const pkg = readJson(path.join(dir, 'package.json'));
    return { dir, name: pkg.name, version: pkg.version, license: pkg.license };
  });
  for (const info of infos) {
    // 同じ名前・版が複数の場所に入っていても、1つにする（版が違えば別に載せる）。
    byName.set(`${info.name}@${info.version}`, info);
  }
  const packageDirByName = new Map(infos.map((info) => [info.name, info.dir]));

  const entries = [];
  for (const info of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
    const license = LICENSE_OVERRIDES[info.name] ?? info.license;
    if (typeof license !== 'string' || !ALLOWED_LICENSES.has(license)) {
      throw new Error(`${info.name}@${info.version}: 許可していないライセンス（${JSON.stringify(license)}）。` +
        '条件を確認してから ALLOWED_LICENSES に足す');
    }
    let file = findLicenseFile(info.dir);
    if (!file) {
      const fallback = LICENSE_FALLBACKS[info.name];
      if (!fallback) throw new Error(`${info.name}@${info.version}: LICENSE が無い。LICENSE_FALLBACKS に足す`);
      if (fallback.file) {
        file = path.join(textsDir, fallback.file);
      } else {
        const fromDir = packageDirByName.get(fallback.from);
        file = fromDir && findLicenseFile(fromDir);
        if (!file) throw new Error(`${info.name}: 借りる先 ${fallback.from} の LICENSE が見つからない`);
      }
    }
    entries.push({ name: info.name, version: info.version, license, text: normalizeText(readFileSync(file, 'utf8')) });
  }

  for (const font of ICON_FONTS) {
    if (!assets.includes(font.asset)) {
      throw new Error(`${font.name}: アプリに入るアセットに ${font.asset} が無い。ICON_FONTS を見直す`);
    }
    const file = font.file
      ? path.join(textsDir, font.file)
      : path.join(packageDirByName.get(font.packageFile[0]) ?? '', font.packageFile[1]);
    if (!existsSync(file)) throw new Error(`${font.name}: ${file} が無い`);
    entries.push({ name: font.name, license: font.license, text: normalizeText(readFileSync(file, 'utf8')) });
  }

  // 同じ全文は1つにまとめる（MIT の全文は、著作権表示の行が同じなら、多くのパッケージで共通）。
  const texts = [];
  const textIndex = new Map();
  const packages = entries
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(({ text, ...entry }) => {
      if (!textIndex.has(text)) {
        textIndex.set(text, texts.length);
        texts.push(text);
      }
      return { ...entry, text: textIndex.get(text) };
    });

  const header = `// 生成物。手で編集しない。\`node scripts/generate-licenses.mjs\` で作り直す（依存を更新・追加した
// ら、必ず作り直す。載せるものの決め方は、そのスクリプトの先頭を見る）。
// 食い違い（インストール済みの版と違うなど）は \`npm test\`（thirdPartyLicenses.test.ts）が検出する。

export interface ThirdPartyPackage {
  /** npmのパッケージ名（アイコンフォントは、名前の後ろに \`(icon font)\`） */
  name: string;
  /** バージョン（アイコンフォントには無い） */
  version?: string;
  /** SPDX のライセンス識別子 */
  license: string;
  /** \`THIRD_PARTY_LICENSE_TEXTS\` の添字 */
  text: number;
}
`;
  const body =
    `\n/** ライセンスの全文（先頭付近に著作権表示を含む）。同じ文は1つにまとめてある。 */\n` +
    `export const THIRD_PARTY_LICENSE_TEXTS: readonly string[] = ${JSON.stringify(texts, null, 2)};\n` +
    `\nexport const THIRD_PARTY_PACKAGES: readonly ThirdPartyPackage[] = ${JSON.stringify(packages, null, 2)};\n`;
  writeFileSync(outFile, header + body);
  console.log(`${path.relative(root, outFile)}: ${packages.length} 件、全文 ${texts.length} 種`);
}

main();
