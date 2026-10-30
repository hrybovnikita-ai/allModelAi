/**
 * AllModelAI copy and client-side hints for Clerk passwords.
 * Clerk Dashboard + Clerk API remain the source of truth — never bypass server validation.
 */

/** Matches Clerk default minimum when Dashboard policy is NIST-style (8+). */
export const CLERK_PASSWORD_MIN_LENGTH = 8;

export const CLERK_PASSWORD_HINT = 'Use at least 8 characters.';

/**
 * Client-side hint for tests and UI only. Clerk SignUp/SignIn still validates on the server.
 * Supports long passwords — no max length check here (Clerk enforces max_length from Dashboard).
 */
export function clerkPasswordMeetsMinimumLength(password) {
  return typeof password === 'string' && password.length >= CLERK_PASSWORD_MIN_LENGTH;
}

/**
 * Partial Clerk localization overrides — merged by ClerkProvider with built-in en-US strings.
 * Keeps breached-password messaging; simplifies length copy to match product requirements.
 */
export function clerkAuthPasswordLocalization() {
  return {
    unstable__errors: {
      form_password_length_too_short: CLERK_PASSWORD_HINT,
      form_password_not_strong_enough: CLERK_PASSWORD_HINT,
      passwordComplexity: {
        sentencePrefix: 'Use at least',
        minimumLength: '{{length}} characters.',
        maximumLength: '',
        requireLowercase: '',
        requireNumbers: '',
        requireSpecialCharacter: '',
        requireUppercase: '',
      },
    },
  };
}

/**
 * Manual Clerk Dashboard checklist (Production instance). Code cannot change these remotely.
 */
export const CLERK_DASHBOARD_PASSWORD_POLICY_CHECKLIST = [
  'User & authentication → Email, Phone, Username → Password: minimum length 8 (default).',
  'Disable optional complexity rules unless required: uppercase, lowercase, numbers, special characters — leave OFF for simple passwords.',
  'Keep "Reject compromised passwords" / Have I Been Pwned enabled (recommended).',
  'Do not enable extra zxcvbn "strong password" requirements if you want memorable 8+ character passwords.',
  'Authorized domains must include your app host (localhost for dev, all-model-ai.com for production).',
  'Google OAuth can stay enabled alongside email/password — no password required for social sign-in.',
];
