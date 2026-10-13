// 第三者のライセンスの一覧（`thirdPartyLicenses.ts`。`scripts/generate-licenses.mjs` の生成物）が、
// 依存と食い違っていないことのテスト。`npm test` で実行する。依存を更新・追加したときは、
// `node scripts/generate-licenses.mjs` で作り直す。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { THIRD_PARTY_LICENSE_TEXTS, THIRD_PARTY_PACKAGES } from './thirdPartyLicenses.ts';

const readJson = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const lock: { packages: Record<string, { version?: string }> } = readJson('../../package-lock.json');
const manifest: { dependencies: Record<string, string> } = readJson('../../package.json');

const npmPackages = THIRD_PARTY_PACKAGES.filter((entry) => entry.kind === 'npm');
const names = new Set(THIRD_PARTY_PACKAGES.map((entry) => entry.name));

// 許可しているライセンスの全文に、必ず含まれる文（生成のとき、種類は package.json の license で
// 確認しているので、ここでは、別の種類の全文が入っていないことだけを見る）。
const LICENSE_MARKERS: Record<string, RegExp> = {
  MIT: /Permission is hereby granted, free of charge/,
  ISC: /Permission to use, copy, modify, and\/or distribute this software/,
  'Apache-2.0': /Apache License\s+Version 2\.0/,
  'BSD-3-Clause': /Redistribution and use in source and binary forms/,
  'BSL-1.0': /Boost Software License - Version 1\.0/,
};

describe('THIRD_PARTY_PACKAGES', () => {
  it('名前と版の組は重ならない。全文の添字は範囲内', () => {
    const keys = THIRD_PARTY_PACKAGES.map((entry) => `${entry.name}@${entry.version ?? ''}`);
    assert.equal(new Set(keys).size, keys.length);
    for (const entry of THIRD_PARTY_PACKAGES) {
      assert.ok(THIRD_PARTY_LICENSE_TEXTS[entry.text] !== undefined, entry.name);
    }
  });

  it('全文は、すべてどれかのパッケージから使われている（使われない全文が残らない）', () => {
    const used = new Set(THIRD_PARTY_PACKAGES.map((entry) => entry.text));
    assert.equal(used.size, THIRD_PARTY_LICENSE_TEXTS.length);
  });

  it('ライセンスの種類は、全文と合っている', () => {
    for (const entry of THIRD_PARTY_PACKAGES) {
      const marker = LICENSE_MARKERS[entry.license];
      assert.ok(marker, `${entry.name}: 許可していないライセンス ${entry.license}`);
      assert.match(THIRD_PARTY_LICENSE_TEXTS[entry.text] ?? '', marker, entry.name);
    }
  });

  it('npmのパッケージは、package-lock.json に、その名前と版で入っている（依存を更新したら作り直す）', () => {
    const installed = new Set(
      Object.entries(lock.packages).map(([path, info]) => {
        const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
        return `${name}@${info.version}`;
      }),
    );
    for (const entry of npmPackages) {
      assert.ok(installed.has(`${entry.name}@${entry.version}`), `${entry.name}@${entry.version}`);
    }
  });

  it('package.json の dependencies は、すべて載っている（依存を足したら作り直す）', () => {
    const listed = new Set(npmPackages.map((entry) => entry.name));
    for (const name of Object.keys(manifest.dependencies)) {
      assert.ok(listed.has(name), name);
    }
  });

  it('アイコンフォント（Ionicons・Material Symbols）が載っている', () => {
    const fonts = THIRD_PARTY_PACKAGES.filter((entry) => entry.kind === 'font').map((entry) => entry.name);
    assert.deepEqual(fonts.sort(), ['Ionicons (icon font)', 'Material Symbols (icon font)']);
  });

  it('expo-router が取り込んだ React Navigation の著作権表示が載っている（Expo の LICENSE とは別の行）', () => {
    const entry = THIRD_PARTY_PACKAGES.find((item) => item.kind === 'bundled');
    assert.equal(entry?.name, 'React Navigation (bundled in expo-router)');
    const text = THIRD_PARTY_LICENSE_TEXTS[entry?.text ?? -1] ?? '';
    assert.match(text, /Copyright \(c\) 2017 React Navigation Contributors/);
  });

  it('ネイティブのライブラリ（React Native の C++ の依存と、Android の Maven の依存）が載っている', () => {
    for (const name of ['Hermes', 'Folly', 'glog', 'double-conversion', 'Boost', '{fmt}', 'fast_float']) {
      assert.ok(names.has(name), name);
    }
    for (const name of ['AndroidX', 'OkHttp', 'Okio', 'Fresco', 'SoLoader', 'fbjni', 'Kotlin']) {
      assert.ok(names.has(name), name);
    }
    // SocketRocket は iOS だけ、Maven の依存は Android だけ。
    assert.equal(THIRD_PARTY_PACKAGES.find((item) => item.name === 'SocketRocket')?.platform, 'ios');
    assert.equal(THIRD_PARTY_PACKAGES.find((item) => item.name === 'AndroidX')?.platform, 'android');
  });

  it('platform・includes は、ネイティブのものにだけある。includes は group:artifact:version', () => {
    for (const entry of THIRD_PARTY_PACKAGES) {
      if (entry.platform !== undefined) {
        assert.ok(entry.platform === 'ios' || entry.platform === 'android', entry.name);
        assert.equal(entry.kind, 'native', entry.name);
      }
      if (entry.includes !== undefined) {
        assert.equal(entry.kind, 'native', entry.name);
        assert.ok(entry.includes.length > 0, entry.name);
        for (const coordinate of entry.includes) assert.match(coordinate, /^[\w.-]+:[\w.-]+:[\w.-]+$/, entry.name);
      }
    }
  });
});
