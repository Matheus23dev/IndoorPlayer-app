import RNFS from 'react-native-fs';

const MEDIA_FOLDER =
  `${RNFS.DocumentDirectoryPath}/media`;

async function ensureFolder() {
  const exists =
    await RNFS.exists(
      MEDIA_FOLDER,
    );

  if (!exists) {
    await RNFS.mkdir(
      MEDIA_FOLDER,
    );
  }
}

export async function downloadMedia(
  url: string,
  fileName: string,
) {
  await ensureFolder();

  const localPath =
    `${MEDIA_FOLDER}/${fileName}`;

  const exists =
    await RNFS.exists(
      localPath,
    );

  if (exists) {
    return localPath;
  }

  console.log(
    'DOWNLOAD:',
    fileName,
  );

  const result =
    await RNFS.downloadFile({
      fromUrl: url,
      toFile: localPath,
    }).promise;

  if (
    result.statusCode !==
    200
  ) {
    throw new Error(
      'Erro ao baixar mídia',
    );
  }

  return localPath;
}

export async function cleanUnusedMedia(
  validFiles: string[],
) {
  await ensureFolder();

  const files =
    await RNFS.readDir(
      MEDIA_FOLDER,
    );

  for (const file of files) {
    const shouldKeep =
      validFiles.includes(
        file.name,
      );

    if (!shouldKeep) {
      try {
        await RNFS.unlink(
          file.path,
        );

        console.log(
          'REMOVIDO:',
          file.name,
        );
      } catch (error) {
        console.log(
          error,
        );
      }
    }
  }
}

export async function clearAllMedia() {
  const exists =
    await RNFS.exists(
      MEDIA_FOLDER,
    );

  if (!exists) {
    return;
  }

  await RNFS.unlink(
    MEDIA_FOLDER,
  );
}