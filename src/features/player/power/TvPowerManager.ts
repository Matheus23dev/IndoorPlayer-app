import { NativeModules, Platform } from 'react-native';

import { playerEventLogger } from '../logging/PlayerEventLogger';

export type TvPowerState = 'ON' | 'STANDBY';

interface TvPowerContext {
  reason: string;
  occurrenceId: string | null;
}

interface CecCommandResult {
  action: string;
  executable: string;
  output: string;
  logPath: string;
}

interface CecNativeModule {
  turnOn: (
    reason: string,
    occurrenceId: string | null,
  ) => Promise<CecCommandResult>;

  standby: (
    reason: string,
    occurrenceId: string | null,
  ) => Promise<CecCommandResult>;

  diagnose: () => Promise<CecCommandResult>;
}

const nativeCecModule = NativeModules.CecModule as CecNativeModule | undefined;

const FAILURE_RETRY_DELAY_MS = 30_000;

class TvPowerManager {
  private desiredState: TvPowerState | null = null;
  private desiredContext: TvPowerContext | null = null;
  private appliedState: TvPowerState | null = null;

  private processing: Promise<void> | null = null;
  private retryTimer?: ReturnType<typeof setTimeout>;

  private lastFailureAt = 0;

  turnOn(context: TvPowerContext) {
    return this.requestState('ON', context);
  }

  standby(context: TvPowerContext) {
    return this.requestState('STANDBY', context);
  }

  async diagnose() {
    this.assertAvailable();

    return nativeCecModule!.diagnose();
  }

  getAppliedState() {
    return this.appliedState;
  }

  getDesiredState() {
    return this.desiredState;
  }

  private requestState(state: TvPowerState, context: TvPowerContext) {
    this.desiredState = state;
    this.desiredContext = context;

    if (this.appliedState === state && !this.processing) {
      return Promise.resolve();
    }

    if (this.processing) {
      return this.processing;
    }

    if (this.isInFailureCooldown()) {
      this.scheduleRetry();
      return Promise.resolve();
    }

    this.processing = this.processDesiredState().finally(() => {
      this.processing = null;

      if (
        this.desiredState !== null &&
        this.desiredState !== this.appliedState
      ) {
        this.scheduleRetry(0);
      }
    });

    return this.processing;
  }

  private async processDesiredState() {
    const state = this.desiredState;

    const context = this.desiredContext;

    if (!state || !context) {
      return;
    }

    if (state === this.appliedState) {
      return;
    }

    await this.applyState(state, context);
  }

  private async applyState(state: TvPowerState, context: TvPowerContext) {
    try {
      this.assertAvailable();

      const result =
        state === 'ON'
          ? await nativeCecModule!.turnOn(context.reason, context.occurrenceId)
          : await nativeCecModule!.standby(
              context.reason,
              context.occurrenceId,
            );

      this.appliedState = state;
      this.lastFailureAt = 0;

      playerEventLogger.log({
        event: state === 'ON' ? 'TV_POWER_ON' : 'TV_STANDBY',
        category: 'POWER',
        level: 'SUCCESS',
        message:
          state === 'ON'
            ? 'Comando para ligar a TV executado.'
            : 'Comando para colocar a TV em standby executado.',
        metadata: {
          reason: context.reason,
          occurrenceId: context.occurrenceId,
        },
        dedupeKey: `tv-power:${state}:${context.reason}:${
          context.occurrenceId ?? ''
        }`,
        dedupeWindowMs: 30_000,
      });

      console.log('[TV POWER] Comando CEC executado:', {
        state,
        reason: context.reason,
        occurrenceId: context.occurrenceId,
        result,
      });
    } catch (error) {
      this.appliedState = null;
      this.lastFailureAt = Date.now();

      playerEventLogger.log({
        event: 'TV_POWER_COMMAND_FAILED',
        category: 'POWER',
        level: 'ERROR',
        message: 'Falha ao executar o comando de energia da TV.',
        metadata: {
          requestedState: state,
          reason: context.reason,
          occurrenceId: context.occurrenceId,
          error: error instanceof Error ? error.message : String(error),
        },
        dedupeKey: `tv-power-failed:${state}:${context.reason}`,
        dedupeWindowMs: 5 * 60_000,
      });

      console.log('[TV POWER] Falha no comando CEC:', {
        state,
        reason: context.reason,
        occurrenceId: context.occurrenceId,
        error,
        retryAfterSeconds: FAILURE_RETRY_DELAY_MS / 1000,
      });

      this.scheduleRetry();
    }
  }

  private scheduleRetry(delay = this.getRemainingRetryDelay()) {
    if (this.retryTimer || this.processing || this.desiredState === null) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;

      if (
        this.desiredState === null ||
        this.desiredState === this.appliedState ||
        this.processing
      ) {
        return;
      }

      this.processing = this.processDesiredState().finally(() => {
        this.processing = null;
      });
    }, Math.max(0, delay));
  }

  private getRemainingRetryDelay() {
    if (this.lastFailureAt <= 0) {
      return 0;
    }

    const elapsed = Date.now() - this.lastFailureAt;

    return Math.max(0, FAILURE_RETRY_DELAY_MS - elapsed);
  }

  private isInFailureCooldown() {
    return this.lastFailureAt > 0 && this.getRemainingRetryDelay() > 0;
  }

  private assertAvailable() {
    if (Platform.OS !== 'android') {
      throw new Error('Controle HDMI-CEC disponível somente no Android.');
    }

    if (!nativeCecModule) {
      throw new Error('Módulo nativo CecModule não foi registrado.');
    }
  }
}

export const tvPowerManager = new TvPowerManager();
