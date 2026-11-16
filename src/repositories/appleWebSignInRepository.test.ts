// AndroidのAppleログイン（Web経由）のRepositoryのテスト。`npm test` で実行する。ブラウザ・URLの受け取り・前面への
// 復帰は偽物。実機のCustom Tab・Appleの画面での確認は、docs §8（7.3.9・7.3.13）。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthError } from './authError.ts';
import {
  APP_RETURN_URL,
  APPLE_CALLBACK_URL,
  APPLE_SERVICES_ID,
  buildAuthorizeUrl,
  createAppleWebSignInRepository,
  parseReturnUrl,
  redirectSystemPath,
  type AuthBrowser,
} from './appleWebSignInRepository.ts';

const HASHED = 'H'.repeat(43);

/** 偽のブラウザ。開いたURLを記録し、`emitUrl`・`emitForeground` で、アプリに届くものを送る。 */
function fakeBrowser(options: { openFails?: boolean } = {}) {
  const urls = new Set<(url: string) => void>();
  const foregrounds = new Set<() => void>();
  const opened: string[] = [];
  const browser: AuthBrowser = {
    open: async (url) => {
      opened.push(url);
      if (options.openFails) throw new Error('no browser SECRET-URL');
    },
    onUrl: (listener) => {
      urls.add(listener);
      return () => urls.delete(listener);
    },
    onForeground: (listener) => {
      foregrounds.add(listener);
      return () => foregrounds.delete(listener);
    },
  };
  return {
    browser,
    opened,
    emitUrl: (url: string) => [...urls].forEach((listener) => listener(url)),
    emitForeground: () => [...foregrounds].forEach((listener) => listener()),
    listenerCount: () => urls.size + foregrounds.size,
  };
}

async function failureCode(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AuthError, 'AuthError で失敗する');
    return { code: error.code, message: error.message };
  }
  assert.fail('失敗するはず');
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('buildAuthorizeUrl', () => {
  it('Apple の認可のURL。client_id は Services ID、redirect_uri は Worker のコールバック、scope は付けない', () => {
    const url = new URL(buildAuthorizeUrl(HASHED));
    assert.equal(`${url.origin}${url.pathname}`, 'https://appleid.apple.com/auth/authorize');
    assert.equal(url.searchParams.get('client_id'), APPLE_SERVICES_ID);
    assert.equal(url.searchParams.get('redirect_uri'), APPLE_CALLBACK_URL);
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('response_mode'), 'query');
    // state と nonce は、渡された SHA-256(T) をそのまま入れる
    assert.equal(url.searchParams.get('state'), HASHED);
    assert.equal(url.searchParams.get('nonce'), HASHED);
    // 名前・メールを要求しない。スコープを付けると、response_mode が form_post に限られる
    assert.equal(url.searchParams.has('scope'), false);
  });

  it('Workerの設定と同じ値を指している（Services ID・Return URL・戻り先のスキーム）', () => {
    assert.equal(APPLE_SERVICES_ID, 'com.yskms.singfolio.web');
    assert.equal(APPLE_CALLBACK_URL, 'https://singfolio.app/auth/apple/callback');
    assert.equal(APP_RETURN_URL, 'singfolio://auth/apple');
  });
});

describe('parseReturnUrl', () => {
  it('code・state・error を読む（URLデコードする）', () => {
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}?code=a%2Bb%2Fc&state=${HASHED}`), {
      code: 'a+b/c',
      state: HASHED,
    });
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}?error=user_cancelled_authorize&state=${HASHED}`), {
      error: 'user_cancelled_authorize',
      state: HASHED,
    });
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}`), {});
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}/?code=x`), { code: 'x' });
  });

  it('同じ名前が複数あれば最初のもの。知らない名前・読めない値は無視する', () => {
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}?code=a&code=b&other=1&state=%E0%A4%A`), { code: 'a' });
    assert.deepEqual(parseReturnUrl(`${APP_RETURN_URL}?code=a#frag`), { code: 'a' });
  });

  it('アプリの他のURLや、似たURLは null（画面へ渡す）', () => {
    for (const url of [
      'singfolio://song/1',
      'singfolio://auth/applesauce?code=x',
      'singfolio://auth/apple2?code=x',
      'singfolio://auth',
      'singfolio://',
      'https://singfolio.app/auth/apple/callback?code=x',
      'other://auth/apple?code=x',
      '',
    ]) {
      assert.equal(parseReturnUrl(url), null, url);
    }
  });
});

describe('redirectSystemPath（app/+native-intent.tsx）', () => {
  it('Appleからの戻りのURLは、起動中は null（遷移しない）、起動時は "/"（ルートから始める。null だと Stack の既定の先頭が開く）', () => {
    const url = `${APP_RETURN_URL}?code=x&state=${HASHED}`;
    assert.equal(redirectSystemPath(url, false), null);
    assert.equal(redirectSystemPath(url, true), '/');
    assert.equal(redirectSystemPath(`${APP_RETURN_URL}?error=user_cancelled_authorize`, true), '/');
  });

  it('ほかのURLは、起動中も起動時も、そのまま渡す', () => {
    for (const url of ['singfolio://song/1', 'singfolio://', 'singfolio://auth/applesauce?code=x', '/songs']) {
      assert.equal(redirectSystemPath(url, false), url);
      assert.equal(redirectSystemPath(url, true), url);
    }
  });
});

describe('getAuthorizationCode', () => {
  it('認可の画面を開き、戻りのURLの code を返す。受け取りは、ブラウザを開く前に始め、終わったらやめる', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser).getAuthorizationCode(HASHED);
    assert.deepEqual(fake.opened, [buildAuthorizeUrl(HASHED)]);
    assert.equal(fake.listenerCount(), 2);
    fake.emitUrl(`${APP_RETURN_URL}?code=the-code&state=${HASHED}`);
    assert.equal(await promise, 'the-code');
    assert.equal(fake.listenerCount(), 0);
  });

  it('前面に戻る通知が、戻りのURLより先でも、URLが猶予のうちに来れば受け取る', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser, { graceMs: 50 }).getAuthorizationCode(HASHED);
    fake.emitForeground();
    await wait(10);
    fake.emitUrl(`${APP_RETURN_URL}?code=late&state=${HASHED}`);
    assert.equal(await promise, 'late');
  });

  it('利用者がブラウザを閉じた（前面に戻ったが、猶予のうちにURLが来ない）: cancelled', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser, { graceMs: 20 }).getAuthorizationCode(HASHED);
    fake.emitForeground();
    assert.equal((await failureCode(promise)).code, 'cancelled');
    assert.equal(fake.listenerCount(), 0);
  });

  it('Appleの画面で取りやめ（error=user_cancelled_authorize）: cancelled。ほかの error は provider-failed', async () => {
    for (const [error, code] of [
      ['user_cancelled_authorize', 'cancelled'],
      ['access_denied', 'provider-failed'],
      ['invalid_request', 'provider-failed'],
    ] as const) {
      const fake = fakeBrowser();
      const promise = createAppleWebSignInRepository(fake.browser).getAuthorizationCode(HASHED);
      fake.emitUrl(`${APP_RETURN_URL}?error=${error}&state=${HASHED}`);
      assert.equal((await failureCode(promise)).code, code, error);
    }
    // 取りやめは state が付かないことがある
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser).getAuthorizationCode(HASHED);
    fake.emitUrl(`${APP_RETURN_URL}?error=user_cancelled_authorize`);
    assert.equal((await failureCode(promise)).code, 'cancelled');
  });

  it('state が違う・無い code のURLは、自分のフローのものではないので受け取らず、待ち続ける（正しいものが後から来れば通る）', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser, { graceMs: 1000 }).getAuthorizationCode(HASHED);
    fake.emitUrl(`${APP_RETURN_URL}?code=forged&state=${'X'.repeat(43)}`);
    fake.emitUrl(`${APP_RETURN_URL}?code=nostate`);
    fake.emitUrl(`${APP_RETURN_URL}?error=access_denied&state=${'X'.repeat(43)}`); // 違う state の error も無視
    fake.emitUrl(`${APP_RETURN_URL}?code=&state=${HASHED}`); // 空の code
    fake.emitUrl('singfolio://song/1'); // アプリの他のURL
    await wait(5);
    fake.emitUrl(`${APP_RETURN_URL}?code=real&state=${HASHED}`);
    assert.equal(await promise, 'real');
  });

  it('ブラウザを開けなかった: provider-failed。例外の内容は載せない', async () => {
    const fake = fakeBrowser({ openFails: true });
    const failure = await failureCode(createAppleWebSignInRepository(fake.browser).getAuthorizationCode(HASHED));
    assert.equal(failure.code, 'provider-failed');
    assert.equal(failure.message.includes('SECRET-URL'), false);
    assert.equal(fake.listenerCount(), 0);
  });

  it('上限（既定は5分）を過ぎたら timeout にして、受け取りをやめる', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser, { waitLimitMs: 20 }).getAuthorizationCode(HASHED);
    assert.equal((await failureCode(promise)).code, 'timeout');
    assert.equal(fake.listenerCount(), 0);
  });

  it('終わったあとに届いたURL・前面への復帰は、何もしない（二重に解決・失敗しない）', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser, { graceMs: 10 }).getAuthorizationCode(HASHED);
    fake.emitUrl(`${APP_RETURN_URL}?code=first&state=${HASHED}`);
    assert.equal(await promise, 'first');
    fake.emitUrl(`${APP_RETURN_URL}?code=second&state=${HASHED}`);
    fake.emitForeground();
    await wait(30);
    assert.equal(fake.listenerCount(), 0);
  });

  it('認可コード・state を、エラーの message に載せない', async () => {
    const fake = fakeBrowser();
    const promise = createAppleWebSignInRepository(fake.browser).getAuthorizationCode(HASHED);
    fake.emitUrl(`${APP_RETURN_URL}?error=access_denied_${'x'}&state=${HASHED}`);
    const failure = await failureCode(promise);
    assert.equal(failure.message.includes(HASHED), false);
  });
});
