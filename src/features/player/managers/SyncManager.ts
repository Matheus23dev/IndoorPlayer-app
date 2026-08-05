import { api } from '../../../core/api/client';

import { getDeviceToken } from '../../../core/storage/deviceStorage';

import { cacheManager } from './CacheManager';

import { downloadManager } from './DownloadManager';

import { playbackManager } from './PlaybackManager';

import { playlistManager } from './PlaylistManager';

import { programmingManager } from './ProgrammingManager';

import { normalizeProgrammingResponse } from '../domain/programming';

import { sortPlayerItems } from '../domain/playerItem';

import type { PlayerItem } from '../types/media';

import type {
  ProgrammingPlaylist,
  ProgrammingResponse,
  ProgrammingResponseInput,
} from '../types/programming';

import { playerEventLogger } from '../logging/PlayerEventLogger';

export interface InvalidDeviceEvent {
  reason: 'UNLINKED' | 'DELETED';

  keepCode: boolean;
}

type InvalidDeviceHandler = (event: InvalidDeviceEvent) => void | Promise<void>;

class SyncManager {
  private readonly syncIntervalMs = 15_000;

  private readonly programmingHours = 24;

  private readonly programmingLimit = 20;

  private readonly emptyCacheGraceMs = 5 * 60_000;

  private interval: ReturnType<typeof setInterval> | undefined;

  private emptyCacheTimer: ReturnType<typeof setTimeout> | undefined;

  private syncing = false;

  private started = false;

  private pendingSync = false;

  private pendingForceSync = false;

  private lastSyncFailed = false;

  private onInvalidDevice: InvalidDeviceHandler | null = null;

  setInvalidDeviceHandler(handler: InvalidDeviceHandler | null) {
    this.onInvalidDevice = handler;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.sync();

    this.interval = setInterval(() => {
      if (this.started) {
        void this.sync();
      }
    }, this.syncIntervalMs);
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

  async sync(force = false) {
    if (this.syncing) {
      this.pendingSync = true;

      this.pendingForceSync = this.pendingForceSync || force;

      console.log('[SYNC] Sincronização em andamento. Nova execução agendada.');

      return;
    }

    this.syncing = true;

    try {
      const token = await getDeviceToken();

      if (!token) {
        console.log('[SYNC] Token do dispositivo não encontrado.');

        return;
      }

      console.log('[SYNC] Consultando as próximas 24 horas...');

      const response = await api.get<ProgrammingResponseInput>(
        '/devices/programming',
        {
          params: {
            hours: this.programmingHours,

            limit: this.programmingLimit,
          },
          headers: {
            'Cache-Control': 'no-cache, no-store',
            Pragma: 'no-cache',
          },
        },
      );

      const responseReceivedAt = Date.now();

      const remotePayload = response.data;

      this.validateProgrammingResponse(remotePayload);

      const remoteProgramming = normalizeProgrammingResponse(remotePayload);

      const localSnapshot = programmingManager.getSnapshot();

      const localPlaylistsById = this.createLocalPlaylistMap(
        localSnapshot.playlists,
      );

      const preparedPlaylists = await this.preparePlaylists(
        remoteProgramming.playlists,
        localPlaylistsById,
      );

      const preparedProgramming: ProgrammingResponse = {
        ...remoteProgramming,
        playlists: preparedPlaylists,
      };

      const contentChanged = await programmingManager.setProgramming(
        preparedProgramming,
        responseReceivedAt,
      );

      await this.cleanUnusedCache(preparedPlaylists);

      if (contentChanged || force) {
        this.lastSyncFailed = false;

        playerEventLogger.log({
          event: 'PROGRAMMING_SYNCED',
          category: 'SYNC',
          level: 'SUCCESS',
          message: contentChanged
            ? 'Programa\u00e7\u00e3o atualizada com sucesso.'
            : 'Programa\u00e7\u00e3o conferida por sincroniza\u00e7\u00e3o for\u00e7ada.',
          metadata: {
            version: preparedProgramming.version,
            occurrences: preparedProgramming.occurrences.length,
            playlists: preparedPlaylists.length,
            media: preparedPlaylists.flatMap(playlist => playlist.items).length,
            forced: force,
          },
          dedupeKey: `programming-synced:${preparedProgramming.version}:${force}`,
          dedupeWindowMs: force ? 2_000 : 60_000,
        });

        console.log('[SYNC] Programação sincronizada:', {
          version: preparedProgramming.version,

          hours: this.programmingHours,

          occurrences: preparedProgramming.occurrences.length,

          playlists: preparedPlaylists.length,

          cachedItems: preparedPlaylists.flatMap(playlist => playlist.items)
            .length,

          videoAudio: preparedPlaylists.flatMap(playlist =>
            playlist.items
              .filter(item => item.media.type === 'VIDEO')
              .map(item => ({
                itemId: item.id,
                muted: item.muted,
              })),
          ),

          forced: force,
        });

        return;
      }

      console.log('[SYNC] Programação não mudou.');
      if (this.lastSyncFailed) {
        this.lastSyncFailed = false;

        playerEventLogger.log({
          event: 'SYNC_CONNECTION_RESTORED',
          category: 'SYNC',
          level: 'SUCCESS',
          message: 'A comunica\u00e7\u00e3o com a API foi restabelecida.',
        });
      }
    } catch (error) {
      const invalidDevice = this.getInvalidDeviceEvent(error);

      if (invalidDevice) {
        playerEventLogger.log({
          event: 'DEVICE_SESSION_INVALID',
          category: 'SESSION',
          level: 'WARNING',
          message:
            'A API informou que a sess\u00e3o do dispositivo n\u00e3o \u00e9 mais v\u00e1lida.',
          metadata: {
            reason: invalidDevice.reason,
            keepCode: invalidDevice.keepCode,
          },
        });

        console.log(
          '[SYNC] Sessão do dispositivo não é mais válida:',
          invalidDevice,
        );

        await this.onInvalidDevice?.(invalidDevice);

        return;
      }

      console.log('[SYNC] Erro na sincronização:', this.formatSyncError(error));
      const syncError = this.formatSyncError(error);

      this.lastSyncFailed = true;

      playerEventLogger.log({
        event: 'PROGRAMMING_SYNC_FAILED',
        category: 'SYNC',
        level: 'ERROR',
        message: 'Falha ao sincronizar a programa\u00e7\u00e3o com a API.',
        metadata: {
          status: syncError.status,
          url: syncError.url,
          error: syncError.message,
        },
        dedupeKey: `programming-sync-failed:${syncError.status}:${syncError.message}`,
        dedupeWindowMs: 60_000,
      });
    } finally {
      this.syncing = false;

      this.runPendingSyncIfNeeded();
    }
  }

  private async preparePlaylists(
    remotePlaylists: ProgrammingPlaylist[],
    localPlaylistsById: Map<string, ProgrammingPlaylist>,
  ) {
    const preparedPlaylists: ProgrammingPlaylist[] = [];

    for (const remotePlaylist of remotePlaylists) {
      const localPlaylist = localPlaylistsById.get(remotePlaylist.id);
      let preparedPlaylist: ProgrammingPlaylist;

      if (
        localPlaylist &&
        (await this.canReuseLocalPlaylist(remotePlaylist, localPlaylist))
      ) {
        preparedPlaylist = this.mergeRemotePlaylistWithLocalFiles(
          remotePlaylist,
          localPlaylist,
        );

        console.log('[SYNC] Playlist reutilizada do cache:', remotePlaylist.id);
      } else {
        preparedPlaylist = await this.downloadPlaylist(remotePlaylist);
      }

      const bars = await this.prepareOverlayBars(remotePlaylist);

      preparedPlaylists.push({
        ...preparedPlaylist,
        bars,
      });
    }

    return preparedPlaylists;
  }

  private async prepareOverlayBars(playlist: ProgrammingPlaylist) {
    return Promise.all(
      playlist.bars.map(async bar => {
        if (!bar.media) {
          return bar;
        }

        const localPath = await downloadManager.downloadMedia(bar.media);

        return {
          ...bar,
          media: {
            ...bar.media,
            localPath: localPath.startsWith('file://')
              ? localPath
              : `file://${localPath}`,
          },
        };
      }),
    );
  }

  private mergeRemotePlaylistWithLocalFiles(
    remotePlaylist: ProgrammingPlaylist,
    localPlaylist: ProgrammingPlaylist,
  ): ProgrammingPlaylist {
    const localItemsById = new Map(
      localPlaylist.items.map(item => [item.id, item]),
    );

    return {
      ...remotePlaylist,

      items: remotePlaylist.items.map(remoteItem => {
        const localItem = localItemsById.get(remoteItem.id);

        return {
          ...remoteItem,

          media: {
            ...remoteItem.media,

            localPath: localItem?.media.localPath,
          },
        };
      }),
    };
  }

  private async downloadPlaylist(
    playlist: ProgrammingPlaylist,
  ): Promise<ProgrammingPlaylist> {
    if (!Array.isArray(playlist.items) || playlist.items.length === 0) {
      return {
        ...playlist,
        items: [],
      };
    }

    console.log('[SYNC] Preparando playlist:', {
      playlistId: playlist.id,

      name: playlist.name,

      totalItems: playlist.items.length,
    });

    const downloadedItems = await downloadManager.downloadPlaylist(playlist);

    if (downloadedItems.length !== playlist.items.length) {
      throw new Error(
        `Nem todas as mídias da playlist ${playlist.name} foram baixadas.`,
      );
    }

    const invalidItem = downloadedItems.find(item => !item.media.localPath);

    if (invalidItem) {
      throw new Error(`Mídia sem arquivo local: ${invalidItem.media.name}`);
    }

    return {
      ...playlist,
      items: downloadedItems,
    };
  }

  private async canReuseLocalPlaylist(
    remotePlaylist: ProgrammingPlaylist,
    localPlaylist: ProgrammingPlaylist,
  ) {
    if (!this.hasSameCachedMedia(remotePlaylist, localPlaylist)) {
      return false;
    }

    const cacheIsValid = await cacheManager.validate(localPlaylist.items);

    if (!cacheIsValid) {
      console.log('[SYNC] Playlist local ignorada: cache inválido.', {
        playlistId: localPlaylist.id,
      });

      return false;
    }

    return true;
  }

  private hasSameCachedMedia(
    remotePlaylist: ProgrammingPlaylist,
    localPlaylist: ProgrammingPlaylist,
  ) {
    if (remotePlaylist.items.length !== localPlaylist.items.length) {
      return false;
    }

    const remoteItems = sortPlayerItems(remotePlaylist.items);

    const localItems = sortPlayerItems(localPlaylist.items);

    return remoteItems.every((remoteItem, index) => {
      const localItem = localItems[index];

      if (!localItem) {
        return false;
      }

      return (
        remoteItem.id === localItem.id &&
        remoteItem.media.id === localItem.media.id &&
        remoteItem.media.fileUrl === localItem.media.fileUrl &&
        (remoteItem.media.updatedAt ?? null) ===
          (localItem.media.updatedAt ?? null) &&
        Boolean(localItem.media.localPath)
      );
    });
  }

  private async cleanUnusedCache(programmingPlaylists: ProgrammingPlaylist[]) {
    const programmingItems = programmingPlaylists.flatMap(
      playlist => playlist.items,
    );
    const programmingBarMedias = programmingPlaylists.flatMap(playlist =>
      playlist.bars.flatMap(bar => (bar.media ? [bar.media] : [])),
    );

    const selectedItems = playlistManager.getCurrent();

    const playingItems = playbackManager.getPlaylist();

    const itemsToKeep = this.mergeUniqueItems([
      ...programmingItems,
      ...selectedItems,
      ...playingItems,
    ]);

    if (itemsToKeep.length === 0) {
      this.scheduleEmptyCacheCleanup();

      return;
    }

    this.cancelEmptyCacheCleanup();

    await cacheManager.clean(itemsToKeep, programmingBarMedias);
  }

  private scheduleEmptyCacheCleanup() {
    if (this.emptyCacheTimer) {
      return;
    }

    console.log(
      '[SYNC] Cache vazio será removido após 5 minutos de segurança.',
    );

    this.emptyCacheTimer = setTimeout(() => {
      this.emptyCacheTimer = undefined;

      if (!this.canClearEmptyCache()) {
        return;
      }

      void cacheManager.clear().catch(error => {
        console.log('[SYNC] Erro ao limpar cache vazio:', error);
      });
    }, this.emptyCacheGraceMs);
  }

  private cancelEmptyCacheCleanup() {
    if (!this.emptyCacheTimer) {
      return;
    }

    clearTimeout(this.emptyCacheTimer);

    this.emptyCacheTimer = undefined;
  }

  private canClearEmptyCache() {
    const programming = programmingManager.getSnapshot();

    const selectedItems = playlistManager.getCurrent();

    const playingItems = playbackManager.getPlaylist();

    return (
      programming.playlists.length === 0 &&
      selectedItems.length === 0 &&
      playingItems.length === 0
    );
  }

  private mergeUniqueItems(items: PlayerItem[]) {
    const uniqueItems = new Map<string, PlayerItem>();

    for (const item of items) {
      const key =
        item.media.localPath ??
        [item.media.id, item.media.updatedAt ?? item.media.fileUrl].join(':');

      uniqueItems.set(key, item);
    }

    return Array.from(uniqueItems.values());
  }

  private createLocalPlaylistMap(playlists: ProgrammingPlaylist[]) {
    return new Map(playlists.map(playlist => [playlist.id, playlist]));
  }

  private runPendingSyncIfNeeded() {
    if (!this.pendingSync) {
      return;
    }

    const pendingForce = this.pendingForceSync;

    this.pendingSync = false;

    this.pendingForceSync = false;

    if (!this.started && !pendingForce) {
      return;
    }

    void this.sync(pendingForce);
  }

  private getInvalidDeviceEvent(error: unknown): InvalidDeviceEvent | null {
    const response = (
      error as {
        response?: {
          status?: number;
          data?: {
            message?: string | string[];
          };
        };
      }
    )?.response;

    const status = response?.status;

    if (status === 401 || status === 403) {
      return {
        reason: 'UNLINKED',

        keepCode: true,
      };
    }

    const message = this.getErrorMessage(response?.data?.message);

    const normalized = message.toLowerCase();

    if (status === 404) {
      const deviceWasDeleted =
        normalized.includes('dispositivo não encontrado') ||
        normalized.includes('dispositivo nao encontrado');

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
      normalized.includes('não está vinculado') ||
      normalized.includes('nao esta vinculado') ||
      normalized.includes('não possui uma empresa vinculada')
    ) {
      return {
        reason: 'UNLINKED',

        keepCode: true,
      };
    }

    return null;
  }

  private validateProgrammingResponse(programming: ProgrammingResponseInput) {
    if (
      !programming ||
      typeof programming.version !== 'string' ||
      typeof programming.serverTime !== 'string' ||
      !Array.isArray(programming.occurrences) ||
      !Array.isArray(programming.playlists)
    ) {
      throw new Error('Resposta de programação inválida.');
    }
  }

  private formatSyncError(error: unknown) {
    const requestError = error as {
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

    return {
      status: requestError.response?.status ?? null,

      baseURL: requestError.config?.baseURL ?? null,

      url: requestError.config?.url ?? null,

      response: requestError.response?.data ?? null,

      message: requestError.message ?? 'Erro desconhecido',
    };
  }

  private getErrorMessage(message: string | string[] | undefined) {
    if (Array.isArray(message)) {
      return message.join(' ');
    }

    return String(message ?? '');
  }
}

export const syncManager = new SyncManager();
