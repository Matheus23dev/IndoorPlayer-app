import { api } from '../../../core/api/client';

import { getDeviceToken } from '../../../core/storage/deviceStorage';

import { playbackManager } from './PlaybackManager';

import { playlistManager } from './PlaylistManager';

import { playerEventLogger } from '../logging/PlayerEventLogger';

export class HeartbeatManager {
  private readonly intervalMs = 10_000;

  private interval: ReturnType<typeof setInterval> | undefined;

  private started = false;

  private sending = false;

  private sendPending = false;

  private lastSendFailed = false;

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.send();

    this.interval = setInterval(() => {
      void this.send();
    }, this.intervalMs);
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;

    this.sendPending = false;

    this.clearHeartbeatInterval();
  }

  async send() {
    if (this.sending) {
      this.sendPending = true;

      return;
    }

    this.sending = true;

    try {
      do {
        this.sendPending = false;

        try {
          const token = await getDeviceToken();

          if (!token) {
            return;
          }

          const payload = this.createHeartbeatPayload();

          await api.post('/devices/heartbeat', payload);

          if (this.lastSendFailed) {
            this.lastSendFailed = false;

            playerEventLogger.log({
              event: 'HEARTBEAT_RESTORED',
              category: 'CONNECTION',
              level: 'SUCCESS',
              message: 'O envio de status do Player foi restabelecido.',
            });
          }

          console.log('[HEARTBEAT] Enviado.');
        } catch (error) {
          const errorInfo = this.getErrorInfo(error);

          if (!this.lastSendFailed) {
            playerEventLogger.log({
              event: 'HEARTBEAT_FAILED',
              category: 'CONNECTION',
              level: 'ERROR',
              message:
                'O Player n\u00e3o conseguiu enviar seu status para a API.',
              metadata: {
                status: errorInfo.status,
                error: Array.isArray(errorInfo.message)
                  ? errorInfo.message.join(' ')
                  : String(errorInfo.message),
              },
              dedupeWindowMs: 30_000,
            });
          }

          this.lastSendFailed = true;

          console.log('[HEARTBEAT] Falha ao enviar:', errorInfo);
        }
      } while (this.sendPending);
    } finally {
      this.sending = false;
    }
  }

  isRunning() {
    return this.started;
  }

  private createHeartbeatPayload() {
    const playback = playbackManager.getPlaybackState();

    const currentItem = playback.currentItem;

    return {
      playlistId: currentItem ? playlistManager.getPlaylistId() : null,

      playlistItemId: currentItem?.id ?? null,

      mediaId: currentItem?.media.id ?? null,

      currentTime: playback.currentTime,

      duration: playback.duration,

      muted: currentItem?.media.type === 'VIDEO' ? currentItem.muted : null,

      startedAt: playback.startedAt,
    };
  }

  private clearHeartbeatInterval() {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);

    this.interval = undefined;
  }

  private getErrorInfo(error: unknown) {
    const parsedError = error as {
      response?: {
        status?: number;
        data?: {
          message?: string | string[];
        };
      };
      message?: string;
    };

    return {
      status: parsedError.response?.status ?? null,

      message:
        parsedError.response?.data?.message ??
        parsedError.message ??
        'Erro desconhecido',
    };
  }
}

export const heartbeatManager = new HeartbeatManager();
