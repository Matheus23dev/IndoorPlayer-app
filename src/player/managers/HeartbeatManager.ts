import {
  api,
} from '../../services/api';

import {
  getDeviceToken,
} from '../../storage/device';

import {
  playbackManager,
} from './PlaybackManager';

import {
  playlistManager,
} from './PlaylistManager';

class HeartbeatManager {
  private readonly intervalMs =
    30_000;

  private interval:
    | ReturnType<
        typeof setInterval
      >
    | undefined;

  private started =
    false;

  private sending =
    false;

  start() {
    if (this.started) {
      return;
    }

    this.started =
      true;

    void this.send();

    this.interval =
      setInterval(
        () => {
          void this.send();
        },
        this.intervalMs,
      );
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started =
      false;

    if (this.interval) {
      clearInterval(
        this.interval,
      );

      this.interval =
        undefined;
    }
  }

  async send() {
    if (this.sending) {
      return;
    }

    this.sending =
      true;

    try {
      const token =
        await getDeviceToken();

      if (!token) {
        return;
      }

      const playback =
        playbackManager
          .getPlaybackState();

      const currentItem =
        playback.currentItem;

      await api.post(
        '/devices/heartbeat',
        {
          playlistId:
            currentItem
              ? playlistManager
                  .getPlaylistId()
              : null,

          playlistItemId:
            currentItem?.id ??
            null,

          mediaId:
            currentItem
              ?.media.id ??
            null,

          currentTime:
            playback.currentTime,

          duration:
            playback.duration,

          startedAt:
            playback.startedAt,
        },
      );

      console.log(
        '[HEARTBEAT] Enviado.',
      );
    } catch (error: any) {
      console.log(
        '[HEARTBEAT] Falha ao enviar:',
        {
          status:
            error?.response?.status ??
            null,

          message:
            error?.response?.data?.message ??
            error?.message ??
            'Erro desconhecido',
        },
      );
    } finally {
      this.sending =
        false;
    }
  }

  isRunning() {
    return this.started;
  }
}

export const heartbeatManager =
  new HeartbeatManager();
