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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !error.config?.skipAuthRedirect) {
      const { handleUnauthorizedApiResponse } = await import('./clientAuthReset.js');
      await handleUnauthorizedApiResponse(url);
    }
    return Promise.reject(error);
  },
);

export default apiClient;
