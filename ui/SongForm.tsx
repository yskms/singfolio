import { Stack, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { TextInput as NativeTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SONG_STATUSES,
  type Song,
  type SongStatus,
  type SongSuggestion,
  type Tag,
} from '../src/domain/types';
import { errorMessageKey } from '../src/i18n';
import { getServices, ServiceError, type SongInput } from '../src/services';
import { MIN_CATALOG_TERM_LENGTH, mergeArtistSuggestions } from '../src/services/suggestionRules';
import { resolveTagInput } from '../src/services/tagInput';
import { normalizeText, searchKey } from '../src/services/text';
import { ChoiceRow } from './ChoiceRow';
import { FormField } from './FormField';
import { FormInput } from './FormInput';
import { useI18n } from './i18n';
import { KeyStepper } from './KeyStepper';
import { SuggestionList } from './SuggestionList';
import { TagPicker } from './TagPicker';
import { Text } from './Text';
import { useTheme } from './theme';
import { useSuggestions } from './useSuggestions';

/** 追加画面の Status の既定。「曲を登録 → Readyにする」が中心の体験のため。 */
const DEFAULT_STATUS: SongStatus = 'ready';

/** 外部の候補を探すまでの待ち時間。入力が止まってから送る（打つたびには送らない）。 */
const SUGGEST_DELAY_MS = 500;

/**
 * 追加・編集の画面（`app/song/`）のヘッダー。ルートが、読み込み中も含めて常に指定する
 * （`SongForm` が出るまで指定しないと、画面を開く動きの間、ヘッダーが無い）。題はルートが
 * 足す。保存のボタンだけは、入力の状態に依存するため `SongForm` が足す。
 * 戻るボタンの文字は出さない（iOSは、前の画面の題を出す。前の画面は、ルートのStackの
 * (tabs) で、このStackのヘッダーを出さず、題も付けていないため、意味のある文字にならない
 * はず。出した場合の表示は未確認）。
 */
export const SONG_FORM_SCREEN_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal',
  // iOSの戻るボタンの長押しメニュー（複数の画面を一度に戻る）は、破棄の確認を通らず、
  // 画面をネイティブ側で先に外してしまう（React Navigationの警告による。メニュー自体は未確認）。
  headerBackButtonMenuEnabled: false,
} as const;

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * 曲の追加・編集の入力画面。`song` を渡すと編集、渡さないと追加。保存すると前の画面へ戻る。
 * 保存のボタンはヘッダーの右（キーボードを出したまま押せる）。
 *
 * - 曲名・アーティストが空なら、保存せずに両方の欄にエラーを出す（Serviceの検証と同じ
 *   `normalizeText` で判定し、Serviceのエラーは念のため受ける）。
 * - 新しいタグは、保存するときに、曲と同じトランザクションで作る（保存せずに戻ったときも、
 *   保存に失敗したときも、使われないタグが残らない）。「新規タグ」欄に書いたまま保存した名前も、
 *   追加したものとして扱う。
 * - 変更があるまま戻る（戻るボタン・iOSのスワイプ・Androidの戻る操作）と、破棄の確認を出す。
 * - 曲名・アーティストの欄の直下に、候補を出す（`singfolio-screen-flow.md`「候補（サジェスト）」）。
 *   欄を**編集した**ときだけ探す（フォーカスしただけ・開いたときの既存の値では、外部へ送らない）。
 *   曲の候補を選ぶと曲名とアーティストの両方、アーティストの候補を選ぶとアーティストだけを
 *   置き換える。選んで欄が書き換わっても、探し直さない。
 */
export function SongForm({ song, tags }: { song?: Song; tags: readonly Tag[] }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // 開いた時点の内容。変更の有無（破棄の確認）の基準。
  const [initial] = useState(() => ({
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    status: song?.status ?? DEFAULT_STATUS,
    keyOffset: song?.keyOffset ?? 0,
    privateNote: song?.privateNote ?? '',
    tagIds: new Set(song?.tags.map((tag) => tag.id)),
  }));

  const [title, setTitle] = useState(initial.title);
  const [artist, setArtist] = useState(initial.artist);
  const [status, setStatus] = useState<SongStatus>(initial.status);
  const [keyOffset, setKeyOffset] = useState(initial.keyOffset);
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlySet<string>>(initial.tagIds);
  // 保存するときに作る、新しいタグの名前（正規化した形）。
  const [pendingTagNames, setPendingTagNames] = useState<readonly string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [privateNote, setPrivateNote] = useState(initial.privateNote);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [artistError, setArtistError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // 候補。欄を編集したときだけ探す（フォーカスしただけでは探さない・送らない）ため、フォーカス中か、
  // 編集したか（フォーカスが外れたら戻す）を持つ。`picked*` は、候補を選んで入った値で、欄が
  // その値のままのあいだは探し直さない（編集すると外れる）。
  const [titleFocused, setTitleFocused] = useState(false);
  const [artistFocused, setArtistFocused] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [artistEdited, setArtistEdited] = useState(false);
  const [pickedTitle, setPickedTitle] = useState<string | null>(null);
  const [pickedArtist, setPickedArtist] = useState<string | null>(null);
  // この画面でアーティストを入力した・候補から選んだ（開いている間は戻さない。`artistEdited` は
  // フォーカスが外れると戻るので別）。曲名の検索にアーティストを添えるのは、これが true のとき
  // だけ。編集画面を開いたときの既存のアーティストは、編集していないので、送らない。
  const [artistTouched, setArtistTouched] = useState(false);
  // 候補を選ぶたびに増やし、入力欄の `key` にする（欄を作り直す）。iOSは、日本語の変換中
  // （未確定の文字がある）の欄の値を、JSから書き換えても無視する（確定の後も、欄は未確定の文字の
  // まま。`onChangeText` も来ない。iOSシミュレータで確認）。ひらがなを打ってから、確定せずに
  // 候補を押すのは普通の使い方なので、欄ごと作り直して、変換中の状態を捨てる。
  const [titleEpoch, setTitleEpoch] = useState(0);
  const [artistEpoch, setArtistEpoch] = useState(0);
  // 外部の候補が使える（組み込まれていて、設定がオン）。提供元の表記を出すかどうか。
  const [providerShown, setProviderShown] = useState(false);
  useEffect(() => {
    let current = true;
    getServices()
      .then(async ({ suggestions, settings }) =>
        suggestions.available && (await settings.getSuggestionsEnabled()),
      )
      .then((enabled) => {
        if (current) setProviderShown(enabled);
      })
      .catch(() => {}); // 候補が出ないだけ。入力・保存には影響しない。
    return () => {
      current = false;
    };
  }, []);

  const titleActive = titleFocused && titleEdited && title !== pickedTitle;
  const artistActive = artistFocused && artistEdited && artist !== pickedArtist;
  const searchArtist = artistTouched ? artist : '';
  const songSuggestions = useSuggestions<SongSuggestion>({
    active: titleActive,
    term: title,
    queryKey: `${language}\n${title}\n${searchArtist}`,
    delayMs: SUGGEST_DELAY_MS,
    load: async () =>
      (await getServices()).suggestions.catalogSongs({ title, artist: searchArtist, language }),
  });
  const localArtists = useSuggestions<string>({
    active: artistActive,
    term: artist,
    queryKey: artist,
    delayMs: 0,
    load: async () => (await getServices()).suggestions.localArtists(artist),
  });
  const catalogArtists = useSuggestions<string>({
    active: artistActive,
    term: artist,
    queryKey: `${language}\n${artist}`,
    delayMs: SUGGEST_DELAY_MS,
    load: async () => (await getServices()).suggestions.catalogArtists({ artist, language }),
  });
  const artistSuggestions = useMemo(
    () => mergeArtistSuggestions(localArtists, catalogArtists, artist),
    [localArtists, catalogArtists, artist],
  );
  // 提供元の表記は、検索語を外部へ送りうる間（送る長さがあるとき）だけ出す。
  const sendable = (text: string) => searchKey(text).length >= MIN_CATALOG_TERM_LENGTH;
  // 欄を作り直す（上の `titleEpoch` の説明）と、フォーカスの外れ（`onBlur`）が来ないことが
  // あるので、フォーカスと編集の状態も、ここで戻す。
  const pickSong = (suggestion: SongSuggestion) => {
    setTitle(suggestion.title);
    setArtist(suggestion.artist);
    setPickedTitle(suggestion.title);
    setPickedArtist(suggestion.artist);
    setArtistTouched(true);
    setTitleError(undefined);
    setArtistError(undefined);
    setTitleFocused(false);
    setArtistFocused(false);
    setTitleEdited(false);
    setArtistEdited(false);
    setTitleEpoch((epoch) => epoch + 1);
    setArtistEpoch((epoch) => epoch + 1);
    Keyboard.dismiss();
  };
  const pickArtist = (name: string) => {
    setArtist(name);
    setPickedArtist(name);
    setArtistTouched(true);
    setArtistError(undefined);
    setArtistFocused(false);
    setArtistEdited(false);
    setArtistEpoch((epoch) => epoch + 1);
    Keyboard.dismiss();
  };

  const titleRef = useRef<NativeTextInput>(null);
  const artistRef = useRef<NativeTextInput>(null);
  // 二重タップで二重に保存しない（state は再描画まで古い）。
  const savingRef = useRef(false);

  // キーボードが下の欄（新規タグ・Private Note）を隠さないようにする。
  // iOSは `automaticallyAdjustKeyboardInsets` が行う。Androidは、エッジ・ツー・エッジのため、
  // 画面（ScrollView）がキーボードの下まで広がったまま縮まず、そのままでは、スクロールできず
  // 隠れたままになる。キーボードの高さの分だけ末尾に余白を足し、下の欄にフォーカスが入って
  // いるあいだは、末尾までスクロールする（余白が入って内容の高さが変わった後に行う）。
  // 曲名・アーティスト（上の欄）は、元から見える。
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const revealBottom = useRef(false);
  const focusTopField = () => {
    revealBottom.current = false;
  };
  const focusBottomField = () => {
    revealBottom.current = true;
    scrollRef.current?.scrollToEnd({ animated: true });
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const isDirty =
    title !== initial.title ||
    artist !== initial.artist ||
    status !== initial.status ||
    keyOffset !== initial.keyOffset ||
    privateNote !== initial.privateNote ||
    !sameIds(selectedTagIds, initial.tagIds) ||
    pendingTagNames.length > 0 ||
    tagInput.trim() !== '';
  // 保存できた。戻る操作は、この後の再描画（破棄の確認が外れる）で行う。
  const [saved, setSaved] = useState(false);

  // 変更があるまま戻ろうとすると止めて、破棄の確認を出す。`beforeRemove` を自分で購読せず、
  // これを使う。iOSのネイティブのStackは、これで止めると伝えない限り、戻るボタン・スワイプを
  // ネイティブ側で先に実行してしまい、止められない（"was removed natively" の警告になる）。
  usePreventRemove(isDirty && !saved, ({ data }) => {
    Alert.alert(t('songForm.discardTitle'), t('songForm.discardMessage'), [
      { text: t('songForm.keepEditing'), style: 'cancel' },
      {
        text: t('songForm.discard'),
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // 上の `usePreventRemove` より後に置く（保存済みの状態を先にそちらへ渡してから、戻る）。
  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

  const addTagFromInput = () => {
    const result = resolveTagInput(tagInput, tags, pendingTagNames);
    if (result.type === 'existing') {
      const id = result.tag.id;
      setSelectedTagIds((current) => new Set(current).add(id));
    } else if (result.type === 'new') {
      setPendingTagNames((current) => [...current, result.name]);
    }
    setTagInput('');
  };

  const save = async () => {
    if (savingRef.current) return;
    const titleMissing = normalizeText(title) === '';
    const artistMissing = normalizeText(artist) === '';
    setTitleError(titleMissing ? t('error.titleRequired') : undefined);
    setArtistError(artistMissing ? t('error.artistRequired') : undefined);
    if (titleMissing || artistMissing) {
      (titleMissing ? titleRef : artistRef).current?.focus();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const services = await getServices();
      // 「新規タグ」欄に書いたままの名前も、追加したものとして扱う。
      const typed = resolveTagInput(tagInput, tags, pendingTagNames);
      const tagIds = new Set(selectedTagIds);
      if (typed.type === 'existing') tagIds.add(typed.tag.id);
      // 新しいタグは、Serviceが、曲の保存と同じトランザクションで作る（保存が失敗したとき、
      // タグだけが残らないように）。
      const newTagNames = typed.type === 'new' ? [...pendingTagNames, typed.name] : pendingTagNames;

      const input: SongInput = {
        title,
        artist,
        status,
        keyOffset,
        privateNote,
        tagIds: [...tagIds],
        newTagNames: [...newTagNames],
      };
      if (song) await services.songs.updateSong(song.id, input);
      else await services.songs.createSong(input);

      Keyboard.dismiss();
      // 保存中のまま（`savingRef` を戻さない）にして、戻るまでの間の再タップで二重に保存しない。
      setSaved(true);
    } catch (error) {
      savingRef.current = false;
      setSaving(false);
      if (error instanceof ServiceError && error.code === 'title-required') {
        setTitleError(t('error.titleRequired'));
      } else if (error instanceof ServiceError && error.code === 'artist-required') {
        setArtistError(t('error.artistRequired'));
      } else {
        Alert.alert(t('songForm.saveFailedTitle'), t(errorMessageKey(error)), [{ text: t('common.ok') }]);
      }
    }
  };
  // ヘッダーのボタンは、入力のたびに作り直さない（その都度ナビゲーションの再描画になる）。
  // 押したときに最新の `save` を呼ぶため、ref 経由にする。
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const headerOptions = useMemo(
    () => ({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          hitSlop={8}
          onPress={() => void saveRef.current()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary, opacity: saving ? 0.5 : pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.saveLabel, { color: colors.onPrimary }]}>{t('songForm.save')}</Text>
        </Pressable>
      ),
    }),
    [t, saving, colors.primary, colors.onPrimary],
  );

  return (
    <>
      <Stack.Screen options={headerOptions} />
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
        <FormField label={t('songForm.title')} required error={titleError}>
          <FormInput
            key={`title-${titleEpoch}`}
            ref={titleRef}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setTitleEdited(true);
              setPickedTitle(null);
              setTitleError(undefined);
            }}
            accessibilityLabel={t('songForm.title')}
            accessibilityHint={t('songForm.requiredHint')}
            invalid={titleError !== undefined}
            onFocus={() => {
              focusTopField();
              setTitleFocused(true);
            }}
            onBlur={() => {
              setTitleFocused(false);
              setTitleEdited(false);
            }}
            // 追加は、開いてすぐ入力できるようにする（素早く登録できることを優先）。欄を作り直した
            // とき（候補を選んだ後）は、フォーカスしない。
            autoFocus={!song && titleEpoch === 0}
            returnKeyType="next"
            onSubmitEditing={() => artistRef.current?.focus()}
            submitBehavior="submit"
          />
          <SuggestionList
            rows={songSuggestions.map((suggestion) => ({
              key: `${suggestion.title}\u0000${suggestion.artist}`,
              primary: suggestion.title,
              secondary: suggestion.artist,
              registered: suggestion.registered,
              accessibilityLabel: t(
                suggestion.registered ? 'songForm.suggestionA11yRegistered' : 'songForm.suggestionA11y',
                { title: suggestion.title, artist: suggestion.artist },
              ),
            }))}
            hint={t('songForm.suggestionSongHint')}
            onPick={(index) => {
              const suggestion = songSuggestions[index];
              if (suggestion) pickSong(suggestion);
            }}
            provider={
              providerShown && titleActive && sendable(title) ? t('songForm.suggestionsProvider') : undefined
            }
          />
        </FormField>

        <FormField label={t('songForm.artist')} required error={artistError}>
          <FormInput
            key={`artist-${artistEpoch}`}
            ref={artistRef}
            value={artist}
            onChangeText={(text) => {
              setArtist(text);
              setArtistTouched(true);
              setArtistEdited(true);
              setPickedArtist(null);
              setArtistError(undefined);
            }}
            accessibilityLabel={t('songForm.artist')}
            accessibilityHint={t('songForm.requiredHint')}
            invalid={artistError !== undefined}
            onFocus={() => {
              focusTopField();
              setArtistFocused(true);
            }}
            onBlur={() => {
              setArtistFocused(false);
              setArtistEdited(false);
            }}
            returnKeyType="done"
          />
          <SuggestionList
            rows={artistSuggestions.map((name) => ({
              key: name,
              primary: name,
              accessibilityLabel: name,
            }))}
            hint={t('songForm.suggestionArtistHint')}
            onPick={(index) => {
              const name = artistSuggestions[index];
              if (name !== undefined) pickArtist(name);
            }}
            provider={
              providerShown && artistActive && sendable(artist) ? t('songForm.suggestionsProvider') : undefined
            }
          />
        </FormField>

        <FormField label={t('songForm.status')}>
          <ChoiceRow
            options={SONG_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
            value={status}
            onChange={setStatus}
          />
        </FormField>

        <FormField label={t('songForm.myKey')}>
          <KeyStepper value={keyOffset} onChange={setKeyOffset} />
        </FormField>

        <FormField label={t('songForm.tags')} note={t('songForm.tagsNote')}>
          <TagPicker
            tags={tags}
            selectedIds={selectedTagIds}
            pendingNames={pendingTagNames}
            onToggleTag={(id) =>
              setSelectedTagIds((current) => {
                const next = new Set(current);
                if (!next.delete(id)) next.add(id);
                return next;
              })
            }
            onRemovePending={(name) => setPendingTagNames((current) => current.filter((n) => n !== name))}
            input={tagInput}
            onChangeInput={setTagInput}
            onSubmitInput={addTagFromInput}
            onInputFocus={focusBottomField}
          />
        </FormField>

        <FormField label={t('songForm.privateNote')}>
          <FormInput
            multiline
            value={privateNote}
            onChangeText={setPrivateNote}
            onFocus={focusBottomField}
            placeholder={t('songForm.privateNotePlaceholder')}
            accessibilityLabel={t('songForm.privateNote')}
          />
        </FormField>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  saveButton: {
    minWidth: 64,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
