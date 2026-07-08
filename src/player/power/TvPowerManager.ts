import {
  NativeModules,
  Platform,
} from 'react-native';

export type TvPowerState =
  | 'ON'
  | 'STANDBY';

interface TvPowerContext {
  reason:
    string;

  occurrenceId:
    string | null;
}

interface CecCommandResult {
  action:
    string;

  executable:
    string;

  output:
    string;

  logPath:
    string;
}

interface CecNativeModule {
  turnOn: (
    reason:
      string,

    occurrenceId:
      string | null,
  ) => Promise<CecCommandResult>;

  standby: (
    reason:
      string,

    occurrenceId:
      string | null,
  ) => Promise<CecCommandResult>;

  diagnose: () =>
    Promise<CecCommandResult>;
}

const nativeCecModule =
  NativeModules.CecModule as
    | CecNativeModule
    | undefined;

const FAILURE_RETRY_DELAY_MS =
  30_000;

class TvPowerManager {
  private desiredState:
    | TvPowerState
    | null =
      null;

  private appliedState:
    | TvPowerState
    | null =
      null;

  private processing:
    Promise<void> | null =
      null;

  private lastFailureAt =
    0;

  turnOn(
    context:
      TvPowerContext,
  ) {
    return this.requestState(
      'ON',
      context,
    );
  }

  standby(
    context:
      TvPowerContext,
  ) {
    return this.requestState(
      'STANDBY',
      context,
    );
  }

  async diagnose() {
    this.assertAvailable();

    return nativeCecModule!
      .diagnose();
  }

  getAppliedState() {
    return this.appliedState;
  }

  private requestState(
    state:
      TvPowerState,

    context:
      TvPowerContext,
  ) {
    this.desiredState =
      state;

    if (
      this.appliedState ===
      state
    ) {
      return Promise.resolve();
    }

    const elapsedSinceFailure =
      Date.now() -
      this.lastFailureAt;

    if (
      this.lastFailureAt > 0 &&
      elapsedSinceFailure <
        FAILURE_RETRY_DELAY_MS
    ) {
      return Promise.resolve();
    }

    if (this.processing) {
      return this.processing;
    }

    this.processing =
      this.applyState(
        state,
        context,
      )
        .finally(() => {
          this.processing =
            null;
        });

    return this.processing;
  }

  private async applyState(
    state:
      TvPowerState,

    context:
      TvPowerContext,
  ) {
    try {
      this.assertAvailable();

      const result =
        state ===
          'ON'
          ? await nativeCecModule!
              .turnOn(
                context.reason,
                context.occurrenceId,
              )
          : await nativeCecModule!
              .standby(
                context.reason,
                context.occurrenceId,
              );

      this.appliedState =
        state;

      this.lastFailureAt =
        0;

      console.log(
        '[TV POWER] Comando CEC executado:',
        {
          state,
          reason:
            context.reason,
          occurrenceId:
            context.occurrenceId,
          result,
        },
      );
    } catch (error) {
      this.appliedState =
        null;

      this.lastFailureAt =
        Date.now();

      console.log(
        '[TV POWER] Falha no comando CEC:',
        {
          state,
          reason:
            context.reason,
          occurrenceId:
            context.occurrenceId,
          error,
          retryAfterSeconds:
            FAILURE_RETRY_DELAY_MS /
            1000,
        },
      );
    }
  }

  private assertAvailable() {
    if (
      Platform.OS !==
      'android'
    ) {
      throw new Error(
        'Controle HDMI-CEC disponível somente no Android.',
      );
    }

    if (
      !nativeCecModule
    ) {
      throw new Error(
        'Módulo nativo CecModule não foi registrado.',
      );
    }
  }
}

export const tvPowerManager =
  new TvPowerManager();
