const isCapacitorClientOrigin = (origin) => {
    if (!origin || typeof origin !== 'string') return false;
    const normalized = origin.trim().replace(/\/$/, '').toLowerCase();
    if (normalized === 'https://localhost' || normalized === 'http://localhost') return true;
    if (normalized.startsWith('capacitor://') || normalized.startsWith('ionic://')) return true;
    return false;
};

const isCapacitorClientRequest = (req) => {
    if (!req?.get) return false;
    if (req.get('x-allmodelai-client') === 'capacitor') return true;
    return isCapacitorClientOrigin(req.get('origin'));
};

/** Frontend and API on different origins (Safari, split Vercel/Render deploy). */
const isCrossSiteAuthRequest = (req) => {
    if (!req?.get) return false;
    const origin = String(req.get('origin') || '').trim();
    if (!origin) return false;
    try {
        const requestHost = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        if (!requestHost) return false;
        const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
        return new URL(origin).origin !== `${proto}://${requestHost}`.replace(/\/$/, '');
    } catch {
        return false;
    }
};

const shouldIssueNativeSessionToken = (req) => isCapacitorClientRequest(req) || isCrossSiteAuthRequest(req);

/** SameSite=None requires Secure; only use on HTTPS cross-site (production split deploy). */
const needsCrossSiteCookies = (req) => {
    if (!isCrossSiteAuthRequest(req)) return false;
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    if (proto === 'https') return true;
    return process.env.COOKIE_SECURE === 'true';
};

const sessionCookieOptions = (req) => {
    const configuredSecure = process.env.COOKIE_SECURE;
    if (configuredSecure !== undefined && !['true', 'false'].includes(configuredSecure)) {
        throw new Error('COOKIE_SECURE must be true or false');
    }

    const configuredSameSite = String(process.env.COOKIE_SAME_SITE || '').trim().toLowerCase();
    let sameSite = 'lax';
    if (['lax', 'strict', 'none'].includes(configuredSameSite)) {
        sameSite = configuredSameSite;
    } else if (needsCrossSiteCookies(req)) {
        sameSite = 'none';
    }

    let secure = configuredSecure === undefined
        ? process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
        : configuredSecure === 'true';

    if (sameSite === 'none') {
        secure = true;
    }

    return {
        httpOnly: true,
        sameSite,
        path: '/',
        secure,
    };
};

module.exports = {
    sessionCookieOptions,
    isCapacitorClientOrigin,
    isCapacitorClientRequest,
    isCrossSiteAuthRequest,
    shouldIssueNativeSessionToken,
    needsCrossSiteCookies,
};
