import axios from 'axios';
import { nativeClientHeaders, resolveApiUrl } from './apiBase.js';

export const apiClient = axios.create({
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  Object.assign(config.headers, nativeClientHeaders());

  const url = config.url || '';
  if (!url) return config;

  if (/^https?:\/\//i.test(url)) {
    config.url = resolveApiUrl(url);
  } else {
    config.url = resolveApiUrl(url.startsWith('/') ? url : `/${url}`);
  }

  return config;
});

export default apiClient;
