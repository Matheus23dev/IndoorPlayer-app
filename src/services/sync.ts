  import { api } from './api';
  import { getDeviceCode } from '../storage/device';
  import { downloadMedia } from './downloader';

  export async function syncPlaylist() {
    const code = await getDeviceCode();

    const res = await api.get(`/devices/current-playlist/${code}`);

    console.log('SYNC RESPONSE:', res.data);

    const playlist = res.data?.playlist;

    if (!playlist?.items) {
      return [];
    }

    const items = playlist.items;

    const localItems = [];

    for (const item of items) {
      const media = item.media;

      const url = api.defaults.baseURL + media.fileUrl;

      try {
        const localPath = await downloadMedia(url, media.name);

        localItems.push({
          ...item,
          localPath,
        });
      } catch (e) {
        console.log('SKIP MEDIA:', media.name);
      }
    }

    return localItems;
  }