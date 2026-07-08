import {
  CommonActions,
  createNavigationContainerRef,
} from '@react-navigation/native';

export type RootStackParamList = {
  Activation: undefined;
  Player: undefined;
};

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

let pendingActivationReset =
  false;

function performActivationReset() {
  if (!navigationRef.isReady()) {
    console.log(
      '[NAVIGATION] Container ainda não está pronto. Reset pendente.',
    );

    return false;
  }

  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,

      routes: [
        {
          name:
            'Activation',
        },
      ],
    }),
  );

  pendingActivationReset =
    false;

  console.log(
    '[NAVIGATION] Tela de ativação aberta.',
  );

  return true;
}

export function resetToActivation() {
  pendingActivationReset =
    true;

  performActivationReset();
}

export function flushPendingNavigation() {
  console.log(
    '[NAVIGATION] Container pronto.',
  );

  if (!pendingActivationReset) {
    return;
  }

  performActivationReset();
}
