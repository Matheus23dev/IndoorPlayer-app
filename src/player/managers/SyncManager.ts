import {
  api,
} from '../../services/api';

import {
  getDeviceToken,
} from '../../storage/device';

import {
  cacheManager,
} from './CacheManager';

import {
  downloadManager,
} from './DownloadManager';

import {
  playbackManager,
} from './PlaybackManager';

import {
  playlistManager,
} from './PlaylistManager';

import {
  programmingManager,
} from './ProgrammingManager';

import type {
  PlayerItem,
} from '../types/Player';

import type {
  ProgrammingPlaylist,
  ProgrammingResponse,
} from '../types/Programming';

export interface InvalidDeviceEvent {
  reason:
    | 'UNLINKED'
    | 'DELETED';
  keepCode: boolean;
}

type InvalidDeviceHandler = (
  event: InvalidDeviceEvent,
) =>
  | void
  | Promise<void>;

class SyncManager {
  private readonly syncIntervalMs =
    5 * 60_000;

  private readonly programmingHours =
    24;

  private readonly programmingLimit =
    20;

  private readonly emptyCacheGraceMs =
    5 * 60_000;

  private interval:
    | ReturnType<typeof setInterval>
    | undefined;

  private emptyCacheTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private syncing =
    false;

  private started =
    false;

  private pendingSync =
    false;

  private pendingForceSync =
    false;

  private onInvalidDevice:
    InvalidDeviceHandler | null = null;

  setInvalidDeviceHandler(
    handler:
      InvalidDeviceHandler | null,
  ) {
    this.onInvalidDevice =
      handler;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.sync();

    this.interval =
      setInterval(
        () => {
          void this.sync();
        },
        this.syncIntervalMs,
      );
  }

  stop() {
    this.started = false;
    this.pendingSync = false;
    this.pendingForceSync = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    this.cancelEmptyCacheCleanup();
  }

  async forceSync() {
    await this.sync(true);
  }

  async sync(
    force = false,
  ) {
    if (this.syncing) {
      this.pendingSync = true;
      this.pendingForceSync =
        this.pendingForceSync || force;

      console.log(
        '[SYNC] Sincronização em andamento. Nova execução agendada.',
      );

      return;
    }

    this.syncing = true;

    try {
      const token =
        await getDeviceToken();

      if (!token) {
        console.log(
          '[SYNC] Token do dispositivo não encontrado.',
        );

        return;
      }

      console.log(
        '[SYNC] Consultando as próximas 24 horas...',
      );

      const response =
        await api.get<ProgrammingResponse>(
          '/devices/programming',
          {
            params: {
              hours: this.programmingHours,
              limit: this.programmingLimit,
            },
          },
        );

      const responseReceivedAt =
        Date.now();

      const remoteProgramming =
        response.data;

      this.validateProgrammingResponse(
        remoteProgramming,
      );

      const localSnapshot =
        programmingManager.getSnapshot();

      const versionDidNotChange =
        localSnapshot.version ===
        remoteProgramming.version;

      const reusableLocalPlaylists =
        remoteProgramming.playlists
          .map(remotePlaylist => {
            const localPlaylist =
              localSnapshot.playlists.find(
                playlist =>
                  playlist.id ===
                  remotePlaylist.id,
              );

            if (
              !localPlaylist ||
              !this.canReuseLocalPlaylist(
                remotePlaylist,
                localPlaylist,
              )
            ) {
              return null;
            }

            return localPlaylist;
          })
          .filter(
            (
              playlist,
            ): playlist is ProgrammingPlaylist =>
              playlist !== null,
          );

      const allRemotePlaylistsAreReady =
        reusableLocalPlaylists.length ===
        remoteProgramming.playlists.length;

      if (
        versionDidNotChange &&
        allRemotePlaylistsAreReady
      ) {
        programmingManager.setProgramming(
          {
            ...remoteProgramming,
            playlists: reusableLocalPlaylists,
          },
          responseReceivedAt,
        );

        await this.cleanUnusedCache(
          reusableLocalPlaylists,
        );

        console.log(
          '[SYNC] Programação não mudou.',
        );

        return;
      }

      console.log(
        '[SYNC] Nova programação encontrada:',
        {
          version: remoteProgramming.version,
          occurrences:
            remoteProgramming.occurrences.length,
          playlists:
            remoteProgramming.playlists.length,
          forced: force,
        },
      );

      const preparedPlaylists:
        ProgrammingPlaylist[] = [];

      for (
        const remotePlaylist
        of remoteProgramming.playlists
      ) {
        const localPlaylist =
          localSnapshot.playlists.find(
            playlist =>
              playlist.id ===
              remotePlaylist.id,
          );

        if (
          localPlaylist &&
          this.canReuseLocalPlaylist(
            remotePlaylist,
            localPlaylist,
          )
        ) {
          preparedPlaylists.push(
            localPlaylist,
          );

          console.log(
            '[SYNC] Playlist reutilizada do cache:',
            remotePlaylist.id,
          );

          continue;
        }

        const preparedPlaylist =
          await this.downloadPlaylist(
            remotePlaylist,
          );

        preparedPlaylists.push(
          preparedPlaylist,
        );
      }

      const preparedProgramming:
        ProgrammingResponse = {
        ...remoteProgramming,
        playlists: preparedPlaylists,
      };

      programmingManager.setProgramming(
        preparedProgramming,
        responseReceivedAt,
      );

      await this.cleanUnusedCache(
        preparedPlaylists,
      );

      console.log(
        '[SYNC] Programação sincronizada:',
        {
          hours: this.programmingHours,
          occurrences:
            preparedProgramming.occurrences.length,
          playlists:
            preparedPlaylists.length,
          cachedItems:
            preparedPlaylists.flatMap(
              playlist =>
                playlist.items,
            ).length,
        },
      );
    } catch (error) {
      const invalidDevice =
        this.getInvalidDeviceEvent(error);

      if (invalidDevice) {
        console.log(
          '[SYNC] Sessão do dispositivo não é mais válida:',
          invalidDevice,
        );

        await this.onInvalidDevice
          ?.(invalidDevice);

        return;
      }

      const requestError =
        error as {
          message?: string;
          config?: {
            baseURL?: string;
            url?: string;
          };
          response?: {
            status?: number;
            data?: unknown;
          };
        };

      console.log(
        '[SYNC] Erro na sincronização:',
        {
          status:
            requestError.response?.status ??
            null,

          baseURL:
            requestError.config?.baseURL ??
            null,

          url:
            requestError.config?.url ??
            null,

          response:
            requestError.response?.data ??
            null,

          message:
            requestError.message ??
            'Erro desconhecido',
        },
      );
    } finally {
      this.syncing = false;

      if (this.pendingSync) {
        const pendingForce =
          this.pendingForceSync;

        this.pendingSync = false;
        this.pendingForceSync = false;

        void this.sync(pendingForce);
      }
    }
  }

  private async downloadPlaylist(
    playlist: ProgrammingPlaylist,
  ): Promise<ProgrammingPlaylist> {
    if (
      !Array.isArray(playlist.items) ||
      playlist.items.length === 0
    ) {
      return {
        ...playlist,
        items: [],
      };
    }

    console.log(
      '[SYNC] Preparando playlist:',
      {
        playlistId: playlist.id,
        name: playlist.name,
        totalItems: playlist.items.length,
      },
    );

    const downloadedItems =
      await downloadManager.downloadPlaylist(
        playlist,
      );

    if (
      downloadedItems.length !==
      playlist.items.length
    ) {
      throw new Error(
        `Nem todas as mídias da playlist ${playlist.name} foram baixadas.`,
      );
    }

    const invalidItem =
      downloadedItems.find(
        item =>
          !item.media.localPath,
      );

    if (invalidItem) {
      throw new Error(
        `Mídia sem arquivo local: ${invalidItem.media.name}`,
      );
    }

    return {
      ...playlist,
      items: downloadedItems,
    };
  }

  private canReuseLocalPlaylist(
    remotePlaylist: ProgrammingPlaylist,
    localPlaylist: ProgrammingPlaylist,
  ) {
    if (
      remotePlaylist.items.length !==
      localPlaylist.items.length
    ) {
      return false;
    }

    const remoteItems =
      [...remotePlaylist.items]
        .sort(
          (first, second) =>
            first.order - second.order,
        );

    const localItems =
      [...localPlaylist.items]
        .sort(
          (first, second) =>
            first.order - second.order,
        );

    return remoteItems.every(
      (remoteItem, index) => {
        const localItem =
          localItems[index];

        if (!localItem) {
          return false;
        }

        return (
          remoteItem.id === localItem.id &&
          remoteItem.order === localItem.order &&
          (
            remoteItem.duration ?? null
          ) === (
            localItem.duration ?? null
          ) &&
          remoteItem.media.id ===
            localItem.media.id &&
          remoteItem.media.fileUrl ===
            localItem.media.fileUrl &&
          (
            remoteItem.media.updatedAt ?? null
          ) === (
            localItem.media.updatedAt ?? null
          ) &&
          Boolean(
            localItem.media.localPath,
          )
        );
      },
    );
  }

  private async cleanUnusedCache(
    programmingPlaylists:
      ProgrammingPlaylist[],
  ) {
    const programmingItems =
      programmingPlaylists.flatMap(
        playlist =>
          playlist.items,
      );

    const selectedItems =
      playlistManager.getCurrent();

    const playingItems =
      playbackManager.getPlaylist();

    const itemsToKeep =
      this.mergeUniqueItems([
        ...programmingItems,
        ...selectedItems,
        ...playingItems,
      ]);

    if (itemsToKeep.length === 0) {
      this.scheduleEmptyCacheCleanup();

      return;
    }

    this.cancelEmptyCacheCleanup();

    await cacheManager.clean(
      itemsToKeep,
    );
  }

  private scheduleEmptyCacheCleanup() {
    if (this.emptyCacheTimer) {
      return;
    }

    console.log(
      '[SYNC] Cache vazio será removido após 5 minutos de segurança.',
    );

    this.emptyCacheTimer =
      setTimeout(
        () => {
          this.emptyCacheTimer =
            undefined;

          const programming =
            programmingManager.getSnapshot();

          const selectedItems =
            playlistManager.getCurrent();

          const playingItems =
            playbackManager.getPlaylist();

          const canClear =
            programming.playlists.length === 0 &&
            selectedItems.length === 0 &&
            playingItems.length === 0;

          if (!canClear) {
            return;
          }

          void cacheManager
            .clear()
            .catch(error => {
              console.log(
                '[SYNC] Erro ao limpar cache vazio:',
                error,
              );
            });
        },
        this.emptyCacheGraceMs,
      );
  }

  private cancelEmptyCacheCleanup() {
    if (!this.emptyCacheTimer) {
      return;
    }

    clearTimeout(
      this.emptyCacheTimer,
    );

    this.emptyCacheTimer =
      undefined;
  }

  private mergeUniqueItems(
    items: PlayerItem[],
  ) {
    const uniqueItems =
      new Map<string, PlayerItem>();

    for (const item of items) {
      const key =
        item.media.localPath ??
        [
          item.media.id,
          item.media.updatedAt ??
            item.media.fileUrl,
        ].join(':');

      uniqueItems.set(key, item);
    }

    return Array.from(
      uniqueItems.values(),
    );
  }

  private getInvalidDeviceEvent(
    error: unknown,
  ): InvalidDeviceEvent | null {
    const response =
      (
        error as {
          response?: {
            status?: number;
            data?: {
              message?:
                | string
                | string[];
            };
          };
        }
      )?.response;

    const status =
      response?.status;

    if (
      status === 401 ||
      status === 403
    ) {
      return {
        reason: 'UNLINKED',
        keepCode: true,
      };
    }

    const rawMessage =
      response?.data?.message;

    const message =
      Array.isArray(rawMessage)
        ? rawMessage.join(' ')
        : String(rawMessage ?? '');

    const normalized =
      message.toLowerCase();

    /*
     * Um 404 também pode significar que a API
     * publicada ainda está com uma rota antiga.
     * Só removemos o registro local quando a
     * própria API disser que o dispositivo não existe.
     */
    if (status === 404) {
      const deviceWasDeleted =
        normalized.includes(
          'dispositivo não encontrado',
        ) ||
        normalized.includes(
          'dispositivo nao encontrado',
        );

      if (!deviceWasDeleted) {
        return null;
      }

      return {
        reason: 'DELETED',
        keepCode: false,
      };
    }

    if (status !== 400) {
      return null;
    }

    if (
      normalized.includes(
        'não está vinculado',
      ) ||
      normalized.includes(
        'nao esta vinculado',
      ) ||
      normalized.includes(
        'não possui uma empresa vinculada',
      )
    ) {
      return {
        reason: 'UNLINKED',
        keepCode: true,
      };
    }

    return null;
  }

  private validateProgrammingResponse(
    programming:
      ProgrammingResponse,
  ) {
    if (
      !programming ||
      typeof programming.version !==
        'string' ||
      typeof programming.serverTime !==
        'string' ||
      !Array.isArray(
        programming.occurrences,
      ) ||
      !Array.isArray(
        programming.playlists,
      )
    ) {
      throw new Error(
        'Resposta de programação inválida.',
      );
    }
  }
}

export const syncManager =
  new SyncManager();
