import type { PlayerItem } from '../types/media';
import type {
  PlaylistOrientation,
  ProgrammingOverlayBar,
} from '../types/programming';

import {
  createPlayerItemsSignature,
  sortPlayerItems,
} from '../domain/playerItem';

export interface PlaylistSnapshot {
  items: PlayerItem[];
  playlistId: string | null;
  scheduleId: string | null;
  hash: string | null;
  orientation: PlaylistOrientation;
  bars: ProgrammingOverlayBar[];
}

interface SetPlaylistOptions {
  playlistId: string;
  scheduleId: string;
  hash: string;
  orientation: PlaylistOrientation;
  bars: ProgrammingOverlayBar[];
}

type PlaylistListener = (snapshot: PlaylistSnapshot) => void;

class PlaylistManager {
  private items: PlayerItem[] = [];

  private playlistId: string | null = null;
  private scheduleId: string | null = null;
  private hash: string | null = null;
  private orientation: PlaylistOrientation = 'LANDSCAPE';
  private bars: ProgrammingOverlayBar[] = [];
  private itemsSignature = '';
  private barsSignature = '';

  private listeners = new Set<PlaylistListener>();

  setPlaylist(items: PlayerItem[], options: SetPlaylistOptions) {
    const normalizedItems = sortPlayerItems(items);

    const nextItemsSignature = createPlayerItemsSignature(normalizedItems);
    const normalizedBars = [...options.bars].sort(
      (first, second) => first.order - second.order,
    );
    const nextBarsSignature = JSON.stringify(
      normalizedBars.map(bar => ({
        id: bar.id,
        position: bar.position,
        sizePercent: bar.sizePercent,
        backgroundColor: bar.backgroundColor,
        opacity: bar.opacity,
        fit: bar.fit,
        contentPosition: bar.contentPosition,
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
        localPath: bar.media?.localPath ?? null,
      })),
    );

    const isSamePlaylist =
      this.playlistId === options.playlistId &&
      this.scheduleId === options.scheduleId &&
      this.hash === options.hash &&
      this.orientation === options.orientation &&
      this.itemsSignature === nextItemsSignature &&
      this.barsSignature === nextBarsSignature;

    if (isSamePlaylist) {
      console.log('[PLAYLIST] Nenhuma alteração encontrada.');

      return false;
    }

    this.items = normalizedItems;
    this.playlistId = options.playlistId;
    this.scheduleId = options.scheduleId;
    this.hash = options.hash;
    this.orientation = options.orientation;
    this.bars = normalizedBars;
    this.itemsSignature = nextItemsSignature;
    this.barsSignature = nextBarsSignature;

    console.log('[PLAYLIST] Playlist atualizada:', {
      playlistId: this.playlistId,
      scheduleId: this.scheduleId,
      totalItems: this.items.length,
      orientation: this.orientation,
      bars: this.bars.length,
    });

    this.emit();

    return true;
  }

  clear() {
    if (this.isEmpty()) {
      return false;
    }

    this.reset();

    console.log('[PLAYLIST] Playlist removida.');

    this.emit();

    return true;
  }

  getCurrent() {
    return [...this.items];
  }

  getPlaylistId() {
    return this.playlistId;
  }

  getScheduleId() {
    return this.scheduleId;
  }

  getHash() {
    return this.hash;
  }

  getOrientation() {
    return this.orientation;
  }

  getBars() {
    return this.bars.map(bar => ({
      ...bar,
      media: bar.media ? { ...bar.media } : null,
    }));
  }

  hasPlaylist() {
    return this.items.length > 0;
  }

  getSnapshot(): PlaylistSnapshot {
    return {
      items: [...this.items],
      playlistId: this.playlistId,
      scheduleId: this.scheduleId,
      hash: this.hash,
      orientation: this.orientation,
      bars: this.getBars(),
    };
  }

  subscribe(listener: PlaylistListener) {
    this.listeners.add(listener);

    this.notifyListener(listener, this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();

    this.listeners.forEach(listener => this.notifyListener(listener, snapshot));
  }

  private notifyListener(
    listener: PlaylistListener,
    snapshot: PlaylistSnapshot,
  ) {
    try {
      listener(snapshot);
    } catch (error) {
      console.log('[PLAYLIST] Erro no listener:', error);
    }
  }

  private isEmpty() {
    return (
      this.items.length === 0 &&
      this.playlistId === null &&
      this.scheduleId === null &&
      this.hash === null &&
      this.itemsSignature === '' &&
      this.barsSignature === ''
    );
  }

  private reset() {
    this.items = [];
    this.playlistId = null;
    this.scheduleId = null;
    this.hash = null;
    this.orientation = 'LANDSCAPE';
    this.bars = [];
    this.itemsSignature = '';
    this.barsSignature = '';
  }
}

export const playlistManager = new PlaylistManager();
