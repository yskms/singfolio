// セッションの保存先のテスト。`npm test` で実行する。メモリ上の偽の SecureStore で動かす
// （実機のKeychain・Keystoreでの確認の代わりにはならない）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSessionRepository, type SecureStorage } from './sessionRepository.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: SecureStorage = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => void items.set(key, value),
    deleteItemAsync: async (key) => void items.delete(key),
  };
  return { storage, items };
}

const stored = (session: string, provider: 'apple' | 'google' = 'apple', localDataId = 'data-1') =>
  ({ session, provider, localDataId }) as const;

describe('sessionRepository', () => {
  it('保存して読み戻せる。保存先はSecureStoreのキー1つだけで、ユーザー情報は持たない', async () => {
    const { storage, items } = memoryStorage();
    const sessions = createSessionRepository(storage);
    assert.deepEqual(await sessions.read(), { kind: 'none' });
    await sessions.set(stored('abc', 'google', 'data-9'));
    assert.deepEqual(await sessions.read(), { kind: 'found', value: stored('abc', 'google', 'data-9') });
    assert.equal(items.size, 1);
    const [key, raw] = [...items][0];
    assert.match(key, /^[A-Za-z0-9._-]+$/); // SecureStore が受け付けるキー
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['localDataId', 'provider', 'session', 'v']);
  });

  it('上書きできる。clear で消え、無くても成功する', async () => {
    const { storage } = memoryStorage();
    const sessions = createSessionRepository(storage);
    await sessions.set(stored('one', 'apple'));
    await sessions.set(stored('two', 'google'));
    assert.deepEqual(await sessions.read(), { kind: 'found', value: stored('two', 'google') });
    await sessions.clear();
    assert.deepEqual(await sessions.read(), { kind: 'none' });
    await sessions.clear();
  });

  it('壊れた値・知らない版・知らないログイン手段・識別子の無い値は unreadable（消さない）', async () => {
    const bad = [
      'not json',
      '"string"',
      'null',
      JSON.stringify({ v: 2, session: 'abc', provider: 'apple', localDataId: 'd' }),
      JSON.stringify({ v: 1, session: '', provider: 'apple', localDataId: 'd' }),
      JSON.stringify({ v: 1, session: 'abc', provider: 'facebook', localDataId: 'd' }),
      JSON.stringify({ v: 1, session: 5, provider: 'apple', localDataId: 'd' }),
      JSON.stringify({ session: 'abc', provider: 'apple', localDataId: 'd' }),
      JSON.stringify({ v: 1, session: 'abc', provider: 'apple' }),
      JSON.stringify({ v: 1, session: 'abc', provider: 'apple', localDataId: '' }),
    ];
    for (const raw of bad) {
      const { storage, items } = memoryStorage({ 'singfolio.session': raw });
      assert.deepEqual(await createSessionRepository(storage).read(), { kind: 'unreadable' }, raw);
      assert.equal(items.size, 1, '読めない値は消さない');
    }
  });

  it('読み取りの失敗は unreadable（投げない）。値が無い none とは区別する', async () => {
    const sessions = createSessionRepository({
      getItemAsync: async () => {
        throw new Error('keychain locked');
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    });
    assert.deepEqual(await sessions.read(), { kind: 'unreadable' });
  });

  it('保存・削除の失敗は投げる', async () => {
    const failing: SecureStorage = {
      getItemAsync: async () => null,
      setItemAsync: async () => {
        throw new Error('write failed');
      },
      deleteItemAsync: async () => {
        throw new Error('delete failed');
      },
    };
    const sessions = createSessionRepository(failing);
    await assert.rejects(sessions.set(stored('abc')), /write failed/);
    await assert.rejects(sessions.clear(), /delete failed/);
  });

  it('削除が黙って失敗して、値が残っているときは、clear が投げる（iOSの deleteItemAsync は投げない）', async () => {
    const { storage, items } = memoryStorage({ 'singfolio.session': 'still here' });
    const sessions = createSessionRepository({ ...storage, deleteItemAsync: async () => {} });
    await assert.rejects(sessions.clear(), /could not be removed/);
    assert.equal(items.size, 1);
  });

  it('削除のあとの読み戻しが投げたら、clear も投げる（残っていないと確かめられない）', async () => {
    const sessions = createSessionRepository({
      getItemAsync: async () => {
        throw new Error('keychain error');
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    });
    await assert.rejects(sessions.clear(), /keychain error/);
  });
});
