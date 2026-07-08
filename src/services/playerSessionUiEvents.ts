import type {
  DeviceSessionEvent,
} from './deviceSessionEvents';

type PlayerSessionUiListener = (
  event:
    DeviceSessionEvent,
) => void;

class PlayerSessionUiEvents {
  private listeners =
    new Set<
      PlayerSessionUiListener
    >();

  private pendingEvent:
    DeviceSessionEvent |
    null =
      null;

  subscribe(
    listener:
      PlayerSessionUiListener,
  ) {
    this.listeners.add(
      listener,
    );

    /*
     * Caso a sessão tenha terminado durante uma
     * pequena troca de renderização, entrega o
     * evento pendente assim que a PlayerScreen
     * estiver inscrita novamente.
     */
    if (this.pendingEvent) {
      const event =
        this.pendingEvent;

      this.pendingEvent =
        null;

      setTimeout(
        () => {
          if (
            this.listeners.has(
              listener,
            )
          ) {
            listener(
              event,
            );
          }
        },
        0,
      );
    }

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  emit(
    event:
      DeviceSessionEvent,
  ) {
    if (
      this.listeners.size ===
      0
    ) {
      this.pendingEvent =
        event;

      console.log(
        '[PLAYER UI] Retorno à ativação ficou pendente.',
      );

      return;
    }

    this.pendingEvent =
      null;

    this.listeners.forEach(
      listener => {
        try {
          listener(
            event,
          );
        } catch (error) {
          console.log(
            '[PLAYER UI] Erro ao avisar a tela:',
            error,
          );
        }
      },
    );
  }
}

export const playerSessionUiEvents =
  new PlayerSessionUiEvents();
