import * as AppleAuthentication from 'expo-apple-authentication';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { AuthProvider } from '../src/domain/types';
import { accountErrorMessageKey, type AccountAction } from '../src/i18n';
import { getServices } from '../src/services';
import { ActionButton, BUTTON_RADIUS } from './ActionButton';
import { useI18n } from './i18n';
import { Text } from './Text';
import { useTheme } from './theme';

type AccountView =
  | { kind: 'loading' }
  // `getSignedInProvider` が投げた（ローカルDBの識別子を読めないなど）。「ログアウト中」と取り違えない。
  | { kind: 'unknown' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; provider: AuthProvider };

interface Notice {
  kind: 'error' | 'info';
  text: string;
}

/**
 * Account 画面（`app/account.tsx`）の中身。ログイン・ログアウト・「ほかの端末をすべてログアウト」・アカウントの削除。
 *
 * **ログインを要求しない**: ここでの失敗は、すべてこの画面の中で伝えて、ErrorBoundary（アプリ全体のエラー画面）には
 * 伝えない（`getSignedInProvider` が投げても、「状態を確認できなかった」と出して、やり直せるようにするだけ）。
 * 画面は `account`（Service）の返す値だけを使う。URL・レスポンスの形・各社のSDK・セッションの値には触れない。
 *
 * 操作は1つずつ。実行中は、ほかの操作を押せず、戻る操作も止める（アカウントの削除の結果は、この画面でしか伝えられない。
 * 待つのは、削除で最大30秒、サインインの各社の画面は、OSが前面に出ている間）。
 */
export function AccountSection() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();

  const [view, setView] = useState<AccountView>({ kind: 'loading' });
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // state は再描画まで古いので、連打で操作が重ならないよう、参照でも持つ。
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 実行中は戻れない（結果を伝える画面が無くなるため）。iOSのネイティブのStackは、これで止めると伝えない限り、
  // 戻る操作をネイティブ側で先に実行してしまう（`SongForm` の `usePreventRemove` と同じ理由）。
  usePreventRemove(busy !== null, () => {});

  const refresh = useCallback(async () => {
    let next: AccountView;
    try {
      const { account } = await getServices();
      const provider = await account.getSignedInProvider();
      next = provider === null ? { kind: 'signedOut' } : { kind: 'signedIn', provider };
    } catch {
      next = { kind: 'unknown' };
    }
    if (mountedRef.current) setView(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 結果の文言を、読み上げにも伝える。Androidは `accessibilityLiveRegion`（下の `Text`）が伝える。iOSには無いので、ここで。
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice.text);
  }, [notice]);

  /**
   * 操作を1つ実行する。失敗は文言に直して出す（取りやめは何も出さない）。終わったら、成功でも失敗でも、
   * サインインの状態を読み直す（失敗のあとに、端末のセッションが捨てられていることがある）。
   */
  const run = async (action: AccountAction, task: () => Promise<Notice | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setNotice(null);
    let result: Notice | null;
    try {
      result = await task();
    } catch (error) {
      const key = accountErrorMessageKey(error, action);
      result = key === null ? null : { kind: 'error', text: t(key) };
    }
    await refresh();
    busyRef.current = false;
    if (mountedRef.current) {
      setNotice(result);
      setBusy(null);
    }
  };

  const signIn = (provider: AuthProvider) =>
    run('signIn', async () => {
      const { account } = await getServices();
      await account.signIn(provider);
      return null;
    });

  const confirmSignOut = () =>
    Alert.alert(t('account.signOutConfirmTitle'), t('account.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        onPress: () =>
          void run('signOut', async () => {
            const { account } = await getServices();
            const { serverRevoked } = await account.signOut();
            return serverRevoked ? null : { kind: 'info', text: t('account.signedOutLocalOnly') };
          }),
      },
    ]);

  const confirmSignOutOthers = () =>
    Alert.alert(t('account.signOutOthersConfirmTitle'), t('account.signOutOthersConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOutOthers'),
        onPress: () =>
          void run('signOutOthers', async () => {
            const { account } = await getServices();
            await account.signOutOthers();
            return { kind: 'info', text: t('account.signedOutOthers') };
          }),
      },
    ]);

  const confirmDelete = (provider: AuthProvider) =>
    Alert.alert(
      t('account.deleteConfirmTitle'),
      t('account.deleteConfirmMessage', { provider: providerName(t, provider) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.deleteConfirmAction'),
          style: 'destructive',
          onPress: () =>
            void run('deleteAccount', async () => {
              const { account } = await getServices();
              const { appleRevoked, sessionCleared } = await account.deleteAccount();
              // 削除は成功している。端末のセッションを捨てられなかった（読み直すと、まだサインイン中に見える）ときと、
              // Appleのトークンを失効できなかったときは、それぞれの案内を足す。
              const lines = [t('account.deleted')];
              if (!sessionCleared) lines.push(t('account.deletedSignInRemains'));
              if (appleRevoked === false) lines.push(t('account.appleNotRevokedNote'));
              return { kind: 'info', text: lines.join('\n') };
            }),
        },
      ],
    );

  const busyLabel = busy === null ? null : t(busyKeys[busy]);
  const disabled = busy !== null;

  return (
    <View style={styles.root}>
      {notice && (
        <Text
          // 結果は、画面の上に出す（削除のあとは、サインアウト中の表示に変わるので、その上）。
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: notice.kind === 'error' ? colors.error : colors.textPrimary }]}
        >
          {notice.text}
        </Text>
      )}

      {view.kind === 'unknown' && (
        <View style={styles.block}>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('account.loadFailed')}</Text>
          <ActionButton label={t('account.retry')} disabled={disabled} onPress={() => void refresh()} />
        </View>
      )}

      {view.kind === 'signedOut' && (
        <View style={styles.block}>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('account.signedOutNote')}</Text>
          {/* Googleと、iOS以外のAppleのボタン。ロゴは使わない（各社のロゴの規約に踏み込まないため）。 */}
          <View style={styles.buttons}>
            {Platform.OS === 'ios' ? (
              // Appleの規約に沿った見た目と文言（OSが、端末の言語で出す）。背景色・角丸は、`style` ではなく専用の
              // プロパティで指定する（`style` で指定しても効かず、App Storeのガイドラインにも反する）。
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  scheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={BUTTON_RADIUS}
                style={[styles.appleButton, { opacity: disabled ? 0.5 : 1 }]}
                // 実行中の連打は、`run` が弾く（ボタン自体は、押せなくしていない）。
                onPress={() => void signIn('apple')}
              />
            ) : (
              <ActionButton
                label={t('account.signInApple')}
                disabled={disabled}
                onPress={() => void signIn('apple')}
              />
            )}
            <ActionButton
              label={t('account.signInGoogle')}
              disabled={disabled}
              onPress={() => void signIn('google')}
            />
          </View>
        </View>
      )}

      {view.kind === 'signedIn' && (
        <View style={styles.block}>
          <Text role="heading" style={[styles.signedIn, { color: colors.textPrimary }]}>
            {t('account.signedInWith', { provider: providerName(t, view.provider) })}
          </Text>

          <ActionRow label={t('account.signOut')} disabled={disabled} onPress={confirmSignOut} />
          <ActionRow
            label={t('account.signOutOthers')}
            note={t('account.signOutOthersNote')}
            disabled={disabled}
            onPress={confirmSignOutOthers}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ActionRow
            label={t('account.deleteAccount')}
            note={t('account.deleteNote')}
            destructive
            disabled={disabled}
            onPress={() => confirmDelete(view.provider)}
          />
        </View>
      )}

      {busyLabel !== null && (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={[styles.busyLabel, { color: colors.textSecondary }]}>{busyLabel}</Text>
        </View>
      )}
    </View>
  );
}

const busyKeys = {
  signIn: 'account.signingIn',
  signOut: 'account.signingOut',
  signOutOthers: 'account.signingOutOthers',
  deleteAccount: 'account.deleting',
} as const satisfies Record<AccountAction, `account.${string}`>;

function providerName(t: ReturnType<typeof useI18n>['t'], provider: AuthProvider): string {
  return provider === 'apple' ? t('account.providerApple') : t('account.providerGoogle');
}

/** サインイン中の操作の行（ログアウト・ほかの端末のログアウト・削除）。`note` は、行の下の補足。 */
function ActionRow({
  label,
  note,
  destructive = false,
  disabled,
  onPress,
}: {
  label: string;
  note?: string;
  destructive?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.rowLabel, { color: destructive ? colors.error : colors.textPrimary }]}>{label}</Text>
      </Pressable>
      {note !== undefined && <Text style={[styles.rowNote, { color: colors.textSecondary }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  block: { gap: 16 },
  notice: { fontSize: 15, lineHeight: 22 },
  note: { fontSize: 15, lineHeight: 22 },
  buttons: { gap: 12 },
  // 高さと幅が無いと、Appleのボタンは画面に出ない。
  appleButton: { width: '100%', height: 48 },
  signedIn: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  rowWrap: { gap: 0 },
  row: { minHeight: 48, justifyContent: 'center' },
  rowLabel: { fontSize: 16, lineHeight: 22 },
  rowNote: { fontSize: 13, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  busyLabel: { flexShrink: 1, fontSize: 15, lineHeight: 22 },
});
