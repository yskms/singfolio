// 自前で同梱したフォントのライセンス（`fontLicenses.ts`）が、`assets/fonts/OFL-*.txt` と食い違って
// いないことのテスト。`npm test` で実行する。アイコンフォントや npm の依存は対象外（WBS 6.6）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { fontFamilies } from '../theme/fonts.ts';
import { FONT_LICENSES } from './fontLicenses.ts';

const fontsDir = new URL('../../assets/fonts/', import.meta.url);

// `fontLicenses.ts` は、行末の空白と末尾の改行を除いて写している。
const normalize = (text: string) =>
  text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/, '');

describe('FONT_LICENSES', () => {
  it('自前で同梱した書体（fontFamilies。assets/fonts/）を、過不足なく持つ', () => {
    assert.deepEqual(
      FONT_LICENSES.map((license) => license.name).sort(),
      Object.values(fontFamilies).sort(),
    );
  });

  it('assets/fonts/OFL-*.txt と同じ内容（ファイルも、過不足なく対応する）', () => {
    const files = readdirSync(fontsDir).filter((name) => /^OFL-.*\.txt$/.test(name));
    assert.equal(files.length, FONT_LICENSES.length, files.join(', '));
    const fileTexts = files.map((name) => normalize(readFileSync(new URL(name, fontsDir), 'utf8')));
    for (const license of FONT_LICENSES) {
      assert.ok(fileTexts.includes(license.text), `${license.name}: OFL-*.txt のどれとも一致しない`);
    }
  });

  it('先頭の行は著作権表示', () => {
    for (const license of FONT_LICENSES) {
      assert.match(license.text.split('\n')[0] ?? '', /^Copyright /, license.name);
    }
  });
});
