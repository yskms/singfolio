// 文言のカタログ（en / ja）の整合のテスト。キーの過不足は型が保証するので、ここでは、
// 型では分からない中身（空の文言・`{name}` の食い違い・件数の形）を見る。`npm test` で実行する。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES } from '../domain/types.ts';
import {
  AuthError,
  DatabaseTooNewError,
  PublishError,
  ServiceError,
  type AuthErrorCode,
  type PublishErrorCode,
} from '../services/errors.ts';
import {
  accountErrorMessageKey,
  catalogs,
  createAppTranslator,
  errorMessageKey,
  errorScreenContent,
  needsProfileReload,
  publicProfileErrorMessageKey,
  type AccountAction,
  type PublicProfileAction,
  type MessageKey,
} from './index.ts';
import { en } from './en.ts';
import { placeholderNames } from './translate.ts';
import type { Message } from './types.ts';

const keys = Object.keys(en) as MessageKey[];

function forms(message: Message): string[] {
  return typeof message === 'string' ? [message] : Object.values(message);
}

describe('catalogs', () => {
  it('全言語が、English と同じキーを過不足なく持つ（型の保証が実行時にも成り立つ）', () => {
    for (const language of LANGUAGES) {
      assert.deepEqual(Object.keys(catalogs[language]).sort(), [...keys].sort(), language);
    }
  });

  it('空の文言が無い', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        for (const form of forms(catalogs[language][key])) {
          assert.notEqual(form.trim(), '', `${language}: ${key}`);
        }
      }
    }
  });

  it('English が件数の文言なら、他の言語も件数の文言（count を渡す呼び出しが、どの言語でも同じ）', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        assert.equal(
          typeof catalogs[language][key] === 'string',
          typeof catalogs.en[key] === 'string',
          `${language}: ${key}`,
        );
      }
    }
  });

  it('English の件数の文言は、one と other の両方を持つ', () => {
    for (const key of keys) {
      const message = catalogs.en[key];
      if (typeof message !== 'string') assert.ok(message.one && message.other, key);
    }
  });

  it('波括弧は {name}（英数字と _ だけの名前）の形だけ。型の読み取りと実行時の置き換えが食い違わない', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        for (const form of forms(catalogs[language][key])) {
          assert.doesNotMatch(form.replace(/\{\w+\}/g, ''), /[{}]/, `${language}: ${key}`);
        }
      }
    }
  });

  it('{name} の名前が、言語間で食い違わない（呼び出し側が渡す値は言語によらず同じ）', () => {
    const names = (message: Message) =>
      [...new Set(forms(message).flatMap(placeholderNames))].sort();
    for (const language of LANGUAGES) {
      for (const key of keys) {
        // 件数の文言は、言語によって使わない形がある（日本語の one など）ので、形ごとではなく
        // 文言全体で見る。
        assert.deepEqual(names(catalogs[language][key]), names(catalogs.en[key]), `${language}: ${key}`);
      }
    }
  });
});

describe('createAppTranslator', () => {
  it('言語ごとの文言を返す', () => {
    assert.equal(createAppTranslator('en')('tabs.songs'), 'Songs');
    assert.equal(createAppTranslator('ja')('tabs.songs'), '曲');
  });

  it('必要な値の型は、English の文言のリテラル型（as const）から決まる', () => {
    // en.ts の `as const` を外すと、文言が string に広がり、`t` が値を要求できなくなる。
    // 下の代入が型エラーになるので、`npm run typecheck` が検出する。
    const songs: 'Songs' = en['tabs.songs'];
    assert.equal(songs, 'Songs');
    const t = createAppTranslator('en');
    // @ts-expect-error 値の要らない文言に値は渡せない
    t('tabs.songs', { count: 1 });
  });
});

describe('errorMessageKey', () => {
  it('利用者が入力で起こす失敗は、それぞれ専用の文言。それ以外は汎用', () => {
    assert.equal(errorMessageKey(new ServiceError('title-required')), 'error.titleRequired');
    assert.equal(errorMessageKey(new ServiceError('tag-name-duplicate')), 'error.tagNameDuplicate');
    assert.equal(errorMessageKey(new ServiceError('invalid-language')), 'error.unexpected');
  });

  it('ServiceError 以外（DBの失敗・undefined など）は汎用の文言', () => {
    assert.equal(errorMessageKey(new Error('disk full')), 'error.unexpected');
    assert.equal(errorMessageKey(undefined), 'error.unexpected');
  });
});

describe('errorScreenContent', () => {
  it('アプリより新しいDBは、再試行ではなくアプリの更新を促す（やり直しても開けない）', () => {
    assert.deepEqual(errorScreenContent(new DatabaseTooNewError(99, 1)), {
      titleKey: 'errorScreen.updateTitle',
      messageKey: 'errorScreen.updateMessage',
      canRetry: false,
    });
  });

  it('それ以外（DBを開けない・描画の失敗・Error以外の値）は、汎用の文言で、やり直せる', () => {
    for (const error of [new Error('disk full'), new ServiceError('song-not-found'), undefined, 'x']) {
      assert.deepEqual(errorScreenContent(error), {
        titleKey: 'errorScreen.title',
        messageKey: 'errorScreen.message',
        canRetry: true,
      });
    }
  });
});

describe('app.json', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  const plugin = (expo.plugins as unknown[]).find(
    (entry): entry is [string, { supportedLocales?: { ios?: string[]; android?: string[] } }] =>
      Array.isArray(entry) && entry[0] === 'expo-localization',
  );
  const supported = plugin?.[1].supportedLocales;
  const sorted = (values: readonly string[]) => [...values].sort();

  it('iOSの対応言語（CFBundleLocalizations）が、アプリの言語と同じ', () => {
    // 宣言が無いと、iOSの標準の文言（コピー/ペーストのメニューなど）が日本語の端末でも
    // 英語のままになる（Appleの説明による。このアプリでは未確認）。JSからは読めないので
    // 手で写していて、ここで食い違いを検出する。
    assert.deepEqual(sorted(supported?.ios ?? []), sorted(LANGUAGES));
  });

  it('Androidは宣言しない（OSのアプリごとの言語を出さず、言語の操作をアプリ内に一本化する）。宣言するなら、アプリの言語と同じ', () => {
    assert.deepEqual(sorted(supported?.android ?? LANGUAGES), sorted(LANGUAGES));
  });
});

describe('accountErrorMessageKey', () => {
  // 全コードを挙げる（足し忘れは型エラー）。
  const codes: Record<AuthErrorCode, true> = {
    cancelled: true,
    network: true,
    unavailable: true,
    unauthorized: true,
    'invalid-request': true,
    'invalid-response': true,
    'provider-unavailable': true,
    'provider-failed': true,
    timeout: true,
    'already-signed-in': true,
    'not-signed-in': true,
    'reauth-failed': true,
    'account-mismatch': true,
    'storage-failed': true,
    'delete-unconfirmed': true,
    unexpected: true,
  };
  const actions: AccountAction[] = ['signIn', 'signOut', 'signOutOthers', 'deleteAccount'];

  it('すべての操作・失敗の種類で、英語・日本語の文言があるキー（または、何も出さない null）に決まる', () => {
    for (const action of actions) {
      for (const code of Object.keys(codes) as AuthErrorCode[]) {
        const key = accountErrorMessageKey(new AuthError(code), action);
        if (key === null) continue;
        for (const language of LANGUAGES) {
          assert.ok(key in catalogs[language], `${action}/${code}: ${key}`);
        }
      }
    }
  });

  it('取りやめは、サインインと削除では何も出さない', () => {
    assert.equal(accountErrorMessageKey(new AuthError('cancelled'), 'signIn'), null);
    assert.equal(accountErrorMessageKey(new AuthError('cancelled'), 'deleteAccount'), null);
  });

  it('provider-failed は、取りやめと同じ扱いにも、アプリの不具合にもしない（サインインでは、原因を言い切らない文言）', () => {
    assert.equal(accountErrorMessageKey(new AuthError('provider-failed'), 'signIn'), 'account.error.providerFailed');
  });

  it('削除の再認証が終わらなかった・時間切れは、「本人確認ができず、削除していない」と伝える（サインインの文言にしない）', () => {
    for (const code of ['provider-failed', 'timeout'] as const) {
      assert.equal(accountErrorMessageKey(new AuthError(code), 'deleteAccount'), 'account.error.reauthFailed');
    }
    assert.equal(accountErrorMessageKey(new AuthError('timeout'), 'signIn'), 'account.error.timeout');
    assert.match(en['account.error.reauthFailed'], /wasn’t deleted/);
  });

  it('削除の要求を送ったあとの通信の失敗（delete-unconfirmed）だけが、「削除されたか分からない」。送る前の network は、ふつうの文言', () => {
    assert.equal(
      accountErrorMessageKey(new AuthError('delete-unconfirmed'), 'deleteAccount'),
      'account.error.deleteUnconfirmed',
    );
    assert.equal(accountErrorMessageKey(new AuthError('network'), 'deleteAccount'), 'account.error.network');
    assert.equal(accountErrorMessageKey(new AuthError('network'), 'signIn'), 'account.error.network');
    assert.equal(accountErrorMessageKey(new AuthError('network'), 'signOutOthers'), 'account.error.network');
    // 削除以外では起きないコードは、アプリの不具合の扱い
    assert.equal(accountErrorMessageKey(new AuthError('delete-unconfirmed'), 'signIn'), 'error.unexpected');
  });

  it('削除の 401 は、「サインアウトされた。削除済みかもしれない。残っているなら、サインインし直して削除」。ほかの操作の 401 とは別', () => {
    assert.equal(accountErrorMessageKey(new AuthError('unauthorized'), 'deleteAccount'), 'account.error.deleteSignedOut');
    assert.equal(accountErrorMessageKey(new AuthError('unauthorized'), 'signOutOthers'), 'account.error.signedOut');
    assert.equal(accountErrorMessageKey(new AuthError('unauthorized'), 'signIn'), 'account.error.signInFailed');
  });

  it('再認証の失敗と、別のアカウントでの再認証は、削除されていないと伝える文言', () => {
    assert.equal(accountErrorMessageKey(new AuthError('reauth-failed'), 'deleteAccount'), 'account.error.reauthFailed');
    assert.equal(accountErrorMessageKey(new AuthError('account-mismatch'), 'deleteAccount'), 'account.error.accountMismatch');
    assert.match(en['account.error.reauthFailed'], /wasn’t deleted/);
    assert.match(en['account.error.accountMismatch'], /wasn’t deleted/);
  });

  it('削除の 401 の文言は、「削除済みの可能性」と「残っている場合の手順」の両方を伝える（最初の削除の 401 でも、誤解させない）', () => {
    assert.match(en['account.error.deleteSignedOut'], /may already be deleted/);
    assert.match(en['account.error.deleteSignedOut'], /still exists/);
  });

  it('アプリの不具合（invalid-request など）と、AuthError 以外の失敗は、汎用の文言', () => {
    assert.equal(accountErrorMessageKey(new AuthError('invalid-request'), 'signIn'), 'error.unexpected');
    assert.equal(accountErrorMessageKey(new AuthError('unexpected'), 'deleteAccount'), 'error.unexpected');
    assert.equal(accountErrorMessageKey(new Error('boom'), 'signIn'), 'error.unexpected');
    assert.equal(accountErrorMessageKey(undefined, 'signOut'), 'error.unexpected');
  });
});

describe('publicProfileErrorMessageKey', () => {
  // 全コードを挙げる（足し忘れは型エラー）。
  const authCodes: Record<AuthErrorCode, true> = {
    cancelled: true,
    network: true,
    unavailable: true,
    unauthorized: true,
    'invalid-request': true,
    'invalid-response': true,
    'provider-unavailable': true,
    'provider-failed': true,
    timeout: true,
    'already-signed-in': true,
    'not-signed-in': true,
    'reauth-failed': true,
    'account-mismatch': true,
    'storage-failed': true,
    'delete-unconfirmed': true,
    unexpected: true,
  };
  const publishCodes: Record<PublishErrorCode, true> = {
    'username-required': true,
    'username-invalid': true,
    'username-unavailable': true,
    'username-already-set': true,
    'version-conflict': true,
    'display-name-required': true,
    'too-many-songs': true,
    'invalid-snapshot': true,
    'too-large': true,
  };
  const actions: PublicProfileAction[] = ['load', 'claimUsername', 'publish', 'unpublish'];

  it('すべての操作・失敗の種類で、英語・日本語の文言があるキーに決まる', () => {
    for (const action of actions) {
      const errors = [
        ...(Object.keys(authCodes) as AuthErrorCode[]).map((code) => new AuthError(code)),
        ...(Object.keys(publishCodes) as PublishErrorCode[]).map((code) => new PublishError(code)),
        new Error('boom'),
        undefined,
      ];
      for (const error of errors) {
        const key = publicProfileErrorMessageKey(error, action);
        for (const language of LANGUAGES) assert.ok(key in catalogs[language], `${action}: ${key}`);
      }
    }
  });

  it('サーバーが理由を返して断ったものは、それぞれの文言', () => {
    assert.equal(publicProfileErrorMessageKey(new PublishError('username-invalid'), 'claimUsername'), 'publicProfile.error.usernameInvalid');
    assert.equal(
      publicProfileErrorMessageKey(new PublishError('username-unavailable'), 'claimUsername'),
      'publicProfile.error.usernameUnavailable',
    );
    assert.equal(publicProfileErrorMessageKey(new PublishError('display-name-required'), 'publish'), 'publicProfile.error.displayNameRequired');
    assert.equal(publicProfileErrorMessageKey(new PublishError('too-large'), 'publish'), 'publicProfile.error.tooLarge');
  });

  it('Publish の network だけは「公開できたか分からない」。ほかの操作の network は、ふつうの文言', () => {
    assert.equal(publicProfileErrorMessageKey(new AuthError('network'), 'publish'), 'publicProfile.error.publishNetwork');
    assert.equal(publicProfileErrorMessageKey(new AuthError('network'), 'unpublish'), 'account.error.network');
    assert.equal(publicProfileErrorMessageKey(new AuthError('network'), 'load'), 'account.error.network');
  });

  it('401 とサインインしていない状態は、サインアウトされたと伝える', () => {
    for (const code of ['unauthorized', 'not-signed-in'] as const) {
      assert.equal(publicProfileErrorMessageKey(new AuthError(code), 'publish'), 'account.error.signedOut');
    }
  });

  it('アプリの不具合・読めない応答・想定外は、汎用の文言（snapshot の検証の失敗を含む）', () => {
    assert.equal(publicProfileErrorMessageKey(new AuthError('invalid-response'), 'publish'), 'error.unexpected');
    assert.equal(publicProfileErrorMessageKey(new AuthError('unexpected'), 'load'), 'error.unexpected');
    assert.equal(publicProfileErrorMessageKey(new PublishError('invalid-snapshot'), 'publish'), 'error.unexpected');
    assert.equal(publicProfileErrorMessageKey(new Error('boom'), 'publish'), 'error.unexpected');
  });

  it('読み直すべき失敗: サインインが外れた、username の有無が食い違った', () => {
    assert.equal(needsProfileReload(new AuthError('unauthorized')), true);
    assert.equal(needsProfileReload(new AuthError('not-signed-in')), true);
    assert.equal(needsProfileReload(new PublishError('username-required')), true);
    assert.equal(needsProfileReload(new PublishError('username-already-set')), true);
    assert.equal(needsProfileReload(new AuthError('network')), false);
    assert.equal(needsProfileReload(new PublishError('username-invalid')), false);
    assert.equal(needsProfileReload(new Error('boom')), false);
  });

  it('公開の確認の文言は、秘密の項目は公開しないと明示する', () => {
    assert.match(en['publicProfile.sharedNote'], /My Key, Private Note, and status are never shared/);
    assert.match(en['publicProfile.publishConfirmMessage'], /never shared/);
  });
});
