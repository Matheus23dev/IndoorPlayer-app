import RNFS from 'react-native-fs';

const DIR = `${RNFS.DocumentDirectoryPath}/media`;

export async function cleanExpired(items: any[]) {
  const now = new Date();

  for (const item of items) {
    if (item.endAt && new Date(item.endAt) < now) {
      const path = `${DIR}/${item.media.name}`;

      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
    }
  }
}