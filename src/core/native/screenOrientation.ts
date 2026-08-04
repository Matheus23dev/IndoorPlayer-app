import { NativeModules } from 'react-native';

import type { PlaylistOrientation } from '../../features/player/types/programming';

interface ScreenOrientationNativeModule {
  setOrientation: (orientation: PlaylistOrientation) => Promise<string>;
}

export interface OrientationViewportLayout {
  width: number;
  height: number;
  rotation: '0deg' | '90deg' | '-90deg';
  usesFallback: boolean;
}

const nativeModule = NativeModules.ScreenOrientation as
  | ScreenOrientationNativeModule
  | undefined;

export async function setScreenOrientation(orientation: PlaylistOrientation) {
  if (!nativeModule?.setOrientation) {
    return;
  }

  try {
    await nativeModule.setOrientation(orientation);
  } catch (error) {
    console.log('[SCREEN ORIENTATION] Não foi possível orientar a tela:', {
      orientation,
      error,
    });
  }
}

export function resolveOrientationViewport(
  orientation: PlaylistOrientation,
  windowWidth: number,
  windowHeight: number,
): OrientationViewportLayout {
  const needsFallback =
    orientation === 'PORTRAIT'
      ? windowWidth > windowHeight
      : windowHeight > windowWidth;

  if (!needsFallback) {
    return {
      width: windowWidth,
      height: windowHeight,
      rotation: '0deg',
      usesFallback: false,
    };
  }

  return {
    width: windowHeight,
    height: windowWidth,
    rotation: orientation === 'PORTRAIT' ? '90deg' : '-90deg',
    usesFallback: true,
  };
}
