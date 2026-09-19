const sessionCookieOptions = () => {
    const configuredSecure = process.env.COOKIE_SECURE;
    if (configuredSecure !== undefined && !['true', 'false'].includes(configuredSecure)) {
        throw new Error('COOKIE_SECURE must be true or false');
    }
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: configuredSecure === undefined
            ? process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
            : configuredSecure === 'true',
    };
};

module.exports = { sessionCookieOptions };
