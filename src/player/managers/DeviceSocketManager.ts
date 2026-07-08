import {
  io,
  type Socket,
} from 'socket.io-client';

import {
  api,
} from '../../services/api';

import {
  getDeviceCode,
  getDeviceToken,
} from '../../storage/device';

import type {
  DeviceSessionEvent,
} from '../../services/deviceSessionEvents';

interface ProgrammingChangedEvent {
  deviceId:
    string;

  reason:
    string;

  entityId:
    | string
    | null;

  emittedAt:
    string;
}

interface DeviceStatusResponse {
  id:
    string;

  code:
    string;

  name:
    string | null;

  isLinked:
    boolean;
}

export type DeviceSessionEndedEvent =
  DeviceSessionEvent;

interface StartOptions {
  onProgrammingChanged: () =>
    | void
    | Promise<void>;

  onDeviceSessionEnded: (
    event:
      DeviceSessionEndedEvent,
  ) =>
    | void
    | Promise<void>;
}

class DeviceSocketManager {
  private socket:
    Socket | null =
      null;

  private options:
    StartOptions | null =
      null;

  private sessionEnding =
    false;

  private serverDisconnectCheck:
    | ReturnType<typeof setTimeout>
    | undefined;

  async start(
    options:
      StartOptions,
  ) {
    this.options =
      options;

    this.sessionEnding =
      false;

    this.clearServerDisconnectCheck();

    if (this.socket) {
      return;
    }

    const token =
      await getDeviceToken();

    if (!token) {
      await this
        .triggerSessionEnded({
          deviceId:
            null,

          reason:
            'UNAUTHORIZED',

          keepCode:
            true,

          emittedAt:
            new Date()
              .toISOString(),
        });

      return;
    }

    this.socket =
      io(
        this.getSocketUrl(),
        {
          transports: [
            'websocket',
          ],

          auth: {
            token,
          },

          reconnection:
            true,

          reconnectionAttempts:
            Infinity,

          reconnectionDelay:
            1_000,

          reconnectionDelayMax:
            10_000,

          timeout:
            15_000,
        },
      );

    this.socket.on(
      'connect',
      () => {
        console.log(
          '[SOCKET] TV autenticada:',
          this.socket?.id,
        );

        void this
          .triggerSync();
      },
    );

    this.socket.on(
      'programming:changed',
      (
        event:
          ProgrammingChangedEvent,
      ) => {
        console.log(
          '[SOCKET] Programação alterada:',
          event,
        );

        void this
          .triggerSync();
      },
    );

    this.socket.on(
      'device:unlinked',
      (
        event:
          DeviceSessionEndedEvent,
      ) => {
        console.log(
          '[SOCKET] Sessão encerrada:',
          event,
        );

        void this
          .triggerSessionEnded(
            event,
          );
      },
    );

    this.socket.on(
      'disconnect',
      reason => {
        console.log(
          '[SOCKET] Desconectado:',
          reason,
        );

        /*
         * Quando a API usa disconnectSockets(true),
         * o Socket.IO informa "io server disconnect"
         * e não tenta reconectar automaticamente.
         *
         * Mesmo que o evento device:unlinked seja
         * perdido, conferimos o código na API para
         * descobrir se a TV foi desvinculada ou excluída.
         */
        if (
          reason ===
            'io server disconnect' &&
          !this.sessionEnding
        ) {
          void this
            .verifySessionAfterServerDisconnect();
        }
      },
    );

    this.socket.on(
      'connect_error',
      error => {
        console.log(
          '[SOCKET] Erro de conexão:',
          error.message,
        );

        if (
          error.message ===
          'UNAUTHORIZED'
        ) {
          void this
            .triggerSessionEnded({
              deviceId:
                null,

              reason:
                'UNAUTHORIZED',

              keepCode:
                true,

              emittedAt:
                new Date()
                  .toISOString(),
            });
        }
      },
    );
  }

  stop() {
    this.clearServerDisconnectCheck();

    if (this.socket) {
      this.socket
        .removeAllListeners();

      this.socket
        .disconnect();
    }

    this.socket =
      null;

    this.options =
      null;

    this.sessionEnding =
      false;
  }

  isConnected() {
    return (
      this.socket
        ?.connected ??
      false
    );
  }

  private async verifySessionAfterServerDisconnect() {
    if (
      this.sessionEnding
    ) {
      return;
    }

    try {
      const code =
        await getDeviceCode();

      if (!code) {
        await this
          .triggerSessionEnded({
            deviceId:
              null,

            reason:
              'DELETED',

            keepCode:
              false,

            emittedAt:
              new Date()
                .toISOString(),
          });

        return;
      }

      const response =
        await api.get<
          DeviceStatusResponse
        >(
          `/devices/code/${encodeURIComponent(
            code,
          )}`,
        );

      if (
        !response.data
          .isLinked
      ) {
        await this
          .triggerSessionEnded({
            deviceId:
              response.data.id,

            reason:
              'UNLINKED',

            keepCode:
              true,

            emittedAt:
              new Date()
                .toISOString(),
          });

        return;
      }

      /*
       * O registro ainda existe e continua
       * vinculado. Reconecta porque o servidor
       * encerrou a conexão anterior.
       */
      if (
        this.socket &&
        !this.socket.connected
      ) {
        this.socket.connect();
      }
    } catch (error: any) {
      const status =
        error?.response?.status;

      if (
        status === 404
      ) {
        await this
          .triggerSessionEnded({
            deviceId:
              null,

            reason:
              'DELETED',

            keepCode:
              false,

            emittedAt:
              new Date()
                .toISOString(),
          });

        return;
      }

      console.log(
        '[SOCKET] Falha ao verificar sessão após desconexão:',
        {
          status:
            status ??
            null,

          message:
            error?.response?.data?.message ??
            error?.message ??
            'Erro desconhecido',
        },
      );

      /*
       * Em uma falha temporária de rede, tenta
       * novamente sem apagar o cadastro da TV.
       */
      this.clearServerDisconnectCheck();

      this.serverDisconnectCheck =
        setTimeout(
          () => {
            void this
              .verifySessionAfterServerDisconnect();
          },
          3_000,
        );
    }
  }

  private async triggerSync() {
    try {
      await this.options
        ?.onProgrammingChanged();
    } catch (error) {
      console.log(
        '[SOCKET] Erro ao sincronizar:',
        error,
      );
    }
  }

  private async triggerSessionEnded(
    event:
      DeviceSessionEndedEvent,
  ) {
    if (this.sessionEnding) {
      return;
    }

    this.sessionEnding =
      true;

    this.clearServerDisconnectCheck();

    try {
      await this.options
        ?.onDeviceSessionEnded(
          event,
        );
    } catch (error) {
      this.sessionEnding =
        false;

      console.log(
        '[SOCKET] Erro ao encerrar sessão:',
        error,
      );
    }
  }

  private clearServerDisconnectCheck() {
    if (
      !this.serverDisconnectCheck
    ) {
      return;
    }

    clearTimeout(
      this.serverDisconnectCheck,
    );

    this.serverDisconnectCheck =
      undefined;
  }

  private getSocketUrl() {
    const baseUrl =
      String(
        api.defaults.baseURL ??
        '',
      )
        .replace(
          /\/+$/,
          '',
        )
        .replace(
          /\/api$/,
          '',
        );

    if (!baseUrl) {
      throw new Error(
        'URL da API não configurada.',
      );
    }

    return `${baseUrl}/devices`;
  }
}

export const deviceSocketManager =
  new DeviceSocketManager();
