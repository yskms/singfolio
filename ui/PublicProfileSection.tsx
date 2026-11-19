import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PublicProfile } from '../src/domain/types';
import {
  needsProfileReload,
  publicProfileErrorMessageKey,
  type PublicProfileAction,
  type PublicProfileErrorMessageKey,
} from '../src/i18n';
import { formatDateTime } from '../src/i18n/dateTime';
import { getServices } from '../src/services';
import { PublishError } from '../src/services/errors';
import { PUBLISH_LIMITS } from '../src/services/publishSnapshot';
import { isValidUsername, normalizeUsernameInput, publicAddress } from '../src/services/username';
import { ActionButton } from './ActionButton';
import { FormField } from './FormField';
import { FormInput } from './FormInput';
import { useI18n } from './i18n';
import { SettingsRow } from './SettingsRow';
import { Text } from './Text';
import { useTheme } from './theme';
import { useFocusRefreshKey } from './useFocusRefreshKey';
import { useKeyboardHeight } from './useKeyboardHeight';

type ScreenState =
  | { kind: 'loading' }
  // サーバーの状態を読めなかった（通信・サーバー）。「公開していない」とは取り違えない。
  | { kind: 'failed' }
  | { kind: 'signedOut' }
  // `profile` が `null` なら、まだ `username` を確保していない。`readyCount` は、公開する曲（Ready）の数、`publicTagCount` は、
  // 公開に選んだタグの数（Public Tags 画面から戻ったときに読み直す）。
  | { kind: 'ready'; profile: PublicProfile | null; readyCount: number; publicTagCount: number };

type NoticeKey = PublicProfileErrorMessageKey | 'publicProfile.published' | 'publicProfile.unpublished';

interface Notice {
  kind: 'error' | 'info';
  key: NoticeKey;
}

type BusyAction = Exclude<PublicProfileAction, 'load'>;

const EMPTY_FORM = { displayName: '', bio: '' } as const;

/**
 * Public Profile 画面（`app/public-profile.tsx`）の中身。`username` の確保・Display Name と Bio・Publish Now・Unpublish・状態の表示。
 *
 * **ログインを要求しない**: サインインしていなければ、公開にはサインインが要ると伝えて、Account へ案内するだけ。ここでの失敗は、すべて
 * この画面の中で伝えて、ErrorBoundary（アプリ全体のエラー画面）には伝えない。画面は `account`・`publish`（Service）の返す値だけを使う。
 * URL・レスポンスの形・セッションの値には触れない。
 *
 * **Display Name・Bio は、この画面だけが持つ下書き**（保存しない）。入力欄の初期値は、サーバーの「最後に Publish した値」
 * （`PublicProfile.displayName`・`bio`。再インストール後・別の端末でも、公開中の内容が出る）。Publish したときに公開内容になる。
 * 変更があるまま戻るときは、破棄の確認を出す。
 *
 * 操作は1つずつ。実行中は、ほかの操作を押せず、戻る操作も止める（結果を伝える画面が無くなるため）。
 */
export function PublicProfileSection() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<ScreenState>({ kind: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  // 入力欄の下書きと、その基準（サーバーの「最後に Publish した値」。変更の有無の判定に使う）。
  const [usernameInput, setUsernameInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [base, setBase] = useState<{ displayName: string; bio: string }>(EMPTY_FORM);
  // state は再描画まで古いので、連打で操作が重ならないよう、参照でも持つ。
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);
  const viewKindRef = useRef<ScreenState['kind']>('loading');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    viewKindRef.current = view.kind;
  });

  const resetForm = useCallback((profile: PublicProfile | null) => {
    const next = profile === null ? EMPTY_FORM : { displayName: profile.displayName, bio: profile.bio };
    setBase(next);
    setDisplayName(next.displayName);
    setBio(next.bio);
  }, []);

  /**
   * サインインの状態とサーバーの公開の状態を読む（`refreshProfile` は、端末の記録が今のアカウントのものか確かめて、合わなければ捨てる）。
   * 入力欄は読み込んだ値に戻す（呼ぶのは、画面を開いたとき・読み込みに失敗したあと・サインインが外れたあと・`username` の有無が
   * 食い違ったときで、どれも下書きを持ち越さなくてよい）。
   */
  const load = useCallback(async () => {
    const id = ++loadIdRef.current;
    setView({ kind: 'loading' });
    let next: ScreenState;
    let nextNotice: Notice | null = null;
    let profile: PublicProfile | null = null;
    try {
      const { account, publish, songs } = await getServices();
      const provider = await account.getSignedInProvider();
      if (provider === null) {
        next = { kind: 'signedOut' };
      } else {
        profile = await publish.refreshProfile();
        const counts = await songs.countSongsByStatus();
        const choices = await publish.listPublicTagChoices();
        next = {
          kind: 'ready',
          profile,
          readyCount: counts.ready,
          publicTagCount: choices.filter((choice) => choice.isPublic).length,
        };
      }
    } catch (error) {
      if (needsProfileReload(error)) {
        // 401: 端末のセッションは捨てられている。
        next = { kind: 'signedOut' };
        nextNotice = { kind: 'error', key: publicProfileErrorMessageKey(error, 'load') };
      } else {
        next = { kind: 'failed' };
      }
    }
    // 後から始めた読み込みがあれば、先の結果は捨てる。
    if (!mountedRef.current || id !== loadIdRef.current) return;
    resetForm(profile);
    setUsernameInput('');
    setNotice(nextNotice);
    setView(next);
  }, [resetForm]);

  useEffect(() => {
    void load();
  }, [load]);

  // Account から戻ったとき（サインインしたかもしれない）、サインインしていない・読み込みに失敗した状態なら、読み直す。
  // 画面が準備できているとき（入力中の下書きがありうる）は、読み直さない。
  const focusKey = useFocusRefreshKey();
  useEffect(() => {
    if (focusKey > 0 && (viewKindRef.current === 'signedOut' || viewKindRef.current === 'failed')) void load();
  }, [focusKey, load]);

  // Public Tags から戻ったとき（選んだタグの数が変わったかもしれない）、数だけを読み直す。入力中の下書きには触れない。
  // 読めなくても、前の数のまま（行の値が古くなるだけ。選択そのものは Public Tags 画面が持つ）。
  useEffect(() => {
    if (focusKey === 0 || viewKindRef.current !== 'ready') return;
    let cancelled = false;
    getServices()
      .then(({ publish }) => publish.listPublicTagChoices())
      .then(
        (choices) => {
          if (cancelled) return;
          const publicTagCount = choices.filter((choice) => choice.isPublic).length;
          setView((current) => (current.kind === 'ready' ? { ...current, publicTagCount } : current));
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [focusKey]);

  const isDirty = displayName !== base.displayName || bio !== base.bio;

  // 変更があるまま戻ろうとすると止めて、破棄の確認を出す（`SongForm` と同じ。`beforeRemove` を自分で購読しない）。
  // 実行中は、確認を出さずに止める（結果を伝える画面を残す）。
  usePreventRemove(isDirty || busy !== null, ({ data }) => {
    if (busyRef.current) return;
    // 実行が終わった直後の1描画は、まだ止めたまま（`busy` が戻る前）。変更が無ければ、確認なしで戻す。
    if (!isDirty) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t('publicProfile.discardTitle'), t('publicProfile.discardMessage'), [
      { text: t('publicProfile.keepEditing'), style: 'cancel' },
      { text: t('publicProfile.discard'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // 結果の文言を、読み上げにも伝える。Androidは `accessibilityLiveRegion`（下の `Text`）が伝える。iOSには無いので、ここで。
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(t(notice.key));
  }, [notice, t]);

  // Android のキーボードが下の欄（Bio）を隠さないようにする（`SongForm` と同じ理由。iOS は ScrollView が行う）。
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  const revealBottom = useRef(false);

  /**
   * 操作を1つ実行する。失敗は文言に直して出す。サインインが外れた・`username` の有無が食い違ったときは、サーバーの状態を読み直す。
   * `task` は、成功の文言（なければ `null`）を返す。
   */
  const run = async (action: BusyAction, task: () => Promise<NoticeKey | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setNotice(null);
    let result: Notice | null = null;
    let reload = false;
    try {
      const key = await task();
      result = key === null ? null : { kind: 'info', key };
    } catch (error) {
      result = { kind: 'error', key: publicProfileErrorMessageKey(error, action) };
      reload = needsProfileReload(error);
    }
    busyRef.current = false;
    if (!mountedRef.current) return;
    setBusy(null);
    setNotice(result);
    if (reload) {
      await load();
      // 読み直しは通知を消す。操作の失敗の文言は残す（`load` が自分で出す通知は、サインインが外れたときの同じ文言）。
      if (mountedRef.current) setNotice((current) => current ?? result);
    }
  };

  const applyProfile = (profile: PublicProfile) => {
    setView((current) => (current.kind === 'ready' ? { ...current, profile } : current));
    resetForm(profile);
  };

  const confirmClaim = () => {
    const username = normalizeUsernameInput(usernameInput);
    if (!isValidUsername(username) || busyRef.current) return;
    Alert.alert(
      t('publicProfile.username.confirmTitle', { username }),
      t('publicProfile.username.confirmMessage', { address: publicAddress(username) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('publicProfile.username.confirmAction'),
          onPress: () =>
            void run('claimUsername', async () => {
              const { publish } = await getServices();
              applyProfile(await publish.claimUsername(username));
              return null;
            }),
        },
      ],
    );
  };

  /**
   * 版が食い違ったときの確認。`visibleConfirmed` は、「人に見える状態になる」確認（最初の公開・非公開にしたあとの公開の確認）を、
   * この Publish のために済ませているか。**公開中と見て確認なしで送ったのに、サーバーは非公開だった**（別の端末で、画面を開いたあとに非公開にされた）
   * ときは、置き換えではなく、もう一度公開する確認を出す（置き換えるだけの文言では、公開ページが再び人に見えることを伝えられない）。
   */
  const confirmReplace = (server: PublicProfile, visibleConfirmed: boolean) => {
    // 画面の状態（公開中か・最終公開）は、サーバーの今の内容に合わせる。入力中の Display Name・Bio は、そのまま。
    setView((current) => (current.kind === 'ready' ? { ...current, profile: server } : current));
    const republish = !server.published && !visibleConfirmed;
    Alert.alert(
      republish ? t('publicProfile.republishTitle') : t('publicProfile.replaceTitle'),
      republish
        ? t('publicProfile.republishMessage', { address: publicAddress(server.username) })
        : t('publicProfile.replaceMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: republish ? t('publicProfile.publishConfirmAction') : t('publicProfile.replaceAction'),
          // 送り直すまでの間に、また食い違うことがある。置き換えの確認では、「人に見える状態になる」ことは伝えていない（公開中だったため）ので、
          // 引き継ぐのは、すでに伝えた分だけ（もう一度公開する確認を出したときと、元から済んでいたとき）。
          onPress: () => publishNow(server.version, republish || visibleConfirmed),
        },
      ],
    );
  };

  const publishNow = (replaceVersion?: number, visibleConfirmed = false) =>
    void run('publish', async () => {
      const { publish } = await getServices();
      try {
        applyProfile(await publish.publish({ displayName, bio, replaceVersion }));
        return 'publicProfile.published';
      } catch (error) {
        // 別の端末が Publish した・非公開にした、再インストール後、応答を受け取れなかった Publish のあと。確認のうえ、置き換える。
        if (error instanceof PublishError && error.code === 'version-conflict' && error.profile) {
          confirmReplace(error.profile, visibleConfirmed);
          return null;
        }
        throw error;
      }
    });

  const startPublish = (profile: PublicProfile) => {
    if (busyRef.current) return;
    // 公開中の更新（Publish Now）は、確認なしで送る。最初の公開と、非公開にしたあとの公開は、人に見える状態になるので、確認する。
    if (profile.published) {
      publishNow();
      return;
    }
    Alert.alert(
      t('publicProfile.publishConfirmTitle'),
      t('publicProfile.publishConfirmMessage', { address: publicAddress(profile.username) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('publicProfile.publishConfirmAction'), onPress: () => publishNow(undefined, true) },
      ],
    );
  };

  const confirmUnpublish = () =>
    Alert.alert(t('publicProfile.unpublishConfirmTitle'), t('publicProfile.unpublishConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('publicProfile.unpublishConfirmAction'),
        style: 'destructive',
        onPress: () =>
          void run('unpublish', async () => {
            const { publish } = await getServices();
            const profile = await publish.unpublish();
            // サーバーに `username` が無かった（アカウントを作り直したなど）。何も伝えずに画面が変わらないよう、`username-required` の
            // 失敗として扱う（文言を出して、サーバーの状態を読み直し、`username` の確保から始める）。
            if (profile === null) throw new PublishError('username-required');
            // 入力中の下書きは、そのまま残す（非公開にしても、Display Name・Bio の控えはサーバーに残る）。
            setView((current) => (current.kind === 'ready' ? { ...current, profile } : current));
            return 'publicProfile.unpublished';
          }),
      },
    ]);

  const busyKeys = {
    claimUsername: 'publicProfile.claiming',
    publish: 'publicProfile.publishing',
    unpublish: 'publicProfile.unpublishing',
  } as const satisfies Record<BusyAction, `publicProfile.${string}`>;

  const disabled = busy !== null;
  // `ready` のときだけ値がある（`profile` が `null` なら、まだ `username` を確保していない）。
  const profile = view.kind === 'ready' ? view.profile : null;
  const readyCount = view.kind === 'ready' ? view.readyCount : 0;
  const publicTagCount = view.kind === 'ready' ? view.publicTagCount : 0;
  const tooManySongs = readyCount > PUBLISH_LIMITS.songs;

  return (
    // 文字を大きくした端末でも切れないよう、はみ出すときはスクロールできるようにする。
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        // キーボードの高さには、下端のナビゲーションバーの分が含まれない（Androidで確認）。
        { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom + 16 : 32 + insets.bottom },
      ]}
      onContentSizeChange={() => {
        if (keyboardHeight > 0 && revealBottom.current) scrollRef.current?.scrollToEnd({ animated: true });
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      {notice && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: notice.kind === 'error' ? colors.error : colors.textPrimary }]}
        >
          {t(notice.key)}
        </Text>
      )}

      {view.kind === 'failed' && (
        <View style={styles.block}>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('publicProfile.loadFailed')}</Text>
          <ActionButton label={t('publicProfile.retry')} onPress={() => void load()} />
        </View>
      )}

      {view.kind === 'signedOut' && (
        <View style={styles.block}>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('publicProfile.signedOutNote')}</Text>
          <ActionButton label={t('publicProfile.goToAccount')} onPress={() => router.push('/account')} />
        </View>
      )}

      {view.kind === 'ready' && profile === null && (
        <View style={styles.block}>
          <Text role="heading" style={[styles.heading, { color: colors.textPrimary }]}>
            {t('publicProfile.username.title')}
          </Text>
          <UsernameForm
            value={usernameInput}
            onChange={setUsernameInput}
            disabled={disabled}
            onSubmit={confirmClaim}
          />
        </View>
      )}

      {profile !== null && (
        <View style={styles.block}>
          <StatusBlock profile={profile} />

          <FormField label={t('publicProfile.displayName')} required>
            <FormInput
              value={displayName}
              onChangeText={setDisplayName}
              onFocus={() => {
                revealBottom.current = false;
              }}
              // 長さは UTF-16 の単位で数える（`maxLength` の数え方）。送る側の上限（コードポイント）より厳しい側で、超えることは無い
              // （絵文字などは、上限の半分で止まる）。値の出どころは、この画面の入力か、そこから送った公開済みの値だけ。
              maxLength={PUBLISH_LIMITS.displayNameChars}
              accessibilityLabel={t('publicProfile.displayName')}
              returnKeyType="done"
              editable={!disabled}
            />
          </FormField>

          <FormField label={t('publicProfile.bio')}>
            <FormInput
              multiline
              value={bio}
              onChangeText={setBio}
              onFocus={() => {
                revealBottom.current = true;
                scrollRef.current?.scrollToEnd({ animated: true });
              }}
              // 数え方は Display Name と同じ。下のカウンタも、同じ（UTF-16 の単位）数え方で、入力欄が止まる数と一致する。
              maxLength={PUBLISH_LIMITS.bioChars}
              accessibilityLabel={t('publicProfile.bio')}
              editable={!disabled}
            />
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {bio.length} / {PUBLISH_LIMITS.bioChars}
            </Text>
          </FormField>

          <SettingsRow
            label={t('publicProfile.tags')}
            value={publicTagCount === 0 ? t('publicProfile.tagsNone') : t('publicProfile.tagsCount', { count: publicTagCount })}
            accessibilityHint={t('publicProfile.tagsHint')}
            onPress={() => {
              // 実行中は開かない（Publish が読んだあとに選択が変わると、公開される内容が画面の印象とずれる）。
              if (!busyRef.current) router.push('/public-tags');
            }}
          />

          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('publicProfile.sharedNote')}</Text>
          <Text
            style={[
              styles.note,
              { color: tooManySongs ? colors.error : colors.textSecondary },
            ]}
          >
            {tooManySongs
              ? t('publicProfile.tooManySongs', { count: readyCount, limit: PUBLISH_LIMITS.songs })
              : t('publicProfile.readyCount', { count: readyCount })}
          </Text>

          <ActionButton
            variant="primary"
            label={t('publicProfile.publish')}
            // Display Name が空・曲が多すぎるときは、送っても断られる（通信の前に Service が断る）。
            disabled={disabled || displayName.trim() === '' || tooManySongs}
            onPress={() => startPublish(profile)}
          />

          {profile.published && (
            <View style={styles.unpublish}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={confirmUnpublish}
                style={({ pressed }) => [styles.row, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.rowLabel, { color: colors.error }]}>{t('publicProfile.unpublish')}</Text>
              </Pressable>
              <Text style={[styles.rowNote, { color: colors.textSecondary }]}>{t('publicProfile.unpublishNote')}</Text>
            </View>
          )}
        </View>
      )}

      {(view.kind === 'loading' || busy !== null) && (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.textSecondary} />
          {busy !== null && <Text style={[styles.busyLabel, { color: colors.textSecondary }]}>{t(busyKeys[busy])}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

/** `username` の入力。確かめるのは形だけ（予約語・取られている名前は、サーバーが断る）。 */
function UsernameForm({
  value,
  onChange,
  disabled,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const normalized = normalizeUsernameInput(value);
  const valid = isValidUsername(normalized);
  // 何か打つまでは、エラーにしない。
  const invalid = normalized !== '' && !valid;
  return (
    <>
      <FormField
        label={t('publicProfile.username.label')}
        required
        note={t('publicProfile.username.note')}
        error={invalid ? t('publicProfile.error.usernameInvalid') : undefined}
      >
        <FormInput
          value={value}
          onChangeText={onChange}
          invalid={invalid}
          // 名前を自動修正が書き換えない・大文字にしない（サーバーは小文字だけを受け付け、アプリが小文字にして送る）。
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          keyboardType="ascii-capable"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          accessibilityLabel={t('publicProfile.username.label')}
          editable={!disabled}
        />
      </FormField>
      {valid && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t('publicProfile.username.preview', { address: publicAddress(normalized) })}
        </Text>
      )}
      <ActionButton
        variant="primary"
        label={t('publicProfile.username.claim')}
        disabled={disabled || !valid}
        onPress={onSubmit}
      />
    </>
  );
}

/** 公開の状態（公開中か・アドレス・最終公開の時刻）。 */
function StatusBlock({ profile }: { profile: PublicProfile }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.status}>
      <View style={styles.statusRow}>
        {/* 公開中は塗り、未公開は縁だけ（色だけで伝えない。文字でも伝えている）。装飾なので読み上げない。 */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.dot,
            profile.published
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: 'transparent', borderColor: colors.textSecondary },
          ]}
        />
        <Text role="heading" style={[styles.heading, { color: colors.textPrimary }]}>
          {profile.published ? t('publicProfile.status.published') : t('publicProfile.status.notPublished')}
        </Text>
      </View>
      <Text selectable style={[styles.address, { color: colors.textPrimary }]}>
        {publicAddress(profile.username)}
      </Text>
      {profile.published && profile.publishedAt !== null && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t('publicProfile.lastPublished', { time: formatDateTime(profile.publishedAt) })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  block: { gap: 16 },
  notice: { fontSize: 15, lineHeight: 22 },
  note: { fontSize: 13, lineHeight: 18 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  status: { gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  address: { fontSize: 15, lineHeight: 22 },
  counter: { fontSize: 13, lineHeight: 18, textAlign: 'right' },
  unpublish: { gap: 0 },
  row: { minHeight: 48, justifyContent: 'center' },
  rowLabel: { fontSize: 16, lineHeight: 22 },
  rowNote: { fontSize: 13, lineHeight: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  busyLabel: { flexShrink: 1, fontSize: 15, lineHeight: 22 },
});
