import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ProgrammingSnapshot } from '../types/programming';

const PROGRAMMING_STATE_KEY = '@indoor-player/programming-state-v1';

class ProgrammingState {
  async save(snapshot: ProgrammingSnapshot) {
    try {
      await AsyncStorage.setItem(
        PROGRAMMING_STATE_KEY,
        JSON.stringify(snapshot),
      );
    } catch (error) {
      console.log('[PROGRAMMING STATE] Erro ao salvar programação:', error);

      throw error;
    }
  }

  async load(): Promise<ProgrammingSnapshot | null> {
    try {
      const raw = await AsyncStorage.getItem(PROGRAMMING_STATE_KEY);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as ProgrammingSnapshot;

      if (!this.isValidSnapshot(parsed)) {
        await this.clear();

        return null;
      }

      return parsed;
    } catch (error) {
      console.log(
        '[PROGRAMMING STATE] Programação local inválida. Limpando:',
        error,
      );

      await this.clear();

      return null;
    }
  }

  async clear() {
    try {
      await AsyncStorage.removeItem(PROGRAMMING_STATE_KEY);
    } catch (error) {
      console.log('[PROGRAMMING STATE] Erro ao limpar programação:', error);

      throw error;
    }
  }

  private isValidSnapshot(value: unknown): value is ProgrammingSnapshot {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const snapshot = value as ProgrammingSnapshot;

    return (
      this.isStringOrNull(snapshot.version) &&
      this.isStringOrNull(snapshot.serverTime) &&
      typeof snapshot.timeZone === 'string' &&
      Number.isFinite(snapshot.clockOffsetMs) &&
      this.isNumberOrNull(snapshot.syncedAt) &&
      Array.isArray(snapshot.occurrences) &&
      Array.isArray(snapshot.playlists)
    );
  }

  private isStringOrNull(value: unknown) {
    return typeof value === 'string' || value === null;
  }

  private isNumberOrNull(value: unknown) {
    return Number.isFinite(value) || value === null;
  }
}

export const programmingState = new ProgrammingState();
