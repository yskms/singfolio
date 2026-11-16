/// <reference types="node" />
// wrangler.jsonc の、変えてはいけない方針を固定する。変えるときは、docs の §8 と一緒に直す。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { unstable_readConfig } from 'wrangler';
import { APP_RETURN_URL, APPLE_CALLBACK_URL } from '../src/appleWeb.ts';
import { workerDir } from './localDatabase.ts';

const config = unstable_readConfig({ config: path.join(workerDir, 'wrangler.jsonc') });

describe('wrangler.jsonc', () => {
  it('Workers Logs は無効（認証の値が、ログに残らないようにするため）', () => {
    // 資料は、記録に含まれるヘッダー（Authorization など）と、invocation_logs を false にしたときの
    // console.log のメタデータを書いていない。確かめずに有効にしない。
    assert.equal(config.observability?.enabled, false);
    // 有効にされても、Appleのコールバックの code・state をログに残さないための安全弁。
    assert.equal(config.observability?.redact_query_string, true);
  });

  it('到達できる入口は singfolio.app だけ（workers.dev とプレビューのURLは出さない）', () => {
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.routes, [{ pattern: 'singfolio.app', custom_domain: true }]);
  });

  it('秘密情報は wrangler.jsonc に値を書かない（vars に置かない）', () => {
    assert.equal(config.secrets?.required?.includes('NONCE_HMAC_KEY'), true);
    for (const name of config.secrets?.required ?? []) {
      assert.equal(name in (config.vars ?? {}), false, `${name} を vars に置かない`);
    }
  });

  it('IDトークンの aud（vars）は、アプリ・Appleの設定と食い違っていない', () => {
    const vars = (config.vars ?? {}) as Record<string, unknown>;
    const app = JSON.parse(readFileSync(path.join(workerDir, '..', 'app.json'), 'utf8')) as {
      expo: {
        ios: { bundleIdentifier: string };
        android: { package: string };
        plugins: Array<string | [string, Record<string, string>]>;
      };
    };
    // Appleのネイティブのトークンの aud は、アプリのバンドルID（iOS）。ずれると、すべてのAppleログインが拒否される。
    assert.equal(vars.APPLE_BUNDLE_ID, app.expo.ios.bundleIdentifier);
    // Services ID は、primary App ID とは別の識別子（AndroidのWeb経由のログイン用）。
    assert.match(String(vars.APPLE_SERVICES_ID), /^[a-z0-9.-]+$/);
    assert.notEqual(vars.APPLE_SERVICES_ID, vars.APPLE_BUNDLE_ID);
    // Googleの aud は、サーバー用（Web）のクライアントID。iOS・Androidのクライアントではない。
    assert.match(String(vars.GOOGLE_WEB_CLIENT_ID), /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    // アプリ（plugins/withGoogleSignIn.js）が SDK に渡すサーバー用（Web）のクライアントID。これが IDトークンの
    // aud になるので、ずれると、すべてのGoogleログインが拒否される（別のGoogle Cloudのプロジェクトのクライアントを
    // 取り違えた例がある）。iOSのクライアントは、同じプロジェクトのもの（番号の部分が同じ）でなければならない。
    const google = app.expo.plugins.find(
      (plugin): plugin is [string, Record<string, string>] =>
        Array.isArray(plugin) && plugin[0] === './plugins/withGoogleSignIn.js',
    );
    assert.ok(google, 'app.json に plugins/withGoogleSignIn.js が無い');
    assert.equal(vars.GOOGLE_WEB_CLIENT_ID, google[1].webClientId);
    assert.equal(google[1].iosClientId.split('-')[0], google[1].webClientId.split('-')[0]);
  });

  it('npm run dev は、実際のローカルのオリジンを保つ（HTTPS検査が localhost を通すため）', () => {
    // wrangler dev は、既定で routes の singfolio.app を request.url のホストに書き換える。すると
    // Workerから localhost が見えず、HTTPS検査（src/https.ts）がローカルのHTTPを403で拒否する。
    const pkg = JSON.parse(readFileSync(path.join(workerDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    assert.match(pkg.scripts.dev ?? '', /--infer-origin-from-routes=false/);
  });

  it('AndroidのAppleログイン: 秘密鍵は秘密情報（必須）、Team ID・Key ID は形だけ確かめる', () => {
    const vars = (config.vars ?? {}) as Record<string, unknown>;
    assert.equal(config.secrets?.required?.includes('APPLE_PRIVATE_KEY'), true);
    assert.equal('APPLE_PRIVATE_KEY' in vars, false);
    // Apple の Team ID・Key ID は、どちらも英大文字と数字の10文字。
    assert.match(String(vars.APPLE_TEAM_ID), /^[A-Z0-9]{10}$/);
    assert.match(String(vars.APPLE_KEY_ID), /^[A-Z0-9]{10}$/);
  });

  it('AndroidのAppleログイン: コールバックのURLは本番のホスト、戻り先のスキームは app.json の scheme', () => {
    // Services ID の Return URL に登録する値と、アプリのURLスキーム。ずれると、Appleのログインが戻れない。
    const app = JSON.parse(readFileSync(path.join(workerDir, '..', 'app.json'), 'utf8')) as { expo: { scheme: string } };
    const host = (config.routes as Array<{ pattern: string }>)[0]!.pattern;
    assert.equal(new URL(APPLE_CALLBACK_URL).protocol, 'https:');
    assert.equal(new URL(APPLE_CALLBACK_URL).host, host);
    assert.equal(new URL(APP_RETURN_URL).protocol, `${app.expo.scheme}:`);
  });

  it('AndroidのAppleログイン: アプリが持つ Services ID・Return URL・戻り先は、Workerの値と同じ（別々に書いてある）', () => {
    // アプリ（src/repositories/appleWebSignInRepository.ts）は、Appleの認可のURLと、Custom Tab の戻りの判定に、
    // これらを書き写している。Workerとコードは共有しない。ずれると、Appleの画面が出ない・戻れない・コードが交換できない。
    const vars = (config.vars ?? {}) as Record<string, unknown>;
    const source = readFileSync(path.join(workerDir, '..', 'src/repositories/appleWebSignInRepository.ts'), 'utf8');
    assert.ok(source.includes(`APPLE_SERVICES_ID = '${vars.APPLE_SERVICES_ID}'`));
    assert.ok(source.includes(`APPLE_CALLBACK_URL = '${APPLE_CALLBACK_URL}'`));
    assert.ok(source.includes(`APP_RETURN_URL = '${APP_RETURN_URL}'`));
  });

  it('HTTPS検査を迂回する設定を vars に置かない', () => {
    // 検査は、localhost のホスト名だけを通す。環境変数などで切る口は作らない（docs §8「HTTPS」）。
    for (const name of Object.keys(config.vars ?? {})) {
      assert.doesNotMatch(name, /insecure|http|ssl|tls/i, `${name}: HTTPS検査を切る口にならないか確認する`);
    }
  });

  it('.dev.vars.example に、必須の秘密情報がすべて載っている', () => {
    const example = readFileSync(path.join(workerDir, '.dev.vars.example'), 'utf8');
    for (const name of config.secrets?.required ?? []) {
      assert.match(example, new RegExp(`^${name}=`, 'm'), `${name} が .dev.vars.example に無い`);
    }
  });
});
