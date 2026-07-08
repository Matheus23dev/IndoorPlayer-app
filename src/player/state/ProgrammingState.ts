import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ProgrammingSnapshot,
} from '../../../../../Downloads/indoor-player-completo-offline-websocket/app/src/player/types/Programming';

const PROGRAMMING_STATE_KEY =
  '@indoor-player/programming-state-v1';

class ProgrammingState {
  async save(
    snapshot:
      ProgrammingSnapshot,
  ) {
    await AsyncStorage.setItem(
      PROGRAMMING_STATE_KEY,
      JSON.stringify(
        snapshot,
      ),
    );
  }

  async load():
    Promise<
      ProgrammingSnapshot |
      null
    > {
    const raw =
      await AsyncStorage.getItem(
        PROGRAMMING_STATE_KEY,
      );

    if (!raw) {
      return null;
    }

    try {
      const parsed =
        JSON.parse(
          raw,
        ) as ProgrammingSnapshot;

      const isValid =
        parsed &&
        (
          typeof parsed.version ===
            'string' ||
          parsed.version ===
            null
        ) &&
        (
          typeof parsed.serverTime ===
            'string' ||
          parsed.serverTime ===
            null
        ) &&
        typeof parsed.timeZone ===
          'string' &&
        Number.isFinite(
          parsed.clockOffsetMs,
        ) &&
        (
          Number.isFinite(
            parsed.syncedAt,
          ) ||
          parsed.syncedAt ===
            null
        ) &&
        Array.isArray(
          parsed.occurrences,
        ) &&
        Array.isArray(
          parsed.playlists,
        );

      if (!isValid) {
        await this.clear();

        return null;
      }

      return parsed;
    } catch {
      await this.clear();

      return null;
    }
  }

  async clear() {
    await AsyncStorage.removeItem(
      PROGRAMMING_STATE_KEY,
    );
  }
}

export const programmingState =
  new ProgrammingState();
