import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useNavigation,
} from '@react-navigation/native';

import { api } from '../services/api';

import {
  getDeviceCode,
  removeDeviceCode,
  saveDeviceCode,
} from '../storage/device';

type DeviceResponse = {
  id: string;
  code: string;
  isLinked: boolean;
};

export function ActivationScreen() {
  const navigation =
    useNavigation<any>();

  const mountedRef =
    useRef(false);

  const timeoutRef =
    useRef<
      ReturnType<typeof setTimeout>
      | undefined
    >(undefined);

  const [
    code,
    setCode,
  ] = useState<string | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState(
    'Preparando ativação...',
  );

  useEffect(() => {
    mountedRef.current = true;

    void initialize();

    return () => {
      mountedRef.current = false;

      if (timeoutRef.current) {
        clearTimeout(
          timeoutRef.current,
        );
      }
    };
  }, []);

  async function initialize() {
    try {
      setLoading(true);

      const savedCode =
        await getDeviceCode();

      if (savedCode) {
        setCode(savedCode);

        setMessage(
          'Verificando dispositivo...',
        );

        await checkDevice(
          savedCode,
        );

        return;
      }

      await registerDevice();
    } catch (error) {
      console.log(
        '[ACTIVATION] Erro ao iniciar:',
        error,
      );

      setMessage(
        'Erro ao iniciar ativação. Tentando novamente...',
      );

      scheduleRetryInitialize();
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function registerDevice() {
    try {
      setMessage(
        'Registrando dispositivo...',
      );

      const response =
        await api.post<DeviceResponse>(
          '/devices/register',
        );

      const deviceCode =
        response.data.code;

      await saveDeviceCode(
        deviceCode,
      );

      if (!mountedRef.current) {
        return;
      }

      setCode(deviceCode);

      setMessage(
        'Aguardando vínculo no painel...',
      );

      if (response.data.isLinked) {
        goToPlayer();
        return;
      }

      scheduleCheck(
        deviceCode,
      );
    } catch (error) {
      console.log(
        '[ACTIVATION] Erro ao registrar:',
        error,
      );

      setMessage(
        'Sem conexão com o servidor. Tentando registrar novamente...',
      );

      scheduleRetryInitialize();
    }
  }

  async function checkDevice(
    deviceCode: string,
  ) {
    try {
      const response =
        await api.get<DeviceResponse>(
          `/devices/code/${deviceCode}`,
        );

      if (!mountedRef.current) {
        return;
      }

      if (response.data.isLinked) {
        setMessage(
          'Dispositivo vinculado. Abrindo player...',
        );

        goToPlayer();

        return;
      }

      setMessage(
        'Aguardando vínculo no painel...',
      );

      scheduleCheck(
        deviceCode,
      );
    } catch (error: any) {
      const status =
        error?.response?.status;

      console.log(
        '[ACTIVATION] Erro ao verificar:',
        error,
      );

      /*
       * Se o backend respondeu 404,
       * esse código não existe mais.
       * Aí sim registramos outro.
       */
      if (status === 404) {
        await removeDeviceCode();

        if (!mountedRef.current) {
          return;
        }

        setCode(null);

        await registerDevice();

        return;
      }

      /*
       * Se foi erro de internet, não cria
       * código novo. Mantém o código salvo
       * e tenta consultar novamente.
       */
      if (mountedRef.current) {
        setMessage(
          'Sem conexão. Mantendo código salvo e tentando novamente...',
        );

        scheduleCheck(
          deviceCode,
        );
      }
    }
  }

  function scheduleCheck(
    deviceCode: string,
  ) {
    if (timeoutRef.current) {
      clearTimeout(
        timeoutRef.current,
      );
    }

    timeoutRef.current =
      setTimeout(() => {
        void checkDevice(
          deviceCode,
        );
      }, 3000);
  }

  function scheduleRetryInitialize() {
    if (timeoutRef.current) {
      clearTimeout(
        timeoutRef.current,
      );
    }

    timeoutRef.current =
      setTimeout(() => {
        void initialize();
      }, 5000);
  }

  function goToPlayer() {
    if (timeoutRef.current) {
      clearTimeout(
        timeoutRef.current,
      );
    }

    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Player',
        },
      ],
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Ativação do Player
      </Text>

      <Text style={styles.description}>
        Use este código no painel
        administrador para vincular esta TV.
      </Text>

      <View style={styles.codeBox}>
        <Text style={styles.code}>
          {code ?? '------'}
        </Text>
      </View>

      <View style={styles.statusBox}>
        {loading && (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
          />
        )}

        <Text style={styles.message}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },

    title: {
      color: '#FFFFFF',
      fontSize: 32,
      fontWeight: '800',
      textAlign: 'center',
    },

    description: {
      marginTop: 16,
      color: '#A3A3A3',
      fontSize: 18,
      textAlign: 'center',
      lineHeight: 26,
      maxWidth: 620,
    },

    codeBox: {
      marginTop: 40,
      paddingVertical: 28,
      paddingHorizontal: 52,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      backgroundColor: '#111111',
    },

    code: {
      color: '#FFFFFF',
      fontSize: 52,
      fontWeight: '900',
      letterSpacing: 8,
      textAlign: 'center',
    },

    statusBox: {
      marginTop: 32,
      alignItems: 'center',
      gap: 12,
    },

    message: {
      color: '#D4D4D4',
      fontSize: 16,
      textAlign: 'center',
      maxWidth: 620,
    },
  });