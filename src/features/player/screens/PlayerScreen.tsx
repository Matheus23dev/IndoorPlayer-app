import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../app/App';
import { playerSessionUiEvents } from '../../../core/events/playerSessionUiEvents';
import {
  resolveOrientationViewport,
  setScreenOrientation,
} from '../../../core/native/screenOrientation';
import { usePlayer } from '../hooks/usePlayer';
import { useVideoPlayback } from '../hooks/useVideoPlayback';

const MISSING_FILE_SKIP_DELAY_MS = 1_000;

type PlayerNavigation = NativeStackNavigationProp<RootStackParamList, 'Player'>;

export function PlayerScreen() {
  const navigation = useNavigation<PlayerNavigation>();
  const windowDimensions = useWindowDimensions();

  const {
    currentItem,
    playbackKey,
    initializing,
    isEmpty,
    isImage,
    isVideo,
    hasPendingPlaylist,
    orientation,
    finishCurrentVideo,
    failCurrentVideo,
    reportVideoLoaded,
    reportVideoProgress,
    next,
  } = usePlayer();

  const { handleLoad, handleProgress, handleEnd, handleError } =
    useVideoPlayback({
      itemId: currentItem?.id,
      playbackKey,
      finishVideo: finishCurrentVideo,
      failVideo: failCurrentVideo,
      reportLoaded: reportVideoLoaded,
      reportProgress: reportVideoProgress,
    });

  const viewport = resolveOrientationViewport(
    orientation,
    windowDimensions.width,
    windowDimensions.height,
  );

  const viewportStyle = viewport.rotated
    ? [
        styles.viewport,
        {
          width: viewport.width,
          height: viewport.height,
          transform: [{ rotate: viewport.rotation }],
        },
      ]
    : styles.viewport;

  useEffect(() => {
    // A TV Box deve continuar em landscape. Playlists verticais são giradas
    // dentro desse canvas para ficarem corretas quando a TV estiver em pé.
    void setScreenOrientation('LANDSCAPE');

    return () => {
      void setScreenOrientation('LANDSCAPE');
    };
  }, []);

  useEffect(() => {
    return playerSessionUiEvents.subscribe(event => {
      console.log('[PLAYER SCREEN] Voltando para ativação:', event);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Activation' }],
      });
    });
  }, [navigation]);

  useEffect(() => {
    if (!currentItem || currentItem.media.localPath) {
      return;
    }

    const timer = setTimeout(next, MISSING_FILE_SKIP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [currentItem, next]);

  const handleImageError = useCallback(
    (error: unknown) => {
      console.log('[PLAYER SCREEN] Erro na imagem:', error);
      next();
    },
    [next],
  );

  if (initializing && !currentItem) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.message}>Preparando conteúdo...</Text>
      </View>
    );
  }

  if (isEmpty || !currentItem) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
      </View>
    );
  }

  const localPath = currentItem.media.localPath;

  if (!localPath) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
      </View>
    );
  }

  const muted = currentItem.muted;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <View style={viewportStyle}>
        {isImage && (
          <Image
            key={`${currentItem.id}-${playbackKey}`}
            source={{ uri: localPath }}
            style={styles.media}
            resizeMode="contain"
            fadeDuration={0}
            onError={handleImageError}
          />
        )}

        {isVideo && (
          <Video
            key={`${currentItem.id}-${playbackKey}`}
            source={{ uri: localPath }}
            style={styles.media}
            resizeMode="contain"
            paused={false}
            repeat={false}
            controls={false}
            muted={muted}
            volume={muted ? 0 : 1}
            progressUpdateInterval={250}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={handleEnd}
            onError={handleError}
          />
        )}

        {hasPendingPlaylist && (
          <View style={styles.pendingIndicator} pointerEvents="none" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  viewport: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  media: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#000000',
  },
  message: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 20,
    textAlign: 'center',
  },
  pendingIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.25,
  },
});
