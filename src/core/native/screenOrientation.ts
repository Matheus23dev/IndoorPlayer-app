import { NativeModules } from 'react-native';

import type { PlaylistOrientation } from '../../features/player/types/programming';

interface ScreenOrientationNativeModule {
  setOrientation: (orientation: PlaylistOrientation) => Promise<string>;
}

export interface OrientationViewportLayout {
  width: number;
  height: number;
  rotation: '0deg' | '90deg' | '-90deg';
  rotated: boolean;
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
  if (orientation === 'LANDSCAPE') {
    return {
      width: windowWidth,
      height: windowHeight,
      rotation: '0deg',
      rotated: false,
    };
  }

  return {
    width: windowHeight,
    height: windowWidth,
    rotation: '90deg',
    rotated: true,
  };
}
