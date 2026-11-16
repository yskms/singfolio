// GoogleのサインインのRepositoryのテスト。`npm test` で実行する。自作のExpoモジュールは偽物。
// 実際のモジュール・SDKでの確認（`nonce` の扱い、取りやめのコード）は、iOS Simulator・Androidエミュレータ（docs §8）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthError } from './authError.ts';
import { createGoogleSignInRepository, type GoogleSignInLike } from './googleSignInRepository.ts';

function fakeGoogle(overrides: Partial<GoogleSignInLike> = {}) {
  const nonces: string[] = [];
  const google: GoogleSignInLike = {
    signInWithGoogle: async (nonce) => {
      nonces.push(nonce);
      return 'ID-TOKEN';
    },
    ...overrides,
  };
  return { google, nonces };
}

/** Expo Modules の例外の形（`code` を持つ）。 */
function coded(code: string, message = 'native failure SECRET-TOKEN'): Error {
  return Object.assign(new Error(message), { code });
}

async function codeOfFailure(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AuthError, 'AuthError で失敗する');
    return { code: error.code, message: error.message };
  }
  assert.fail('失敗するはず');
}

describe('getIdToken', () => {
  it('渡された nonce をそのまま渡し、IDトークンを返す', async () => {
    const { google, nonces } = fakeGoogle();
    const hashed = 'x'.repeat(43);
    assert.equal(await createGoogleSignInRepository(google).getIdToken(hashed), 'ID-TOKEN');
    assert.deepEqual(nonces, [hashed]);
  });

  it('取りやめ（ERR_CANCELED）は cancelled', async () => {
    const { google } = fakeGoogle({
      signInWithGoogle: async () => {
        throw coded('ERR_CANCELED');
      },
    });
    const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
    assert.equal(failure.code, 'cancelled');
  });

  it('取りやめ以外のSDKの失敗は provider-failed。元の例外の内容は載せない', async () => {
    for (const code of ['ERR_NO_ACCOUNT', 'ERR_FAILED', 'ERR_NO_PRESENTER']) {
      const { google } = fakeGoogle({
        signInWithGoogle: async () => {
          throw coded(code);
        },
      });
      const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
      assert.equal(failure.code, 'provider-failed', code);
      assert.ok(!failure.message.includes('SECRET-TOKEN'));
    }
  });

  it('モジュールが組み込まれていなければ（ERR_UNAVAILABLE）provider-unavailable', async () => {
    const { google } = fakeGoogle({
      signInWithGoogle: async () => {
        throw coded('ERR_UNAVAILABLE');
      },
    });
    const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
    assert.equal(failure.code, 'provider-unavailable');
  });

  it('IDトークンを取り出せなかった（ERR_NO_ID_TOKEN）は invalid-response', async () => {
    const { google } = fakeGoogle({
      signInWithGoogle: async () => {
        throw coded('ERR_NO_ID_TOKEN');
      },
    });
    const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
    assert.equal(failure.code, 'invalid-response');
  });

  it('クライアントIDが無い（ERR_NOT_CONFIGURED）・想定していない失敗は unexpected。内容は載せない', async () => {
    for (const thrown of [
      coded('ERR_NOT_CONFIGURED'),
      new Error('boom SECRET-TOKEN'),
      coded('ERR_SOMETHING_NEW'),
      'SECRET-TOKEN',
      null,
      undefined,
    ]) {
      const { google } = fakeGoogle({
        signInWithGoogle: async () => {
          throw thrown;
        },
      });
      const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
      assert.equal(failure.code, 'unexpected');
      assert.ok(!failure.message.includes('SECRET-TOKEN'));
    }
  });

  it('IDトークンが空・文字列でなければ invalid-response', async () => {
    for (const idToken of ['', null, undefined, 5]) {
      const { google } = fakeGoogle({ signInWithGoogle: async () => idToken as string });
      const failure = await codeOfFailure(createGoogleSignInRepository(google).getIdToken('n'));
      assert.equal(failure.code, 'invalid-response');
    }
  });
});
