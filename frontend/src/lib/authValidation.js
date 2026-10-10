const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

export function validateRegistrationForm({ name, email, password, confirmPassword }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return { ok: false, message: 'Please enter your name.' };
  }
  if (trimmedName.length < MIN_NAME_LENGTH || trimmedName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`,
    };
  }

  const trimmedEmail = String(email || '').trim();
  if (!trimmedEmail) {
    return { ok: false, message: 'Please enter your email address.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail.toLowerCase())) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  if (!password) {
    return { ok: false, message: 'Please enter a password.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match.' };
  }

  return {
    ok: true,
    payload: {
      name: trimmedName,
      email: trimmedEmail.toLowerCase(),
      password,
    },
  };
}

export function validatePasswordEnrollmentForm({ newPassword, confirmPassword, currentPassword }, { passwordEnabled = false } = {}) {
  if (!newPassword) {
    return { ok: false, message: 'Please enter a new password.' };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match.' };
  }
  if (passwordEnabled && !currentPassword) {
    return { ok: false, message: 'Enter your current password.' };
  }
  return {
    ok: true,
    payload: {
      newPassword,
      confirmPassword,
      currentPassword: passwordEnabled ? currentPassword : undefined,
    },
  };
}
