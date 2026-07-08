import {
  useEffect,
  useRef,
} from 'react';

import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Video from 'react-native-video';

import {
  useNavigation,
} from '@react-navigation/native';

import {
  usePlayer,
} from '../player/hooks/usePlayer';

import {
  playerSessionUiEvents,
} from '../services/playerSessionUiEvents';

export function PlayerScreen() {
  const navigation =
    useNavigation<any>();

  const {
    currentItem,
    playbackKey,
    initializing,
    isEmpty,
    isImage,
    isVideo,
    hasPendingPlaylist,
    finishCurrentVideo,
    failCurrentVideo,
    reportVideoLoaded,
    reportVideoProgress,
    next,
  } = usePlayer();

  const videoDurationRef =
    useRef(0);

  useEffect(() => {
    return playerSessionUiEvents.subscribe(
      event => {
        console.log(
          '[PLAYER SCREEN] Voltando para ativação:',
          event,
        );

        navigation.reset({
          index:
            0,

          routes: [
            {
              name:
                'Activation',
            },
          ],
        });
      },
    );
  }, [
    navigation,
  ]);

  useEffect(() => {
    videoDurationRef.current = 0;
  }, [
    currentItem?.id,
    playbackKey,
  ]);

  useEffect(() => {
    if (
      !currentItem ||
      currentItem.media.localPath
    ) {
      return;
    }

    const timeout =
      setTimeout(() => {
        next();
      }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    currentItem,
    next,
  ]);

  function handleVideoLoad(
    data: {
      duration?: number;
    },
  ) {
    const duration =
      Number(data.duration) || 0;

    videoDurationRef.current =
      duration;

    reportVideoLoaded(duration);
  }

  function handleVideoProgress(
    data: {
      currentTime: number;
    },
  ) {
    const duration =
      videoDurationRef.current;

    reportVideoProgress(
      data.currentTime,
      duration > 0
        ? duration
        : undefined,
    );

    if (duration <= 0) {
      return;
    }

    const remainingTime =
      duration - data.currentTime;

    if (remainingTime <= 0.25) {
      finishCurrentVideo();
    }
  }

  function handleVideoError(
    error: unknown,
  ) {
    failCurrentVideo(error);
  }

  function handleImageError(
    error: unknown,
  ) {
    console.log(
      '[PLAYER SCREEN] Erro na imagem:',
      error,
    );

    next();
  }

  if (
    initializing &&
    !currentItem
  ) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />

        <ActivityIndicator
          size="large"
          color="#FFFFFF"
        />

        <Text style={styles.message}>
          Preparando conteúdo...
        </Text>
      </View>
    );
  }

  if (
    isEmpty ||
    !currentItem
  ) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />

        <Text style={styles.emptyTitle}>
          Aguardando conteúdo
        </Text>

        <Text style={styles.emptyDescription}>
          Nenhum agendamento está ativo neste momento.
        </Text>
      </View>
    );
  }

  const localPath =
    currentItem.media.localPath;

  /*
   * Sem spinner entre uma mídia e outra.
   * Se um arquivo local estiver indisponível,
   * mantém a tela preta e avança automaticamente.
   */
  if (!localPath) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {isImage && (
        <Image
          key={`${currentItem.id}-${playbackKey}`}
          source={{
            uri: localPath,
          }}
          style={styles.media}
          resizeMode="contain"
          fadeDuration={0}
          onError={handleImageError}
        />
      )}

      {isVideo && (
        <Video
          key={`${currentItem.id}-${playbackKey}`}
          source={{
            uri: localPath,
          }}
          style={styles.media}
          resizeMode="contain"
          paused={false}
          repeat={false}
          controls={false}
          progressUpdateInterval={250}
          onLoad={handleVideoLoad}
          onProgress={handleVideoProgress}
          onEnd={finishCurrentVideo}
          onError={handleVideoError}
        />
      )}

      {hasPendingPlaylist && (
        <View
          style={styles.pendingIndicator}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
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
      backgroundColor: '#000000',
      paddingHorizontal: 32,
    },

    message: {
      marginTop: 20,
      color: '#FFFFFF',
      fontSize: 20,
      textAlign: 'center',
    },

    emptyTitle: {
      color: '#FFFFFF',
      fontSize: 28,
      fontWeight: '700',
      textAlign: 'center',
    },

    emptyDescription: {
      marginTop: 12,
      color: '#A3A3A3',
      fontSize: 18,
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
