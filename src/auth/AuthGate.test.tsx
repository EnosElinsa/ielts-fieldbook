import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AuthGate } from './AuthGate';

const { signUp, signInWithPassword, getSession, resend, resetPasswordForEmail, onAuthStateChange } = vi.hoisted(() => {
  type AuthListener = (event: string, session: unknown) => void;
  return {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    resend: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    onAuthStateChange: vi.fn((callback: AuthListener) => {
      void callback;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }),
  };
});

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      signUp,
      resend,
      resetPasswordForEmail,
      signInWithPassword,
      updateUser: vi.fn(),
      getSession,
      onAuthStateChange,
    },
  }),
}));

afterEach(() => {
  cleanup();
  signUp.mockReset();
  signInWithPassword.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  resend.mockReset();
  resetPasswordForEmail.mockReset();
  onAuthStateChange.mockClear();
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

test('an expired recovery link opens the reset form', async () => {
  window.location.hash =
    '#error_description=Email+link+is+invalid+or+has+expired&error_code=otp_expired&type=recovery';
  render(
    <AuthGate>
      <p>Notebook</p>
    </AuthGate>,
  );
  expect(await screen.findByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
  expect(screen.getByText('This link no longer works. Send another reset email.')).toBeInTheDocument();
});

test('the notebook opens when a session exists', async () => {
  await renderGate();
  const listener = onAuthStateChange.mock.calls[0][0];
  listener('SIGNED_IN', { user: { id: 'u' } });
  expect(await screen.findByText('Notebook')).toBeInTheDocument();
  expect(screen.queryByText('Confirm this address')).not.toBeInTheDocument();
});

const connectionError = 'Could not reach the sign-in service. Check your connection and try again. The service may be temporarily unavailable.';

test('a returned connection error leaves sign-in available and preserves the input', async () => {
  signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Failed to fetch' } });
  await renderGate();
  await userEvent.type(screen.getByLabelText('Email'), 'learner@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'test-password');
  await userEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
  expect(await screen.findByText(connectionError)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
  expect(screen.getByLabelText('Email')).toHaveValue('learner@example.test');
  expect(screen.getByLabelText('Password')).toHaveValue('test-password');
});

test('a thrown sign-in connection failure releases the busy state', async () => {
  signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
  await renderGate();
  await userEvent.type(screen.getByLabelText('Email'), 'learner@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'test-password');
  await userEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
  expect(await screen.findByText(connectionError)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
});

test('a failed saved-session check shows a retry and recovers without clearing the session', async () => {
  getSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await renderGate();
  expect(await screen.findByText(connectionError)).toBeInTheDocument();
  getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null } as never);
  await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  expect(await screen.findByText('Notebook')).toBeInTheDocument();
});

test('a returned saved-session error offers the same connection retry', async () => {
  getSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Failed to fetch' } } as never);
  await renderGate();
  expect(screen.getByText(connectionError)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled();
});
