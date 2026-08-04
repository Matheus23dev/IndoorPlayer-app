import { useCallback, useEffect, useRef, useState } from 'react';

import { AppState, type AppStateStatus } from 'react-native';

import { playerEngine } from '../engine/PlayerEngine';

import {
  playbackManager,
  type PlaybackSnapshot,
} from '../managers/PlaybackManager';
import { playlistManager } from '../managers/PlaylistManager';

type SyncSource = 'foreground' | 'manual';

export function usePlayer() {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(
    playbackManager.getSnapshot(),
  );

  const [orientation, setOrientation] = useState(
    playlistManager.getOrientation(),
  );

  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(false);

  const advancingRef = useRef(false);

  const syncingRef = useRef(false);

  const engineStartedRef = useRef(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const forceSyncSafely = useCallback(async (source: SyncSource) => {
    if (!engineStartedRef.current || syncingRef.current) {
      return;
    }

    syncingRef.current = true;

    try {
      console.log(`[PLAYER HOOK] Sincronizando: ${source}`);

      await playerEngine.forceSync();
    } catch (error) {
      console.log('[PLAYER HOOK] Erro ao sincronizar:', error);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribePlayback = playbackManager.subscribe(nextSnapshot => {
      if (mountedRef.current) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribePlaylist = playlistManager.subscribe(nextSnapshot => {
      if (mountedRef.current) {
        setOrientation(nextSnapshot.orientation);
      }
    });

    async function startEngine() {
      try {
        await playerEngine.start();

        if (!mountedRef.current) {
          playerEngine.stop();
          return;
        }

        engineStartedRef.current = true;
      } catch (error) {
        console.log('[PLAYER HOOK] Erro ao iniciar:', error);
      } finally {
        if (mountedRef.current) {
          setInitializing(false);
        }
      }
    }

    function handleAppStateChange(nextState: AppStateStatus) {
      const previousState = appStateRef.current;

      appStateRef.current = nextState;

      const cameToForeground =
        previousState !== 'active' && nextState === 'active';

      if (!cameToForeground) {
        return;
      }

      void forceSyncSafely('foreground');
    }

    void startEngine();

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      mountedRef.current = false;
      engineStartedRef.current = false;
      syncingRef.current = false;
      advancingRef.current = false;

      unsubscribePlayback();
      unsubscribePlaylist();
      appStateSubscription.remove();

      playerEngine.stop();
    };
  }, [forceSyncSafely]);

  useEffect(() => {
    advancingRef.current = false;
  }, [snapshot.playbackKey]);

  const advanceVideoOnce = useCallback((action: () => void) => {
    if (advancingRef.current) {
      return;
    }

    advancingRef.current = true;

    action();
  }, []);

  const finishCurrentVideo = useCallback(() => {
    advanceVideoOnce(() => {
      playbackManager.videoFinished();
    });
  }, [advanceVideoOnce]);

  const failCurrentVideo = useCallback(
    (error?: unknown) => {
      advanceVideoOnce(() => {
        playbackManager.videoFailed(error);
      });
    },
    [advanceVideoOnce],
  );

  const reportVideoLoaded = useCallback((duration: number) => {
    playbackManager.updateVideoLoaded(duration);
  }, []);

  const reportVideoProgress = useCallback(
    (currentTime: number, duration?: number) => {
      playbackManager.updateVideoProgress(currentTime, duration);
    },
    [],
  );

  const next = useCallback(() => {
    playbackManager.next();
  }, []);

  const previous = useCallback(() => {
    playbackManager.previous();
  }, []);

  const restart = useCallback(() => {
    playbackManager.restartCurrent();
  }, []);

  const synchronize = useCallback(async () => {
    await forceSyncSafely('manual');
  }, [forceSyncSafely]);

  const currentItem = snapshot.currentItem;

  const isImage = currentItem?.media.type === 'IMAGE';

  const isVideo = currentItem?.media.type === 'VIDEO';

  const isEmpty = !initializing && snapshot.totalItems === 0;

  return {
    currentItem,

    currentIndex: snapshot.currentIndex,

    totalItems: snapshot.totalItems,

    playbackKey: snapshot.playbackKey,

    hasPendingPlaylist: snapshot.hasPendingPlaylist,
    orientation,

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
