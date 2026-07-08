import {
  tvPowerManager,
} from './TvPowerManager';

type TvPowerStatus =
  | string
  | null
  | undefined;

type TvPowerManagerAdapter = {
  queryPowerStatus?:
    () =>
      | Promise<TvPowerStatus>
      | TvPowerStatus;

  standby:
    (params: {
      reason:
        string;

      occurrenceId:
        string | null;
    }) =>
      | Promise<void>
      | void;
};

const CHECK_INTERVAL_MS =
  30_000;

const FIRST_CHECK_DELAY_MS =
  15_000;

const CONFIRM_DELAY_MS =
  10_000;

const STANDBY_COOLDOWN_MS =
  60_000;

class TvPowerWatchdog {
  private started =
    false;

  private contentActive =
    false;

  private occurrenceId:
    string | null =
      null;

  private checking =
    false;

  private checkInterval:
    | ReturnType<typeof setInterval>
    | undefined;

  private firstCheckTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private confirmationTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private lastStandbyAt =
    0;

  start() {
    if (this.started) {
      return;
    }

    this.started =
      true;

    this.scheduleFirstCheck();

    this.checkInterval =
      setInterval(
        () => {
          void this.check();
        },
        CHECK_INTERVAL_MS,
      );

    console.log(
      '[TV WATCHDOG] Iniciado. Verificando a cada 30 segundos.',
    );
  }

  stop() {
    this.started =
      false;

    if (this.checkInterval) {
      clearInterval(
        this.checkInterval,
      );

      this.checkInterval =
        undefined;
    }

    if (this.firstCheckTimer) {
      clearTimeout(
        this.firstCheckTimer,
      );

      this.firstCheckTimer =
        undefined;
    }

    this.cancelConfirmation();

    this.checking =
      false;

    console.log(
      '[TV WATCHDOG] Parado.',
    );
  }

  setContentActive(
    active:
      boolean,

    occurrenceId:
      string | null,
  ) {
    const changed =
      this.contentActive !==
        active ||
      this.occurrenceId !==
        occurrenceId;

    this.contentActive =
      active;

    this.occurrenceId =
      occurrenceId;

    if (active) {
      this.cancelConfirmation();

      console.log(
        '[TV WATCHDOG] Conteúdo ativo. A TV não será desligada.',
        {
          occurrenceId,
        },
      );

      return;
    }

    console.log(
      '[TV WATCHDOG] Sem conteúdo ativo. A TV pode ser desligada.',
      {
        occurrenceId,
      },
    );

    if (
      changed &&
      this.started
    ) {
      this.scheduleFirstCheck();
    }
  }

  private scheduleFirstCheck() {
    if (!this.started) {
      return;
    }

    if (this.firstCheckTimer) {
      clearTimeout(
        this.firstCheckTimer,
      );
    }

    this.firstCheckTimer =
      setTimeout(
        () => {
          this.firstCheckTimer =
            undefined;

          void this.check();
        },
        FIRST_CHECK_DELAY_MS,
      );
  }

  private async check() {
    if (
      !this.started ||
      this.contentActive ||
      this.checking
    ) {
      return;
    }

    const elapsedSinceStandby =
      Date.now() -
      this.lastStandbyAt;

    if (
      this.lastStandbyAt > 0 &&
      elapsedSinceStandby <
        STANDBY_COOLDOWN_MS
    ) {
      return;
    }

    this.checking =
      true;

    try {
      const status =
        await this.queryPowerStatus();

      console.log(
        '[TV WATCHDOG] Verificação:',
        {
          status:
            status ??
            'UNKNOWN',

          contentActive:
            this.contentActive,

          occurrenceId:
            this.occurrenceId,
        },
      );

      if (
        this.shouldSendStandby(
          status,
        )
      ) {
        this.scheduleConfirmation();

        return;
      }

      this.cancelConfirmation();
    } catch (error) {
      console.log(
        '[TV WATCHDOG] Falha ao verificar TV:',
        error,
      );
    } finally {
      this.checking =
        false;
    }
  }

  private scheduleConfirmation() {
    if (
      this.confirmationTimer ||
      this.contentActive ||
      !this.started
    ) {
      return;
    }

    console.log(
      '[TV WATCHDOG] TV sem conteúdo detectada. Confirmando em 10 segundos.',
    );

    this.confirmationTimer =
      setTimeout(
        () => {
          this.confirmationTimer =
            undefined;

          void this.confirmAndStandby();
        },
        CONFIRM_DELAY_MS,
      );
  }

  private async confirmAndStandby() {
    if (
      !this.started ||
      this.contentActive ||
      this.checking
    ) {
      return;
    }

    this.checking =
      true;

    try {
      const status =
        await this.queryPowerStatus();

      console.log(
        '[TV WATCHDOG] Confirmação:',
        {
          status:
            status ??
            'UNKNOWN',

          contentActive:
            this.contentActive,

          occurrenceId:
            this.occurrenceId,
        },
      );

      if (
        this.contentActive ||
        !this.shouldSendStandby(
          status,
        )
      ) {
        return;
      }

      const powerManager =
        tvPowerManager as unknown as TvPowerManagerAdapter;

      await powerManager.standby({
        reason:
          'WATCHDOG_NO_CONTENT',

        occurrenceId:
          this.occurrenceId,
      });

      this.lastStandbyAt =
        Date.now();

      console.log(
        '[TV WATCHDOG] Standby enviado porque a TV estava sem conteúdo.',
      );
    } catch (error) {
      console.log(
        '[TV WATCHDOG] Falha ao enviar standby:',
        error,
      );
    } finally {
      this.checking =
        false;
    }
  }

  private async queryPowerStatus() {
    const powerManager =
      tvPowerManager as unknown as TvPowerManagerAdapter;

    if (
      typeof powerManager.queryPowerStatus !==
      'function'
    ) {
      return null;
    }

    try {
      return await powerManager
        .queryPowerStatus();
    } catch (error) {
      console.log(
        '[TV WATCHDOG] queryPowerStatus falhou. Enviando standby por segurança.',
        error,
      );

      return null;
    }
  }

  private shouldSendStandby(
    status:
      TvPowerStatus,
  ) {
    if (
      status ===
        null ||
      status ===
        undefined
    ) {
      return true;
    }

    const normalizedStatus =
      String(status)
        .trim()
        .toUpperCase();

    return (
      normalizedStatus ===
        'ON' ||
      normalizedStatus ===
        'TRANSIENT_TO_ON' ||
      normalizedStatus ===
        'UNKNOWN'
    );
  }

  private cancelConfirmation() {
    if (!this.confirmationTimer) {
      return;
    }

    clearTimeout(
      this.confirmationTimer,
    );

    this.confirmationTimer =
      undefined;
  }
}

export const tvPowerWatchdog =
  new TvPowerWatchdog();
