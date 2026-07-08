import {
  cacheManager,
} from '../managers/CacheManager';

import {
  deviceSocketManager,
  type DeviceSessionEndedEvent,
} from '../managers/DeviceSocketManager';

import {
  heartbeatManager,
} from '../managers/HeartbeatManager';

import {
  playbackManager,
  type PlaybackSnapshot,
} from '../managers/PlaybackManager';

import {
  playlistManager,
  type PlaylistSnapshot,
} from '../managers/PlaylistManager';

import {
  programmingManager,
} from '../managers/ProgrammingManager';

import {
  tvPowerManager,
} from '../power/TvPowerManager';

import {
  tvPowerWatchdog,
} from '../power/TvPowerWatchdog';

import {
  syncManager,
} from '../managers/SyncManager';

import {
  playerState,
} from '../state/PlayerState';

import {
  programmingState,
} from '../state/ProgrammingState';

import {
  removeDeviceRegistration,
  removeDeviceToken,
} from '../../storage/device';

import {
  deviceSessionEvents,
  type DeviceSessionEvent,
} from '../../services/deviceSessionEvents';

import {
  playerSessionUiEvents,
} from '../../services/playerSessionUiEvents';

import type {
  ProgrammingOccurrence,
  ProgrammingPlaylist,
  ProgrammingSnapshot,
} from '../types/Programming';

interface SavedPlayerState {
  items:
    PlaylistSnapshot['items'];

  playlistId:
    string;

  scheduleId:
    string;

  hash:
    string;

  occurrenceId:
    string;

  startAt:
    string;

  endAt:
    string;

  priority:
    number;

  clockOffsetMs:
    number;
}

class PlayerEngine {
  private readonly safetyCheckIntervalMs =
    5_000;

  private started =
    false;

  private unsubscribePlaylist:
    | (() => void)
    | undefined;

  private unsubscribePlayback:
    | (() => void)
    | undefined;

  private unsubscribeProgramming:
    | (() => void)
    | undefined;

  private boundaryTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private safetyInterval:
    | ReturnType<typeof setInterval>
    | undefined;

  private activeOccurrenceId:
    string | null = null;

  private restoredState:
    SavedPlayerState | null = null;

  private lastCleanedSignature =
    '';

  private lastHeartbeatPlaybackKey =
    -1;

  private endingDeviceSession =
    false;

  private unsubscribeDeviceSession:
    | (() => void)
    | undefined;

  async start() {
    if (this.started) {
      return;
    }

    this.started =
      true;

    const programmingRestored =
      await programmingManager.hydrate();

    if (!programmingRestored) {
      await this.restoreSavedPlaylist();
    }

    if (!this.started) {
      return;
    }

    this.unsubscribePlaylist =
      playlistManager.subscribe(
        snapshot => {
          this.handlePlaylistUpdate(
            snapshot,
          );
        },
      );

    this.unsubscribePlayback =
      playbackManager.subscribe(
        snapshot => {
          this.handlePlaybackUpdate(
            snapshot,
          );
        },
      );

    this.unsubscribeProgramming =
      programmingManager.subscribe(
        snapshot => {
          this.handleProgrammingUpdate(
            snapshot,
          );
        },
      );

    /*
     * O watchdog verifica a cada 30 segundos se a TV
     * está ligada sem conteúdo e envia standby quando
     * necessário.
     */
    tvPowerWatchdog.start();

    /*
     * Ao reiniciar o TV Box, o firmware pode acordar
     * a televisão pelo HDMI-CEC. Reavaliamos a
     * programação imediatamente, sem esperar o
     * safety check ou a primeira sincronização.
     *
     * Sem ocorrência ativa, enviamos standby.
     * Com ocorrência ativa e conteúdo válido,
     * mantemos/ligamos a TV.
     */
    this.evaluateProgramming();

    this.startSafetyCheck();

    /*
     * Registra os listeners antes de iniciar
     * qualquer chamada HTTP ou WebSocket. Assim,
     * um 401/403 inicial não é perdido.
     */
    this.unsubscribeDeviceSession =
      deviceSessionEvents.subscribe(
        event =>
          this.handleDeviceSessionEnded(
            event,
          ),
      );

    syncManager.setInvalidDeviceHandler(
      event =>
        this.handleDeviceSessionEnded({
          deviceId: null,
          reason: event.reason,
          keepCode: event.keepCode,
          emittedAt: new Date().toISOString(),
        }),
    );

    await deviceSocketManager.start({
      onProgrammingChanged: () =>
        syncManager.forceSync(),

      onDeviceSessionEnded: event =>
        this.handleDeviceSessionEnded(event),
    });

    syncManager.start();

    heartbeatManager.start();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started =
      false;

    deviceSocketManager.stop();

    syncManager.stop();

    syncManager.setInvalidDeviceHandler(
      null,
    );

    heartbeatManager.stop();

    playbackManager.stop();

    tvPowerWatchdog.stop();

    this.clearBoundaryTimer();

    if (this.safetyInterval) {
      clearInterval(
        this.safetyInterval,
      );

      this.safetyInterval =
        undefined;
    }

    this.unsubscribePlaylist?.();
    this.unsubscribePlayback?.();
    this.unsubscribeProgramming?.();
    this.unsubscribeDeviceSession?.();

    this.unsubscribePlaylist =
      undefined;

    this.unsubscribePlayback =
      undefined;

    this.unsubscribeProgramming =
      undefined;

    this.unsubscribeDeviceSession =
      undefined;

    this.activeOccurrenceId =
      null;

    this.restoredState =
      null;

    this.lastCleanedSignature =
      '';

    this.lastHeartbeatPlaybackKey =
      -1;
  }

  async forceSync() {
    await syncManager.forceSync();
  }

  private async handleDeviceSessionEnded(
    event:
      DeviceSessionEndedEvent |
      DeviceSessionEvent,
  ) {
    if (this.endingDeviceSession) {
      return;
    }

    this.endingDeviceSession =
      true;

    console.log(
      '[ENGINE] Encerrando sessão do dispositivo:',
      event,
    );

    /*
     * O dispositivo não possui mais programação.
     * Enviamos standby somente para a TV por CEC.
     * O TV Box continua ligado e executando o Android.
     */
    tvPowerWatchdog.setContentActive(
      false,
      null,
    );

    void tvPowerManager.standby({
      reason:
        'DEVICE_SESSION_ENDED',

      occurrenceId:
        null,
    });

    /*
     * Primeiro interrompe tudo que ainda pode
     * reproduzir, sincronizar ou enviar heartbeat.
     */
    this.stop();

    playlistManager.clear();
    programmingManager.clear();

    /*
     * A credencial precisa ser removida antes da
     * ActivationScreen abrir. Caso contrário, ela
     * encontra o token antigo e retorna ao Player.
     *
     * O cache e os estados de reprodução não devem
     * bloquear a navegação, pois a limpeza de arquivos
     * pode levar alguns segundos em um TV Box.
     */
    try {
      if (event.keepCode) {
        await removeDeviceToken();

        console.log(
          '[ENGINE] Token local removido; código de ativação mantido.',
        );
      } else {
        await removeDeviceRegistration();

        console.log(
          '[ENGINE] Cadastro local do dispositivo removido.',
        );
      }
    } catch (error) {
      console.log(
        '[ENGINE] Falha ao remover credencial local:',
        error,
      );
    }

    /*
     * A PlayerScreen já está dentro do navigator e
     * possui acesso direto ao objeto navigation.
     * Por isso emitimos um evento para ela fazer o
     * reset, sem depender de uma navigationRef global.
     */
    playerSessionUiEvents.emit({
      deviceId:
        event.deviceId,

      reason:
        event.reason,

      keepCode:
        event.keepCode,

      emittedAt:
        event.emittedAt,
    });

    console.log(
      '[ENGINE] Evento de retorno à ativação emitido.',
    );

    this.endingDeviceSession =
      false;

    /*
     * Limpeza pesada em segundo plano. Ela não pode
     * manter a PlayerScreen visível em "Aguardando
     * conteúdo".
     */
    void this
      .clearSessionData()
      .catch(error => {
        console.log(
          '[ENGINE] Falha na limpeza final da sessão:',
          error,
        );
      });
  }

  private async clearSessionData() {
    const results =
      await Promise.allSettled([
        playerState.clear(),
        programmingState.clear(),
        cacheManager.clear(),
      ]);

    results.forEach(result => {
      if (
        result.status ===
        'rejected'
      ) {
        console.log(
          '[ENGINE] Falha durante limpeza da sessão:',
          result.reason,
        );
      }
    });

    console.log(
      '[ENGINE] Limpeza final da sessão concluída.',
    );
  }

  private handleProgrammingUpdate(
    snapshot:
      ProgrammingSnapshot,
  ) {
    if (
      snapshot.syncedAt ===
      null
    ) {
      this.evaluateRestoredState();

      return;
    }

    this.restoredState =
      null;

    this.evaluateProgramming();
  }

  private evaluateProgramming() {
    if (!this.started) {
      return;
    }

    const snapshot =
      programmingManager.getSnapshot();

    if (
      snapshot.syncedAt ===
      null
    ) {
      if (
        !this.restoredState &&
        !playlistManager.hasPlaylist()
      ) {
        tvPowerWatchdog.setContentActive(
          false,
          null,
        );
      }

      this.evaluateRestoredState();

      return;
    }

    const occurrence =
      programmingManager
        .getActiveOccurrence();

    if (!occurrence) {
      this.activeOccurrenceId =
        null;

      tvPowerWatchdog.setContentActive(
        false,
        null,
      );

      playlistManager.clear();

      void tvPowerManager.standby({
        reason:
          'NO_ACTIVE_SCHEDULE',

        occurrenceId:
          null,
      });

      this.scheduleNextBoundary();

      return;
    }

    const playlist =
      programmingManager.getPlaylist(
        occurrence.playlistId,
      );

    if (
      !playlist ||
      playlist.items.length ===
        0
    ) {
      tvPowerWatchdog.setContentActive(
        false,
        occurrence.occurrenceId,
      );

      void tvPowerManager.standby({
        reason:
          'ACTIVE_SCHEDULE_NO_CONTENT',

        occurrenceId:
          occurrence.occurrenceId,
      });

      this.scheduleNextBoundary();

      return;
    }

    const invalidItem =
      playlist.items.find(
        item =>
          !item.media.localPath,
      );

    if (invalidItem) {
      console.log(
        '[ENGINE] Mídia local ausente:',
        invalidItem.media.id,
      );

      tvPowerWatchdog.setContentActive(
        false,
        occurrence.occurrenceId,
      );

      void tvPowerManager.standby({
        reason:
          'ACTIVE_SCHEDULE_MEDIA_NOT_READY',

        occurrenceId:
          occurrence.occurrenceId,
      });

      this.scheduleNextBoundary();

      return;
    }

    const hash =
      this.createOccurrenceHash(
        occurrence,
        playlist,
      );

    const occurrenceChanged =
      this.activeOccurrenceId !==
      occurrence.occurrenceId;

    const playlistChanged =
      playlistManager.getHash() !==
        hash ||
      playlistManager.getPlaylistId() !==
        playlist.id ||
      playlistManager.getScheduleId() !==
        occurrence.scheduleId;

    if (
      occurrenceChanged &&
      playlistManager.hasPlaylist()
    ) {
      playbackManager.stop();
    }

    this.activeOccurrenceId =
      occurrence.occurrenceId;

    tvPowerWatchdog.setContentActive(
      true,
      occurrence.occurrenceId,
    );

    void tvPowerManager.turnOn({
      reason:
        'ACTIVE_SCHEDULE',

      occurrenceId:
        occurrence.occurrenceId,
    });

    if (playlistChanged) {
      playlistManager.setPlaylist(
        playlist.items,
        {
          playlistId:
            playlist.id,

          scheduleId:
            occurrence.scheduleId,

          hash,
        },
      );
    }

    this.scheduleNextBoundary();
  }

  private scheduleNextBoundary() {
    this.clearBoundaryTimer();

    const correctedNow =
      programmingManager
        .getCorrectedNow();

    const nextBoundary =
      programmingManager
        .getNextBoundary(
          correctedNow,
        );

    if (
      nextBoundary ===
      null
    ) {
      return;
    }

    const delay =
      Math.max(
        0,
        nextBoundary -
          correctedNow +
          25,
      );

    this.boundaryTimer =
      setTimeout(
        () => {
          this.boundaryTimer =
            undefined;

          this.evaluateProgramming();
        },
        delay,
      );
  }

  private clearBoundaryTimer() {
    if (!this.boundaryTimer) {
      return;
    }

    clearTimeout(
      this.boundaryTimer,
    );

    this.boundaryTimer =
      undefined;
  }

  private startSafetyCheck() {
    if (this.safetyInterval) {
      clearInterval(
        this.safetyInterval,
      );
    }

    this.safetyInterval =
      setInterval(
        () => {
          if (this.started) {
            this.evaluateProgramming();
          }
        },
        this.safetyCheckIntervalMs,
      );
  }

  private handlePlaylistUpdate(
    snapshot:
      PlaylistSnapshot,
  ) {
    const hasValidPlaylist =
      snapshot.items.length >
        0 &&
      Boolean(
        snapshot.playlistId,
      ) &&
      Boolean(
        snapshot.scheduleId,
      ) &&
      Boolean(
        snapshot.hash,
      );

    if (!hasValidPlaylist) {
      tvPowerWatchdog.setContentActive(
        false,
        null,
      );

      playbackManager.stop();

      this.lastCleanedSignature =
        '';

      void playerState.clear();

      return;
    }

    const activeOccurrence =
      programmingManager
        .getActiveOccurrence();

    if (
      !activeOccurrence &&
      this.restoredState
    ) {
      tvPowerWatchdog.setContentActive(
        true,
        this.restoredState
          .occurrenceId,
      );

      playbackManager.load(
        snapshot.items,
      );

      return;
    }

    if (!activeOccurrence) {
      tvPowerWatchdog.setContentActive(
        false,
        null,
      );

      playbackManager.stop();

      void playerState.clear();

      return;
    }

    const programmingSnapshot =
      programmingManager
        .getSnapshot();

    const state:
      SavedPlayerState = {
      items:
        snapshot.items,

      playlistId:
        snapshot.playlistId!,

      scheduleId:
        snapshot.scheduleId!,

      hash:
        snapshot.hash!,

      occurrenceId:
        activeOccurrence
          .occurrenceId,

      startAt:
        activeOccurrence.startAt,

      endAt:
        activeOccurrence.endAt,

      priority:
        activeOccurrence.priority,

      clockOffsetMs:
        programmingSnapshot
          .clockOffsetMs,
    };

    void playerState
      .save(state)
      .catch(error => {
        console.log(
          '[ENGINE] Erro ao salvar estado:',
          error,
        );
      });

    tvPowerWatchdog.setContentActive(
      true,
      activeOccurrence.occurrenceId,
    );

    playbackManager.load(
      snapshot.items,
    );
  }

  private handlePlaybackUpdate(
    snapshot:
      PlaybackSnapshot,
  ) {
    if (
      snapshot.playbackKey !==
      this.lastHeartbeatPlaybackKey
    ) {
      this.lastHeartbeatPlaybackKey =
        snapshot.playbackKey;

      if (
        heartbeatManager.isRunning()
      ) {
        void heartbeatManager.send();
      }
    }

    if (
      snapshot.totalItems ===
        0 ||
      snapshot.hasPendingPlaylist
    ) {
      return;
    }

    const activeItems =
      playbackManager.getPlaylist();

    if (
      activeItems.length ===
      0
    ) {
      return;
    }

    const programmingItems =
      programmingManager
        .getSnapshot()
        .playlists
        .flatMap(
          playlist =>
            playlist.items,
        );

    const itemsToKeep =
      this.mergeUniqueItems([
        ...activeItems,
        ...programmingItems,
      ]);

    const keepSignature =
      this.createItemsSignature(
        itemsToKeep,
      );

    if (
      keepSignature ===
      this.lastCleanedSignature
    ) {
      return;
    }

    this.lastCleanedSignature =
      keepSignature;

    void cacheManager
      .clean(
        itemsToKeep,
      )
      .catch(error => {
        this.lastCleanedSignature =
          '';

        console.log(
          '[ENGINE] Erro ao limpar cache:',
          error,
        );
      });
  }

  private async restoreSavedPlaylist() {
    try {
      if (
        playlistManager.hasPlaylist()
      ) {
        return;
      }

      const savedState =
        await playerState.load() as
          | SavedPlayerState
          | null;

      if (!savedState) {
        return;
      }

      const startAt =
        new Date(
          savedState.startAt,
        ).getTime();

      const endAt =
        new Date(
          savedState.endAt,
        ).getTime();

      const clockOffsetMs =
        Number.isFinite(
          savedState.clockOffsetMs,
        )
          ? savedState.clockOffsetMs
          : 0;

      const correctedNow =
        Date.now() +
        clockOffsetMs;

      const isValid =
        Array.isArray(
          savedState.items,
        ) &&
        savedState.items.length >
          0 &&
        Boolean(
          savedState.playlistId,
        ) &&
        Boolean(
          savedState.scheduleId,
        ) &&
        Boolean(
          savedState.hash,
        ) &&
        Boolean(
          savedState.occurrenceId,
        ) &&
        Number.isFinite(
          startAt,
        ) &&
        Number.isFinite(
          endAt,
        ) &&
        startAt <=
          correctedNow &&
        correctedNow <
          endAt;

      if (!isValid) {
        await playerState.clear();

        return;
      }

      this.restoredState =
        savedState;

      tvPowerWatchdog.setContentActive(
        true,
        savedState.occurrenceId,
      );

      void tvPowerManager.turnOn({
        reason:
          'RESTORED_ACTIVE_SCHEDULE',

        occurrenceId:
          savedState.occurrenceId,
      });

      this.activeOccurrenceId =
        savedState.occurrenceId;

      playlistManager.setPlaylist(
        savedState.items,
        {
          playlistId:
            savedState.playlistId,

          scheduleId:
            savedState.scheduleId,

          hash:
            savedState.hash,
        },
      );

      this.scheduleRestoredEnd();
    } catch (error) {
      console.log(
        '[ENGINE] Erro ao restaurar playlist:',
        error,
      );

      await playerState.clear();
    }
  }

  private evaluateRestoredState() {
    if (!this.restoredState) {
      return;
    }

    const correctedNow =
      Date.now() +
      this.restoredState
        .clockOffsetMs;

    const endAt =
      new Date(
        this.restoredState.endAt,
      ).getTime();

    if (
      correctedNow >=
      endAt
    ) {
      this.restoredState =
        null;

      this.activeOccurrenceId =
        null;

      tvPowerWatchdog.setContentActive(
        false,
        null,
      );

      playlistManager.clear();

      void tvPowerManager.standby({
        reason:
          'RESTORED_SCHEDULE_ENDED',

        occurrenceId:
          null,
      });

      return;
    }

    tvPowerWatchdog.setContentActive(
      true,
      this.restoredState
        .occurrenceId,
    );

    void tvPowerManager.turnOn({
      reason:
        'RESTORED_ACTIVE_SCHEDULE',

      occurrenceId:
        this.restoredState
          .occurrenceId,
    });

    this.scheduleRestoredEnd();
  }

  private scheduleRestoredEnd() {
    if (!this.restoredState) {
      return;
    }

    this.clearBoundaryTimer();

    const correctedNow =
      Date.now() +
      this.restoredState
        .clockOffsetMs;

    const endAt =
      new Date(
        this.restoredState.endAt,
      ).getTime();

    const delay =
      Math.max(
        0,
        endAt -
          correctedNow +
          25,
      );

    this.boundaryTimer =
      setTimeout(
        () => {
          this.boundaryTimer =
            undefined;

          this.evaluateRestoredState();
        },
        delay,
      );
  }

  private createOccurrenceHash(
    occurrence:
      ProgrammingOccurrence,

    playlist:
      ProgrammingPlaylist,
  ) {
    return JSON.stringify({
      occurrenceId:
        occurrence.occurrenceId,

      scheduleId:
        occurrence.scheduleId,

      playlistId:
        playlist.id,

      playlistUpdatedAt:
        playlist.updatedAt,

      items:
        [...playlist.items]
          .sort(
            (
              first,
              second,
            ) =>
              first.order -
              second.order,
          )
          .map(
            item => ({
              itemId:
                item.id,

              order:
                item.order,

              duration:
                item.duration ??
                null,

              mediaId:
                item.media.id,

              localPath:
                item.media.localPath ??
                null,

              updatedAt:
                item.media.updatedAt ??
                null,
            }),
          ),
    });
  }

  private mergeUniqueItems(
    items:
      PlaylistSnapshot['items'],
  ) {
    const uniqueItems =
      new Map<
        string,
        PlaylistSnapshot['items'][number]
      >();

    for (
      const item
      of items
    ) {
      uniqueItems.set(
        item.media.localPath ??
          item.media.id,
        item,
      );
    }

    return Array.from(
      uniqueItems.values(),
    );
  }

  private createItemsSignature(
    items:
      PlaylistSnapshot['items'],
  ) {
    return JSON.stringify(
      [...items]
        .sort(
          (
            first,
            second,
          ) =>
            first.media.id.localeCompare(
              second.media.id,
            ),
        )
        .map(
          item => ({
            itemId:
              item.id,

            mediaId:
              item.media.id,

            localPath:
              item.media.localPath ??
              null,

            updatedAt:
              item.media.updatedAt ??
              null,
          }),
        ),
    );
  }
}

export const playerEngine =
  new PlayerEngine();
