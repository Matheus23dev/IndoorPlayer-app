import type {
  CecCapabilities,
  CecNativeModule,
} from '../src/features/player/power/TvPowerManager';
import { TvPowerManager } from '../src/features/player/power/TvPowerManager';

const commandResult = {
  action: 'STANDBY',
  executable: '/system/bin/app_process',
  executionMode: 'PRIVILEGED_APP' as const,
  output: 'OK',
  logPath: '/data/local/tmp/indoor-cec.log',
};

function createNativeModule(
  powerStatus: string | null = 'ON',
): jest.Mocked<CecNativeModule> {
  return {
    turnOn: jest.fn().mockResolvedValue({
      ...commandResult,
      action: 'ON',
    }),
    standby: jest.fn().mockResolvedValue(commandResult),
    diagnose: jest.fn().mockResolvedValue({
      ...commandResult,
      action: 'DIAGNOSE',
    }),
    queryPowerStatus: jest.fn().mockResolvedValue(powerStatus),
    getCapabilities: jest.fn().mockResolvedValue({
      android: true,
      hdmiCecFeature: true,
      hdmiCecPermissionGranted: true,
      privilegedApp: true,
      rootFallbackAvailable: false,
      executionMode: 'PRIVILEGED_APP',
    } satisfies CecCapabilities),
  };
}

describe('TvPowerManager', () => {
  test('reconcilia o estado real da TV antes de enviar standby', async () => {
    const nativeModule = createNativeModule(' on ');
    const manager = new TvPowerManager(nativeModule, 'android');

    await expect(manager.queryPowerStatus()).resolves.toBe('ON');
    await manager.standby({
      reason: 'NO_ACTIVE_SCHEDULE',
      occurrenceId: null,
    });

    expect(manager.getAppliedState()).toBe('STANDBY');
    expect(nativeModule.standby).toHaveBeenCalledTimes(1);
  });

  test('não repete standby quando a TV já está nesse estado', async () => {
    const nativeModule = createNativeModule('STANDBY');
    const manager = new TvPowerManager(nativeModule, 'android');

    await manager.queryPowerStatus();
    await manager.standby({
      reason: 'WATCHDOG_NO_CONTENT',
      occurrenceId: null,
    });

    expect(manager.getAppliedState()).toBe('STANDBY');
    expect(nativeModule.standby).not.toHaveBeenCalled();
  });

  test('expõe as capacidades informadas pelo módulo nativo', async () => {
    const nativeModule = createNativeModule();
    const manager = new TvPowerManager(nativeModule, 'android');

    await expect(manager.getCapabilities()).resolves.toMatchObject({
      hdmiCecFeature: true,
      hdmiCecPermissionGranted: true,
      executionMode: 'PRIVILEGED_APP',
    });
  });
});
