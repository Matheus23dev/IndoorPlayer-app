export type DeviceSessionReason = 'UNAUTHORIZED' | 'UNLINKED' | 'DELETED';

export interface DeviceSessionEvent {
  deviceId: string | null;
  reason: DeviceSessionReason;
  keepCode: boolean;
  emittedAt: string;
}

type DeviceSessionListener = (
  event: DeviceSessionEvent,
) => void | Promise<void>;

class DeviceSessionEvents {
  private listeners = new Set<DeviceSessionListener>();

  subscribe(listener: DeviceSessionListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: DeviceSessionEvent) {
    this.listeners.forEach(listener => {
      this.notifyListener(listener, event);
    });
  }

  clear() {
    this.listeners.clear();
  }

  getListenerCount() {
    return this.listeners.size;
  }

  private notifyListener(
    listener: DeviceSessionListener,
    event: DeviceSessionEvent,
  ) {
    try {
      const result = listener(event);

      if (result && typeof result.catch === 'function') {
        result.catch(error => {
          this.logListenerError(error);
        });
      }
    } catch (error) {
      this.logListenerError(error);
    }
  }

  private logListenerError(error: unknown) {
    console.log('[DEVICE SESSION] Erro no listener:', error);
  }
}

export const deviceSessionEvents = new DeviceSessionEvents();
