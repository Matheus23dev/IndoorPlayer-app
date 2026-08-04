import { downloadManager } from './DownloadManager';

import type { PlayerItem } from '../types/media';

import { playerEventLogger } from '../logging/PlayerEventLogger';

class CacheManager {
  private cleaning = false;

  async clean(items: PlayerItem[]) {
    if (this.cleaning) {
      console.log(
        '[CACHE] Limpeza ignorada: já existe uma limpeza em andamento.',
      );

      return;
    }

    this.cleaning = true;

    try {
      const files = await downloadManager.listFiles();

      const validFileNames = this.createValidFileNames(items);

      console.log('[CACHE] Iniciando limpeza:', {
        totalFiles: files.length,
        validFiles: validFileNames.size,
      });

      for (const file of files) {
        const shouldRemove =
          this.isTemporaryFile(file.name) || !validFileNames.has(file.name);

        if (!shouldRemove) {
          continue;
        }

        await this.removeSafely(file.name);
      }

      console.log('[CACHE] Limpeza concluída.');
    } catch (error) {
      playerEventLogger.log({
        event: 'CACHE_CLEANUP_FAILED',
        category: 'CACHE',
        level: 'ERROR',
        message: 'Falha ao limpar arquivos antigos do cache.',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        dedupeWindowMs: 60_000,
      });

      console.log('[CACHE] Erro durante a limpeza:', error);

      throw error;
    } finally {
      this.cleaning = false;
    }
  }

  async clear() {
    try {
      await downloadManager.clear();

      playerEventLogger.log({
        event: 'CACHE_CLEARED',
        category: 'CACHE',
        level: 'SUCCESS',
        message: 'O cache local de m\u00eddias foi removido.',
        dedupeWindowMs: 5_000,
      });

      console.log('[CACHE] Cache completamente removido.');
    } catch (error) {
      playerEventLogger.log({
        event: 'CACHE_CLEAR_FAILED',
        category: 'CACHE',
        level: 'ERROR',
        message: 'Falha ao remover o cache local de m\u00eddias.',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        dedupeWindowMs: 60_000,
      });

      console.log('[CACHE] Erro ao remover cache:', error);

      throw error;
    }
  }

  async validate(items: PlayerItem[]) {
    if (items.length === 0) {
      return false;
    }

    try {
      return await downloadManager.validatePlaylist(items);
    } catch (error) {
      console.log('[CACHE] Erro ao validar playlist:', error);

      return false;
    }
  }

  async getInfo() {
    const files = await downloadManager.listFiles();

    const validFiles = files.filter(file => !this.isTemporaryFile(file.name));

    const temporaryFiles = files.length - validFiles.length;

    const totalSize = validFiles.reduce(
      (total, file) => total + Number(file.size ?? 0),
      0,
    );

    return {
      totalFiles: validFiles.length,
      temporaryFiles,
      totalSize,
      directory: downloadManager.getCacheDirectory(),
    };
  }

  private createValidFileNames(items: PlayerItem[]) {
    const validFileNames = new Set<string>();

    for (const item of items) {
      const localPath = item.media.localPath;

      if (!localPath) {
        continue;
      }

      const fileName = this.getFileNameFromPath(localPath);

      if (fileName) {
        validFileNames.add(fileName);
      }
    }

    return validFileNames;
  }

  private getFileNameFromPath(localPath: string) {
    const normalizedPath = localPath
      .replace(/^file:\/\//, '')
      .split('?')[0]
      .split('#')[0];

    const parts = normalizedPath.split(/[\\/]/);

    return parts[parts.length - 1] || null;
  }

  private isTemporaryFile(fileName: string) {
    return fileName.endsWith('.tmp');
  }

  private async removeSafely(fileName: string) {
    try {
      await downloadManager.removeFile(fileName);

      console.log('[CACHE] Arquivo removido:', fileName);
    } catch (error) {
      console.log('[CACHE] Não foi possível remover:', {
        fileName,
        error,
      });
    }
  }
}

export const cacheManager = new CacheManager();
