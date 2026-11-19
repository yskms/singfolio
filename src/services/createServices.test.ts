// Service の組み立て（`createServices`）のテスト。Auto Publish のきっかけ（DBへの書き込みの通知）が、`auth` を注入したときだけ配線されること。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServices } from '../testing/testDatabase.ts';
import { AUTO_PUBLISH_DEBOUNCE_MS, type AutoPublishTimers } from './autoPublishService.ts';
import type { AuthOptions } from './createServices.ts';

function recordingTimers() {
  const scheduled: number[] = [];
  const timers: AutoPublishTimers = {
    set: (_task, ms) => {
      scheduled.push(ms);
      return scheduled.length;
    },
    clear: () => {},
  };
  return { timers, scheduled };
}

const auth: AuthOptions = {
  fetch: async () => {
    throw new Error('network is not available');
  },
  storage: { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} },
  sha256Base64Url: async () => '',
};

describe('Auto Publish のきっかけ（7.4.9b）', () => {
  it('auth を注入したビルドでは、どの Service の書き込みでも、待ってから確認する予約が入る（曲・タグ・公開タグ・設定）', async () => {
    const { timers, scheduled } = recordingTimers();
    const t = await createTestServices({ auth, autoPublishTimers: timers });

    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready', newTagNames: ['ballad'] });
    assert.deepEqual(scheduled.at(-1), AUTO_PUBLISH_DEBOUNCE_MS);

    const before = scheduled.length;
    const tag = (await t.services.tags.listTags())[0]!;
    await t.services.publish.setTagPublic(tag.id, true);
    assert.equal(scheduled.length, before + 1);

    await t.services.tags.renameTag(tag.id, 'ballads');
    assert.equal(scheduled.length, before + 2);
    t.services.autoPublish.dispose();
  });

  it('読み取りだけでは、予約しない', async () => {
    const { timers, scheduled } = recordingTimers();
    const t = await createTestServices({ auth, autoPublishTimers: timers });
    await t.services.songs.listSongs();
    await t.services.show.getShowView({ sort: 'artist' });
    assert.deepEqual(scheduled, []);
    t.services.autoPublish.dispose();
  });

  it('auth を注入しないビルド（リリースのビルド）では、何も監視しない', async () => {
    const { timers, scheduled } = recordingTimers();
    const t = await createTestServices({ autoPublishTimers: timers });
    await t.services.songs.createSong({ title: 'A', artist: 'X', status: 'ready' });
    assert.deepEqual(scheduled, []);
  });
});
