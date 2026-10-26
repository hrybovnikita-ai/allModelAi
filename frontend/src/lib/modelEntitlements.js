import { isAnoninModelSlug } from './anoninModelSlug';

/** Keep in sync with backend/src/billing/modelEntitlements.js */
export const FREE_GEMINI_VARIANT_IDS = Object.freeze([
  '3.5-flash-lite',
  '3.1-flash-lite',
  '3-flash',
]);

export const FREE_USER_MODEL_KEYS = Object.freeze([
  'smart',
  'anonin',
  'gemini:3.5-flash-lite',
  'gemini:3.1-flash-lite',
  'gemini:3-flash',
]);

export const FREE_USER_MODEL_COUNT = FREE_USER_MODEL_KEYS.length;

export const ENTITLEMENT_TIER = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  ADMIN: 'admin',
});

const DEFAULT_FREE_GEMINI_VARIANT_ID = '3.5-flash-lite';

export function entitlementKey(slug, variantId) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return '';
  if (normalizedSlug === 'smart' || isAnoninModelSlug(normalizedSlug) || normalizedSlug === 'ai_python') {
    return normalizedSlug === 'anonin' || isAnoninModelSlug(normalizedSlug) ? 'anonin' : normalizedSlug;
  }
  const variant = String(variantId || '').trim();
  if (variant) return `${normalizedSlug}:${variant}`;
  return normalizedSlug;
}

export function isPaidPlanAccess(creditStatus) {
  if (!creditStatus) return false;
  if (creditStatus.isOwner && creditStatus.mode !== 'user' && creditStatus.plusActive !== false) return true;
  if (creditStatus.isDeveloper && creditStatus.canUseDeveloper && creditStatus.mode === 'developer') return true;
  if (creditStatus.models?.includes('all')) return true;
  if (creditStatus.hasSubscription && creditStatus.active) return true;
  if (creditStatus.unlimited && creditStatus.canUseDeveloper) return true;
  return false;
}

export function resolveEntitlementTier(creditStatus) {
  if (!creditStatus) return ENTITLEMENT_TIER.FREE;
  if (creditStatus.entitlementTier) return creditStatus.entitlementTier;
  if (isPaidPlanAccess(creditStatus)) {
    return creditStatus.isOwner || (creditStatus.isDeveloper && creditStatus.mode === 'developer')
      ? ENTITLEMENT_TIER.ADMIN
      : ENTITLEMENT_TIER.PRO;
  }
  return ENTITLEMENT_TIER.FREE;
}

function freeKeysForUser(creditStatus) {
  if (Array.isArray(creditStatus?.freeModelKeys) && creditStatus.freeModelKeys.length) {
    return creditStatus.freeModelKeys;
  }
  return FREE_USER_MODEL_KEYS;
}

export function canUseChatModel(creditStatus, slug, variantId) {
  const normalized = String(slug || '').trim();
  if (!normalized || normalized === 'smart' || normalized === 'ai_python') return true;
  if (isAnoninModelSlug(normalized)) return !isPaidPlanAccess(creditStatus) ? true : true;

  if (creditStatus?.ownerPreview) {
    return hasFreeEntitlement(creditStatus, normalized, variantId);
  }

  if (isPaidPlanAccess(creditStatus)) {
    if (creditStatus?.models?.includes('all')) return true;
    return Boolean(creditStatus?.models?.includes(normalized));
  }

  return hasFreeEntitlement(creditStatus, normalized, variantId);
}

export function hasFreeEntitlement(creditStatus, slug, variantId) {
  const keys = new Set(freeKeysForUser(creditStatus));
  if (slug === 'smart' || isAnoninModelSlug(slug)) return true;
  if (slug === 'gemini') {
    const resolvedVariant = String(variantId || DEFAULT_FREE_GEMINI_VARIANT_ID).trim();
    return keys.has(`gemini:${resolvedVariant}`);
  }
  return keys.has(entitlementKey(slug, variantId));
}

export function isSelectableFreeModel(creditStatus, slug, variantId) {
  if (slug === 'smart' || isAnoninModelSlug(slug)) {
    return canUseChatModel(creditStatus, slug, variantId);
  }
  if (slug === 'gemini') {
    return canUseChatModel(creditStatus, slug, variantId);
  }
  return false;
}

export function isPremiumLockedModel(creditStatus, slug, variantId) {
  if (isPaidPlanAccess(creditStatus)) return false;
  if (slug === 'smart' || isAnoninModelSlug(slug)) return false;
  if (slug === 'gemini') {
    return !canUseChatModel(creditStatus, slug, variantId);
  }
  return true;
}

export function freeModelsLabel(creditStatus, t) {
  if (creditStatus?.models?.includes('all')) return t('All models');
  if (creditStatus?.plusTestMode) return t('Plus Test Mode · all models');
  const count = creditStatus?.freeModelCount ?? FREE_USER_MODEL_COUNT;
  if (count === 5) return t('5 free models');
  return `${count} free models`;
}

export function buildProCheckoutPath({ returnModel, returnVariant } = {}) {
  const params = new URLSearchParams({ plan: 'pro' });
  if (returnModel && returnModel !== 'smart') {
    params.set('returnModel', String(returnModel));
  }
  if (returnVariant) params.set('returnVariant', String(returnVariant));
  return `/checkout?${params.toString()}`;
}

/** @deprecated */
export const FREE_PLAN_CHAT_MODELS = FREE_USER_MODEL_KEYS;
