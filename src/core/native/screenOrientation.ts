import { NativeModules } from 'react-native';

import type { PlaylistOrientation } from '../../features/player/types/programming';

interface ScreenOrientationNativeModule {
  setOrientation: (orientation: PlaylistOrientation) => Promise<string>;
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
