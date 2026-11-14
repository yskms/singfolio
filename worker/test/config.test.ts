/// <reference types="node" />
// wrangler.jsonc の、変えてはいけない方針を固定する。変えるときは、docs の §8 と一緒に直す。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { unstable_readConfig } from 'wrangler';
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

  it('.dev.vars.example に、必須の秘密情報がすべて載っている', () => {
    const example = readFileSync(path.join(workerDir, '.dev.vars.example'), 'utf8');
    for (const name of config.secrets?.required ?? []) {
      assert.match(example, new RegExp(`^${name}=`, 'm'), `${name} が .dev.vars.example に無い`);
    }
  });
});
