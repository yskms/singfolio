// AppleのサインインのRepositoryのテスト。`npm test` で実行する。SDK（expo-apple-authentication）は偽物。
// 実際のAppleのIDトークンでの確認（`nonce` の扱いなど）は、実機・Simulator（docs §8）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthError, isTemporaryAuthError } from './authError.ts';
import {
  createAppleSignInRepository,
  type AppleAuthenticationLike,
} from './appleSignInRepository.ts';

function fakeApple(overrides: Partial<AppleAuthenticationLike> = {}) {
  const requests: Array<{ requestedScopes: unknown[]; nonce: string }> = [];
  const apple: AppleAuthenticationLike = {
    isAvailableAsync: async () => true,
    signInAsync: async (options) => {
      requests.push(options);
      return { identityToken: 'ID-TOKEN' };
    },
    ...overrides,
  };
  return { apple, requests };
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
  it('渡された nonce をそのまま入れ、名前・メールは要求せず、IDトークンを返す', async () => {
    const { apple, requests } = fakeApple();
    const hashed = 'x'.repeat(43);
    assert.equal(await createAppleSignInRepository(apple).getIdToken(hashed), 'ID-TOKEN');
    assert.deepEqual(requests, [{ requestedScopes: [], nonce: hashed }]);
  });

  it('取りやめ（ERR_REQUEST_CANCELED）は cancelled', async () => {
    const { apple } = fakeApple({
      signInAsync: async () => {
        throw coded('ERR_REQUEST_CANCELED');
      },
    });
    const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
    assert.equal(failure.code, 'cancelled');
  });

  it('取りやめ以外のSDKの失敗は provider-failed。元の例外の内容は載せない', async () => {
    for (const code of [
      'ERR_REQUEST_UNKNOWN',
      'ERR_REQUEST_FAILED',
      'ERR_REQUEST_NOT_HANDLED',
      'ERR_REQUEST_NOT_INTERACTIVE',
      'ERR_INVALID_RESPONSE',
      'ERR_REQUEST_MATCHED_EXCLUDED_CREDENTIAL',
    ]) {
      const { apple } = fakeApple({
        signInAsync: async () => {
          throw coded(code);
        },
      });
      const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
      assert.equal(failure.code, 'provider-failed', code);
      assert.ok(!failure.message.includes('SECRET-TOKEN'));
    }
  });

  it('想定していない失敗（コードの無い例外・知らないコード・例外でない値）は unexpected。内容は載せない', async () => {
    for (const thrown of [
      new Error('boom SECRET-TOKEN'),
      coded('ERR_SOMETHING_NEW'),
      coded('ERR_APPLE_AUTHENTICATION_UNAVAILABLE'),
      'SECRET-TOKEN',
      null,
      undefined,
    ]) {
      const { apple } = fakeApple({
        signInAsync: async () => {
          throw thrown;
        },
      });
      const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
      assert.equal(failure.code, 'unexpected');
      assert.ok(!failure.message.includes('SECRET-TOKEN'));
    }
  });

  it('端末がAppleのサインインに対応していなければ provider-unavailable。サインインは開かない', async () => {
    const { apple, requests } = fakeApple({ isAvailableAsync: async () => false });
    const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
    assert.equal(failure.code, 'provider-unavailable');
    assert.deepEqual(requests, []);
  });

  it('対応しているかの確認が失敗したら unexpected', async () => {
    const { apple } = fakeApple({
      isAvailableAsync: async () => {
        throw new Error('boom');
      },
    });
    const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
    assert.equal(failure.code, 'unexpected');
  });

  it('IDトークンが無い・空・文字列でなければ invalid-response', async () => {
    for (const identityToken of [null, '', undefined, 5]) {
      const { apple } = fakeApple({
        signInAsync: async () => ({ identityToken: identityToken as string | null }),
      });
      const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdToken('n'));
      assert.equal(failure.code, 'invalid-response');
    }
  });
});

describe('getIdTokenWithCode（アカウントの削除の再認証）', () => {
  it('getIdToken と同じ呼び出し（スコープ無し・nonce をそのまま）で、IDトークンと認可コードを返す', async () => {
    const { apple, requests } = fakeApple({
      signInAsync: async (options) => {
        requests.push(options);
        return { identityToken: 'ID-TOKEN', authorizationCode: 'AUTH-CODE' };
      },
    });
    const hashed = 'x'.repeat(43);
    assert.deepEqual(await createAppleSignInRepository(apple).getIdTokenWithCode(hashed), {
      idToken: 'ID-TOKEN',
      authorizationCode: 'AUTH-CODE',
    });
    assert.deepEqual(requests, [{ requestedScopes: [], nonce: hashed }]);
  });

  it('認可コードが無い・空なら、付けずに返す（失効できないだけで、本人確認はできる）', async () => {
    for (const authorizationCode of [null, undefined, '']) {
      const { apple } = fakeApple({ signInAsync: async () => ({ identityToken: 'ID-TOKEN', authorizationCode }) });
      assert.deepEqual(await createAppleSignInRepository(apple).getIdTokenWithCode('n'), { idToken: 'ID-TOKEN' });
    }
  });

  it('getIdToken は、認可コードがあっても返さない', async () => {
    const { apple } = fakeApple({ signInAsync: async () => ({ identityToken: 'ID-TOKEN', authorizationCode: 'AUTH-CODE' }) });
    assert.equal(await createAppleSignInRepository(apple).getIdToken('n'), 'ID-TOKEN');
  });

  it('失敗の分類は getIdToken と同じ（取りやめ・失敗・対応していない・IDトークンが無い）。コードを載せない', async () => {
    for (const [thrown, code] of [
      [coded('ERR_REQUEST_CANCELED'), 'cancelled'],
      [coded('ERR_REQUEST_UNKNOWN'), 'provider-failed'],
      [new Error('boom SECRET-TOKEN'), 'unexpected'],
    ] as const) {
      const { apple } = fakeApple({
        signInAsync: async () => {
          throw thrown;
        },
      });
      const failure = await codeOfFailure(createAppleSignInRepository(apple).getIdTokenWithCode('n'));
      assert.equal(failure.code, code);
      assert.ok(!failure.message.includes('SECRET-TOKEN'));
    }
    const unavailable = fakeApple({ isAvailableAsync: async () => false });
    assert.equal((await codeOfFailure(createAppleSignInRepository(unavailable.apple).getIdTokenWithCode('n'))).code, 'provider-unavailable');
    assert.deepEqual(unavailable.requests, []);
    const noToken = fakeApple({ signInAsync: async () => ({ identityToken: null, authorizationCode: 'AUTH-CODE' }) });
    assert.equal((await codeOfFailure(createAppleSignInRepository(noToken.apple).getIdTokenWithCode('n'))).code, 'invalid-response');
  });
});

describe('isTemporaryAuthError', () => {
  it('timeout は一時的な失敗（やり直せば通りうる）。provider-failed は、設定の確認が要るので含めない', () => {
    assert.equal(isTemporaryAuthError(new AuthError('timeout')), true);
    assert.equal(isTemporaryAuthError(new AuthError('provider-failed')), false);
    assert.equal(isTemporaryAuthError(new AuthError('cancelled')), false);
  });
});
