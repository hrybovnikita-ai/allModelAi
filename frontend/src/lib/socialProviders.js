export const FIREBASE_PROVIDER_IDS = {
  Google: 'google.com',
  GitHub: 'github.com',
};

export const SOCIAL_PROVIDER_LABELS = Object.keys(FIREBASE_PROVIDER_IDS);

export function firebaseProviderId(displayName) {
  return FIREBASE_PROVIDER_IDS[displayName] || `${String(displayName || '').toLowerCase()}.com`;
}
