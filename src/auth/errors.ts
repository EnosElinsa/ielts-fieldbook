export type Mode = 'signin' | 'signup' | 'reset';

export function authError(message: string, mode: Mode) {
  const text = message || 'Something went wrong. Try again.';
  if (mode === 'signin' && /invalid login credentials/i.test(text)) {
    return 'That email has no account yet, or the password is wrong. Create an account, or open the confirmation email if you already registered.';
  }
  if (/already registered|already been registered|user already exists/i.test(text)) {
    return 'That email already has an account. Sign in, or reset the password.';
  }
  if (/email not confirmed/i.test(text)) {
    return 'Confirm the email first. Open the message we sent, then sign in.';
  }
  if (/password should be at least|weak password/i.test(text)) {
    return 'Use at least 6 characters.';
  }
  if (/rate limit|too many requests/i.test(text)) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return text;
}
