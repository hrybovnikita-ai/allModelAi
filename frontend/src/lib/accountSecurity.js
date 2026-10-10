import { authGet, authPost } from './authApi.js';
import { readJsonBody } from './httpJson.js';

export async function fetchAccountSecurity() {
  const response = await authGet('account/security');
  const { data, parseError } = await readJsonBody(response);
  if (parseError) throw parseError;
  if (!response.ok) {
    throw Object.assign(new Error(data?.message || 'Could not load security settings.'), {
      status: response.status,
      code: data?.code,
    });
  }
  return data;
}

export async function setAccountPassword(payload) {
  const { data } = await authPost('account/password', payload);
  return data;
}
