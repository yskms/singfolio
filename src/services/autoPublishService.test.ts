// Auto Publish のスケジューラ（待ち・再送・状態の通知）のテスト。`npm test` で実行する。公開の中身（何を送るか・送ってよい状態か）は
// `publishService.test.ts`。ここは「いつ試すか」だけを、偽の `publish`・偽のタイマーで確かめる。
/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PublicProfile } from '../domain/types.ts';
import { AuthError } from '../repositories/authError.ts';
import {
  AUTO_PUBLISH_DEBOUNCE_MS,
  AUTO_PUBLISH_RETRY_MS,
  AUTO_PUBLISH_STARTUP_DELAY_MS,
  createAutoPublishService,
  type AutoPublishEvent,
  type AutoPublishTimers,
} from './autoPublishService.ts';
import type { PendingPublishResult } from './publishService.ts';

/** 時計を自分で進める偽のタイマー。期限が来た順に実行し、実行のたびに、非同期の処理が落ち着くのを待つ。 */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; task: () => void }>();
  const timers: AutoPublishTimers = {
    set: (task, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, task });
      return id;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return {
    timers,
    get pendingCount() {
      return pending.size;
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, entry]) => entry.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].task();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

const PROFILE: PublicProfile = {
  username: 'karaoke_fan',
  version: 3,
  published: true,
  publishedAt: 1,
  displayName: 'Karaoke Fan',
  bio: '',
};

function setup(results: Array<PendingPublishResult | Error>, enabled = true) {
  const clock = fakeTimers();
  const calls = { publish: 0 };
  let on = enabled;
  let foreground = true;
  const queue = [...results];
  const service = createAutoPublishService({
    settings: {
      getAutoPublishEnabled: async () => on,
      setAutoPublishEnabled: async (value) => {
        on = value;
      },
    },
    publish: {
      publishPendingChanges: async () => {
        calls.publish += 1;
        const next = queue.length > 1 ? queue.shift()! : queue[0]!;
        if (next instanceof Error) throw next;
        return next;
      },
    },
    timers: clock.timers,
    isForeground: () => foreground,
  });
  const events: AutoPublishEvent[] = [];
  service.subscribe((event) => events.push(event));
  return {
    service,
    clock,
    calls,
    events,
    isOn: () => on,
    setForeground: (value: boolean) => {
      foreground = value;
    },
  };
}

const NO_CHANGES: PendingPublishResult = { kind: 'idle', reason: 'no-changes' };
const PUBLISHED: PendingPublishResult = { kind: 'published', profile: PROFILE, changeCount: 2 };

describe('Auto Publish: 待ってまとめて送る', () => {
  it('変更の通知から debounce の時間がたつまで、送らない。連続した通知は、1回にまとめる（最後の通知から数える）', async () => {
    const { service, clock, calls } = setup([PUBLISHED]);
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS - 1);
    assert.equal(calls.publish, 0);
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS - 1);
    assert.equal(calls.publish, 0);
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('送れたら、`published` を通知する（開いている画面が、最新の公開の状態に合わせる）。状態は idle', async () => {
    const { service, clock, events } = setup([PUBLISHED]);
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS);
    assert.deepEqual(events, [{ type: 'published', profile: PROFILE }]);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    service.dispose();
  });

  it('オフなら、時間がたっても公開に触れない', async () => {
    const { service, clock, calls } = setup([PUBLISHED], false);
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS * 2);
    assert.equal(calls.publish, 0);
    service.dispose();
  });

  it('起動のあと、少し待ってから確認する（前回送れていない変更の再送）', async () => {
    const { service, clock, calls } = setup([NO_CHANGES]);
    service.start();
    await clock.advance(AUTO_PUBLISH_STARTUP_DELAY_MS - 1);
    assert.equal(calls.publish, 0);
    await clock.advance(1);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('flush は待たずに確認する（前面への復帰）。待っている debounce の分は、取り消す', async () => {
    const { service, clock, calls } = setup([NO_CHANGES]);
    service.notifyChanged();
    await service.flush();
    assert.equal(calls.publish, 1);
    assert.equal(clock.pendingCount, 0);
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS * 2);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('実行中に来た通知は、終わったあとに、もう一度待ってから確認する（同時には実行しない）', async () => {
    const clock = fakeTimers();
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    let release: () => void = () => {};
    const service = createAutoPublishService({
      settings: { getAutoPublishEnabled: async () => true, setAutoPublishEnabled: async () => {} },
      publish: {
        publishPendingChanges: async () => {
          runs += 1;
          active += 1;
          maxActive = Math.max(maxActive, active);
          if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
          active -= 1;
          return NO_CHANGES;
        },
      },
      timers: clock.timers,
    });
    const first = service.flush();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const second = service.flush(); // 実行中: あとでもう一度
    assert.equal(runs, 1);
    release();
    await Promise.all([first, second]);
    assert.equal(runs, 1);
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS);
    assert.equal(runs, 2);
    assert.equal(maxActive, 1);
    service.dispose();
  });
});

describe('Auto Publish: 公開中でないと分かったとき', () => {
  it('`unpublished` を通知する（開いている画面が、スイッチをオフにして、公開中の表示をやめる）。状態は idle。再送のタイマーは作らない', async () => {
    const unpublished = { ...PROFILE, published: false, version: 4 };
    const { service, clock, calls, events } = setup([{ kind: 'idle', reason: 'not-published', profile: unpublished }]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    assert.deepEqual(events, [{ type: 'unpublished', profile: unpublished }]);
    assert.equal(clock.pendingCount, 0);
    assert.equal(calls.publish, 1);
    service.dispose();
  });
});

describe('Auto Publish: 背景では確認を始めない', () => {
  it('待ちのタイマーが背景で発火しても試さず、前面に戻ったときの flush が、同じ差を拾う', async () => {
    const { service, clock, calls, setForeground } = setup([PUBLISHED]);
    service.notifyChanged();
    setForeground(false);
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS);
    assert.equal(calls.publish, 0);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    assert.equal(clock.pendingCount, 0);
    // 背景のまま、flush が呼ばれても試さない（呼ぶ側は前面に戻ったときだけだが、防御として）。
    await service.flush();
    assert.equal(calls.publish, 0);
    setForeground(true);
    await service.flush();
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('再送の待ちが背景で発火しても試さない。状態は retrying のまま、前面に戻ったときの flush で再送する', async () => {
    const { service, clock, calls, setForeground } = setup([new AuthError('network'), PUBLISHED]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    setForeground(false);
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]!);
    assert.equal(calls.publish, 1);
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    setForeground(true);
    await service.flush();
    assert.equal(calls.publish, 2);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    service.dispose();
  });
});

describe('Auto Publish: 通信の失敗は再送する（Pending は端末に残っている）', () => {
  it('通信の失敗は retrying。間隔を延ばしながら再送し、成功したら idle に戻って、間隔もやり直す', async () => {
    const { service, clock, calls, events } = setup([
      new AuthError('network'),
      new AuthError('unavailable'),
      new AuthError('timeout'),
      PUBLISHED,
      new AuthError('network'),
      PUBLISHED,
    ]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    assert.equal(calls.publish, 1);

    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]! - 1);
    assert.equal(calls.publish, 1);
    await clock.advance(1);
    assert.equal(calls.publish, 2);
    await clock.advance(AUTO_PUBLISH_RETRY_MS[1]!);
    assert.equal(calls.publish, 3);
    await clock.advance(AUTO_PUBLISH_RETRY_MS[2]!);
    assert.equal(calls.publish, 4); // 成功
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    assert.equal(events.filter((event) => event.type === 'published').length, 1);

    // 成功のあとの失敗は、最初の間隔からやり直す。
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]!);
    assert.equal(calls.publish, 6);
    service.dispose();
  });

  it('再送の間隔は、最後の値で頭打ちになる', async () => {
    const { service, clock, calls } = setup([new AuthError('network')]);
    await service.flush();
    for (let i = 0; i < AUTO_PUBLISH_RETRY_MS.length + 2; i++) {
      await clock.advance(AUTO_PUBLISH_RETRY_MS[Math.min(i, AUTO_PUBLISH_RETRY_MS.length - 1)]!);
    }
    assert.equal(calls.publish, 1 + AUTO_PUBLISH_RETRY_MS.length + 2);
    service.dispose();
  });

  it('flush（前面への復帰）は、再送の待ちを待たずに試す', async () => {
    const { service, clock, calls } = setup([new AuthError('network'), PUBLISHED]);
    await service.flush();
    assert.equal(clock.pendingCount, 1);
    await service.flush();
    assert.equal(calls.publish, 2);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    assert.equal(clock.pendingCount, 0);
    service.dispose();
  });

  it('オフにすると、待っている再送をやめて idle にする', async () => {
    const { service, clock, calls, isOn } = setup([new AuthError('network')]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    await service.setEnabled(false);
    assert.equal(isOn(), false);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]! * 10);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('再送を待っている間の編集の通知は、再送の時刻を前倒ししない（オフラインのまま編集しても、30秒に戻らない）', async () => {
    const { service, clock, calls } = setup([new AuthError('network'), new AuthError('network'), PUBLISHED]);
    await service.flush();
    // 1回目の失敗のあと、最初の間隔（30秒）で2回目。2回目の失敗のあとの間隔は、2番目の値（60秒）。
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]!);
    assert.equal(calls.publish, 2);
    // 再送を待つあいだ、編集が続く。通知のたびに、待ちが 30 秒に戻ってはいけない。
    await clock.advance(AUTO_PUBLISH_RETRY_MS[1]! - 10_000);
    service.notifyChanged();
    await clock.advance(5_000);
    service.notifyChanged();
    assert.equal(calls.publish, 2);
    // 最初に決めた再送の時刻（2回目の失敗から60秒）に、再送される。
    await clock.advance(5_000);
    assert.equal(calls.publish, 3);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    service.dispose();
  });

  it('失敗した確認の実行中に来た再確認の予約も、再送の待ちを30秒に上書きしない', async () => {
    let release: (() => void) | undefined;
    const clock = fakeTimers();
    let calls = 0;
    const service = createAutoPublishService({
      settings: { getAutoPublishEnabled: async () => true, setAutoPublishEnabled: async () => {} },
      publish: {
        publishPendingChanges: async () => {
          calls += 1;
          if (calls === 1) throw new AuthError('network');
          if (calls === 2) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            throw new AuthError('network');
          }
          return PUBLISHED;
        },
      },
      timers: clock.timers,
    });
    await service.flush();
    // 1回目の失敗のあと、30秒で2回目が始まる。2回目は通信の途中で止まっている。
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]!);
    assert.equal(calls, 2);
    // 実行中に、再確認の予約が入る（前面復帰の flush）。
    const second = service.flush();
    release!();
    await second;
    assert.deepEqual(service.getStatus(), { kind: 'retrying' });
    // 2回目の失敗のあとの間隔は 60秒。予約が、30秒に上書きしてはいけない。
    await clock.advance(AUTO_PUBLISH_RETRY_MS[1]! - 1);
    assert.equal(calls, 2);
    await clock.advance(1);
    assert.equal(calls, 3);
    service.dispose();
  });
});

describe('Auto Publish: 利用者の対応が要る失敗は、止まる（ただし、次の確認でもう一度試す）', () => {
  it('stopped の理由を状態に出す。再送のタイマーは作らない', async () => {
    const { service, clock, calls } = setup([{ kind: 'stopped', reason: 'version-conflict' }]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'stopped', reason: 'version-conflict' });
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]! * 10);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('通信以外の AuthError（アプリの不具合・想定外）は stopped(error)。再送しない', async () => {
    const { service, clock, calls } = setup([new AuthError('invalid-response')]);
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'stopped', reason: 'error' });
    await clock.advance(AUTO_PUBLISH_RETRY_MS[0]! * 10);
    assert.equal(calls.publish, 1);
    service.dispose();
  });

  it('次の確認で解決していれば idle に戻る（止まった状態は、ずっとは続かない）', async () => {
    const { service, clock } = setup([{ kind: 'stopped', reason: 'version-conflict' }, NO_CHANGES]);
    await service.flush();
    assert.equal(service.getStatus().kind, 'stopped');
    service.notifyChanged();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS);
    assert.deepEqual(service.getStatus(), { kind: 'idle' });
    service.dispose();
  });

  it('設定を読めないなど、想定外の失敗でも、投げずに stopped(error) にする（端末の機能は変わらない）', async () => {
    const clock = fakeTimers();
    const service = createAutoPublishService({
      settings: {
        getAutoPublishEnabled: async () => {
          throw new Error('db');
        },
        setAutoPublishEnabled: async () => {},
      },
      publish: { publishPendingChanges: async () => NO_CHANGES },
      timers: clock.timers,
    });
    await service.flush();
    assert.deepEqual(service.getStatus(), { kind: 'stopped', reason: 'error' });
    service.dispose();
  });
});

describe('Auto Publish: 設定と購読', () => {
  it('オンにすると、すぐ確認する（たまっていた変更を送る）。保存に失敗したら投げて、確認しない', async () => {
    const { service, calls } = setup([PUBLISHED], false);
    await service.setEnabled(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(calls.publish, 1); // 待たずに、すぐ確認した

    const clock = fakeTimers();
    let ran = 0;
    const failing = createAutoPublishService({
      settings: {
        getAutoPublishEnabled: async () => true,
        setAutoPublishEnabled: async () => {
          throw new Error('db');
        },
      },
      publish: {
        publishPendingChanges: async () => {
          ran += 1;
          return NO_CHANGES;
        },
      },
      timers: clock.timers,
    });
    await assert.rejects(failing.setEnabled(true));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(ran, 0);
    service.dispose();
    failing.dispose();
  });

  it('状態の通知は、変わったときだけ。購読をやめたら届かない。購読側の失敗は確認を止めない', async () => {
    const { service, events } = setup([new AuthError('network'), new AuthError('network'), PUBLISHED]);
    const seen: string[] = [];
    const stop = service.subscribe((event) => {
      if (event.type === 'status') seen.push(event.status.kind);
      throw new Error('listener failed');
    });
    await service.flush();
    await service.flush(); // retrying のまま: 通知しない
    await service.flush(); // 成功: idle へ
    assert.deepEqual(seen, ['retrying', 'idle']);
    stop();
    const before = events.length;
    await service.flush();
    assert.equal(seen.length, 2);
    assert.ok(events.length >= before);
    service.dispose();
  });

  it('dispose したあとの通知は無視する', async () => {
    const { service, clock, calls } = setup([PUBLISHED]);
    service.dispose();
    service.notifyChanged();
    service.start();
    await clock.advance(AUTO_PUBLISH_DEBOUNCE_MS * 2);
    assert.equal(calls.publish, 0);
  });
});
