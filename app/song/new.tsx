import { Stack } from 'expo-router';

import { getServices } from '../../src/services';
import { useI18n } from '../../ui/i18n';
import { SONG_FORM_SCREEN_OPTIONS, SongForm } from '../../ui/SongForm';
import { useLoad } from '../../ui/useLoad';

// Add Song。Songs画面の `＋` と、曲が1つも無いときのボタンから開く。
export default function AddSongScreen() {
  const { t } = useI18n();
  const tags = useLoad(async () => (await getServices()).tags.listTags());
  return (
    <>
      <Stack.Screen options={{ ...SONG_FORM_SCREEN_OPTIONS, title: t('songForm.addTitle') }} />
      {tags !== undefined && <SongForm tags={tags} />}
    </>
  );
}
