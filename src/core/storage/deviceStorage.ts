import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_CODE_KEY = '@indoor_player:device_code';

const DEVICE_ACTIVATION_SECRET_KEY = '@indoor_player:device_activation_secret';

const DEVICE_TOKEN_KEY = '@indoor_player:device_token';

export interface DeviceRegistration {
  code: string;
  activationSecret: string;
}

export async function saveDeviceRegistration(registration: DeviceRegistration) {
  try {
    await AsyncStorage.multiSet([
      [DEVICE_CODE_KEY, normalizeDeviceCode(registration.code)],
      [DEVICE_ACTIVATION_SECRET_KEY, registration.activationSecret],
    ]);
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao salvar registro do dispositivo:',
      error,
    );

    throw error;
  }
}

export async function getDeviceRegistration(): Promise<DeviceRegistration | null> {
  try {
    const values = await AsyncStorage.multiGet([
      DEVICE_CODE_KEY,
      DEVICE_ACTIVATION_SECRET_KEY,
    ]);

    const code = values.find(([key]) => key === DEVICE_CODE_KEY)?.[1] ?? null;

    const activationSecret =
      values.find(([key]) => key === DEVICE_ACTIVATION_SECRET_KEY)?.[1] ?? null;

    if (!code || !activationSecret) {
      return null;
    }

    return {
      code,
      activationSecret,
    };
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao buscar registro do dispositivo:',
      error,
    );

    return null;
  }
}

export async function saveDeviceCode(code: string) {
  try {
    await AsyncStorage.setItem(DEVICE_CODE_KEY, normalizeDeviceCode(code));
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao salvar código do dispositivo:',
      error,
    );

    throw error;
  }
}

export async function getDeviceCode() {
  try {
    return await AsyncStorage.getItem(DEVICE_CODE_KEY);
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao buscar código do dispositivo:',
      error,
    );

    return null;
  }
}

export async function removeDeviceCode() {
  try {
    await AsyncStorage.removeItem(DEVICE_CODE_KEY);
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao remover código do dispositivo:',
      error,
    );

    throw error;
  }
}

export async function saveDeviceActivationSecret(activationSecret: string) {
  try {
    await AsyncStorage.setItem(DEVICE_ACTIVATION_SECRET_KEY, activationSecret);
  } catch (error) {
    console.log('[DEVICE STORAGE] Erro ao salvar activationSecret:', error);

    throw error;
  }
}

export async function getDeviceActivationSecret() {
  try {
    return await AsyncStorage.getItem(DEVICE_ACTIVATION_SECRET_KEY);
  } catch (error) {
    console.log('[DEVICE STORAGE] Erro ao buscar activationSecret:', error);

    return null;
  }
}

export async function saveDeviceToken(token: string) {
  try {
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch (error) {
    console.log('[DEVICE STORAGE] Erro ao salvar token do dispositivo:', error);

    throw error;
  }
}

export async function getDeviceToken() {
  try {
    return await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  } catch (error) {
    console.log('[DEVICE STORAGE] Erro ao buscar token do dispositivo:', error);

    return null;
  }
}

export async function removeDeviceToken() {
  try {
    await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao remover token do dispositivo:',
      error,
    );

    throw error;
  }
}

export async function removeDeviceRegistration() {
  try {
    await AsyncStorage.multiRemove([
      DEVICE_CODE_KEY,
      DEVICE_ACTIVATION_SECRET_KEY,
      DEVICE_TOKEN_KEY,
    ]);
  } catch (error) {
    console.log(
      '[DEVICE STORAGE] Erro ao remover registro do dispositivo:',
      error,
    );

    throw error;
  }
}

export async function hasDeviceCode() {
  const code = await getDeviceCode();

  return Boolean(code);
}

export async function hasDeviceToken() {
  const token = await getDeviceToken();

  return Boolean(token);
}

function normalizeDeviceCode(code: string) {
  return code.trim().toUpperCase();
}
