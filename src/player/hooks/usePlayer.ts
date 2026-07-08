import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AppState,
  type AppStateStatus,
} from 'react-native';

import {
  playerEngine,
} from '../engine/PlayerEngine';

import {
  playbackManager,
  type PlaybackSnapshot,
} from '../managers/PlaybackManager';

export function usePlayer() {
  const [
    snapshot,
    setSnapshot,
  ] = useState<PlaybackSnapshot>(
    playbackManager.getSnapshot(),
  );

  const [
    initializing,
    setInitializing,
  ] = useState(true);

  const mountedRef =
    useRef(false);

  const advancingRef =
    useRef(false);

  const syncingRef =
    useRef(false);

  const engineStartedRef =
    useRef(false);

  /**
   * Sincronização adicional usada somente:
   *
   * - quando o app volta ao primeiro plano;
   * - quando o usuário força manualmente.
   *
   * O WebSocket cuida das alterações imediatas
   * e o SyncManager mantém o polling de segurança.
   */
  const forceSyncSafely =
    useCallback(
      async (
        source:
          | 'foreground'
          | 'manual',
      ) => {
        if (
          !engineStartedRef.current
        ) {
          return;
        }

        if (
          syncingRef.current
        ) {
          return;
        }

        syncingRef.current =
          true;

        try {
          console.log(
            `[PLAYER HOOK] Sincronizando: ${source}`,
          );

          await playerEngine.forceSync();
        } catch (error) {
          console.log(
            '[PLAYER HOOK] Erro ao sincronizar:',
            error,
          );
        } finally {
          syncingRef.current =
            false;
        }
      },
      [],
    );

  useEffect(() => {
    mountedRef.current =
      true;

    const unsubscribePlayback =
      playbackManager.subscribe(
        nextSnapshot => {
          if (
            !mountedRef.current
          ) {
            return;
          }

          setSnapshot(
            nextSnapshot,
          );
        },
      );

    const startEngine =
      async () => {
        try {
          /**
           * O PlayerEngine:
           *
           * - restaura a programação local;
           * - inicia os timers;
           * - conecta o WebSocket;
           * - inicia o SyncManager;
           * - faz a primeira sincronização.
           */
          await playerEngine.start();

          engineStartedRef.current =
            true;
        } catch (error) {
          console.log(
            '[PLAYER HOOK] Erro ao iniciar:',
            error,
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setInitializing(
              false,
            );
          }
        }
      };

    void startEngine();

    /**
     * Quando o app volta ao primeiro plano,
     * consulta imediatamente a programação.
     *
     * Isso cobre o caso em que o Android
     * suspendeu a conexão WebSocket enquanto
     * o aplicativo estava em segundo plano.
     */
    const handleAppStateChange = (
      state:
        AppStateStatus,
    ) => {
      if (
        state !== 'active'
      ) {
        return;
      }

      void forceSyncSafely(
        'foreground',
      );
    };

    const appStateSubscription =
      AppState.addEventListener(
        'change',
        handleAppStateChange,
      );

    return () => {
      mountedRef.current =
        false;

      engineStartedRef.current =
        false;

      syncingRef.current =
        false;

      unsubscribePlayback();

      appStateSubscription.remove();

      playerEngine.stop();
    };
  }, [
    forceSyncSafely,
  ]);

  /**
   * Libera o bloqueio sempre que o
   * PlaybackManager muda de mídia.
   */
  useEffect(() => {
    advancingRef.current =
      false;
  }, [
    snapshot.playbackKey,
  ]);

  const finishCurrentVideo =
    useCallback(() => {
      if (
        advancingRef.current
      ) {
        return;
      }

      advancingRef.current =
        true;

      playbackManager.videoFinished();
    }, []);

  const failCurrentVideo =
    useCallback(
      (
        error?: unknown,
      ) => {
        if (
          advancingRef.current
        ) {
          return;
        }

        advancingRef.current =
          true;

        playbackManager.videoFailed(
          error,
        );
      },
      [],
    );

  const reportVideoLoaded =
    useCallback(
      (
        duration: number,
      ) => {
        playbackManager.updateVideoLoaded(
          duration,
        );
      },
      [],
    );

  const reportVideoProgress =
    useCallback(
      (
        currentTime:
          number,

        duration?:
          number,
      ) => {
        playbackManager.updateVideoProgress(
          currentTime,
          duration,
        );
      },
      [],
    );

  const next =
    useCallback(() => {
      playbackManager.next();
    }, []);

  const previous =
    useCallback(() => {
      playbackManager.previous();
    }, []);

  const restart =
    useCallback(() => {
      playbackManager.restartCurrent();
    }, []);

  const synchronize =
    useCallback(
      async () => {
        await forceSyncSafely(
          'manual',
        );
      },
      [
        forceSyncSafely,
      ],
    );

  const currentItem =
    snapshot.currentItem;

  const isImage =
    currentItem?.media.type ===
    'IMAGE';

  const isVideo =
    currentItem?.media.type ===
    'VIDEO';

  const isEmpty =
    !initializing &&
    snapshot.totalItems ===
      0;

  return {
    currentItem,

    currentIndex:
      snapshot.currentIndex,

    totalItems:
      snapshot.totalItems,

    playbackKey:
      snapshot.playbackKey,

    hasPendingPlaylist:
      snapshot.hasPendingPlaylist,

    initializing,
    isEmpty,
    isImage,
    isVideo,

    finishCurrentVideo,
    failCurrentVideo,
    reportVideoLoaded,
    reportVideoProgress,

    next,
    previous,
    restart,
    synchronize,
  };
}
