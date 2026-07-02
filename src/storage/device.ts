import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_CODE_KEY =
  '@indoor_player:device_code';

export async function saveDeviceCode(
  code: string,
) {
  await AsyncStorage.setItem(
    DEVICE_CODE_KEY,
    code,
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

export async function hasDeviceCode() {
  const code =
    await getDeviceCode();

  return Boolean(code);
}