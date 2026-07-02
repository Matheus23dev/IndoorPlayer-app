import type {
  PlayerItem,
} from '../types/Player';

export interface PlaybackSnapshot {
  currentItem:
    PlayerItem | null;

  currentIndex:
    number;

  totalItems:
    number;

  playbackKey:
    number;

  hasPendingPlaylist:
    boolean;
}

export interface PlaybackState {
  currentItem:
    PlayerItem | null;

  currentTime:
    number | null;

  duration:
    number | null;

  startedAt:
    string | null;
}

type PlaybackListener = (
  snapshot:
    PlaybackSnapshot,
) => void;

class PlaybackManager {
  private playlist:
    PlayerItem[] = [];

  private pendingPlaylist:
    | PlayerItem[]
    | null = null;

  private currentIndex = 0;

  private playbackKey = 0;

  private imageTimer:
    | ReturnType<
        typeof setTimeout
      >
    | undefined;

  private currentItemStartedAt:
    | Date
    | null = null;

  private currentTime = 0;

  private currentDuration:
    | number
    | null = null;

  private listeners =
    new Set<
      PlaybackListener
    >();

  load(
    items: PlayerItem[],
  ) {
    const orderedItems =
      this.normalizePlaylist(
        items,
      );

    if (
      orderedItems.length === 0
    ) {
      this.stop();
      return;
    }

    const newSignature =
      this.createSignature(
        orderedItems,
      );

    const currentSignature =
      this.createSignature(
        this.playlist,
      );

    const pendingSignature =
      this.pendingPlaylist
        ? this.createSignature(
            this.pendingPlaylist,
          )
        : '';

    if (
      newSignature ===
        currentSignature ||
      newSignature ===
        pendingSignature
    ) {
      return;
    }

    if (
      this.playlist.length === 0
    ) {
      this.activatePlaylist(
        orderedItems,
      );

      return;
    }

    this.pendingPlaylist =
      orderedItems;

    this.emit();
  }

  replaceNow(
    items: PlayerItem[],
  ) {
    const orderedItems =
      this.normalizePlaylist(
        items,
      );

    if (
      orderedItems.length === 0
    ) {
      this.stop();
      return;
    }

    this.pendingPlaylist =
      null;

    this.activatePlaylist(
      orderedItems,
    );
  }

  next() {
    this.clearImageTimer();

    if (
      this.pendingPlaylist
    ) {
      const nextPlaylist =
        this.pendingPlaylist;

      this.pendingPlaylist =
        null;

      this.activatePlaylist(
        nextPlaylist,
      );

      return;
    }

    if (
      this.playlist.length === 0
    ) {
      return;
    }

    this.currentIndex =
      (
        this.currentIndex +
        1
      ) %
      this.playlist.length;

    this.startCurrentItem();
  }

  previous() {
    this.clearImageTimer();

    if (
      this.playlist.length === 0
    ) {
      return;
    }

    this.currentIndex =
      this.currentIndex === 0
        ? this.playlist.length -
          1
        : this.currentIndex -
          1;

    this.startCurrentItem();
  }

  videoFinished() {
    const currentItem =
      this.getCurrentItem();

    if (
      currentItem?.media
        .type !== 'VIDEO'
    ) {
      return;
    }

    this.next();
  }

  videoFailed(
    error?: unknown,
  ) {
    console.log(
      '[PLAYBACK] Erro no vídeo:',
      error,
    );

    this.next();
  }

  updateVideoLoaded(
    duration: number,
  ) {
    if (
      !Number.isFinite(
        duration,
      ) ||
      duration <= 0
    ) {
      return;
    }

    this.currentDuration =
      Math.floor(duration);
  }

  updateVideoProgress(
    currentTime: number,
    duration?: number,
  ) {
    if (
      Number.isFinite(
        currentTime,
      ) &&
      currentTime >= 0
    ) {
      this.currentTime =
        Math.floor(
          currentTime,
        );
    }

    if (
      typeof duration ===
        'number' &&
      Number.isFinite(
        duration,
      ) &&
      duration > 0
    ) {
      this.currentDuration =
        Math.floor(
          duration,
        );
    }
  }

  restartCurrent() {
    if (
      this.playlist.length === 0
    ) {
      return;
    }

    this.clearImageTimer();

    this.startCurrentItem();
  }

  stop() {
    this.clearImageTimer();

    this.playlist = [];

    this.pendingPlaylist =
      null;

    this.currentIndex = 0;

    this.currentItemStartedAt =
      null;

    this.currentTime = 0;

    this.currentDuration =
      null;

    this.playbackKey += 1;

    this.emit();
  }

  subscribe(
    listener:
      PlaybackListener,
  ) {
    this.listeners.add(
      listener,
    );

    listener(
      this.getSnapshot(),
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  getCurrentItem() {
    return (
      this.playlist[
        this.currentIndex
      ] ?? null
    );
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getPlaylist() {
    return [
      ...this.playlist,
    ];
  }

  getPlaybackState():
    PlaybackState {
    const currentItem =
      this.getCurrentItem();

    if (
      !currentItem ||
      !this.currentItemStartedAt
    ) {
      return {
        currentItem: null,
        currentTime: null,
        duration: null,
        startedAt: null,
      };
    }

    let currentTime =
      this.currentTime;

    if (
      currentItem.media
        .type === 'IMAGE'
    ) {
      currentTime =
        Math.floor(
          Math.max(
            0,
            Date.now() -
              this.currentItemStartedAt.getTime(),
          ) / 1000,
        );
    }

    const duration =
      this.currentDuration;

    if (
      duration !== null &&
      duration > 0
    ) {
      currentTime =
        Math.min(
          currentTime,
          duration,
        );
    }

    return {
      currentItem,
      currentTime,
      duration,

      startedAt:
        this.currentItemStartedAt.toISOString(),
    };
  }

  getSnapshot():
    PlaybackSnapshot {
    return {
      currentItem:
        this.getCurrentItem(),

      currentIndex:
        this.currentIndex,

      totalItems:
        this.playlist.length,

      playbackKey:
        this.playbackKey,

      hasPendingPlaylist:
        this.pendingPlaylist !==
        null,
    };
  }

  private activatePlaylist(
    items: PlayerItem[],
  ) {
    this.clearImageTimer();

    this.playlist =
      items;

    this.currentIndex = 0;

    this.startCurrentItem();
  }

  private startCurrentItem() {
    const currentItem =
      this.getCurrentItem();

    if (!currentItem) {
      this.currentItemStartedAt =
        null;

      this.currentTime = 0;

      this.currentDuration =
        null;

      this.emit();

      return;
    }

    this.playbackKey += 1;

    this.currentItemStartedAt =
      new Date();

    this.currentTime = 0;

    this.currentDuration =
      currentItem.media.type ===
      'IMAGE'
        ? this.getImageDuration(
            currentItem,
          )
        : this.getVideoDuration(
            currentItem,
          );

    this.emit();

    if (
      currentItem.media.type ===
      'IMAGE'
    ) {
      const duration =
        this.getImageDuration(
          currentItem,
        );

      this.imageTimer =
        setTimeout(() => {
          this.next();
        }, duration * 1000);
    }
  }

  private getImageDuration(
    item: PlayerItem,
  ) {
    const duration =
      Number(item.duration);

    if (
      !Number.isFinite(
        duration,
      ) ||
      duration <= 0
    ) {
      return 5;
    }

    return Math.floor(
      duration,
    );
  }

  private getVideoDuration(
    item: PlayerItem,
  ) {
    const duration =
      Number(
        item.media.duration,
      );

    if (
      !Number.isFinite(
        duration,
      ) ||
      duration <= 0
    ) {
      return null;
    }

    return Math.floor(
      duration,
    );
  }

  private clearImageTimer() {
    if (!this.imageTimer) {
      return;
    }

    clearTimeout(
      this.imageTimer,
    );

    this.imageTimer =
      undefined;
  }

  private emit() {
    const snapshot =
      this.getSnapshot();

    this.listeners.forEach(
      listener => {
        listener(snapshot);
      },
    );
  }

  private normalizePlaylist(
    items: PlayerItem[],
  ) {
    return [
      ...items,
    ].sort(
      (
        first,
        second,
      ) =>
        first.order -
        second.order,
    );
  }

  private createSignature(
    items: PlayerItem[],
  ) {
    if (
      items.length === 0
    ) {
      return '';
    }

    return JSON.stringify(
      items.map(item => ({
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
      })),
    );
  }
}

export const playbackManager =
  new PlaybackManager();