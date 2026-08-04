import type { DeviceSessionEvent } from './deviceSessionEvents';

type PlayerSessionUiListener = (event: DeviceSessionEvent) => void;

class PlayerSessionUiEvents {
  private listeners = new Set<PlayerSessionUiListener>();

  private pendingEvent: DeviceSessionEvent | null = null;

  subscribe(listener: PlayerSessionUiListener) {
    this.listeners.add(listener);

    this.deliverPendingEventTo(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: DeviceSessionEvent) {
    if (this.listeners.size === 0) {
      this.pendingEvent = event;

      console.log('[PLAYER UI] Retorno à ativação ficou pendente.', event);

      return;
    }

    this.pendingEvent = null;

    this.listeners.forEach(listener => {
      this.notifyListener(listener, event);
    });
  }

  clearPendingEvent() {
    this.pendingEvent = null;
  }

  hasPendingEvent() {
    return this.pendingEvent !== null;
  }

  private deliverPendingEventTo(listener: PlayerSessionUiListener) {
    if (!this.pendingEvent) {
      return;
    }

    const event = this.pendingEvent;

    setTimeout(() => {
      if (!this.listeners.has(listener)) {
        return;
      }

      if (this.pendingEvent !== event) {
        return;
      }

      this.pendingEvent = null;

      this.notifyListener(listener, event);
    }, 0);
  }

  private notifyListener(
    listener: PlayerSessionUiListener,
    event: DeviceSessionEvent,
  ) {
    try {
      listener(event);
    } catch (error) {
      console.log('[PLAYER UI] Erro ao avisar a tela:', error);
    }
  }
}

export const playerSessionUiEvents = new PlayerSessionUiEvents();
