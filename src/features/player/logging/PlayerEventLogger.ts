import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlayerLogCategory =
  | 'SYSTEM'
  | 'CONNECTION'
  | 'SYNC'
  | 'PROGRAMMING'
  | 'DOWNLOAD'
  | 'PLAYBACK'
  | 'AUDIO'
  | 'POWER'
  | 'CACHE'
  | 'SESSION';

export type PlayerLogLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type PlayerLogMetadataValue = string | number | boolean | null;

export interface PlayerLogEvent {
  id: string;
  event: string;
  category: PlayerLogCategory;
  level: PlayerLogLevel;
  message: string;
  metadata?: Record<string, PlayerLogMetadataValue>;
  occurredAt: string;
}

interface CreatePlayerLogEvent
  extends Omit<PlayerLogEvent, 'id' | 'occurredAt'> {
  dedupeKey?: string;
  dedupeWindowMs?: number;
}

type LogTransport = (event: PlayerLogEvent) => Promise<boolean>;

const STORAGE_KEY = '@indoor-player/pending-event-logs/v1';
const MAX_PENDING_EVENTS = 250;
const DEFAULT_DEDUPE_WINDOW_MS = 5_000;

class PlayerEventLogger {
  private queue: PlayerLogEvent[] = [];
  private transport: LogTransport | null = null;
  private hydration: Promise<void> | null = null;
  private flushing = false;
  private readonly recentEvents = new Map<string, number>();

  setTransport(transport: LogTransport) {
    this.transport = transport;
    void this.flush();
  }

  log(input: CreatePlayerLogEvent) {
    const dedupeKey = input.dedupeKey ?? `${input.category}:${input.event}`;
    const dedupeWindowMs = input.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;

    if (this.isDuplicate(dedupeKey, dedupeWindowMs)) {
      return;
    }

    const event: PlayerLogEvent = {
      id: this.createEventId(),
      event: input.event,
      category: input.category,
      level: input.level,
      message: input.message,
      metadata: input.metadata,
      occurredAt: new Date().toISOString(),
    };

    this.writeToConsole(event);
    void this.enqueue(event);
  }

  async flush() {
    await this.hydrate();

    if (this.flushing || !this.transport || this.queue.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue[0];
        const delivered = await this.transport(event).catch(() => false);

        if (!delivered) {
          break;
        }

        this.queue.shift();
        await this.persistQueue();
      }
    } finally {
      this.flushing = false;
    }
  }

  private async enqueue(event: PlayerLogEvent) {
    await this.hydrate();

    this.queue.push(event);

    if (this.queue.length > MAX_PENDING_EVENTS) {
      this.queue.splice(0, this.queue.length - MAX_PENDING_EVENTS);
    }

    await this.persistQueue();
    await this.flush();
  }

  private hydrate() {
    if (this.hydration) {
      return this.hydration;
    }

    this.hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then(rawQueue => {
        if (!rawQueue) {
          return;
        }

        const parsedQueue = JSON.parse(rawQueue) as unknown;

        if (!Array.isArray(parsedQueue)) {
          return;
        }

        this.queue = parsedQueue
          .filter(this.isStoredEvent)
          .slice(-MAX_PENDING_EVENTS);
      })
      .catch(error => {
        console.warn('[PLAYER LOG] Falha ao restaurar fila:', error);
      });

    return this.hydration;
  }

  private async persistQueue() {
    try {
      if (this.queue.length === 0) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        return;
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.warn('[PLAYER LOG] Falha ao salvar fila:', error);
    }
  }

  private isDuplicate(key: string, windowMs: number) {
    const now = Date.now();
    const lastOccurrence = this.recentEvents.get(key);

    this.recentEvents.set(key, now);

    if (this.recentEvents.size > 100) {
      for (const [eventKey, occurredAt] of this.recentEvents) {
        if (now - occurredAt > 10 * 60_000) {
          this.recentEvents.delete(eventKey);
        }
      }
    }

    return lastOccurrence !== undefined && now - lastOccurrence < windowMs;
  }

  private isStoredEvent(value: unknown): value is PlayerLogEvent {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const event = value as Partial<PlayerLogEvent>;

    return (
      typeof event.id === 'string' &&
      typeof event.event === 'string' &&
      typeof event.category === 'string' &&
      typeof event.level === 'string' &&
      typeof event.message === 'string' &&
      typeof event.occurredAt === 'string'
    );
  }

  private createEventId() {
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  private writeToConsole(event: PlayerLogEvent) {
    const details = event.metadata ?? {};
    const message = `[${event.category}] ${event.message}`;

    if (event.level === 'ERROR') {
      console.error(message, details);
      return;
    }

    if (event.level === 'WARNING') {
      console.warn(message, details);
      return;
    }

    console.log(message, details);
  }
}

export const playerEventLogger = new PlayerEventLogger();
