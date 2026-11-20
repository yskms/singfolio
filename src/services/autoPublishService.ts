import type { PublicProfile } from '../domain/types.ts';
import { isTemporaryAuthError } from '../repositories/authError.ts';
import type { PendingPublishResult } from './publishService.ts';

/**
 * 最後の変更から、送るまで待つ時間。編集のたびに通信せず、まとめて送る（要件: 一定時間の debounce）。
 * 連続した編集の間は延び続ける（上限は設けない: 途切れるまで待つ。通信しないまま、端末の記録との差が残るだけ）。
 */
export const AUTO_PUBLISH_DEBOUNCE_MS = 30_000;
/** アプリの起動から、最初の確認までの時間（前回、送れなかった変更の再送。起動の描画の邪魔をしない） */
export const AUTO_PUBLISH_STARTUP_DELAY_MS = 5_000;
/** 通信の失敗のあとの再送の間隔。成功するまで、最後の値を繰り返す */
export const AUTO_PUBLISH_RETRY_MS: readonly number[] = [30_000, 60_000, 120_000, 300_000, 600_000];

/**
 * 最後の確認の結果（利用者に伝えるもの）。**止まっている（`stopped`）状態は、ずっと続くものではない**: 次の確認（編集・前面への復帰など）で、
 * もう一度試し、解決していれば `idle` に戻る。
 * - `idle`: 送れた・送るものが無い・送れる状態でない（非公開・サインインしていない・Auto Publish がオフ）。
 * - `retrying`: 通信の失敗。変更は端末に残っていて、あとで自動で再送する。
 * - `stopped`: 利用者の対応が要る。`version-conflict`（別の端末が公開した。Public Profile の Publish Now で置き換える）、
 *   `too-many-songs`・`display-name-required`・`rejected`（Public Profile で確かめる）、`error`（想定外）。
 */
export type AutoPublishStatus =
  | { kind: 'idle' }
  | { kind: 'retrying' }
  | { kind: 'stopped'; reason: 'version-conflict' | 'too-many-songs' | 'display-name-required' | 'rejected' | 'error' };

export type AutoPublishEvent =
  /** 状態が変わった */
  | { type: 'status'; status: AutoPublishStatus }
  /** 自動で Publish できた（開いている Public Profile が、最新の公開の状態に合わせる。版が進むので、合わせないと次の数え直しが「数えられない」になる） */
  | { type: 'published'; profile: PublicProfile }
  /**
   * サーバーが公開中でないと分かった（別の端末で非公開にされた）。設定は、オフへ戻してある（`publishService`）。開いている Public Profile が、
   * スイッチをオフにし、公開中の表示をやめる（画面を開き直すまで、古い表示のままになるため）。
   */
  | { type: 'unpublished'; profile: PublicProfile };

export interface AutoPublishTimers {
  set(task: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AutoPublishDeps {
  settings: {
    getAutoPublishEnabled(): Promise<boolean>;
    setAutoPublishEnabled(enabled: boolean): Promise<void>;
  };
  publish: { publishPendingChanges(): Promise<PendingPublishResult> };
  /** 待ち時間の計り方。テストが差し替える（既定は `setTimeout`。Nodeでは、プロセスの終了を止めない） */
  timers?: AutoPublishTimers;
  /**
   * アプリが前面にあるか（既定は常に真）。**偽のあいだは、確認を始めない**（待ちのタイマーが背景で発火しても、何も送らず、前面に戻ったときの
   * `flush` に任せる）。Service は RN に依存しないので、アプリ（`index.ts`）が `AppState` から渡す。
   */
  isForeground?: () => boolean;
}

const defaultTimers: AutoPublishTimers = {
  set: (task, ms) => {
    const handle = setTimeout(task, ms);
    // Node のテストが、待ち時間の分、終わらないことがないように（React Native の `setTimeout` は数を返すので、何もしない）。
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  },
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Auto Publish（7.4.9b）: 公開中のページへ、曲の変更を、一定時間待ってまとめて送る。**公開の中身の判断は `publishService.publishPendingChanges` に
 * 任せ**（何を送るか・送ってよい状態か）、ここは「いつ試すか」だけを持つ（待ち・再送・状態の通知）。
 *
 * - **きっかけ**: 端末のDBへの書き込み（`observeCommits` が `notifyChanged` を呼ぶ。どの画面が書いても拾う）、アプリの前面への復帰・起動
 *   （`flush`・`start`）、設定をオンにしたとき。何が変わったかは見ない: 試した結果、変更が無ければ、通信しない。
 * - **Pending（送れていない変更）は、別に保存しない。** 端末の記録（最後に Publish した曲のハッシュ）との差が、そのまま Pending で、再起動しても、
 *   次の確認が同じ差を見つける。通信の失敗は `retrying` にして、間隔を延ばしながら再送する（成功・新しい確認でやり直す）。
 * - **オンでも、公開していなければ何も送らない**（最初の公開は確認つきの Publish Now だけ）。設定は端末のもので、アカウントごとではないが、
 *   別のアカウントの記録を捨てるとき（`publishService`）にオフへ戻す。
 * - **背景では、確認を始めない**（待ちのタイマーが背景で発火しても、`isForeground` が偽なら試さない。`flush` は前面へ復帰したときに呼ばれ、
 *   試せなかった分を拾う）。通信の途中でアプリが止まると、サーバーでは済んでいるのに、端末は結果を記録できず、次の確認が版の食い違い
 *   （`stopped`）になる。**始めた確認の途中で背景に移ることは、防げない**（だから、背景に移ったときに通信を起こさないだけで、確実にはならない）。
 * - **通信に失敗して再送を待っている間は、編集があっても、再送の時刻を前倒ししない**（`retrying` の間の `notifyChanged`・実行中の変更の再確認は、
 *   待っているタイマーを残す。オフラインのまま編集を続けると、30秒の待ちに戻り続け、間隔を延ばす意味が無くなる）。前面への復帰の `flush` は、すぐ試す。
 * - 同時に1つだけ実行する。実行中に来たきっかけは、終わったあとに、もう一度待ってから試す。
 */
export function createAutoPublishService({
  settings,
  publish,
  timers = defaultTimers,
  isForeground = () => true,
}: AutoPublishDeps) {
  let status: AutoPublishStatus = { kind: 'idle' };
  let timer: unknown = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let failures = 0;
  let stopped = false;
  const listeners = new Set<(event: AutoPublishEvent) => void>();

  function emit(event: AutoPublishEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // 購読側の失敗で、確認を止めない
      }
    }
  }

  function setStatus(next: AutoPublishStatus): void {
    const same = next.kind === status.kind && (next.kind !== 'stopped' || (status.kind === 'stopped' && status.reason === next.reason));
    status = next;
    if (!same) emit({ type: 'status', status });
  }

  function cancelTimer(): void {
    if (timer !== null) timers.clear(timer);
    timer = null;
  }

  function schedule(ms: number): void {
    if (stopped) return;
    cancelTimer();
    timer = timers.set(() => {
      timer = null;
      void run();
    }, ms);
  }

  async function attempt(): Promise<void> {
    // 背景では試さない。状態は変えない（前面に戻ったときの `flush` が、同じ差を見つけて試す）。
    if (!isForeground()) return;
    if (!(await settings.getAutoPublishEnabled())) {
      failures = 0;
      setStatus({ kind: 'idle' });
      return;
    }
    let result: PendingPublishResult;
    try {
      result = await publish.publishPendingChanges();
    } catch (error) {
      if (isTemporaryAuthError(error)) {
        const delay = AUTO_PUBLISH_RETRY_MS[Math.min(failures, AUTO_PUBLISH_RETRY_MS.length - 1)]!;
        failures += 1;
        setStatus({ kind: 'retrying' });
        schedule(delay);
      } else {
        failures = 0;
        setStatus({ kind: 'stopped', reason: 'error' });
      }
      return;
    }
    failures = 0;
    if (result.kind === 'stopped') {
      setStatus({ kind: 'stopped', reason: result.reason });
      return;
    }
    setStatus({ kind: 'idle' });
    if (result.kind === 'published') emit({ type: 'published', profile: result.profile });
    else if (result.kind === 'idle' && result.reason === 'not-published') emit({ type: 'unpublished', profile: result.profile });
  }

  function run(): Promise<void> {
    if (running !== null) {
      rerun = true;
      return running;
    }
    cancelTimer();
    running = attempt()
      .catch(() => {
        // 設定を読めないなど。この確認は諦める（次のきっかけで、もう一度試す）。端末の機能は変わらない
        setStatus({ kind: 'stopped', reason: 'error' });
      })
      .finally(() => {
        running = null;
        if (rerun) {
          rerun = false;
          // 再送を待っている（通信の失敗の直後）ときは、そのタイマーを残す（30秒に上書きしない）。
          if (timer === null) schedule(AUTO_PUBLISH_DEBOUNCE_MS);
        }
      });
    return running;
  }

  return {
    /** 最後の確認の結果。画面を開いたときの初期表示に使う。 */
    getStatus(): AutoPublishStatus {
      return status;
    },

    /** 状態の変化と、自動で Publish できたことを受け取る。戻り値で購読をやめる。 */
    subscribe(listener: (event: AutoPublishEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Auto Publish の設定（端末のもの。既定はオフ）。 */
    getEnabled(): Promise<boolean> {
      return settings.getAutoPublishEnabled();
    },

    /**
     * 設定を変える。オンにしたら、すぐ確認する（たまっていた変更を送る）。オフにしたら、待っている確認・再送をやめる。
     * 保存に失敗したら投げる（画面が伝える。状態は変えない）。
     */
    async setEnabled(enabled: boolean): Promise<void> {
      await settings.setAutoPublishEnabled(enabled);
      if (enabled) {
        void run();
      } else {
        cancelTimer();
        failures = 0;
        setStatus({ kind: 'idle' });
      }
    },

    /** 公開内容が変わったかもしれない（端末のDBに書き込んだ）。待ってから確認する（連続した変更は、まとめて1回）。 */
    notifyChanged(): void {
      // 通信に失敗して、再送を待っているときは、編集があっても、再送の時刻を前倒ししない。
      if (status.kind === 'retrying' && timer !== null) return;
      schedule(AUTO_PUBLISH_DEBOUNCE_MS);
    },

    /** アプリの起動のあと、前回、送れていない変更が無いか確認する（少し待つ）。 */
    start(): void {
      schedule(AUTO_PUBLISH_STARTUP_DELAY_MS);
    },

    /** 待たずに、すぐ確認する（アプリが前面に戻ったとき、Public Profile で Publish したあと）。確認が終わるまで待てる。 */
    flush(): Promise<void> {
      return run();
    },

    /** 待っている確認・再送をやめる（以後の `notifyChanged` も無視する）。テストの後始末用。 */
    dispose(): void {
      stopped = true;
      cancelTimer();
    },
  };
}

export type AutoPublishService = ReturnType<typeof createAutoPublishService>;
