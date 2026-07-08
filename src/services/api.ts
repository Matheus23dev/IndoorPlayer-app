import axios, {
  AxiosHeaders,
} from 'axios';

import {
  getDeviceToken,
} from '../storage/device';

import {
  deviceSessionEvents,
} from './deviceSessionEvents';

const API_BASE_URL =
  'https://indoor-player-api.onrender.com';

function isPublicDeviceEndpoint(
  url:
    string | undefined,
) {
  const normalized =
    String(
      url ??
      '',
    );

  return (
    normalized.includes(
      '/devices/register',
    ) ||
    normalized.includes(
      '/devices/activate',
    ) ||
    normalized.includes(
      '/devices/code/',
    )
  );
}

export const api =
  axios.create({
    baseURL:
      API_BASE_URL,

    timeout:
      60_000,

    headers: {
      Accept:
        'application/json',
    },
  });

api.interceptors.request.use(
  async config => {
    if (
      isPublicDeviceEndpoint(
        config.url,
      )
    ) {
      return config;
    }

    const token =
      await getDeviceToken();

    if (!token) {
      return config;
    }

    if (
      !(config.headers
        instanceof AxiosHeaders)
    ) {
      config.headers =
        new AxiosHeaders(
          config.headers,
        );
    }

    config.headers.set(
      'Authorization',
      `Bearer ${token}`,
    );

    return config;
  },
);

api.interceptors.response.use(
  response =>
    response,

  async error => {
    const status =
      error?.response?.status;

    const url =
      error?.config?.url as
        | string
        | undefined;

    const isUnauthorized =
      status ===
        401 ||
      status ===
        403;

    if (
      isUnauthorized &&
      !isPublicDeviceEndpoint(
        url,
      )
    ) {
      const token =
        await getDeviceToken();

      if (token) {
        deviceSessionEvents.emit({
          deviceId:
            null,

          reason:
            'UNAUTHORIZED',

          keepCode:
            true,

          emittedAt:
            new Date()
              .toISOString(),
        });
      }
    }

    return Promise.reject(
      error,
    );
  },
);
