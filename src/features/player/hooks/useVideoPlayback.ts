import { useCallback, useEffect, useRef } from 'react';

const VIDEO_END_TOLERANCE_SECONDS = 0.25;

interface UseVideoPlaybackOptions {
  itemId?: string;
  playbackKey: number;
  finishVideo: () => void;
  failVideo: (error: unknown) => void;
  reportLoaded: (duration: number) => void;
  reportProgress: (currentTime: number, duration?: number) => void;
}

export function useVideoPlayback({
  itemId,
  playbackKey,
  finishVideo,
  failVideo,
  reportLoaded,
  reportProgress,
}: UseVideoPlaybackOptions) {
  const durationRef = useRef(0);
  const actionLockedRef = useRef(false);

  useEffect(() => {
    durationRef.current = 0;
    actionLockedRef.current = false;
  }, [itemId, playbackKey]);

  const finishOnce = useCallback(() => {
    if (actionLockedRef.current) {
      return;
    }

    actionLockedRef.current = true;
    finishVideo();
  }, [finishVideo]);

  const handleLoad = useCallback(
    (data: { duration?: number }) => {
      const duration = Number(data.duration) || 0;

      durationRef.current = duration;
      reportLoaded(duration);
    },
    [reportLoaded],
  );

  const handleProgress = useCallback(
    (data: { currentTime: number }) => {
      const duration = durationRef.current;

      reportProgress(data.currentTime, duration > 0 ? duration : undefined);

      if (
        duration > 0 &&
        duration - data.currentTime <= VIDEO_END_TOLERANCE_SECONDS
      ) {
        finishOnce();
      }
    },
    [finishOnce, reportProgress],
  );

  const handleError = useCallback(
    (error: unknown) => {
      if (actionLockedRef.current) {
        return;
      }

      actionLockedRef.current = true;
      failVideo(error);
    },
    [failVideo],
  );

  return {
    handleLoad,
    handleProgress,
    handleEnd: finishOnce,
    handleError,
  };
}
