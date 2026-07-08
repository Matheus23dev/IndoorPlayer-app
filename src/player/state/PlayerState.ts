import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_STATE_KEY =
  '@indoor-player/player-state-v2';

class PlayerState {
  async save(
    value: unknown,
  ) {
    await AsyncStorage.setItem(
      PLAYER_STATE_KEY,
      JSON.stringify(value),
    );
  }

  async load<T = unknown>(): Promise<T | null> {
    const raw =
      await AsyncStorage.getItem(
        PLAYER_STATE_KEY,
      );

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.clear();

      return null;
    }
  }

  async clear() {
    await AsyncStorage.removeItem(
      PLAYER_STATE_KEY,
    );
  }
}

export const playerState =
  new PlayerState();
