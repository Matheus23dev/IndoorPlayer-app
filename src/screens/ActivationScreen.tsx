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

import {
  api,
} from '../services/api';

import {
  getDeviceActivationSecret,
  getDeviceCode,
  getDeviceToken,
  removeDeviceRegistration,
  saveDeviceRegistration,
  saveDeviceToken,
} from '../storage/device';

type RegisterDeviceResponse = {
  id:
    string;

  code:
    string;

  isLinked:
    boolean;

  activationSecret:
    string;
};

type ActivateDeviceResponse = {
  id:
    string;

  code:
    string;

  name:
    string | null;

  isLinked:
    boolean;

  deviceToken:
    string | null;
};

export function ActivationScreen() {
  const navigation =
    useNavigation<any>();

  const mountedRef =
    useRef(
      false,
    );

  const timeoutRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > |
      undefined
    >(
      undefined,
    );

  const [
    code,
    setCode,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      'Preparando ativação...',
    );

  useEffect(
    () => {
      mountedRef.current =
        true;

      void initialize();

      return () => {
        mountedRef.current =
          false;

        if (
          timeoutRef.current
        ) {
          clearTimeout(
            timeoutRef.current,
          );
        }
      };
    },
    [],
  );

  async function initialize() {
    try {
      setLoading(
        true,
      );

      const existingToken =
        await getDeviceToken();

      const savedCode =
        await getDeviceCode();

      const activationSecret =
        await getDeviceActivationSecret();

      /*
       * Com token e programação local, abrimos
       * o player mesmo sem internet.
       */
      if (
        existingToken &&
        savedCode
      ) {
        setCode(
          savedCode,
        );

        goToPlayer();

        return;
      }

      /*
       * Código antigo, criado antes da autenticação
       * segura, não possui activationSecret.
       */
      if (
        savedCode &&
        !activationSecret
      ) {
        await removeDeviceRegistration();

        await registerDevice();

        return;
      }

      if (
        savedCode &&
        activationSecret
      ) {
        setCode(
          savedCode,
        );

        setMessage(
          'Verificando vínculo seguro...',
        );

        await activateDevice(
          savedCode,
          activationSecret,
        );

        return;
      }

      await registerDevice();
    } catch (error) {
      console.log(
        '[ACTIVATION] Erro ao iniciar:',
        error,
      );

      if (
        mountedRef.current
      ) {
        setMessage(
          'Erro ao iniciar ativação. Tentando novamente...',
        );

        scheduleRetryInitialize();
      }
    } finally {
      if (
        mountedRef.current
      ) {
        setLoading(
          false,
        );
      }
    }
  }

  async function registerDevice() {
    try {
      setMessage(
        'Registrando dispositivo...',
      );

      const response =
        await api.post<
          RegisterDeviceResponse
        >(
          '/devices/register',
        );

      const registration = {
        code:
          response.data.code,

        activationSecret:
          response.data
            .activationSecret,
      };

      await saveDeviceRegistration(
        registration,
      );

      if (
        !mountedRef.current
      ) {
        return;
      }

      setCode(
        registration.code,
      );

      setMessage(
        'Aguardando vínculo no painel...',
      );

      scheduleActivationCheck(
        registration.code,
        registration.activationSecret,
      );
    } catch (error) {
      console.log(
        '[ACTIVATION] Erro ao registrar:',
        error,
      );

      if (
        mountedRef.current
      ) {
        setMessage(
          'Sem conexão com o servidor. Tentando registrar novamente...',
        );

        scheduleRetryInitialize();
      }
    }
  }

  async function activateDevice(
    deviceCode:
      string,

    activationSecret:
      string,
  ) {
    try {
      const response =
        await api.post<
          ActivateDeviceResponse
        >(
          '/devices/activate',
          {
            code:
              deviceCode,

            activationSecret,
          },
        );

      if (
        !mountedRef.current
      ) {
        return;
      }

      if (
        response.data
          .isLinked &&
        response.data
          .deviceToken
      ) {
        await saveDeviceToken(
          response.data
            .deviceToken,
        );

        setMessage(
          'Dispositivo autenticado. Abrindo player...',
        );

        goToPlayer();

        return;
      }

      setMessage(
        'Aguardando vínculo no painel...',
      );

      scheduleActivationCheck(
        deviceCode,
        activationSecret,
      );
    } catch (error: any) {
      const status =
        error?.response
          ?.status;

      console.log(
        '[ACTIVATION] Erro ao ativar:',
        error,
      );

      /*
       * 404: TV foi excluída.
       * 409: registro antigo sem secret seguro.
       */
      if (
        status === 404 ||
        status === 409
      ) {
        await removeDeviceRegistration();

        if (
          !mountedRef.current
        ) {
          return;
        }

        setCode(
          null,
        );

        await registerDevice();

        return;
      }

      if (
        status === 401 ||
        status === 403
      ) {
        await removeDeviceRegistration();

        if (
          mountedRef.current
        ) {
          setCode(
            null,
          );

          await registerDevice();
        }

        return;
      }

      if (
        mountedRef.current
      ) {
        setMessage(
          'Sem conexão. Mantendo o código salvo e tentando novamente...',
        );

        scheduleActivationCheck(
          deviceCode,
          activationSecret,
        );
      }
    }
  }

  function scheduleActivationCheck(
    deviceCode:
      string,

    activationSecret:
      string,
  ) {
    if (
      timeoutRef.current
    ) {
      clearTimeout(
        timeoutRef.current,
      );
    }

    timeoutRef.current =
      setTimeout(
        () => {
          void activateDevice(
            deviceCode,
            activationSecret,
          );
        },
        3_000,
      );
  }

  function scheduleRetryInitialize() {
    if (
      timeoutRef.current
    ) {
      clearTimeout(
        timeoutRef.current,
      );
    }

    timeoutRef.current =
      setTimeout(
        () => {
          void initialize();
        },
        5_000,
      );
  }

  function goToPlayer() {
    if (
      timeoutRef.current
    ) {
      clearTimeout(
        timeoutRef.current,
      );

      timeoutRef.current =
        undefined;
    }

    navigation.reset({
      index:
        0,

      routes: [
        {
          name:
            'Player',
        },
      ],
    });
  }

  return (
    <View
      style={
        styles.container
      }
    >
      <Text
        style={
          styles.title
        }
      >
        Ativação do Player
      </Text>

      <Text
        style={
          styles.description
        }
      >
        Use este código no painel administrador para vincular esta TV.
      </Text>

      <View
        style={
          styles.codeBox
        }
      >
        <Text
          style={
            styles.code
          }
        >
          {code ?? '------'}
        </Text>
      </View>

      <View
        style={
          styles.statusBox
        }
      >
        {loading && (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
          />
        )}

        <Text
          style={
            styles.message
          }
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex:
        1,

      backgroundColor:
        '#000000',

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingHorizontal:
        32,
    },

    title: {
      color:
        '#FFFFFF',

      fontSize:
        32,

      fontWeight:
        '800',

      textAlign:
        'center',
    },

    description: {
      marginTop:
        16,

      color:
        '#A3A3A3',

      fontSize:
        18,

      textAlign:
        'center',

      lineHeight:
        26,

      maxWidth:
        620,
    },

    codeBox: {
      marginTop:
        40,

      paddingVertical:
        28,

      paddingHorizontal:
        52,

      borderRadius:
        18,

      borderWidth:
        2,

      borderColor:
        '#FFFFFF',

      backgroundColor:
        '#111111',
    },

    code: {
      color:
        '#FFFFFF',

      fontSize:
        52,

      fontWeight:
        '900',

      letterSpacing:
        8,

      textAlign:
        'center',
    },

    statusBox: {
      marginTop:
        32,

      alignItems:
        'center',

      gap:
        12,
    },

    message: {
      color:
        '#D4D4D4',

      fontSize:
        16,

      textAlign:
        'center',

      maxWidth:
        620,
    },
  });
