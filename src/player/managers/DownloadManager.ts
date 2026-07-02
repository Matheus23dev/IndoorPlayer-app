import RNFS from 'react-native-fs';

import { api } from '../../services/api';

import type {
  LocalPlayerItem,
  PlayerItem,
  PlayerMedia,
  PlayerPlaylist,
} from '../types/Player';

class DownloadManager {
  private readonly cacheDirectory =
    `${RNFS.DocumentDirectoryPath}/player-media`;

  /**
   * Limita a quantidade de downloads simultâneos.
   *
   * Muitos downloads paralelos podem consumir
   * memória demais em TV Boxes mais simples.
   */
  private readonly maxConcurrentDownloads = 3;

  /**
   * Evita que a mesma mídia seja baixada
   * mais de uma vez simultaneamente.
   */
  private readonly activeDownloads =
    new Map<string, Promise<string>>();

  /**
   * Baixa todas as mídias da playlist.
   *
   * A playlist só é retornada quando todos
   * os arquivos estiverem salvos localmente.
   */
  async downloadPlaylist(
    playlist: PlayerPlaylist,
  ): Promise<LocalPlayerItem[]> {
    await this.ensureCacheDirectory();

    const orderedItems =
      [...playlist.items].sort(
        (first, second) =>
          first.order - second.order,
      );

    if (orderedItems.length === 0) {
      return [];
    }

    const downloadedItems:
      Array<LocalPlayerItem | undefined> =
        new Array(
          orderedItems.length,
        );

    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const itemIndex =
          currentIndex;

        currentIndex += 1;

        if (
          itemIndex >=
          orderedItems.length
        ) {
          return;
        }

        const item =
          orderedItems[itemIndex];

        const localPath =
          await this.downloadMedia(
            item.media,
          );

        downloadedItems[itemIndex] = {
          ...item,

          media: {
            ...item.media,

            localPath:
              this.toLocalUri(
                localPath,
              ),
          },
        };
      }
    };

    const workerCount =
      Math.min(
        this.maxConcurrentDownloads,
        orderedItems.length,
      );

    await Promise.all(
      Array.from(
        {
          length: workerCount,
        },
        () => worker(),
      ),
    );

    const invalidDownload =
      downloadedItems.some(
        item => !item,
      );

    if (invalidDownload) {
      throw new Error(
        'Uma ou mais mídias não foram baixadas.',
      );
    }

    return downloadedItems as
      LocalPlayerItem[];
  }

  /**
   * Baixa uma mídia individual.
   *
   * Retorna o caminho sem file://.
   */
  async downloadMedia(
    media: PlayerMedia,
  ): Promise<string> {
    await this.ensureCacheDirectory();

    const fileName =
      this.createFileName(
        media,
      );

    const finalPath =
      `${this.cacheDirectory}/${fileName}`;

    const existingFileIsValid =
      await this.isValidFile(
        finalPath,
      );

    if (existingFileIsValid) {
      console.log(
        '[DOWNLOAD] Arquivo já existe:',
        fileName,
      );

      return finalPath;
    }

    if (
      await RNFS.exists(
        finalPath,
      )
    ) {
      await RNFS.unlink(
        finalPath,
      );
    }

    const runningDownload =
      this.activeDownloads.get(
        fileName,
      );

    if (runningDownload) {
      console.log(
        '[DOWNLOAD] Aguardando download existente:',
        fileName,
      );

      return runningDownload;
    }

    const downloadPromise =
      this.executeDownload(
        media,
        finalPath,
      );

    this.activeDownloads.set(
      fileName,
      downloadPromise,
    );

    try {
      return await downloadPromise;
    } finally {
      this.activeDownloads.delete(
        fileName,
      );
    }
  }

  /**
   * Verifica se todos os arquivos de uma
   * playlist restaurada continuam existentes.
   */
  async validatePlaylist(
    items: PlayerItem[],
  ) {
    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return false;
    }

    for (const item of items) {
      const localPath =
        item.media.localPath;

      if (!localPath) {
        return false;
      }

      const filePath =
        this.removeFileProtocol(
          localPath,
        );

      const valid =
        await this.isValidFile(
          filePath,
        );

      if (!valid) {
        console.log(
          '[DOWNLOAD] Arquivo local inválido:',
          filePath,
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Retorna todos os arquivos existentes
   * no diretório de mídias.
   */
  async listFiles() {
    await this.ensureCacheDirectory();

    const files =
      await RNFS.readDir(
        this.cacheDirectory,
      );

    return files.filter(
      file => file.isFile(),
    );
  }

  /**
   * Remove um arquivo pelo nome.
   */
  async removeFile(
    fileName: string,
  ) {
    await this.ensureCacheDirectory();

    const path =
      `${this.cacheDirectory}/${fileName}`;

    const exists =
      await RNFS.exists(path);

    if (!exists) {
      return;
    }

    await RNFS.unlink(path);

    console.log(
      '[DOWNLOAD] Arquivo removido:',
      fileName,
    );
  }

  /**
   * Remove completamente o diretório
   * de mídias e depois o recria.
   */
  async clear() {
    const directoryExists =
      await RNFS.exists(
        this.cacheDirectory,
      );

    if (directoryExists) {
      await RNFS.unlink(
        this.cacheDirectory,
      );
    }

    await this.ensureCacheDirectory();

    this.activeDownloads.clear();

    console.log(
      '[DOWNLOAD] Cache removido.',
    );
  }

  getCacheDirectory() {
    return this.cacheDirectory;
  }

  private async executeDownload(
    media: PlayerMedia,
    finalPath: string,
  ) {
    const temporaryPath =
      `${finalPath}.tmp`;

    const remoteUrl =
      this.createRemoteUrl(
        media.fileUrl,
      );

    try {
      const temporaryFileExists =
        await RNFS.exists(
          temporaryPath,
        );

      if (temporaryFileExists) {
        await RNFS.unlink(
          temporaryPath,
        );
      }

      console.log(
        '[DOWNLOAD] Iniciando:',
        {
          name: media.name,
          remoteUrl,
        },
      );

      const downloadResult =
        await RNFS.downloadFile({
          fromUrl:
            remoteUrl,

          toFile:
            temporaryPath,

          background:
            true,

          discretionary:
            true,
        }).promise;

      const statusCode =
        downloadResult.statusCode;

      const requestWasSuccessful =
        statusCode >= 200 &&
        statusCode < 300;

      if (!requestWasSuccessful) {
        throw new Error(
          `Download retornou HTTP ${statusCode}.`,
        );
      }

      const temporaryFileIsValid =
        await this.isValidFile(
          temporaryPath,
        );

      if (!temporaryFileIsValid) {
        throw new Error(
          `O arquivo baixado está vazio: ${media.name}`,
        );
      }

      const finalFileExists =
        await RNFS.exists(
          finalPath,
        );

      if (finalFileExists) {
        await RNFS.unlink(
          finalPath,
        );
      }

      /*
       * O arquivo só recebe o nome definitivo
       * depois que o download termina.
       *
       * Assim o player nunca tenta reproduzir
       * um arquivo parcialmente baixado.
       */
      await RNFS.moveFile(
        temporaryPath,
        finalPath,
      );

      console.log(
        '[DOWNLOAD] Concluído:',
        {
          name: media.name,
          finalPath,
        },
      );

      return finalPath;
    } catch (error) {
      const temporaryFileExists =
        await RNFS.exists(
          temporaryPath,
        );

      if (temporaryFileExists) {
        await RNFS.unlink(
          temporaryPath,
        );
      }

      console.log(
        '[DOWNLOAD] Erro:',
        {
          name: media.name,
          error,
        },
      );

      throw error;
    }
  }

  private async ensureCacheDirectory() {
    const exists =
      await RNFS.exists(
        this.cacheDirectory,
      );

    if (exists) {
      return;
    }

    await RNFS.mkdir(
      this.cacheDirectory,
    );
  }

  private async isValidFile(
    path: string,
  ) {
    try {
      const exists =
        await RNFS.exists(path);

      if (!exists) {
        return false;
      }

      const fileInformation =
        await RNFS.stat(path);

      return (
        fileInformation.isFile() &&
        Number(
          fileInformation.size,
        ) > 0
      );
    } catch {
      return false;
    }
  }

  /**
   * A versão faz com que uma mídia alterada
   * seja baixada novamente, mesmo mantendo
   * o mesmo ID.
   */
  private createFileName(
    media: PlayerMedia,
  ) {
    const safeId =
      media.id.replace(
        /[^a-zA-Z0-9_-]/g,
        '',
      );

    const extension =
      this.getFileExtension(
        media,
      );

    const version =
      this.createMediaVersion(
        media,
      );

    return `${safeId}-${version}.${extension}`;
  }

  private createMediaVersion(
    media: PlayerMedia,
  ) {
    const versionSource = [
      media.updatedAt ?? '',
      media.fileUrl,
      media.fileSize ?? '',
    ].join('|');

    let hash = 0;

    for (
      let index = 0;
      index < versionSource.length;
      index += 1
    ) {
      hash =
        (
          hash * 31 +
          versionSource.charCodeAt(
            index,
          )
        ) | 0;
    }

    return Math.abs(
      hash,
    ).toString(36);
  }

  private getFileExtension(
    media: PlayerMedia,
  ) {
    const cleanUrl =
      media.fileUrl
        .split('?')[0]
        .split('#')[0];

    const fileName =
      cleanUrl
        .split('/')
        .pop() ?? '';

    const lastDotPosition =
      fileName.lastIndexOf('.');

    if (
      lastDotPosition >= 0 &&
      lastDotPosition <
        fileName.length - 1
    ) {
      return fileName
        .slice(
          lastDotPosition + 1,
        )
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          '',
        );
    }

    return media.type === 'VIDEO'
      ? 'mp4'
      : 'jpg';
  }

  private createRemoteUrl(
    fileUrl: string,
  ) {
    if (
      fileUrl.startsWith(
        'http://',
      ) ||
      fileUrl.startsWith(
        'https://',
      )
    ) {
      return fileUrl;
    }

    const baseUrl =
      api.defaults.baseURL;

    if (!baseUrl) {
      throw new Error(
        'A baseURL da API não está configurada.',
      );
    }

    const normalizedBaseUrl =
      baseUrl.replace(
        /\/+$/,
        '',
      );

    const normalizedFileUrl =
      fileUrl.startsWith('/')
        ? fileUrl
        : `/${fileUrl}`;

    return (
      normalizedBaseUrl +
      normalizedFileUrl
    );
  }

  private toLocalUri(
    path: string,
  ) {
    if (
      path.startsWith(
        'file://',
      )
    ) {
      return path;
    }

    return `file://${path}`;
  }

  private removeFileProtocol(
    path: string,
  ) {
    return path.replace(
      /^file:\/\//,
      '',
    );
  }
}

export const downloadManager =
  new DownloadManager();