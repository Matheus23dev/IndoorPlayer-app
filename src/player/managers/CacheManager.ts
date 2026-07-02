import { downloadManager } from './DownloadManager';

import type {
  PlayerItem,
} from '../types/Player';

class CacheManager {
  /**
   * Remove arquivos que não pertencem
   * às playlists recebidas.
   *
   * O SyncManager pode enviar:
   * - playlist atual;
   * - playlist atual + nova playlist.
   *
   * Assim nenhuma mídia em reprodução
   * é apagada durante uma atualização.
   */
  async clean(
    items: PlayerItem[],
  ) {
    try {
      const files =
        await downloadManager.listFiles();

      const validFileNames =
        this.createValidFileNames(
          items,
        );

      console.log(
        '[CACHE] Iniciando limpeza:',
        {
          totalFiles:
            files.length,

          validFiles:
            validFileNames.size,
        },
      );

      for (const file of files) {
        const isTemporaryFile =
          file.name.endsWith(
            '.tmp',
          );

        /*
         * Arquivos .tmp não podem ser usados
         * pelo player. Eles normalmente ficaram
         * de algum download interrompido.
         */
        if (isTemporaryFile) {
          await this.removeSafely(
            file.name,
          );

          continue;
        }

        const fileIsBeingUsed =
          validFileNames.has(
            file.name,
          );

        if (fileIsBeingUsed) {
          continue;
        }

        await this.removeSafely(
          file.name,
        );
      }

      console.log(
        '[CACHE] Limpeza concluída.',
      );
    } catch (error) {
      console.log(
        '[CACHE] Erro durante a limpeza:',
        error,
      );

      throw error;
    }
  }

  /**
   * Remove todas as mídias locais.
   *
   * Usado somente quando o servidor confirma
   * que não existe nenhum agendamento ativo.
   */
  async clear() {
    try {
      await downloadManager.clear();

      console.log(
        '[CACHE] Cache completamente removido.',
      );
    } catch (error) {
      console.log(
        '[CACHE] Erro ao remover cache:',
        error,
      );

      throw error;
    }
  }

  /**
   * Verifica se os arquivos de uma playlist
   * restaurada ainda existem e não estão vazios.
   */
  async validate(
    items: PlayerItem[],
  ) {
    try {
      return await downloadManager
        .validatePlaylist(
          items,
        );
    } catch (error) {
      console.log(
        '[CACHE] Erro ao validar playlist:',
        error,
      );

      return false;
    }
  }

  /**
   * Retorna informações simples sobre
   * os arquivos salvos no aparelho.
   */
  async getInfo() {
    const files =
      await downloadManager.listFiles();

    const validFiles =
      files.filter(
          (        file: { name: string; }) =>
          !file.name.endsWith(
            '.tmp',
          ),
      );

    const temporaryFiles =
      files.filter(
          (        file: { name: string; }) =>
          file.name.endsWith(
            '.tmp',
          ),
      );

    const totalSize =
      validFiles.reduce(
        (
          total: number,
          file: { size: any; },
        ) =>
          total +
          Number(
            file.size,
          ),
        0,
      );

    return {
      totalFiles:
        validFiles.length,

      temporaryFiles:
        temporaryFiles.length,

      totalSize,

      directory:
        downloadManager
          .getCacheDirectory(),
    };
  }

  /**
   * Monta uma lista com os nomes dos
   * arquivos que não podem ser apagados.
   */
  private createValidFileNames(
    items: PlayerItem[],
  ) {
    const validFileNames =
      new Set<string>();

    for (const item of items) {
      const localPath =
        item.media.localPath;

      if (!localPath) {
        continue;
      }

      const fileName =
        this.getFileNameFromPath(
          localPath,
        );

      if (!fileName) {
        continue;
      }

      validFileNames.add(
        fileName,
      );
    }

    return validFileNames;
  }

  private getFileNameFromPath(
    localPath: string,
  ) {
    const normalizedPath =
      localPath
        .replace(
          /^file:\/\//,
          '',
        )
        .split('?')[0]
        .split('#')[0];

    const parts =
      normalizedPath.split(
        /[\\/]/,
      );

    const fileName =
      parts[
        parts.length - 1
      ];

    return fileName || null;
  }

  /**
   * Um erro ao apagar um arquivo isolado
   * não deve interromper toda a limpeza.
   */
  private async removeSafely(
    fileName: string,
  ) {
    try {
      await downloadManager
        .removeFile(
          fileName,
        );

      console.log(
        '[CACHE] Arquivo removido:',
        fileName,
      );
    } catch (error) {
      console.log(
        '[CACHE] Não foi possível remover:',
        {
          fileName,
          error,
        },
      );
    }
  }
}

export const cacheManager =
  new CacheManager();