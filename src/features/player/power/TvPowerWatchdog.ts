import { tvPowerManager } from './TvPowerManager';

type TvPowerStatus = string | null | undefined;

type TvPowerManagerAdapter = {
  queryPowerStatus?: () => Promise<TvPowerStatus> | TvPowerStatus;

  standby: (params: {
    reason: string;
    occurrenceId: string | null;
  }) => Promise<void> | void;
};

const CHECK_INTERVAL_MS = 30_000;

const FIRST_CHECK_DELAY_MS = 15_000;

const CONFIRM_DELAY_MS = 10_000;

const STANDBY_COOLDOWN_MS = 60_000;

class TvPowerWatchdog {
  private started = false;
  private contentActive = false;
  private occurrenceId: string | null = null;

  private checking = false;
  private lastStandbyAt = 0;

  private checkInterval?: ReturnType<typeof setInterval>;

  private firstCheckTimer?: ReturnType<typeof setTimeout>;

  private confirmationTimer?: ReturnType<typeof setTimeout>;

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    this.scheduleFirstCheck();
    this.startInterval();

    console.log('[TV WATCHDOG] Iniciado. Verificando a cada 30 segundos.');
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.checking = false;

    this.clearCheckInterval();
    this.clearFirstCheckTimer();
    this.cancelConfirmation();

    console.log('[TV WATCHDOG] Parado.');
  }

  setContentActive(active: boolean, occurrenceId: string | null) {
    const changed =
      this.contentActive !== active || this.occurrenceId !== occurrenceId;

    this.contentActive = active;
    this.occurrenceId = occurrenceId;

    if (!changed) {
      return;
    }

    if (active) {
      this.cancelConfirmation();

      console.log('[TV WATCHDOG] Conteúdo ativo. A TV não será desligada.', {
        occurrenceId,
      });

      return;
    }

    console.log('[TV WATCHDOG] Sem conteúdo ativo. A TV pode ser desligada.', {
      occurrenceId,
    });

    if (this.started) {
      this.scheduleFirstCheck();
    }
  }

  private startInterval() {
    this.clearCheckInterval();

    this.checkInterval = setInterval(() => {
      void this.check();
    }, CHECK_INTERVAL_MS);
  }

  private scheduleFirstCheck() {
    if (!this.started) {
      return;
    }

    this.clearFirstCheckTimer();

    this.firstCheckTimer = setTimeout(() => {
      this.firstCheckTimer = undefined;

      void this.check();
    }, FIRST_CHECK_DELAY_MS);
  }

  private async check() {
    if (!this.canCheck() || this.isInStandbyCooldown()) {
      return;
    }

    this.checking = true;

    try {
      const status = await this.queryPowerStatus();

      this.logCheck('Verificação', status);

      if (this.shouldSendStandby(status)) {
        this.scheduleConfirmation();
        return;
      }

      this.cancelConfirmation();
    } catch (error) {
      console.log('[TV WATCHDOG] Falha ao verificar TV:', error);
    } finally {
      this.checking = false;
    }
  }

  private scheduleConfirmation(delay = CONFIRM_DELAY_MS) {
    if (!this.started || this.contentActive || this.confirmationTimer) {
      return;
    }

    console.log(
      '[TV WATCHDOG] TV sem conteúdo detectada. Confirmando em 10 segundos.',
    );

    this.confirmationTimer = setTimeout(() => {
      this.confirmationTimer = undefined;

      void this.confirmAndStandby();
    }, delay);
  }

  private async confirmAndStandby() {
    if (!this.started || this.contentActive) {
      return;
    }

    if (this.checking) {
      this.scheduleConfirmation(2_000);

      return;
    }

    if (this.isInStandbyCooldown()) {
      return;
    }

    this.checking = true;

    try {
      const status = await this.queryPowerStatus();

      this.logCheck('Confirmação', status);

      if (this.contentActive || !this.shouldSendStandby(status)) {
        return;
      }

      await this.sendStandby();

      this.lastStandbyAt = Date.now();

      console.log(
        '[TV WATCHDOG] Standby enviado porque a TV estava sem conteúdo.',
      );
    } catch (error) {
      console.log('[TV WATCHDOG] Falha ao enviar standby:', error);
    } finally {
      this.checking = false;
    }
  }

  private async sendStandby() {
    const powerManager = tvPowerManager as unknown as TvPowerManagerAdapter;

    await powerManager.standby({
      reason: 'WATCHDOG_NO_CONTENT',

      occurrenceId: this.occurrenceId,
    });
  }

  private async queryPowerStatus() {
    const powerManager = tvPowerManager as unknown as TvPowerManagerAdapter;

    if (typeof powerManager.queryPowerStatus !== 'function') {
      return null;
    }

    try {
      return await powerManager.queryPowerStatus();
    } catch (error) {
      console.log(
        '[TV WATCHDOG] queryPowerStatus falhou. Enviando standby por segurança.',
        error,
      );

      return null;
    }
  }

  private shouldSendStandby(status: TvPowerStatus) {
    if (status === null || status === undefined) {
      return true;
    }

    const normalizedStatus = String(status).trim().toUpperCase();

    return (
      normalizedStatus === 'ON' ||
      normalizedStatus === 'TRANSIENT_TO_ON' ||
      normalizedStatus === 'UNKNOWN'
    );
  }

  private canCheck() {
    return this.started && !this.contentActive && !this.checking;
  }

  private isInStandbyCooldown() {
    if (this.lastStandbyAt <= 0) {
      return false;
    }

    const elapsed = Date.now() - this.lastStandbyAt;

    return elapsed < STANDBY_COOLDOWN_MS;
  }

  private logCheck(label: string, status: TvPowerStatus) {
    console.log(`[TV WATCHDOG] ${label}:`, {
      status: status ?? 'UNKNOWN',

      contentActive: this.contentActive,

      occurrenceId: this.occurrenceId,
    });
  }

  private clearCheckInterval() {
    if (!this.checkInterval) {
      return;
    }

    clearInterval(this.checkInterval);

    this.checkInterval = undefined;
  }

  private clearFirstCheckTimer() {
    if (!this.firstCheckTimer) {
      return;
    }

    clearTimeout(this.firstCheckTimer);

    this.firstCheckTimer = undefined;
  }

  private cancelConfirmation() {
    if (!this.confirmationTimer) {
      return;
    }

    clearTimeout(this.confirmationTimer);

    this.confirmationTimer = undefined;
  }
}

export const tvPowerWatchdog = new TvPowerWatchdog();
