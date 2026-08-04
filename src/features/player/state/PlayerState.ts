import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_STATE_KEY = '@indoor-player/player-state-v2';

class PlayerState {
  async save(value: unknown) {
    try {
      await AsyncStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(value));
    } catch (error) {
      console.log('[PLAYER STATE] Erro ao salvar estado:', error);

      throw error;
    }
  }

  async load<T = unknown>(): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(PLAYER_STATE_KEY);

      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      console.log('[PLAYER STATE] Estado inválido. Limpando:', error);

      await this.clear();

      return null;
    }
  }

  async clear() {
    try {
      await AsyncStorage.removeItem(PLAYER_STATE_KEY);
    } catch (error) {
      console.log('[PLAYER STATE] Erro ao limpar estado:', error);

      throw error;
    }
  }
}

export const playerState = new PlayerState();
