import type { PlayerItem } from '../types/media';
import type { PlaylistOrientation } from '../types/programming';

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
}

interface SetPlaylistOptions {
  playlistId: string;
  scheduleId: string;
  hash: string;
  orientation: PlaylistOrientation;
}

type PlaylistListener = (snapshot: PlaylistSnapshot) => void;

class PlaylistManager {
  private items: PlayerItem[] = [];

  private playlistId: string | null = null;
  private scheduleId: string | null = null;
  private hash: string | null = null;
  private orientation: PlaylistOrientation = 'LANDSCAPE';
  private itemsSignature = '';

  private listeners = new Set<PlaylistListener>();

  setPlaylist(items: PlayerItem[], options: SetPlaylistOptions) {
    const normalizedItems = sortPlayerItems(items);

    const nextItemsSignature = createPlayerItemsSignature(normalizedItems);

    const isSamePlaylist =
      this.playlistId === options.playlistId &&
      this.scheduleId === options.scheduleId &&
      this.hash === options.hash &&
      this.orientation === options.orientation &&
      this.itemsSignature === nextItemsSignature;

    if (isSamePlaylist) {
      console.log('[PLAYLIST] Nenhuma alteração encontrada.');

      return false;
    }

    this.items = normalizedItems;
    this.playlistId = options.playlistId;
    this.scheduleId = options.scheduleId;
    this.hash = options.hash;
    this.orientation = options.orientation;
    this.itemsSignature = nextItemsSignature;

    console.log('[PLAYLIST] Playlist atualizada:', {
      playlistId: this.playlistId,
      scheduleId: this.scheduleId,
      totalItems: this.items.length,
      orientation: this.orientation,
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
      this.itemsSignature === ''
    );
  }

  private reset() {
    this.items = [];
    this.playlistId = null;
    this.scheduleId = null;
    this.hash = null;
    this.orientation = 'LANDSCAPE';
    this.itemsSignature = '';
  }
}

export const playlistManager = new PlaylistManager();
