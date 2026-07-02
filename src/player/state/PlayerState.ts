import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  PlayerItem,
} from '../types/Player';

const PLAYER_STATE_KEY =
  '@indoor_player:player_state';

export interface StoredPlayerState {
  items: PlayerItem[];

  playlistId: string;

  scheduleId: string;

  hash: string;

  currentIndex?: number;

  savedAt: string;
}

export type PlayerStateData =
  Omit<
    StoredPlayerState,
    'savedAt'
  > & {
    savedAt?: string;
  };

class PlayerState {
  /**
   * Salva os dados da playlist atual.
   *
   * Não salva os arquivos em si. Os vídeos
   * e imagens continuam armazenados pelo
   * react-native-fs.
   */
  async save(
    data: PlayerStateData,
  ) {
    try {
      const state: StoredPlayerState = {
        items:
          data.items,

        playlistId:
          data.playlistId,

        scheduleId:
          data.scheduleId,

        hash:
          data.hash,

        currentIndex:
          data.currentIndex ?? 0,

        savedAt:
          data.savedAt ??
          new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        PLAYER_STATE_KEY,
        JSON.stringify(state),
      );

      console.log(
        '[STATE] Estado do player salvo.',
      );
    } catch (error) {
      console.log(
        '[STATE] Erro ao salvar estado:',
        error,
      );

      throw error;
    }
  }

  /**
   * Recupera a última playlist salva.
   *
   * Caso o JSON esteja corrompido ou incompleto,
   * o estado inválido é removido.
   */
  async load():
    Promise<StoredPlayerState | null> {
    try {
      const storedValue =
        await AsyncStorage.getItem(
          PLAYER_STATE_KEY,
        );

      if (!storedValue) {
        return null;
      }

      const parsed =
        JSON.parse(
          storedValue,
        ) as Partial<StoredPlayerState>;

      if (
        !this.isValidState(
          parsed,
        )
      ) {
        console.log(
          '[STATE] Estado salvo inválido.',
        );

        await this.clear();

        return null;
      }

      return {
        items:
          parsed.items,

        playlistId:
          parsed.playlistId,

        scheduleId:
          parsed.scheduleId,

        hash:
          parsed.hash,

        currentIndex:
          typeof parsed.currentIndex ===
            'number'
            ? parsed.currentIndex
            : 0,

        savedAt:
          parsed.savedAt ??
          new Date().toISOString(),
      };
    } catch (error) {
      console.log(
        '[STATE] Erro ao carregar estado:',
        error,
      );

      await this.clear();

      return null;
    }
  }

  /**
   * Remove somente os metadados da playlist.
   *
   * A exclusão dos arquivos de mídia fica sob
   * responsabilidade do CacheManager.
   */
  async clear() {
    try {
      await AsyncStorage.removeItem(
        PLAYER_STATE_KEY,
      );

      console.log(
        '[STATE] Estado do player removido.',
      );
    } catch (error) {
      console.log(
        '[STATE] Erro ao remover estado:',
        error,
      );

      throw error;
    }
  }

  async exists() {
    const value =
      await AsyncStorage.getItem(
        PLAYER_STATE_KEY,
      );

    return value !== null;
  }

  private isValidState(
    data: Partial<StoredPlayerState>,
  ): data is StoredPlayerState {
    return (
      Array.isArray(
        data.items,
      ) &&
      data.items.length > 0 &&
      typeof data.playlistId ===
        'string' &&
      data.playlistId.length > 0 &&
      typeof data.scheduleId ===
        'string' &&
      data.scheduleId.length > 0 &&
      typeof data.hash ===
        'string' &&
      data.hash.length > 0
    );
  }
}

export const playerState =
  new PlayerState();