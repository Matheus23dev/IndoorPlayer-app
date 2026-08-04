import { useEffect, useRef, useState } from 'react';

import { api } from '../../../core/api/client';
import {
  getDeviceActivationSecret,
  getDeviceCode,
  getDeviceToken,
  removeDeviceRegistration,
  saveDeviceRegistration,
  saveDeviceToken,
} from '../../../core/storage/deviceStorage';

interface RegisterDeviceResponse {
  id: string;
  code: string;
  isLinked: boolean;
  activationSecret: string;
}

interface ActivateDeviceResponse {
  id: string;
  code: string;
  name: string | null;
  isLinked: boolean;
  deviceToken: string | null;
}

const ACTIVATION_CHECK_DELAY_MS = 3_000;
const INITIALIZATION_RETRY_DELAY_MS = 5_000;

export function useDeviceActivation(onActivated: () => void) {
  const onActivatedRef = useRef(onActivated);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Preparando ativação...');

  useEffect(() => {
    onActivatedRef.current = onActivated;
  }, [onActivated]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function schedule(callback: () => void, delay: number) {
      clearTimer();
      timer = setTimeout(callback, delay);
    }

    function openPlayer() {
      clearTimer();
      onActivatedRef.current();
    }

    async function registerDevice() {
      try {
        setMessage('Registrando dispositivo...');

        const response = await api.post<RegisterDeviceResponse>(
          '/devices/register',
        );

        const registration = {
          code: response.data.code,
          activationSecret: response.data.activationSecret,
        };

        await saveDeviceRegistration(registration);

        if (!active) {
          return;
        }

        setCode(registration.code);
        setMessage('Aguardando vínculo no painel...');
        schedule(() => {
          activateDevice(registration.code, registration.activationSecret);
        }, ACTIVATION_CHECK_DELAY_MS);
      } catch (error) {
        console.log('[ACTIVATION] Erro ao registrar:', error);

        if (!active) {
          return;
        }

        setMessage('Sem conexão com o servidor. Tentando novamente...');
        schedule(() => {
          initialize();
        }, INITIALIZATION_RETRY_DELAY_MS);
      }
    }

    async function activateDevice(
      deviceCode: string,
      activationSecret: string,
    ) {
      try {
        const response = await api.post<ActivateDeviceResponse>(
          '/devices/activate',
          {
            code: deviceCode,
            activationSecret,
          },
        );

        if (!active) {
          return;
        }

        if (response.data.isLinked && response.data.deviceToken) {
          await saveDeviceToken(response.data.deviceToken);

          if (!active) {
            return;
          }

          setMessage('Dispositivo autenticado. Abrindo player...');
          openPlayer();
          return;
        }

        setMessage('Aguardando vínculo no painel...');
        schedule(() => {
          activateDevice(deviceCode, activationSecret);
        }, ACTIVATION_CHECK_DELAY_MS);
      } catch (error) {
        const status = getHttpStatus(error);

        console.log('[ACTIVATION] Erro ao ativar:', error);

        if (
          status === 401 ||
          status === 403 ||
          status === 404 ||
          status === 409
        ) {
          await removeDeviceRegistration();

          if (!active) {
            return;
          }

          setCode(null);
          await registerDevice();
          return;
        }

        if (!active) {
          return;
        }

        setMessage('Sem conexão. Mantendo o código e tentando novamente...');
        schedule(() => {
          activateDevice(deviceCode, activationSecret);
        }, ACTIVATION_CHECK_DELAY_MS);
      }
    }

    async function initialize() {
      try {
        setLoading(true);

        const [existingToken, savedCode, activationSecret] = await Promise.all([
          getDeviceToken(),
          getDeviceCode(),
          getDeviceActivationSecret(),
        ]);

        if (!active) {
          return;
        }

        if (existingToken && savedCode) {
          setCode(savedCode);
          openPlayer();
          return;
        }

        if (savedCode && !activationSecret) {
          await removeDeviceRegistration();
          await registerDevice();
          return;
        }

        if (savedCode && activationSecret) {
          setCode(savedCode);
          setMessage('Verificando vínculo seguro...');
          await activateDevice(savedCode, activationSecret);
          return;
        }

        await registerDevice();
      } catch (error) {
        console.log('[ACTIVATION] Erro ao iniciar:', error);

        if (!active) {
          return;
        }

        setMessage('Erro ao iniciar ativação. Tentando novamente...');
        schedule(() => {
          initialize();
        }, INITIALIZATION_RETRY_DELAY_MS);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
      clearTimer();
    };
  }, []);

  return {
    code,
    loading,
    message,
  };
}

function getHttpStatus(error: unknown) {
  return (
    error as {
      response?: { status?: number };
    }
  ).response?.status;
}
