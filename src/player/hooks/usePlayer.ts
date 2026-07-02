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
          await playerEngine.start();
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

    const handleAppStateChange = (
      state:
        AppStateStatus,
    ) => {
      if (
        state !== 'active'
      ) {
        return;
      }

      void playerEngine
        .forceSync()
        .catch(error => {
          console.log(
            '[PLAYER HOOK] Erro ao sincronizar:',
            error,
          );
        });
    };

    const subscription =
      AppState.addEventListener(
        'change',
        handleAppStateChange,
      );

    return () => {
      mountedRef.current =
        false;

      unsubscribePlayback();

      subscription.remove();

      playerEngine.stop();
    };
  }, []);

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
        await playerEngine.forceSync();
      },
      [],
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