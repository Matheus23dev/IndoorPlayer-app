import axios, { AxiosHeaders } from 'axios';

import Config from 'react-native-config';

import { getDeviceToken } from '../storage/deviceStorage';

import { deviceSessionEvents } from '../events/deviceSessionEvents';

// 10.0.2.2 aponta para a máquina host no emulador Android. Em TVs físicas,
// API_BASE_URL deve ser informado no .env durante a geração do APK.
const DEFAULT_API_BASE_URL = 'http://10.0.2.2:3000';

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(
  Config.API_BASE_URL,
  DEFAULT_API_BASE_URL,
);

export const MEDIA_BASE_URL = `${API_BASE_URL}/files/indoor-player-api`;

function isPublicDeviceEndpoint(url: string | undefined) {
  const normalized = String(url);

  return (
    normalized.includes('/devices/register') ||
    normalized.includes('/devices/activate') ||
    normalized.includes('/devices/code/')
  );
}

export const api = axios.create({
  baseURL: API_BASE_URL,

  timeout: 60_000,

  headers: {
    Accept: 'application/json',
  },
});

api.interceptors.request.use(async config => {
  if (isPublicDeviceEndpoint(config.url)) {
    return config;
  }

  const token = await getDeviceToken();

  if (!token) {
    return config;
  }

  if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = new AxiosHeaders(config.headers);
  }

  config.headers.set('Authorization', `Bearer ${token}`);

  return config;
});

api.interceptors.response.use(
  response => response,

  async error => {
    const status = error?.response?.status;

    const url = error?.config?.url as string | undefined;

    const isUnauthorized = status === 401 || status === 403;

    if (isUnauthorized && !isPublicDeviceEndpoint(url)) {
      const token = await getDeviceToken();

      if (token) {
        deviceSessionEvents.emit({
          deviceId: null,

          reason: 'UNAUTHORIZED',

          keepCode: true,

          emittedAt: new Date().toISOString(),
        });
      }
    }

    return Promise.reject(error);
  },
);
