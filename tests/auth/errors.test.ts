import { test } from 'vitest';
import assert from 'node:assert/strict';
import { authError } from '../../src/auth/errors';

test('authError maps the sign-in failures the account page can also hit', () => {
  assert.equal(
    authError('Invalid login credentials', 'signin'),
    'That email has no account yet, or the password is wrong. Create an account, or open the confirmation email if you already registered.',
  );
  assert.equal(
    authError('User already registered', 'signup'),
    'That email already has an account. Sign in, or reset the password.',
  );
  assert.equal(
    authError('Email not confirmed', 'signin'),
    'Confirm the email first. Open the message we sent. The notebook opens from that link.',
  );
  assert.equal(authError('Password should be at least 6 characters', 'signup'), 'Use at least 6 characters.');
  assert.equal(
    authError('For security purposes, you can only request this after 60 seconds. Rate limit.', 'signup'),
    'Too many attempts. Wait a minute, then try again.',
  );
  assert.equal(authError('', 'signin'), 'Something went wrong. Try again.');
});

test('authError maps an expired or used link', () => {
  const expired = 'Email link is invalid or has expired otp_expired';
  assert.equal(authError(expired, 'signup'), 'This link no longer works. Send another confirmation email.');
  assert.equal(authError(expired, 'reset'), 'This link no longer works. Send another reset email.');
  assert.equal(authError(expired, 'signin'), 'This link no longer works. Request a new email below.');
});
