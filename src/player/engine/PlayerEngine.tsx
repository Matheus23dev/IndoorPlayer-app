import {
  cacheManager,
} from '../managers/CacheManager';

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
  syncManager,
} from '../managers/SyncManager';

import {
  playerState,
} from '../state/PlayerState';

interface SavedPlayerState {
  items:
    PlaylistSnapshot['items'];

  playlistId:
    string;

  scheduleId:
    string;

  hash:
    string;
}

class PlayerEngine {
  private started =
    false;

  private unsubscribePlaylist:
    | (() => void)
    | undefined;

  private unsubscribePlayback:
    | (() => void)
    | undefined;

  private lastCleanedSignature =
    '';

  private lastHeartbeatPlaybackKey =
    -1;

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;

    await this.restoreSavedPlaylist();

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

    heartbeatManager.start();

    syncManager.start();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started =
      false;

    syncManager.stop();

    heartbeatManager.stop();

    playbackManager.stop();

    if (
      this.unsubscribePlaylist
    ) {
      this.unsubscribePlaylist();

      this.unsubscribePlaylist =
        undefined;
    }

    if (
      this.unsubscribePlayback
    ) {
      this.unsubscribePlayback();

      this.unsubscribePlayback =
        undefined;
    }

    this.lastCleanedSignature =
      '';

    this.lastHeartbeatPlaybackKey =
      -1;
  }

  async forceSync() {
    await syncManager.forceSync();
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
      playbackManager.stop();

      this.lastCleanedSignature =
        '';

      void playerState.clear();

      return;
    }

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
    };

    void playerState
      .save(state)
      .catch(error => {
        console.log(
          '[ENGINE] Erro ao salvar estado:',
          error,
        );
      });

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

    const latestItems =
      playlistManager.getCurrent();

    if (
      activeItems.length ===
        0 ||
      latestItems.length ===
        0
    ) {
      return;
    }

    const activeSignature =
      this.createItemsSignature(
        activeItems,
      );

    const latestSignature =
      this.createItemsSignature(
        latestItems,
      );

    if (
      activeSignature !==
      latestSignature
    ) {
      return;
    }

    if (
      activeSignature ===
      this.lastCleanedSignature
    ) {
      return;
    }

    this.lastCleanedSignature =
      activeSignature;

    void cacheManager
      .clean(activeItems)
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
        );

      if (!isValid) {
        await playerState.clear();

        return;
      }

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
    } catch (error) {
      console.log(
        '[ENGINE] Erro ao restaurar playlist:',
        error,
      );

      await playerState.clear();
    }
  }

  private createItemsSignature(
    items:
      PlaylistSnapshot['items'],
  ) {
    return JSON.stringify(
      [
        ...items,
      ]
        .sort(
          (
            first,
            second,
          ) =>
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

export const playerEngine =
  new PlayerEngine();