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

const sessionCookieOptions = (req) => {
    const configuredSecure = process.env.COOKIE_SECURE;
    if (configuredSecure !== undefined && !['true', 'false'].includes(configuredSecure)) {
        throw new Error('COOKIE_SECURE must be true or false');
    }

    const configuredSameSite = String(process.env.COOKIE_SAME_SITE || '').trim().toLowerCase();
    let sameSite = 'lax';
    if (['lax', 'strict', 'none'].includes(configuredSameSite)) {
        sameSite = configuredSameSite;
    } else if (isCapacitorClientRequest(req)) {
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

module.exports = { sessionCookieOptions, isCapacitorClientOrigin, isCapacitorClientRequest };
