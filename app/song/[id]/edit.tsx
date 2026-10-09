import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { getServices } from '../../../src/services';
import { useI18n } from '../../../ui/i18n';
import { MessageScreen } from '../../../ui/MessageScreen';
import { SONG_FORM_SCREEN_OPTIONS, SongForm } from '../../../ui/SongForm';
import { useLoad } from '../../../ui/useLoad';

// Edit Song。Song Detail（WBS 2.3）の Edit から開く。
export default function EditSongScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // `id` が変わったら（開いたまま、別の曲のIDで移動したとき）、読み直す。
  const loaded = useLoad(async () => {
    const { songs, tags } = await getServices();
    const [song, allTags] = await Promise.all([songs.getSong(id), tags.listTags()]);
    return { song, tags: allTags };
  }, [id]);
  return (
    <>
      <Stack.Screen options={{ ...SONG_FORM_SCREEN_OPTIONS, title: t('songForm.editTitle') }} />
      {loaded !== undefined &&
        (loaded.song === null ? (
          // 開いている間に曲が消えた・存在しないIDのリンクを開いた。
          // `replace('/')` にしない。Stackの下に既にある (tabs) と別に、新しい (tabs) へ
          // この画面を置き換えてしまい、Songsの絞り込みの状態が初期値に戻って、戻る操作で
          // もう1つのSongsが出る（iOSで確認）。`dismissTo` は、下にある (tabs) まで戻る。
          <MessageScreen
            title={t('songForm.notFoundTitle')}
            message={t('error.songNotFound')}
            action={{ label: t('notFound.home'), onPress: () => router.dismissTo('/') }}
          />
        ) : (
          // 曲が変わったら、入力の状態も作り直す（`SongForm` は、開いた時点の内容を基準にする）。
          <SongForm key={loaded.song.id} song={loaded.song} tags={loaded.tags} />
        ))}
    </>
  );
}
