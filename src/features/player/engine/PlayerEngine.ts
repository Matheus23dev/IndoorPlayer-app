import { cacheManager } from '../managers/CacheManager';

import {
  deviceSocketManager,
  type DeviceSessionEndedEvent,
} from '../managers/DeviceSocketManager';

import { heartbeatManager } from '../managers/HeartbeatManager';

import {
  playbackManager,
  type PlaybackSnapshot,
} from '../managers/PlaybackManager';

import {
  playlistManager,
  type PlaylistSnapshot,
} from '../managers/PlaylistManager';

import { programmingManager } from '../managers/ProgrammingManager';
import { syncManager } from '../managers/SyncManager';

import { tvPowerManager } from '../power/TvPowerManager';
import { tvPowerWatchdog } from '../power/TvPowerWatchdog';

import { playerState } from '../state/PlayerState';
import { programmingState } from '../state/ProgrammingState';

import {
  removeDeviceRegistration,
  removeDeviceToken,
} from '../../../core/storage/deviceStorage';

import {
  deviceSessionEvents,
  type DeviceSessionEvent,
} from '../../../core/events/deviceSessionEvents';

import { playerSessionUiEvents } from '../../../core/events/playerSessionUiEvents';

import { playerEventLogger } from '../logging/PlayerEventLogger';

import {
  getPlayerItemSignatureData,
  normalizePlayerItem,
} from '../domain/playerItem';
import {
  normalizeOverlayBar,
  normalizePlaylistOrientation,
} from '../domain/programming';

import type {
  ProgrammingOccurrence,
  PlaylistOrientation,
  ProgrammingPlaylist,
  ProgrammingSnapshot,
} from '../types/programming';

type Unsubscribe = () => void;

interface SavedPlayerState {
  items: PlaylistSnapshot['items'];
  playlistId: string;
  scheduleId: string;
  hash: string;
  occurrenceId: string;
  startAt: string;
  endAt: string;
  priority: number;
  clockOffsetMs: number;
  orientation: PlaylistOrientation;
  bars: PlaylistSnapshot['bars'];
}

class PlayerEngine {
  private readonly safetyCheckIntervalMs = 5_000;

  private started = false;
  private activeOccurrenceId: string | null = null;
  private restoredState: SavedPlayerState | null = null;
  private lastCleanedSignature = '';
  private lastHeartbeatPlaybackKey = -1;
  private lastLoggedPlaybackKey = -1;
  private lastLoggedItemId: string | null = null;
  private lastLoggedMuted: boolean | null = null;
  private playbackWasActive = false;
  private lastOperationalState = '';
  private endingDeviceSession = false;

  private unsubscribePlaylist?: Unsubscribe;
  private unsubscribePlayback?: Unsubscribe;
  private unsubscribeProgramming?: Unsubscribe;
  private unsubscribeDeviceSession?: Unsubscribe;

  private boundaryTimer?: ReturnType<typeof setTimeout>;
  private safetyInterval?: ReturnType<typeof setInterval>;

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;

    playerEventLogger.log({
      event: 'ENGINE_STARTING',
      category: 'SYSTEM',
      level: 'INFO',
      message: 'Inicializando os servi\u00e7os do Player.',
      dedupeWindowMs: 1_000,
    });

    try {
      const programmingRestored = await programmingManager.hydrate();

      if (!programmingRestored) {
        await this.restoreSavedPlaylist();
      }

      if (!this.started) {
        return;
      }

      this.subscribeManagers();

      tvPowerWatchdog.start();

      this.evaluateProgramming();
      this.startSafetyCheck();

      this.unsubscribeDeviceSession = deviceSessionEvents.subscribe(event =>
        this.handleDeviceSessionEnded(event),
      );

      syncManager.setInvalidDeviceHandler(event =>
        this.handleDeviceSessionEnded({
          deviceId: null,
          reason: event.reason,
          keepCode: event.keepCode,
          emittedAt: new Date().toISOString(),
        }),
      );

      await deviceSocketManager.start({
        onProgrammingChanged: () => syncManager.forceSync(),

        onDeviceSessionEnded: event => this.handleDeviceSessionEnded(event),
      });

      syncManager.start();
      heartbeatManager.start();

      playerEventLogger.log({
        event: 'ENGINE_STARTED',
        category: 'SYSTEM',
        level: 'SUCCESS',
        message: 'Player iniciado e pronto para reproduzir conte\u00fado.',
      });
    } catch (error) {
      playerEventLogger.log({
        event: 'ENGINE_START_FAILED',
        category: 'SYSTEM',
        level: 'ERROR',
        message:
          'O Player n\u00e3o conseguiu concluir a inicializa\u00e7\u00e3o.',
        metadata: {
          error: this.getErrorMessage(error),
        },
      });

      console.log('[ENGINE] Erro ao iniciar engine:', error);

      this.stop();

      throw error;
    }
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;

    playerEventLogger.log({
      event: 'ENGINE_STOPPED',
      category: 'SYSTEM',
      level: 'WARNING',
      message: 'Os servi\u00e7os do Player foram interrompidos.',
    });

    deviceSocketManager.stop();

    syncManager.stop();
    syncManager.setInvalidDeviceHandler(null);

    heartbeatManager.stop();
    playbackManager.stop();
    tvPowerWatchdog.stop();

    this.clearBoundaryTimer();
    this.clearSafetyInterval();
    this.unsubscribeAll();
    this.resetRuntimeState();
  }

  async forceSync() {
    await syncManager.forceSync();
  }

  private subscribeManagers() {
    this.unsubscribePlaylist = playlistManager.subscribe(snapshot =>
      this.handlePlaylistUpdate(snapshot),
    );

    this.unsubscribePlayback = playbackManager.subscribe(snapshot =>
      this.handlePlaybackUpdate(snapshot),
    );

    this.unsubscribeProgramming = programmingManager.subscribe(snapshot =>
      this.handleProgrammingUpdate(snapshot),
    );
  }

  private async handleDeviceSessionEnded(
    event: DeviceSessionEndedEvent | DeviceSessionEvent,
  ) {
    if (this.endingDeviceSession) {
      return;
    }

    this.endingDeviceSession = true;

    playerEventLogger.log({
      event: 'DEVICE_SESSION_ENDED',
      category: 'SESSION',
      level: 'WARNING',
      message: 'A sess\u00e3o deste dispositivo foi encerrada.',
      metadata: {
        reason: event.reason,
        keepCode: event.keepCode,
      },
      dedupeWindowMs: 1_000,
    });

    console.log('[ENGINE] Encerrando sessão do dispositivo:', event);

    this.setContentInactive();

    void tvPowerManager.standby({
      reason: 'DEVICE_SESSION_ENDED',
      occurrenceId: null,
    });

    this.stop();

    playlistManager.clear();
    programmingManager.clear();

    await this.removeLocalDeviceCredential(event);

    playerSessionUiEvents.emit({
      deviceId: event.deviceId,
      reason: event.reason,
      keepCode: event.keepCode,
      emittedAt: event.emittedAt,
    });

    console.log('[ENGINE] Evento de retorno à ativação emitido.');

    this.endingDeviceSession = false;

    void this.clearSessionData().catch(error => {
      console.log('[ENGINE] Falha na limpeza final da sessão:', error);
    });
  }

  private async removeLocalDeviceCredential(
    event: DeviceSessionEndedEvent | DeviceSessionEvent,
  ) {
    try {
      if (event.keepCode) {
        await removeDeviceToken();

        console.log(
          '[ENGINE] Token local removido; código de ativação mantido.',
        );

        return;
      }

      await removeDeviceRegistration();

      console.log('[ENGINE] Cadastro local do dispositivo removido.');
    } catch (error) {
      console.log('[ENGINE] Falha ao remover credencial local:', error);
    }
  }

  private async clearSessionData() {
    const results = await Promise.allSettled([
      playerState.clear(),
      programmingState.clear(),
      cacheManager.clear(),
    ]);

    results.forEach(result => {
      if (result.status === 'rejected') {
        console.log('[ENGINE] Falha durante limpeza da sessão:', result.reason);
      }
    });

    console.log('[ENGINE] Limpeza final da sessão concluída.');
  }

  private handleProgrammingUpdate(snapshot: ProgrammingSnapshot) {
    if (snapshot.syncedAt === null) {
      this.evaluateRestoredState();
      return;
    }

    this.restoredState = null;
    this.evaluateProgramming();
  }

  private evaluateProgramming() {
    if (!this.started) {
      return;
    }

    const snapshot = programmingManager.getSnapshot();

    if (snapshot.syncedAt === null) {
      if (!this.restoredState && !playlistManager.hasPlaylist()) {
        this.setContentInactive();
      }

      this.evaluateRestoredState();
      return;
    }

    const occurrence = programmingManager.getActiveOccurrence();

    if (!occurrence) {
      this.handleNoActiveSchedule();
      return;
    }

    const playlist = programmingManager.getPlaylist(occurrence.playlistId);

    if (!playlist || playlist.items.length === 0) {
      this.handleScheduleUnavailable(
        'ACTIVE_SCHEDULE_NO_CONTENT',
        occurrence.occurrenceId,
      );

      return;
    }

    const invalidItem = playlist.items.find(item => !item.media.localPath);

    if (invalidItem) {
      console.log('[ENGINE] Mídia local ausente:', invalidItem.media.id);

      this.handleScheduleUnavailable(
        'ACTIVE_SCHEDULE_MEDIA_NOT_READY',
        occurrence.occurrenceId,
      );

      return;
    }

    this.applyActiveSchedule(occurrence, playlist);

    this.scheduleNextBoundary();
  }

  private handleNoActiveSchedule() {
    if (this.lastOperationalState !== 'NO_ACTIVE_SCHEDULE') {
      this.lastOperationalState = 'NO_ACTIVE_SCHEDULE';

      playerEventLogger.log({
        event: 'NO_ACTIVE_SCHEDULE',
        category: 'PROGRAMMING',
        level: 'INFO',
        message: 'Nenhum agendamento est\u00e1 ativo neste momento.',
      });
    }

    this.activeOccurrenceId = null;

    this.setContentInactive();

    playlistManager.clear();

    void tvPowerManager.standby({
      reason: 'NO_ACTIVE_SCHEDULE',
      occurrenceId: null,
    });

    this.scheduleNextBoundary();
  }

  private handleScheduleUnavailable(
    reason: 'ACTIVE_SCHEDULE_NO_CONTENT' | 'ACTIVE_SCHEDULE_MEDIA_NOT_READY',

    occurrenceId: string,
  ) {
    const operationalState = `${reason}:${occurrenceId}`;

    if (this.lastOperationalState !== operationalState) {
      this.lastOperationalState = operationalState;

      playerEventLogger.log({
        event: reason,
        category: 'PROGRAMMING',
        level: 'ERROR',
        message:
          reason === 'ACTIVE_SCHEDULE_NO_CONTENT'
            ? 'O agendamento ativo n\u00e3o possui conte\u00fado para reproduzir.'
            : 'Uma m\u00eddia do agendamento ativo ainda n\u00e3o est\u00e1 dispon\u00edvel localmente.',
        metadata: {
          occurrenceId,
        },
      });
    }

    tvPowerWatchdog.setContentActive(false, occurrenceId);

    void tvPowerManager.standby({
      reason,
      occurrenceId,
    });

    this.scheduleNextBoundary();
  }

  private applyActiveSchedule(
    occurrence: ProgrammingOccurrence,
    playlist: ProgrammingPlaylist,
  ) {
    const hash = this.createOccurrenceHash(occurrence, playlist);

    const occurrenceChanged =
      this.activeOccurrenceId !== occurrence.occurrenceId;

    const playlistChanged =
      playlistManager.getHash() !== hash ||
      playlistManager.getPlaylistId() !== playlist.id ||
      playlistManager.getScheduleId() !== occurrence.scheduleId;

    if (occurrenceChanged || playlistChanged) {
      this.lastOperationalState = `ACTIVE:${occurrence.occurrenceId}:${playlist.updatedAt}`;

      playerEventLogger.log({
        event: 'ACTIVE_SCHEDULE_APPLIED',
        category: 'PROGRAMMING',
        level: 'SUCCESS',
        message: 'Agendamento ativo aplicado ao Player.',
        metadata: {
          schedule: occurrence.scheduleName,
          playlist: playlist.name,
          items: playlist.items.length,
          occurrenceId: occurrence.occurrenceId,
        },
        dedupeKey: `active-schedule:${occurrence.occurrenceId}:${playlist.updatedAt}`,
        dedupeWindowMs: 60_000,
      });
    }

    if (occurrenceChanged && playlistManager.hasPlaylist()) {
      playbackManager.stop();
    }

    this.activeOccurrenceId = occurrence.occurrenceId;

    tvPowerWatchdog.setContentActive(true, occurrence.occurrenceId);

    void tvPowerManager.turnOn({
      reason: 'ACTIVE_SCHEDULE',
      occurrenceId: occurrence.occurrenceId,
    });

    if (playlistChanged) {
      playlistManager.setPlaylist(playlist.items, {
        playlistId: playlist.id,
        scheduleId: occurrence.scheduleId,
        hash,
        orientation: playlist.orientation,
        bars: playlist.bars,
      });
    }
  }

  private scheduleNextBoundary() {
    this.clearBoundaryTimer();

    const correctedNow = programmingManager.getCorrectedNow();

    const nextBoundary = programmingManager.getNextBoundary(correctedNow);

    if (nextBoundary === null) {
      return;
    }

    const delay = Math.max(0, nextBoundary - correctedNow + 25);

    this.boundaryTimer = setTimeout(() => {
      this.boundaryTimer = undefined;
      this.evaluateProgramming();
    }, delay);
  }

  private clearBoundaryTimer() {
    if (!this.boundaryTimer) {
      return;
    }

    clearTimeout(this.boundaryTimer);
    this.boundaryTimer = undefined;
  }

  private clearSafetyInterval() {
    if (!this.safetyInterval) {
      return;
    }

    clearInterval(this.safetyInterval);
    this.safetyInterval = undefined;
  }

  private startSafetyCheck() {
    this.clearSafetyInterval();

    this.safetyInterval = setInterval(() => {
      if (this.started) {
        this.evaluateProgramming();
      }
    }, this.safetyCheckIntervalMs);
  }

  private handlePlaylistUpdate(snapshot: PlaylistSnapshot) {
    const hasValidPlaylist =
      snapshot.items.length > 0 &&
      Boolean(snapshot.playlistId) &&
      Boolean(snapshot.scheduleId) &&
      Boolean(snapshot.hash);

    if (!hasValidPlaylist) {
      this.setContentInactive();

      playbackManager.stop();

      this.lastCleanedSignature = '';

      void playerState.clear();

      return;
    }

    const activeOccurrence = programmingManager.getActiveOccurrence();

    if (!activeOccurrence && this.restoredState) {
      tvPowerWatchdog.setContentActive(true, this.restoredState.occurrenceId);

      playbackManager.load(snapshot.items);

      return;
    }

    if (!activeOccurrence) {
      this.setContentInactive();

      playbackManager.stop();

      void playerState.clear();

      return;
    }

    this.saveActivePlayerState(snapshot, activeOccurrence);

    tvPowerWatchdog.setContentActive(true, activeOccurrence.occurrenceId);

    playbackManager.load(snapshot.items);
  }

  private saveActivePlayerState(
    snapshot: PlaylistSnapshot,
    activeOccurrence: ProgrammingOccurrence,
  ) {
    const programmingSnapshot = programmingManager.getSnapshot();

    const state: SavedPlayerState = {
      items: snapshot.items,
      playlistId: snapshot.playlistId!,
      scheduleId: snapshot.scheduleId!,
      hash: snapshot.hash!,
      occurrenceId: activeOccurrence.occurrenceId,
      startAt: activeOccurrence.startAt,
      endAt: activeOccurrence.endAt,
      priority: activeOccurrence.priority,
      clockOffsetMs: programmingSnapshot.clockOffsetMs,
      orientation: snapshot.orientation,
      bars: snapshot.bars,
    };

    void playerState.save(state).catch(error => {
      console.log('[ENGINE] Erro ao salvar estado:', error);
    });
  }

  private handlePlaybackUpdate(snapshot: PlaybackSnapshot) {
    this.sendHeartbeatOnPlaybackChange(snapshot);
    this.logPlaybackChange(snapshot);

    if (snapshot.totalItems === 0 || snapshot.hasPendingPlaylist) {
      return;
    }

    const activeItems = playbackManager.getPlaylist();

    if (activeItems.length === 0) {
      return;
    }

    const programmingItems = programmingManager
      .getSnapshot()
      .playlists.flatMap(playlist => playlist.items);
    const barMedias = [
      ...playlistManager.getBars(),
      ...programmingManager
        .getSnapshot()
        .playlists.flatMap(playlist => playlist.bars),
    ].flatMap(bar => [
      ...(bar.media ? [bar.media] : []),
      ...bar.contentItems.flatMap(item => (item.media ? [item.media] : [])),
    ]);

    const itemsToKeep = this.mergeUniqueItems([
      ...activeItems,
      ...programmingItems,
    ]);

    const keepSignature = this.createItemsSignature(itemsToKeep, barMedias);

    if (keepSignature === this.lastCleanedSignature) {
      return;
    }

    this.lastCleanedSignature = keepSignature;

    void cacheManager.clean(itemsToKeep, barMedias).catch(error => {
      this.lastCleanedSignature = '';

      console.log('[ENGINE] Erro ao limpar cache:', error);
    });
  }

  private sendHeartbeatOnPlaybackChange(snapshot: PlaybackSnapshot) {
    if (snapshot.playbackKey === this.lastHeartbeatPlaybackKey) {
      return;
    }

    this.lastHeartbeatPlaybackKey = snapshot.playbackKey;

    if (heartbeatManager.isRunning()) {
      void heartbeatManager.send();
    }
  }

  private logPlaybackChange(snapshot: PlaybackSnapshot) {
    if (snapshot.playbackKey === this.lastLoggedPlaybackKey) {
      return;
    }

    this.lastLoggedPlaybackKey = snapshot.playbackKey;

    const item = snapshot.currentItem;

    if (!item) {
      if (this.playbackWasActive) {
        playerEventLogger.log({
          event: 'PLAYBACK_STOPPED',
          category: 'PLAYBACK',
          level: 'INFO',
          message: 'A reprodu\u00e7\u00e3o de m\u00eddias foi interrompida.',
          dedupeWindowMs: 1_000,
        });
      }

      this.playbackWasActive = false;
      this.lastLoggedItemId = null;
      this.lastLoggedMuted = null;
      return;
    }

    const isVideo = item.media.type === 'VIDEO';
    const audioChanged =
      isVideo &&
      this.lastLoggedItemId === item.id &&
      this.lastLoggedMuted !== null &&
      this.lastLoggedMuted !== item.muted;

    playerEventLogger.log({
      event: audioChanged ? 'VIDEO_AUDIO_CHANGED' : 'MEDIA_STARTED',
      category: audioChanged ? 'AUDIO' : 'PLAYBACK',
      level: 'SUCCESS',
      message: audioChanged
        ? item.muted
          ? 'O \u00e1udio do v\u00eddeo atual foi silenciado.'
          : 'O \u00e1udio do v\u00eddeo atual foi ativado.'
        : `${item.media.type === 'VIDEO' ? 'V\u00eddeo' : 'Imagem'} iniciado: ${
            item.media.name
          }`,
      metadata: {
        media: item.media.name,
        mediaType: item.media.type,
        position: `${snapshot.currentIndex + 1}/${snapshot.totalItems}`,
        duration: item.media.duration ?? item.duration ?? null,
        muted: isVideo ? item.muted : null,
      },
      dedupeKey: `${audioChanged ? 'audio' : 'playback'}:${
        snapshot.playbackKey
      }`,
      dedupeWindowMs: 0,
    });

    this.playbackWasActive = true;
    this.lastLoggedItemId = item.id;
    this.lastLoggedMuted = isVideo ? item.muted : null;
  }

  private async restoreSavedPlaylist() {
    try {
      if (playlistManager.hasPlaylist()) {
        return;
      }

      const savedState = (await playerState.load()) as SavedPlayerState | null;

      if (!savedState) {
        return;
      }

      const normalizedState = this.normalizeSavedState(savedState);

      if (!this.isSavedStateValid(normalizedState)) {
        await playerState.clear();
        return;
      }

      const [itemsCacheIsValid, barsCacheIsValid] = await Promise.all([
        cacheManager.validate(normalizedState.items),
        cacheManager.validateMedias(
          normalizedState.bars.flatMap(bar => [
            ...(bar.media ? [bar.media] : []),
            ...bar.contentItems.flatMap(item =>
              item.media ? [item.media] : [],
            ),
          ]),
        ),
      ]);

      if (!itemsCacheIsValid || !barsCacheIsValid) {
        console.log('[ENGINE] Playlist salva ignorada: cache local inválido.');

        await playerState.clear();
        return;
      }

      this.restoredState = normalizedState;

      playerEventLogger.log({
        event: 'PLAYLIST_RESTORED_FROM_CACHE',
        category: 'CACHE',
        level: 'SUCCESS',
        message: 'A playlist ativa foi restaurada do cache local.',
        metadata: {
          playlistId: normalizedState.playlistId,
          scheduleId: normalizedState.scheduleId,
          items: normalizedState.items.length,
          occurrenceId: normalizedState.occurrenceId,
        },
      });

      tvPowerWatchdog.setContentActive(true, normalizedState.occurrenceId);

      void tvPowerManager.turnOn({
        reason: 'RESTORED_ACTIVE_SCHEDULE',
        occurrenceId: normalizedState.occurrenceId,
      });

      this.activeOccurrenceId = normalizedState.occurrenceId;

      playlistManager.setPlaylist(normalizedState.items, {
        playlistId: normalizedState.playlistId,
        scheduleId: normalizedState.scheduleId,
        hash: normalizedState.hash,
        orientation: normalizedState.orientation,
        bars: normalizedState.bars,
      });

      this.scheduleRestoredEnd();
    } catch (error) {
      console.log('[ENGINE] Erro ao restaurar playlist:', error);

      await playerState.clear();
    }
  }

  private normalizeSavedState(savedState: SavedPlayerState): SavedPlayerState {
    return {
      ...savedState,

      items: Array.isArray(savedState.items)
        ? savedState.items.map(normalizePlayerItem)
        : [],

      clockOffsetMs: Number.isFinite(savedState.clockOffsetMs)
        ? savedState.clockOffsetMs
        : 0,

      orientation: normalizePlaylistOrientation(savedState.orientation),
      bars: Array.isArray(savedState.bars)
        ? savedState.bars.map(normalizeOverlayBar)
        : [],
    };
  }

  private isSavedStateValid(savedState: SavedPlayerState) {
    const startAt = new Date(savedState.startAt).getTime();

    const endAt = new Date(savedState.endAt).getTime();

    const correctedNow = Date.now() + savedState.clockOffsetMs;

    return (
      Array.isArray(savedState.items) &&
      savedState.items.length > 0 &&
      Boolean(savedState.playlistId) &&
      Boolean(savedState.scheduleId) &&
      Boolean(savedState.hash) &&
      Boolean(savedState.occurrenceId) &&
      Number.isFinite(startAt) &&
      Number.isFinite(endAt) &&
      startAt <= correctedNow &&
      correctedNow < endAt
    );
  }

  private evaluateRestoredState() {
    if (!this.restoredState) {
      return;
    }

    const correctedNow = Date.now() + this.restoredState.clockOffsetMs;

    const endAt = new Date(this.restoredState.endAt).getTime();

    if (correctedNow >= endAt) {
      this.restoredState = null;
      this.activeOccurrenceId = null;

      this.setContentInactive();

      playlistManager.clear();

      void tvPowerManager.standby({
        reason: 'RESTORED_SCHEDULE_ENDED',
        occurrenceId: null,
      });

      return;
    }

    tvPowerWatchdog.setContentActive(true, this.restoredState.occurrenceId);

    void tvPowerManager.turnOn({
      reason: 'RESTORED_ACTIVE_SCHEDULE',
      occurrenceId: this.restoredState.occurrenceId,
    });

    this.scheduleRestoredEnd();
  }

  private scheduleRestoredEnd() {
    if (!this.restoredState) {
      return;
    }

    this.clearBoundaryTimer();

    const correctedNow = Date.now() + this.restoredState.clockOffsetMs;

    const endAt = new Date(this.restoredState.endAt).getTime();

    const delay = Math.max(0, endAt - correctedNow + 25);

    this.boundaryTimer = setTimeout(() => {
      this.boundaryTimer = undefined;
      this.evaluateRestoredState();
    }, delay);
  }

  private setContentInactive() {
    tvPowerWatchdog.setContentActive(false, null);
  }

  private createOccurrenceHash(
    occurrence: ProgrammingOccurrence,
    playlist: ProgrammingPlaylist,
  ) {
    return JSON.stringify({
      occurrenceId: occurrence.occurrenceId,
      scheduleId: occurrence.scheduleId,
      playlistId: playlist.id,
      orientation: playlist.orientation,
      playlistUpdatedAt: playlist.updatedAt,

      bars: playlist.bars.map(bar => ({
        id: bar.id,
        position: bar.position,
        sizePercent: bar.sizePercent,
        backgroundColor: bar.backgroundColor,
        opacity: bar.opacity,
        fit: bar.fit,
        contentPosition: bar.contentPosition,
        contentAlignment: bar.contentAlignment,
        imageSizePercent: bar.imageSizePercent,
        contentPadding: bar.contentPadding,
        contentGap: bar.contentGap,
        contentItems: bar.contentItems,
        textContent: bar.textContent,
        textColor: bar.textColor,
        fontSize: bar.fontSize,
        widgetType: bar.widgetType,
        weatherLocation: bar.weatherLocation,
        order: bar.order,
        updatedAt: bar.updatedAt,
        mediaId: bar.media?.id ?? null,
        mediaUpdatedAt: bar.media?.updatedAt ?? null,
      })),

      items: [...playlist.items]
        .sort((first, second) => first.order - second.order)
        .map(getPlayerItemSignatureData),
    });
  }

  private mergeUniqueItems(items: PlaylistSnapshot['items']) {
    const uniqueItems = new Map<string, PlaylistSnapshot['items'][number]>();

    for (const item of items) {
      uniqueItems.set(item.media.localPath ?? item.media.id, item);
    }

    return Array.from(uniqueItems.values());
  }

  private createItemsSignature(
    items: PlaylistSnapshot['items'],
    extraMedias: Array<PlaylistSnapshot['items'][number]['media']>,
  ) {
    return JSON.stringify({
      items: [...items]
        .sort((first, second) => first.media.id.localeCompare(second.media.id))
        .map(item => ({
          itemId: item.id,
          mediaId: item.media.id,
          localPath: item.media.localPath ?? null,
          updatedAt: item.media.updatedAt ?? null,
        })),
      extraMedias: [...extraMedias]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map(media => ({
          mediaId: media.id,
          localPath: media.localPath ?? null,
          updatedAt: media.updatedAt ?? null,
        })),
    });
  }

  private unsubscribeAll() {
    this.unsubscribePlaylist?.();
    this.unsubscribePlayback?.();
    this.unsubscribeProgramming?.();
    this.unsubscribeDeviceSession?.();

    this.unsubscribePlaylist = undefined;
    this.unsubscribePlayback = undefined;
    this.unsubscribeProgramming = undefined;
    this.unsubscribeDeviceSession = undefined;
  }

  private resetRuntimeState() {
    this.activeOccurrenceId = null;
    this.restoredState = null;
    this.lastCleanedSignature = '';
    this.lastHeartbeatPlaybackKey = -1;
    this.lastLoggedPlaybackKey = -1;
    this.lastLoggedItemId = null;
    this.lastLoggedMuted = null;
    this.playbackWasActive = false;
    this.lastOperationalState = '';
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const playerEngine = new PlayerEngine();
