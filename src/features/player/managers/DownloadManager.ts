import RNFS from 'react-native-fs';

import { MEDIA_BASE_URL } from '../../../core/api/client';

import { playerEventLogger } from '../logging/PlayerEventLogger';

import type {
  LocalPlayerItem,
  PlayerItem,
  PlayerMedia,
  PlayerPlaylist,
} from '../types/media';

class DownloadManager {
  private readonly cacheDirectory = `${RNFS.DocumentDirectoryPath}/player-media`;

  private readonly maxConcurrentDownloads = 3;

  private readonly activeDownloads = new Map<string, Promise<string>>();

  async downloadPlaylist(playlist: PlayerPlaylist): Promise<LocalPlayerItem[]> {
    await this.ensureCacheDirectory();

    const orderedItems = [...playlist.items].sort(
      (first, second) => first.order - second.order,
    );

    if (orderedItems.length === 0) {
      return [];
    }

    const downloadedItems: Array<LocalPlayerItem | undefined> = new Array(
      orderedItems.length,
    );

    await this.runDownloadWorkers(orderedItems, downloadedItems);

    if (downloadedItems.some(item => !item)) {
      throw new Error('Uma ou mais mídias não foram baixadas.');
    }

    return downloadedItems as LocalPlayerItem[];
  }

  async downloadMedia(media: PlayerMedia): Promise<string> {
    await this.ensureCacheDirectory();

    const fileName = this.createFileName(media);

    const finalPath = `${this.cacheDirectory}/${fileName}`;

    const runningDownload = this.activeDownloads.get(fileName);

    if (runningDownload) {
      console.log('[DOWNLOAD] Aguardando download existente:', fileName);

      return runningDownload;
    }

    if (await this.isValidFile(finalPath)) {
      console.log('[DOWNLOAD] Arquivo já existe:', fileName);

      return finalPath;
    }

    await this.removeFileIfExists(finalPath);

    const downloadPromise = this.executeDownload(media, finalPath);

    this.activeDownloads.set(fileName, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.activeDownloads.delete(fileName);
    }
  }

  async validatePlaylist(items: PlayerItem[]) {
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }

    for (const item of items) {
      const localPath = item.media.localPath;

      if (!localPath) {
        return false;
      }

      const filePath = this.removeFileProtocol(localPath);

      if (await this.isValidFile(filePath)) {
        continue;
      }

      console.log('[DOWNLOAD] Arquivo local inválido:', filePath);

      return false;
    }

    return true;
  }

  async validateMedia(localPath: string) {
    const filePath = this.removeFileProtocol(localPath);

    return this.isValidFile(filePath);
  }

  async listFiles() {
    await this.ensureCacheDirectory();

    const files = await RNFS.readDir(this.cacheDirectory);

    return files.filter(file => file.isFile());
  }

  async removeFile(fileName: string) {
    await this.ensureCacheDirectory();

    const path = `${this.cacheDirectory}/${fileName}`;

    const removed = await this.removeFileIfExists(path);

    if (removed) {
      console.log('[DOWNLOAD] Arquivo removido:', fileName);
    }
  }

  async clear() {
    this.activeDownloads.clear();

    await this.removeDirectoryIfExists(this.cacheDirectory);

    await this.ensureCacheDirectory();

    console.log('[DOWNLOAD] Cache removido.');
  }

  getCacheDirectory() {
    return this.cacheDirectory;
  }

  private async runDownloadWorkers(
    orderedItems: PlayerPlaylist['items'],
    downloadedItems: Array<LocalPlayerItem | undefined>,
  ) {
    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const itemIndex = currentIndex;

        currentIndex += 1;

        if (itemIndex >= orderedItems.length) {
          return;
        }

        const item = orderedItems[itemIndex];

        const localPath = await this.downloadMedia(item.media);

        downloadedItems[itemIndex] = {
          ...item,

          media: {
            ...item.media,

            localPath: this.toLocalUri(localPath),
          },
        };
      }
    };

    const workerCount = Math.min(
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
  }

  private async executeDownload(media: PlayerMedia, finalPath: string) {
    const temporaryPath = `${finalPath}.tmp`;

    const remoteUrl = this.createRemoteUrl(media.fileUrl);

    try {
      await this.removeFileIfExists(temporaryPath);

      playerEventLogger.log({
        event: 'MEDIA_DOWNLOAD_STARTED',
        category: 'DOWNLOAD',
        level: 'INFO',
        message: `Download iniciado: ${media.name}`,
        metadata: {
          mediaId: media.id,
          mediaType: media.type,
          fileSize: media.fileSize ?? null,
        },
        dedupeKey: `download-started:${media.id}:${
          media.updatedAt ?? media.fileUrl
        }`,
        dedupeWindowMs: 5_000,
      });

      console.log('[DOWNLOAD] Iniciando:', {
        name: media.name,
        remoteUrl,
      });

      const result = await RNFS.downloadFile({
        fromUrl: remoteUrl,
        toFile: temporaryPath,
        background: true,
        discretionary: true,
      }).promise;

      if (!this.isSuccessfulStatus(result.statusCode)) {
        throw new Error(`Download retornou HTTP ${result.statusCode}.`);
      }

      if (!(await this.isValidFile(temporaryPath))) {
        throw new Error(`O arquivo baixado está vazio: ${media.name}`);
      }

      await this.removeFileIfExists(finalPath);

      await RNFS.moveFile(temporaryPath, finalPath);

      playerEventLogger.log({
        event: 'MEDIA_DOWNLOAD_COMPLETED',
        category: 'DOWNLOAD',
        level: 'SUCCESS',
        message: `Download conclu\u00eddo: ${media.name}`,
        metadata: {
          mediaId: media.id,
          mediaType: media.type,
          fileSize: media.fileSize ?? null,
        },
        dedupeKey: `download-completed:${media.id}:${
          media.updatedAt ?? media.fileUrl
        }`,
        dedupeWindowMs: 5_000,
      });

      console.log('[DOWNLOAD] Concluído:', {
        name: media.name,
        finalPath,
      });

      return finalPath;
    } catch (error) {
      await this.removeFileIfExists(temporaryPath);

      playerEventLogger.log({
        event: 'MEDIA_DOWNLOAD_FAILED',
        category: 'DOWNLOAD',
        level: 'ERROR',
        message: `Falha ao baixar: ${media.name}`,
        metadata: {
          mediaId: media.id,
          error: error instanceof Error ? error.message : String(error),
        },
        dedupeKey: `download-failed:${media.id}:${
          error instanceof Error ? error.message : String(error)
        }`,
        dedupeWindowMs: 30_000,
      });

      console.log('[DOWNLOAD] Erro:', {
        name: media.name,
        remoteUrl,
        error,
      });

      throw error;
    }
  }

  private async ensureCacheDirectory() {
    const exists = await RNFS.exists(this.cacheDirectory);

    if (exists) {
      return;
    }

    await RNFS.mkdir(this.cacheDirectory);
  }

  private async isValidFile(path: string) {
    try {
      const exists = await RNFS.exists(path);

      if (!exists) {
        return false;
      }

      const info = await RNFS.stat(path);

      return info.isFile() && Number(info.size) > 0;
    } catch {
      return false;
    }
  }

  private async removeFileIfExists(path: string) {
    const exists = await RNFS.exists(path);

    if (!exists) {
      return false;
    }

    await RNFS.unlink(path);

    return true;
  }

  private async removeDirectoryIfExists(path: string) {
    const exists = await RNFS.exists(path);

    if (!exists) {
      return;
    }

    await RNFS.unlink(path);
  }

  private createFileName(media: PlayerMedia) {
    const safeId = this.sanitizeFilePart(media.id) || 'media';

    const version = this.createMediaVersion(media);

    const extension = this.getFileExtension(media);

    return `${safeId}-${version}.${extension}`;
  }

  private createMediaVersion(media: PlayerMedia) {
    const versionSource = [
      media.updatedAt ?? '',
      media.fileUrl,
      media.fileSize ?? '',
    ].join('|');

    let hash = 0;

    for (let index = 0; index < versionSource.length; index += 1) {
      // Mantém o hash em um inteiro assinado de 32 bits.
      // eslint-disable-next-line no-bitwise
      hash = (hash * 31 + versionSource.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
  }

  private getFileExtension(media: PlayerMedia) {
    const cleanUrl = media.fileUrl.split('?')[0].split('#')[0];

    const fileName = cleanUrl.split('/').pop() ?? '';

    const extension = fileName.includes('.')
      ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
      : '';

    const safeExtension = this.sanitizeFilePart(extension);

    if (safeExtension) {
      return safeExtension;
    }

    return media.type === 'VIDEO' ? 'mp4' : 'jpg';
  }

  private createRemoteUrl(fileUrl: string) {
    const normalizedFileUrl = String(fileUrl ?? '').trim();

    if (!normalizedFileUrl) {
      throw new Error('fileUrl da mídia não informado.');
    }

    if (
      normalizedFileUrl.startsWith('http://') ||
      normalizedFileUrl.startsWith('https://')
    ) {
      return encodeURI(normalizedFileUrl);
    }

    const normalizedMediaBaseUrl = MEDIA_BASE_URL.replace(/\/+$/, '');

    const cleanFileUrl = normalizedFileUrl.replace(/^\/+/, '');

    if (cleanFileUrl.startsWith('files/indoor-player-api/')) {
      return encodeURI(
        `${normalizedMediaBaseUrl}/${cleanFileUrl.replace(
          /^files\/indoor-player-api\//,
          '',
        )}`,
      );
    }

    if (cleanFileUrl.startsWith('uploads/')) {
      return encodeURI(
        `${normalizedMediaBaseUrl}/${cleanFileUrl.replace(/^uploads\//, '')}`,
      );
    }

    return encodeURI(`${normalizedMediaBaseUrl}/${cleanFileUrl}`);
  }

  private toLocalUri(path: string) {
    if (path.startsWith('file://')) {
      return path;
    }

    return `file://${path}`;
  }

  private removeFileProtocol(path: string) {
    return path.replace(/^file:\/\//, '');
  }

  private sanitizeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private isSuccessfulStatus(statusCode: number) {
    return statusCode >= 200 && statusCode < 300;
  }
}

export const downloadManager = new DownloadManager();
