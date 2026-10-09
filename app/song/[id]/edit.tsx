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
  const loaded = useLoad(async () => {
    const { songs, tags } = await getServices();
    const [song, allTags] = await Promise.all([songs.getSong(id), tags.listTags()]);
    return { song, tags: allTags };
  });
  return (
    <>
      <Stack.Screen options={{ ...SONG_FORM_SCREEN_OPTIONS, title: t('songForm.editTitle') }} />
      {loaded !== undefined &&
        (loaded.song === null ? (
          // 開いている間に曲が消えた・存在しないIDのリンクを開いた。
          <MessageScreen
            title={t('songForm.notFoundTitle')}
            message={t('error.songNotFound')}
            action={{ label: t('notFound.home'), onPress: () => router.replace('/') }}
          />
        ) : (
          <SongForm song={loaded.song} tags={loaded.tags} />
        ))}
    </>
  );
}
