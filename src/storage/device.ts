import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_CODE_KEY =
  '@indoor_player:device_code';

const DEVICE_ACTIVATION_SECRET_KEY =
  '@indoor_player:device_activation_secret';

const DEVICE_TOKEN_KEY =
  '@indoor_player:device_token';

export interface DeviceRegistration {
  code: string;
  activationSecret: string;
}

export async function saveDeviceRegistration(
  registration:
    DeviceRegistration,
) {
  await AsyncStorage.multiSet([
    [
      DEVICE_CODE_KEY,
      registration.code
        .trim()
        .toUpperCase(),
    ],

    [
      DEVICE_ACTIVATION_SECRET_KEY,
      registration.activationSecret,
    ],
  ]);
}

export async function getDeviceRegistration():
  Promise<
    DeviceRegistration |
    null
  > {
  const [
    [
      ,
      code,
    ],

    [
      ,
      activationSecret,
    ],
  ] =
    await AsyncStorage.multiGet([
      DEVICE_CODE_KEY,
      DEVICE_ACTIVATION_SECRET_KEY,
    ]);

  if (
    !code ||
    !activationSecret
  ) {
    return null;
  }

  return {
    code,
    activationSecret,
  };
}

export async function saveDeviceCode(
  code:
    string,
) {
  await AsyncStorage.setItem(
    DEVICE_CODE_KEY,
    code
      .trim()
      .toUpperCase(),
  );
}

export async function getDeviceCode() {
  return AsyncStorage.getItem(
    DEVICE_CODE_KEY,
  );
}

export async function removeDeviceCode() {
  await AsyncStorage.removeItem(
    DEVICE_CODE_KEY,
  );
}

export async function saveDeviceActivationSecret(
  activationSecret:
    string,
) {
  await AsyncStorage.setItem(
    DEVICE_ACTIVATION_SECRET_KEY,
    activationSecret,
  );
}

export async function getDeviceActivationSecret() {
  return AsyncStorage.getItem(
    DEVICE_ACTIVATION_SECRET_KEY,
  );
}

export async function saveDeviceToken(
  token:
    string,
) {
  await AsyncStorage.setItem(
    DEVICE_TOKEN_KEY,
    token,
  );
}

export async function getDeviceToken() {
  return AsyncStorage.getItem(
    DEVICE_TOKEN_KEY,
  );
}

export async function removeDeviceToken() {
  await AsyncStorage.removeItem(
    DEVICE_TOKEN_KEY,
  );
}

export async function removeDeviceRegistration() {
  await AsyncStorage.multiRemove([
    DEVICE_CODE_KEY,
    DEVICE_ACTIVATION_SECRET_KEY,
    DEVICE_TOKEN_KEY,
  ]);
}

export async function hasDeviceCode() {
  const code =
    await getDeviceCode();

  return Boolean(
    code,
  );
}

export async function hasDeviceToken() {
  const token =
    await getDeviceToken();

  return Boolean(
    token,
  );
}
