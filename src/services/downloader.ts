import RNFS from 'react-native-fs';

const DIR = `${RNFS.DocumentDirectoryPath}/media`;

async function ensureDir() {
  if (!(await RNFS.exists(DIR))) {
    await RNFS.mkdir(DIR);
  }
}

export async function downloadMedia(url: string, fileName: string) {
  await ensureDir();

  const path = `${DIR}/${fileName}`;
  const temp = `${path}.tmp`;

  const exists = await RNFS.exists(path);
  if (exists) return path;

  try {
    const res = await RNFS.downloadFile({
      fromUrl: url,
      toFile: temp,
    }).promise;

    if (res.statusCode !== 200) {
      throw new Error('HTTP ' + res.statusCode);
    }

    await RNFS.moveFile(temp, path);

    return path;
  } catch (err) {
    if (await RNFS.exists(temp)) {
      await RNFS.unlink(temp);
    }

    console.log('DOWNLOAD ERROR:', url, err);
    throw err;
  }
}