// アイコンの import の仕方のテスト。`npm test` で実行する。
//
// `@expo/vector-icons` を、ルート（`import { Ionicons } from '@expo/vector-icons'`）から importすると、
// 全てのアイコンセット（20種類）が読み込まれ、そのフォント（TTF）が全部アプリに入る（`expo export`
// で確認。約5MB増える）。使うセットのパス（`@expo/vector-icons/Ionicons`）から importすると、
// そのセットのフォントだけになる。見た目は同じで、壊れても動くので、テストで固定する。
//
// ソースの文字列を見る簡易な検査（`src/theme/fonts.test.ts` と同じ）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);

describe('@expo/vector-icons の import', () => {
  it('ルートからは importしない（使うアイコンセットのパスから importする）', () => {
    const violations: string[] = [];
    for (const dir of ['app', 'ui', 'src']) {
      for (const file of readdirSync(new URL(`${dir}/`, root), { recursive: true }) as string[]) {
        if (!/\.tsx?$/.test(file)) continue;
        const path = `${dir}/${file}`;
        // 自分自身（このテスト）は、説明のために書いているので除く。
        if (path === 'src/iconImports.test.ts') continue;
        const text = readFileSync(new URL(path, root), 'utf8');
        if (/from\s*['"]@expo\/vector-icons['"]/.test(text) || /require\(\s*['"]@expo\/vector-icons['"]\s*\)/.test(text)) {
          violations.push(`${path}: @expo/vector-icons をルートからimportしている（@expo/vector-icons/Ionicons のように、セットを指定する）`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});
