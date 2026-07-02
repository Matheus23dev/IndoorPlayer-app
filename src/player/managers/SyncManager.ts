import { api } from '../../services/api';
import { getDeviceCode } from '../../storage/device';

import { cacheManager } from './CacheManager';
import { downloadManager } from './DownloadManager';
import { playlistManager } from './PlaylistManager';

import type {
  PlayerItem,
} from '../types/Player';

interface RemotePlaylist {
  id: string;
  name: string;
  items: PlayerItem[];
}

interface CurrentPlaylistResponse {
  scheduleId?: string | null;

  schedule?: {
    id: string;
  } | null;

  playlist?: RemotePlaylist | null;
}

class SyncManager {
  private readonly syncIntervalMs =
    30_000;

  private interval:
    | ReturnType<typeof setInterval>
    | undefined;

  private syncing = false;

  private started = false;

  /**
   * Inicia a sincronização.
   *
   * Faz uma consulta imediatamente e depois
   * consulta novamente a cada 30 segundos.
   */
  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.sync();

    this.interval =
      setInterval(() => {
        void this.sync();
      }, this.syncIntervalMs);
  }

  stop() {
    this.started = false;

    if (this.interval) {
      clearInterval(
        this.interval,
      );

      this.interval =
        undefined;
    }
  }

  /**
   * Força uma nova consulta ao servidor.
   */
  async forceSync() {
    await this.sync(true);
  }

  /**
   * Consulta o agendamento atual.
   *
   * A playlist ativa não é apagada quando
   * houver apenas falha de internet.
   */
  async sync(force = false) {
    if (this.syncing) {
      console.log(
        '[SYNC] Sincronização já está em andamento.',
      );

      return;
    }

    this.syncing = true;

    try {
      const code =
        await getDeviceCode();

      if (!code) {
        console.log(
          '[SYNC] Código do dispositivo não encontrado.',
        );

        return;
      }

      console.log(
        '[SYNC] Consultando playlist atual...',
      );

      const response =
        await api.get<CurrentPlaylistResponse>(
          `/devices/current-playlist/${code}`,
        );

      const data =
        response.data;

      const scheduleId =
        data.scheduleId ??
        data.schedule?.id ??
        null;

      const playlist =
        data.playlist ?? null;

      /*
       * O servidor respondeu corretamente,
       * mas não existe agendamento ativo.
       *
       * Nesse caso podemos parar a reprodução
       * e remover as mídias armazenadas.
       */
      if (
        !scheduleId ||
        !playlist ||
        !Array.isArray(
          playlist.items,
        ) ||
        playlist.items.length === 0
      ) {
        console.log(
          '[SYNC] Nenhum agendamento ativo.',
        );

        const changed =
          playlistManager.clear();

        if (changed) {
          await cacheManager.clear();
        }

        return;
      }

      const hash =
        this.createPlaylistHash(
          scheduleId,
          playlist,
        );

      const playlistDidNotChange =
        playlistManager.getHash() ===
          hash &&
        playlistManager.getScheduleId() ===
          scheduleId &&
        playlistManager.getPlaylistId() ===
          playlist.id;

      if (
        !force &&
        playlistDidNotChange
      ) {
        console.log(
          '[SYNC] Playlist não mudou.',
        );

        return;
      }

      console.log(
        '[SYNC] Nova versão encontrada:',
        {
          scheduleId,
          playlistId:
            playlist.id,
          totalItems:
            playlist.items.length,
        },
      );

      /*
       * Mantém a playlist antiga em reprodução
       * enquanto todos os arquivos novos são
       * baixados e validados.
       */
      const previousItems =
        playlistManager.getCurrent();

      const downloadedItems =
        await downloadManager.downloadPlaylist(
          playlist,
        );

      if (
        downloadedItems.length !==
        playlist.items.length
      ) {
        throw new Error(
          'Nem todas as mídias da playlist foram baixadas.',
        );
      }

      const invalidItem =
        downloadedItems.find(
          item =>
            !item.media
              .localPath,
        );

      if (invalidItem) {
        throw new Error(
          `Mídia sem arquivo local: ${invalidItem.id}`,
        );
      }

      /*
       * Ao definir a nova playlist, o PlayerEngine
       * será notificado. O PlaybackManager manterá
       * essa playlist pendente até a mídia atual
       * terminar.
       */
      playlistManager.setPlaylist(
        downloadedItems,
        {
          playlistId:
            playlist.id,

          scheduleId,

          hash,
        },
      );

      /*
       * Não podemos apagar imediatamente os arquivos
       * da playlist anterior, pois ela ainda pode estar
       * reproduzindo até o final da mídia atual.
       *
       * Por isso mantemos os arquivos das duas playlists.
       * O PlayerEngine fará a limpeza definitiva depois
       * que a troca for efetivada.
       */
      await cacheManager.clean([
        ...previousItems,
        ...downloadedItems,
      ]);

      console.log(
        '[SYNC] Sincronização concluída.',
      );
    } catch (error) {
      /*
       * Em caso de internet indisponível ou erro
       * na API, a playlist local existente continua
       * sendo reproduzida normalmente.
       */
      console.log(
        '[SYNC] Erro na sincronização:',
        error,
      );
    } finally {
      this.syncing = false;
    }
  }

  private createPlaylistHash(
    scheduleId: string,
    playlist: RemotePlaylist,
  ) {
    const normalizedItems =
      [...playlist.items]
        .sort(
          (first, second) =>
            first.order -
            second.order,
        )
        .map(item => ({
          itemId:
            item.id,

          order:
            item.order,

          duration:
            item.duration ??
            null,

          mediaId:
            item.media.id,

          fileUrl:
            item.media.fileUrl,

          mediaUpdatedAt:
            item.media.updatedAt ??
            null,

          mediaDuration:
            item.media.duration ??
            null,
        }));

    return JSON.stringify({
      scheduleId,

      playlistId:
        playlist.id,

      items:
        normalizedItems,
    });
  }
}

export const syncManager =
  new SyncManager();