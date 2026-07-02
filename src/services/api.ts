import axios from 'axios';

const API_BASE_URL =
  'https://indoor-player-api.onrender.com';

export const api = axios.create({
  baseURL: API_BASE_URL,

  timeout: 60_000,

  headers: {
    Accept: 'application/json',
  },
});