// SettingsService（とSettingsRepository）のテスト。`npm test` で実行する。
// 実際のSQL（node:sqlite）に対して動かす。実機のexpo-sqliteでの確認の代わりにはならない。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Appearance, Language } from '../domain/types.ts';
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

describe('language', () => {
  it('未保存なら、端末の言語から決めて保存する（初回起動）', async () => {
    const { services, sqlite } = await createTestServices();
    assert.equal(await services.settings.ensureLanguage(['ja-JP']), 'ja');
    // 保存してある（端末の言語が変わっても、変わらない）。
    assert.equal(await services.settings.ensureLanguage(['en-US']), 'ja');
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value: string };
    assert.equal(row.value, 'ja');
  });

  it('端末の言語が対応外なら English にして保存する', async () => {
    const { services } = await createTestServices();
    assert.equal(await services.settings.ensureLanguage(['fr-FR']), 'en');
    assert.equal(await services.settings.ensureLanguage(['ja-JP']), 'en');
  });

  it('設定した値を、上書きして読み戻せる', async () => {
    const { services } = await createTestServices();
    for (const language of ['ja', 'en', 'ja'] as const) {
      await services.settings.setLanguage(language);
      assert.equal(await services.settings.ensureLanguage(['en-US']), language);
    }
  });

  it('不正な値は invalid-language で、保存済みの値は変わらない', async () => {
    const { services } = await createTestServices();
    await services.settings.setLanguage('ja');
    await assert.rejects(
      services.settings.setLanguage('fr' as Language),
      (error) => error instanceof ServiceError && error.code === 'invalid-language',
    );
    await assert.rejects(
      services.settings.setLanguage('system' as Language),
      (error) => error instanceof ServiceError && error.code === 'invalid-language',
    );
    assert.equal(await services.settings.ensureLanguage(['en-US']), 'ja');
  });

  it('旧版の system や、型の外の値（将来のバージョンが書いた言語など）は、端末の言語から決め直して保存する', async () => {
    for (const value of ['system', 'fr']) {
      const { services, sqlite } = await createTestServices();
      sqlite.exec(`INSERT INTO settings (key, value) VALUES ('language', '${value}')`);
      assert.equal(await services.settings.ensureLanguage(['ja-JP']), 'ja', value);
      assert.equal(await services.settings.ensureLanguage(['en-US']), 'ja', value);
    }
  });

  it('Appearanceとは別の設定として保存される', async () => {
    const { services } = await createTestServices();
    await services.settings.setAppearance('dark');
    await services.settings.setLanguage('ja');
    assert.equal(await services.settings.getAppearance(), 'dark');
    assert.equal(await services.settings.ensureLanguage(['en-US']), 'ja');
    await services.settings.setLanguage('en');
    assert.equal(await services.settings.getAppearance(), 'dark');
  });
});

describe('suggestions', () => {
  it('未設定ならオン（候補を外部の検索から出す）', async () => {
    const { services } = await createTestServices();
    assert.equal(await services.settings.getSuggestionsEnabled(), true);
  });

  it('設定した値を読み戻せる。オフにも、オンに戻すこともできる', async () => {
    const { services } = await createTestServices();
    for (const enabled of [false, true, false, true]) {
      await services.settings.setSuggestionsEnabled(enabled);
      assert.equal(await services.settings.getSuggestionsEnabled(), enabled);
    }
  });

  it('off 以外の保存値（将来のバージョンが書いた値など）は、オンとして読む', async () => {
    const { services, sqlite } = await createTestServices();
    sqlite.exec("INSERT INTO settings (key, value) VALUES ('suggestions', 'maybe')");
    assert.equal(await services.settings.getSuggestionsEnabled(), true);
    sqlite.exec("UPDATE settings SET value = 'off' WHERE key = 'suggestions'");
    assert.equal(await services.settings.getSuggestionsEnabled(), false);
  });
});
