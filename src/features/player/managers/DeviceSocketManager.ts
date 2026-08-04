import { io, type Socket } from 'socket.io-client';

import { api } from '../../../core/api/client';

import {
  getDeviceCode,
  getDeviceToken,
} from '../../../core/storage/deviceStorage';

import type { DeviceSessionEvent } from '../../../core/events/deviceSessionEvents';

import {
  playerEventLogger,
  type PlayerLogEvent,
} from '../logging/PlayerEventLogger';

interface ProgrammingChangedEvent {
  deviceId: string;
  reason: string;
  entityId: string | null;
  emittedAt: string;
}

interface DeviceStatusResponse {
  id: string;
  code: string;
  name: string | null;
  isLinked: boolean;
}

export type DeviceSessionEndedEvent = DeviceSessionEvent;

type SessionEndReason = DeviceSessionEndedEvent['reason'];

interface StartOptions {
  onProgrammingChanged: () => void | Promise<void>;

  onDeviceSessionEnded: (
    event: DeviceSessionEndedEvent,
  ) => void | Promise<void>;
}

class DeviceSocketManager {
  private socket: Socket | null = null;
  private options: StartOptions | null = null;

  private starting = false;
  private sessionEnding = false;
  private verifyingSession = false;

  private serverDisconnectCheck?: ReturnType<typeof setTimeout>;

  constructor() {
    playerEventLogger.setTransport(event => this.sendPlayerLog(event));
  }

  async start(options: StartOptions) {
    this.options = options;

    if (this.starting) {
      return;
    }

    this.starting = true;
    this.sessionEnding = false;

    this.clearServerDisconnectCheck();

    try {
      const token = await getDeviceToken();

      if (!token) {
        await this.triggerSessionEnded(
          this.createSessionEvent('UNAUTHORIZED', true),
        );

        return;
      }

      if (this.socket) {
        this.socket.auth = {
          token,
        };

        if (!this.socket.connected) {
          this.socket.connect();
        }

        return;
      }

      this.socket = io(this.getSocketUrl(), {
        transports: ['websocket'],

        auth: {
          token,
        },

        reconnection: true,

        reconnectionAttempts: Infinity,

        reconnectionDelay: 1_000,

        reconnectionDelayMax: 10_000,

        timeout: 15_000,
      });

      this.registerSocketListeners();
    } finally {
      this.starting = false;
    }
  }

  stop() {
    this.clearServerDisconnectCheck();

    this.socket?.removeAllListeners();
    this.socket?.disconnect();

    this.socket = null;
    this.options = null;

    this.starting = false;
    this.sessionEnding = false;
    this.verifyingSession = false;
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }

  private registerSocketListeners() {
    const socket = this.socket;

    if (!socket) {
      return;
    }

    socket.on('connect', () => {
      void playerEventLogger.flush();

      console.log('[SOCKET] TV autenticada:', socket.id);

      void this.triggerSync();
    });

    socket.on('programming:changed', (event: ProgrammingChangedEvent) => {
      playerEventLogger.log({
        event: 'PROGRAMMING_CHANGE_RECEIVED',
        category: 'PROGRAMMING',
        level: 'INFO',
        message:
          'Altera\u00e7\u00e3o de programa\u00e7\u00e3o recebida em tempo real.',
        metadata: {
          reason: event.reason,
          entityId: event.entityId,
        },
        dedupeKey: `programming-change:${event.reason}:${event.entityId ?? ''}`,
        dedupeWindowMs: 1_000,
      });

      console.log('[SOCKET] Programação alterada:', event);

      void this.triggerSync();
    });

    socket.on('device:unlinked', (event: DeviceSessionEndedEvent) => {
      console.log('[SOCKET] Sessão encerrada:', event);

      void this.triggerSessionEnded(event);
    });

    socket.on('disconnect', reason => {
      playerEventLogger.log({
        event: 'SOCKET_DISCONNECTED',
        category: 'CONNECTION',
        level: 'WARNING',
        message: 'A conex\u00e3o em tempo real com a API foi interrompida.',
        metadata: {
          reason,
        },
        dedupeKey: `socket-disconnected:${reason}`,
        dedupeWindowMs: 15_000,
      });

      console.log('[SOCKET] Desconectado:', reason);

      if (reason === 'io server disconnect' && !this.sessionEnding) {
        void this.verifySessionAfterServerDisconnect();
      }
    });

    socket.on('connect_error', error => {
      const message = error.message ?? '';

      playerEventLogger.log({
        event: 'SOCKET_CONNECTION_ERROR',
        category: 'CONNECTION',
        level: 'ERROR',
        message: 'Falha ao conectar o Player \u00e0 API.',
        metadata: {
          error: message || 'Erro desconhecido',
        },
        dedupeKey: `socket-error:${message}`,
        dedupeWindowMs: 30_000,
      });

      console.log('[SOCKET] Erro de conexão:', message);

      if (this.isUnauthorizedMessage(message)) {
        void this.triggerSessionEnded(
          this.createSessionEvent('UNAUTHORIZED', true),
        );
      }
    });
  }

  private async verifySessionAfterServerDisconnect() {
    if (this.sessionEnding || this.verifyingSession) {
      return;
    }

    this.verifyingSession = true;

    try {
      const code = await getDeviceCode();

      if (!code) {
        await this.triggerSessionEnded(
          this.createSessionEvent('DELETED', false),
        );

        return;
      }

      const response = await api.get<DeviceStatusResponse>(
        `/devices/code/${encodeURIComponent(code)}`,
      );

      if (!response.data.isLinked) {
        await this.triggerSessionEnded(
          this.createSessionEvent('UNLINKED', true, response.data.id),
        );

        return;
      }

      await this.reconnectIfNeeded();
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 404) {
        await this.triggerSessionEnded(
          this.createSessionEvent('DELETED', false),
        );

        return;
      }

      console.log('[SOCKET] Falha ao verificar sessão após desconexão:', {
        status: status ?? null,

        message:
          error?.response?.data?.message ??
          error?.message ??
          'Erro desconhecido',
      });

      this.scheduleServerDisconnectCheck();

      playerEventLogger.log({
        event: 'SESSION_VERIFICATION_FAILED',
        category: 'SESSION',
        level: 'ERROR',
        message:
          'N\u00e3o foi poss\u00edvel verificar a sess\u00e3o ap\u00f3s a desconex\u00e3o.',
        metadata: {
          status: status ?? null,
          error:
            error?.response?.data?.message ??
            error?.message ??
            'Erro desconhecido',
        },
        dedupeKey: 'session-verification-failed',
        dedupeWindowMs: 30_000,
      });
    } finally {
      this.verifyingSession = false;
    }
  }

  private async reconnectIfNeeded() {
    if (!this.socket || this.socket.connected) {
      return;
    }

    const token = await getDeviceToken();

    if (!token) {
      await this.triggerSessionEnded(
        this.createSessionEvent('UNAUTHORIZED', true),
      );

      return;
    }

    this.socket.auth = {
      token,
    };

    this.socket.connect();
  }

  private async triggerSync() {
    try {
      await this.options?.onProgrammingChanged();
    } catch (error) {
      playerEventLogger.log({
        event: 'REALTIME_SYNC_FAILED',
        category: 'SYNC',
        level: 'ERROR',
        message: 'A sincroniza\u00e7\u00e3o solicitada em tempo real falhou.',
        metadata: {
          error: this.getErrorMessage(error),
        },
        dedupeKey: 'realtime-sync-failed',
        dedupeWindowMs: 30_000,
      });

      console.log('[SOCKET] Erro ao sincronizar:', error);
    }
  }

  private async triggerSessionEnded(event: DeviceSessionEndedEvent) {
    if (this.sessionEnding) {
      return;
    }

    this.sessionEnding = true;

    this.clearServerDisconnectCheck();

    try {
      await this.options?.onDeviceSessionEnded(event);
    } catch (error) {
      this.sessionEnding = false;

      console.log('[SOCKET] Erro ao encerrar sessão:', error);
    }
  }

  private scheduleServerDisconnectCheck() {
    this.clearServerDisconnectCheck();

    this.serverDisconnectCheck = setTimeout(() => {
      void this.verifySessionAfterServerDisconnect();
    }, 3_000);
  }

  private sendPlayerLog(event: PlayerLogEvent) {
    const socket = this.socket;

    if (!socket?.connected) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>(resolve => {
      socket
        .timeout(6_000)
        .emit(
          'player:log',
          event,
          (error: Error | null, response?: { ok?: boolean }) => {
            resolve(!error && response?.ok === true);
          },
        );
    });
  }

  private clearServerDisconnectCheck() {
    if (!this.serverDisconnectCheck) {
      return;
    }

    clearTimeout(this.serverDisconnectCheck);

    this.serverDisconnectCheck = undefined;
  }

  private createSessionEvent(
    reason: SessionEndReason,
    keepCode: boolean,
    deviceId: string | null = null,
  ): DeviceSessionEndedEvent {
    return {
      deviceId,
      reason,
      keepCode,
      emittedAt: new Date().toISOString(),
    };
  }

  private isUnauthorizedMessage(message: string) {
    return message.toUpperCase().includes('UNAUTHORIZED');
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private getSocketUrl() {
    const baseUrl = String(api.defaults.baseURL ?? '')
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    if (!baseUrl) {
      throw new Error('URL da API não configurada.');
    }

    return `${baseUrl}/devices`;
  }
}

export const deviceSocketManager = new DeviceSocketManager();
