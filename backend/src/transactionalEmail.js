const crypto = require('node:crypto');

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    })[character]);
}

function isTransactionalEmailConfigured() {
    return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

function resolveFrontendOrigin() {
    const raw = String(process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',')[0]
        .trim();
    return raw.replace(/\/$/, '') || 'http://localhost:5173';
}

async function sendResendEmail({ to, subject, text, html, idempotencyKey }) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) {
        return { sent: false, reason: 'not_configured' };
    }

    const response = await fetch('https://api.resend.com/emails', {
        signal: AbortSignal.timeout(5000),
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
    });

    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        return {
            sent: false,
            reason: 'delivery_failed',
            status: response.status,
            error: details?.message || response.statusText,
        };
    }

    return { sent: true };
}

async function sendPasswordResetEmail({ email, token }) {
    const origin = resolveFrontendOrigin();
    const resetUrl = `${origin}/forgot-password?token=${encodeURIComponent(token)}`;
    const safeEmail = escapeHtml(email);
    const text = [
        'Reset your AllModelAI password',
        '',
        `Use this link within 30 minutes to set a new AllModelAI password:`,
        resetUrl,
        '',
        'If you did not request this, you can ignore this email.',
        'This never uses or asks for your Google password.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;background:#111827;color:#e5e7eb;border-radius:16px">
      <div style="display:inline-block;padding:8px 12px;background:#6d5dfc;border-radius:10px;font-weight:700;color:#fff">AI</div>
      <h1 style="color:#fff;font-size:22px">Reset your AllModelAI password</h1>
      <p>We received a password reset request for <strong style="color:#fff">${safeEmail}</strong>.</p>
      <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;margin:16px 0;padding:12px 18px;background:#6d5dfc;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Set new password</a></p>
      <p style="color:#94a3b8;font-size:13px">This link expires in 30 minutes and can be used once. It never asks for your Google password.</p>
      <p style="color:#94a3b8;font-size:13px">If you did not request this, ignore this email.</p>
    </div>`;

    const idempotencyKey = `pwd-reset-${crypto.createHash('sha256').update(`${email}:${token.slice(0, 12)}`).digest('hex').slice(0, 32)}`;
    return sendResendEmail({
        to: email,
        subject: 'Reset your AllModelAI password',
        text,
        html,
        idempotencyKey,
    });
}

async function sendEmailVerificationEmail({ email, token }) {
    const origin = resolveFrontendOrigin();
    const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
    const safeEmail = escapeHtml(email);
    const text = [
        'Verify your AllModelAI email',
        '',
        `Confirm ${email} by opening this link within 30 minutes:`,
        verifyUrl,
        '',
        'If you did not create an AllModelAI account, you can ignore this email.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;background:#111827;color:#e5e7eb;border-radius:16px">
      <div style="display:inline-block;padding:8px 12px;background:#6d5dfc;border-radius:10px;font-weight:700;color:#fff">AI</div>
      <h1 style="color:#fff;font-size:22px">Verify your email</h1>
      <p>Confirm <strong style="color:#fff">${safeEmail}</strong> to finish creating your AllModelAI account.</p>
      <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;margin:16px 0;padding:12px 18px;background:#6d5dfc;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Verify email</a></p>
      <p style="color:#94a3b8;font-size:13px">This link expires in 30 minutes.</p>
    </div>`;

    const idempotencyKey = `email-verify-${crypto.createHash('sha256').update(`${email}:${token.slice(0, 12)}`).digest('hex').slice(0, 32)}`;
    return sendResendEmail({
        to: email,
        subject: 'Verify your AllModelAI email',
        text,
        html,
        idempotencyKey,
    });
}

module.exports = {
    escapeHtml,
    isTransactionalEmailConfigured,
    resolveFrontendOrigin,
    sendPasswordResetEmail,
    sendEmailVerificationEmail,
};
