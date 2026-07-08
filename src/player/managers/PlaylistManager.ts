import type {
  PlayerItem,
} from '../types/Player';

export interface PlaylistSnapshot {
  items: PlayerItem[];
  playlistId: string | null;
  scheduleId: string | null;
  hash: string | null;
}

interface SetPlaylistOptions {
  playlistId: string;
  scheduleId: string;
  hash: string;
}

type PlaylistListener = (
  snapshot: PlaylistSnapshot,
) => void;

class PlaylistManager {
  private items: PlayerItem[] = [];

  private playlistId: string | null =
    null;

  private scheduleId: string | null =
    null;

  private hash: string | null = null;

  private listeners =
    new Set<PlaylistListener>();

  setPlaylist(
    items: PlayerItem[],
    options: SetPlaylistOptions,
  ) {
    const normalizedItems =
      this.normalizeItems(items);

    const isSamePlaylist =
      this.hash === options.hash &&
      this.playlistId ===
        options.playlistId &&
      this.scheduleId ===
        options.scheduleId;

    if (isSamePlaylist) {
      console.log(
        '[PLAYLIST] Nenhuma alteração encontrada.',
      );

      return false;
    }

    this.items = normalizedItems;
    this.playlistId = options.playlistId;
    this.scheduleId = options.scheduleId;
    this.hash = options.hash;

    console.log(
      '[PLAYLIST] Playlist atualizada:',
      {
        playlistId:
          this.playlistId,
        scheduleId:
          this.scheduleId,
        totalItems:
          this.items.length,
      },
    );

    this.emit();

    return true;
  }

  clear() {
    const alreadyEmpty =
      this.items.length === 0 &&
      this.playlistId === null &&
      this.scheduleId === null &&
      this.hash === null;

    if (alreadyEmpty) {
      return false;
    }

    this.items = [];
    this.playlistId = null;
    this.scheduleId = null;
    this.hash = null;

    console.log(
      '[PLAYLIST] Playlist removida.',
    );

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

  hasPlaylist() {
    return this.items.length > 0;
  }

  getSnapshot(): PlaylistSnapshot {
    return {
      items: [...this.items],
      playlistId:
        this.playlistId,
      scheduleId:
        this.scheduleId,
      hash: this.hash,
    };
  }

  subscribe(
    listener: PlaylistListener,
  ) {
    this.listeners.add(listener);

    listener(
      this.getSnapshot(),
    );

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot =
      this.getSnapshot();

    this.listeners.forEach(
      listener => {
        try {
          listener(snapshot);
        } catch (error) {
          console.log(
            '[PLAYLIST] Erro no listener:',
            error,
          );
        }
      },
    );
  }

  private normalizeItems(
    items: PlayerItem[],
  ) {
    return [...items].sort(
      (first, second) =>
        first.order - second.order,
    );
  }
}

export const playlistManager =
  new PlaylistManager();
