import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AuthGate } from './AuthGate';

const { signUp, resend, resetPasswordForEmail } = vi.hoisted(() => ({
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      signUp,
      resend,
      resetPasswordForEmail,
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

afterEach(() => {
  cleanup();
  signUp.mockReset();
  resend.mockReset();
  resetPasswordForEmail.mockReset();
  window.location.hash = '';
});

async function renderGate() {
  render(
    <AuthGate>
      <p>Notebook</p>
    </AuthGate>,
  );
  await screen.findByRole('heading', { name: 'Sign in' });
}

test('the confirmation link opens the notebook and resend uses the shared sentence', async () => {
  signUp.mockResolvedValue({ data: { session: null }, error: null });
  resend.mockResolvedValue({ error: null });
  await renderGate();
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  await userEvent.type(screen.getByLabelText('Email'), 'enoselinsa@gmail.com');
  await userEvent.type(screen.getByLabelText('Password'), 'secret1');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(signUp).toHaveBeenCalledWith({
    email: 'enoselinsa@gmail.com',
    password: 'secret1',
    options: { emailRedirectTo: window.location.origin },
  });
  expect(await screen.findByText('The notebook opens in that tab.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I confirmed it. Sign in' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }));
  expect(resend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'enoselinsa@gmail.com',
    options: { emailRedirectTo: window.location.origin },
  });
  expect(await screen.findByText('Confirmation sent.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resend confirmation' })).not.toBeInTheDocument();
});

test('the reset mailbox does not ask for a second sign-in', async () => {
  resetPasswordForEmail.mockResolvedValue({ error: null });
  await renderGate();
  await userEvent.click(screen.getByRole('button', { name: 'Forgot password' }));
  await userEvent.type(screen.getByLabelText('Email'), 'enoselinsa@gmail.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText('Enter a new password on the page that opens.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I confirmed it. Sign in' })).not.toBeInTheDocument();
});

test('an expired link with no type uses the sign-in sentence', async () => {
  window.location.hash = '#error_description=Email+link+is+invalid+or+has+expired&error_code=otp_expired';
  await renderGate();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('This link no longer works. Request a new email below.')).toBeInTheDocument();
});

test('an expired signup link keeps the sign-in card and the confirmation sentence', async () => {
  window.location.hash =
    '#error_description=Email+link+is+invalid+or+has+expired&error_code=otp_expired&type=signup';
  await renderGate();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('This link no longer works. Send another confirmation email.')).toBeInTheDocument();
});
