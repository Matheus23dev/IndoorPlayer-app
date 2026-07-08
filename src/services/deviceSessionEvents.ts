export type DeviceSessionReason =
  | 'UNAUTHORIZED'
  | 'UNLINKED'
  | 'DELETED';

export interface DeviceSessionEvent {
  deviceId:
    | string
    | null;

  reason:
    DeviceSessionReason;

  keepCode:
    boolean;

  emittedAt:
    string;
}

type DeviceSessionListener = (
  event:
    DeviceSessionEvent,
) =>
  | void
  | Promise<void>;

class DeviceSessionEvents {
  private listeners =
    new Set<
      DeviceSessionListener
    >();

  subscribe(
    listener:
      DeviceSessionListener,
  ) {
    this.listeners.add(
      listener,
    );

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
    this.listeners.forEach(
      listener => {
        try {
          void listener(
            event,
          );
        } catch (error) {
          console.log(
            '[DEVICE SESSION] Erro no listener:',
            error,
          );
        }
      },
    );
  }
}

export const deviceSessionEvents =
  new DeviceSessionEvents();
