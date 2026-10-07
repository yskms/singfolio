// SettingsService（とSettingsRepository）のテスト。`npm test` で実行する。
// 実際のSQL（node:sqlite）に対して動かす。実機のexpo-sqliteでの確認の代わりにはならない。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Appearance } from '../domain/types.ts';
import { createTestServices } from '../testing/testDatabase.ts';
import { ServiceError } from './errors.ts';

describe('appearance', () => {
  it('未設定なら system（端末の設定に従う）', async () => {
    const { services } = await createTestServices();
    assert.equal(await services.settings.getAppearance(), 'system');
  });

  it('設定した値を読み戻せる。上書きもできる', async () => {
    const { services } = await createTestServices();
    for (const appearance of ['dark', 'light', 'system'] as const) {
      await services.settings.setAppearance(appearance);
      assert.equal(await services.settings.getAppearance(), appearance);
    }
  });

  it('不正な値は invalid-appearance で、保存済みの値は変わらない', async () => {
    const { services } = await createTestServices();
    await services.settings.setAppearance('dark');
    await assert.rejects(
      services.settings.setAppearance('sepia' as Appearance),
      (error) => error instanceof ServiceError && error.code === 'invalid-appearance',
    );
    assert.equal(await services.settings.getAppearance(), 'dark');
  });

  it('保存された値が型の外のもの（将来のバージョンが書いた値など）なら、system にする', async () => {
    const { services, sqlite } = await createTestServices();
    sqlite.exec("INSERT INTO settings (key, value) VALUES ('appearance', 'sepia')");
    assert.equal(await services.settings.getAppearance(), 'system');
  });
});
