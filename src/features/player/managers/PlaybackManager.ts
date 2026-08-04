import type { PlayerItem } from '../types/media';

import {
  createPlayerItemsSignature,
  sortPlayerItems,
} from '../domain/playerItem';

import { playerEventLogger } from '../logging/PlayerEventLogger';

export interface PlaybackSnapshot {
  currentItem: PlayerItem | null;
  currentIndex: number;
  totalItems: number;
  playbackKey: number;
  hasPendingPlaylist: boolean;
}

export interface PlaybackState {
  currentItem: PlayerItem | null;
  currentTime: number | null;
  duration: number | null;
  startedAt: string | null;
}

type PlaybackListener = (snapshot: PlaybackSnapshot) => void;

export class PlaybackManager {
  private playlist: PlayerItem[] = [];
  private pendingPlaylist: PlayerItem[] | null = null;

  private currentIndex = 0;
  private playbackKey = 0;

  private imageTimer?: ReturnType<typeof setTimeout>;

  private currentItemStartedAt: Date | null = null;

  private currentTime = 0;

  private currentDuration: number | null = null;

  private listeners = new Set<PlaybackListener>();

  load(items: PlayerItem[]) {
    const orderedItems = sortPlayerItems(items);

    if (orderedItems.length === 0) {
      this.stop();
      return;
    }

    /*
     * A programação recebida já é igual à
     * playlist que está sendo reproduzida.
     */
    if (this.isSamePlaylist(orderedItems, this.playlist)) {
      return;
    }

    if (this.playlist.length === 0) {
      this.activatePlaylist(orderedItems);

      return;
    }

    /*
     * Quando apenas o áudio do vídeo atual muda,
     * aplica imediatamente. Sem isso, a alteração
     * ficaria aguardando o vídeo terminar.
     */
    if (this.applyCurrentVideoAudioChangeNow(orderedItems)) {
      return;
    }

    /*
     * Evita guardar novamente a mesma playlist
     * que já está aguardando para ser aplicada.
     */
    if (this.isSamePlaylist(orderedItems, this.pendingPlaylist ?? [])) {
      return;
    }

    /*
     * As demais alterações continuam pendentes
     * até a mídia atual terminar, evitando cortes.
     */
    this.pendingPlaylist = orderedItems;

    this.emit();
  }

  replaceNow(items: PlayerItem[]) {
    const orderedItems = sortPlayerItems(items);

    if (orderedItems.length === 0) {
      this.stop();
      return;
    }

    this.pendingPlaylist = null;

    this.activatePlaylist(orderedItems);
  }

  next() {
    this.clearImageTimer();

    if (this.pendingPlaylist) {
      const nextPlaylist = this.pendingPlaylist;

      this.pendingPlaylist = null;

      this.activatePlaylist(nextPlaylist);

      return;
    }

    if (this.playlist.length === 0) {
      return;
    }

    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;

    this.startCurrentItem();
  }

  previous() {
    this.clearImageTimer();

    if (this.playlist.length === 0) {
      return;
    }

    this.currentIndex =
      this.currentIndex === 0
        ? this.playlist.length - 1
        : this.currentIndex - 1;

    this.startCurrentItem();
  }

  videoFinished() {
    const currentItem = this.getCurrentItem();

    if (currentItem?.media.type !== 'VIDEO') {
      return;
    }

    this.next();
  }

  videoFailed(error?: unknown) {
    const currentItem = this.getCurrentItem();

    playerEventLogger.log({
      event: 'VIDEO_PLAYBACK_FAILED',
      category: 'PLAYBACK',
      level: 'ERROR',
      message: currentItem
        ? `Falha ao reproduzir o v\u00eddeo: ${currentItem.media.name}`
        : 'Falha ao reproduzir o v\u00eddeo.',
      metadata: {
        mediaId: currentItem?.media.id ?? null,
        error: error instanceof Error ? error.message : String(error ?? ''),
      },
      dedupeKey: `video-failed:${currentItem?.media.id ?? 'unknown'}:${String(
        error,
      )}`,
      dedupeWindowMs: 30_000,
    });

    console.log('[PLAYBACK] Erro no vídeo:', error);

    this.next();
  }

  updateVideoLoaded(duration: number) {
    const normalizedDuration = this.normalizeDuration(duration);

    if (normalizedDuration === null) {
      return;
    }

    this.currentDuration = normalizedDuration;
  }

  updateVideoProgress(currentTime: number, duration?: number) {
    const normalizedCurrentTime = this.normalizeTime(currentTime);

    if (normalizedCurrentTime !== null) {
      this.currentTime = normalizedCurrentTime;
    }

    const normalizedDuration =
      typeof duration === 'number' ? this.normalizeDuration(duration) : null;

    if (normalizedDuration !== null) {
      this.currentDuration = normalizedDuration;
    }
  }

  restartCurrent() {
    if (this.playlist.length === 0) {
      return;
    }

    this.clearImageTimer();
    this.startCurrentItem();
  }

  stop() {
    this.clearImageTimer();

    this.playlist = [];
    this.pendingPlaylist = null;
    this.currentIndex = 0;

    this.resetCurrentItemState();

    this.playbackKey += 1;

    this.emit();
  }

  subscribe(listener: PlaybackListener) {
    this.listeners.add(listener);

    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getCurrentItem() {
    return this.playlist[this.currentIndex] ?? null;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getPlaylist() {
    return [...this.playlist];
  }

  getPlaybackState(): PlaybackState {
    const currentItem = this.getCurrentItem();

    if (!currentItem || !this.currentItemStartedAt) {
      return {
        currentItem: null,
        currentTime: null,
        duration: null,
        startedAt: null,
      };
    }

    const duration = this.currentDuration;

    let currentTime =
      currentItem.media.type === 'IMAGE'
        ? this.getElapsedImageTime()
        : this.currentTime;

    if (duration !== null && duration > 0) {
      currentTime = Math.min(currentTime, duration);
    }

    return {
      currentItem,
      currentTime,
      duration,

      startedAt: this.currentItemStartedAt.toISOString(),
    };
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      currentItem: this.getCurrentItem(),

      currentIndex: this.currentIndex,

      totalItems: this.playlist.length,

      playbackKey: this.playbackKey,

      hasPendingPlaylist: this.pendingPlaylist !== null,
    };
  }

  private applyCurrentVideoAudioChangeNow(nextItems: PlayerItem[]) {
    const currentItem = this.getCurrentItem();

    if (!currentItem || currentItem.media.type !== 'VIDEO') {
      return false;
    }

    const nextCurrentIndex = nextItems.findIndex(
      item => item.id === currentItem.id,
    );

    if (nextCurrentIndex < 0) {
      return false;
    }

    const nextCurrentItem = nextItems[nextCurrentIndex];

    const isSameMedia =
      nextCurrentItem.media.id === currentItem.media.id &&
      (nextCurrentItem.media.localPath ?? null) ===
        (currentItem.media.localPath ?? null);

    if (!isSameMedia) {
      return false;
    }

    const currentMuted = currentItem.muted;

    const nextMuted = nextCurrentItem.muted;

    if (currentMuted === nextMuted) {
      return false;
    }

    /*
     * Substitui os dados da playlist mantendo o
     * mesmo item selecionado. startCurrentItem()
     * aumenta o playbackKey e força o componente
     * Video a receber o novo estado de áudio.
     */
    this.playlist = nextItems;

    this.pendingPlaylist = null;

    this.currentIndex = nextCurrentIndex;

    this.startCurrentItem();

    console.log('[PLAYBACK] Áudio atualizado imediatamente:', {
      itemId: nextCurrentItem.id,

      muted: nextMuted,
    });

    return true;
  }

  private activatePlaylist(items: PlayerItem[]) {
    this.clearImageTimer();

    this.playlist = items;
    this.currentIndex = 0;

    this.startCurrentItem();
  }

  private startCurrentItem() {
    this.clearImageTimer();

    const currentItem = this.getCurrentItem();

    if (!currentItem) {
      this.resetCurrentItemState();
      this.emit();

      return;
    }

    this.playbackKey += 1;

    this.currentItemStartedAt = new Date();

    this.currentTime = 0;

    this.currentDuration =
      currentItem.media.type === 'IMAGE'
        ? this.getImageDuration(currentItem)
        : this.getVideoDuration(currentItem);

    this.emit();

    if (currentItem.media.type === 'IMAGE') {
      this.startImageTimer(currentItem);
    }
  }

  private startImageTimer(item: PlayerItem) {
    const duration = this.getImageDuration(item);

    this.imageTimer = setTimeout(() => {
      this.next();
    }, duration * 1000);
  }

  private resetCurrentItemState() {
    this.currentItemStartedAt = null;

    this.currentTime = 0;

    this.currentDuration = null;
  }

  private getElapsedImageTime() {
    if (!this.currentItemStartedAt) {
      return 0;
    }

    return Math.floor(
      Math.max(0, Date.now() - this.currentItemStartedAt.getTime()) / 1000,
    );
  }

  private getImageDuration(item: PlayerItem) {
    return this.normalizeDuration(Number(item.duration)) ?? 5;
  }

  private getVideoDuration(item: PlayerItem) {
    return this.normalizeDuration(Number(item.media.duration));
  }

  private normalizeDuration(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.floor(value);
  }

  private normalizeTime(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.floor(value);
  }

  private clearImageTimer() {
    if (!this.imageTimer) {
      return;
    }

    clearTimeout(this.imageTimer);

    this.imageTimer = undefined;
  }

  private emit() {
    const snapshot = this.getSnapshot();

    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {
        console.log('[PLAYBACK] Erro em listener:', error);
      }
    });
  }

  private isSamePlaylist(first: PlayerItem[], second: PlayerItem[]) {
    return (
      createPlayerItemsSignature(first) === createPlayerItemsSignature(second)
    );
  }
}

export const playbackManager = new PlaybackManager();
