import axios from 'axios';
import { nativeClientHeaders, resolveApiUrl } from './apiBase.js';

export const apiClient = axios.create({
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    ...nativeClientHeaders(),
  },
});

apiClient.interceptors.request.use((config) => {
  const url = config.url || '';
  if (url && !/^https?:\/\//i.test(url)) {
    config.url = resolveApiUrl(url.startsWith('/') ? url : `/${url}`);
  }
  return config;
});

export default apiClient;
