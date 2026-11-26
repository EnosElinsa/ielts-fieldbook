import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AuthGate } from './AuthGate';
import { ThemeProvider } from '../context/ThemeContext';

const { signUp, signInWithPassword, getSession, resend, resetPasswordForEmail, onAuthStateChange, remoteOwner, resetAccountStore } = vi.hoisted(() => {
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
    remoteOwner: { current: null as string | null },
    resetAccountStore: vi.fn(),
  };
});

vi.mock('../storage/remote', () => ({
  accountId: () => remoteOwner.current,
  resetAccountStore,
}));

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
  vi.useRealTimers();
  signUp.mockReset();
  signInWithPassword.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  resend.mockReset();
  resetPasswordForEmail.mockReset();
  onAuthStateChange.mockClear();
  remoteOwner.current = null;
  resetAccountStore.mockReset();
  window.location.hash = '';
});

test('a stalled session check offers a real retry and can reach sign-in', async () => {
  vi.useFakeTimers();
  getSession.mockImplementationOnce(() => new Promise(() => {}));
  render(<AuthGate><p>Study workspace</p></AuthGate>);
  expect(screen.getByRole('status')).toHaveTextContent('Checking your saved session');
  expect(screen.queryByRole('button', { name: 'Retry connection' })).not.toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(10_000); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry connection' })); });
  expect(getSession).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});

async function renderGate() {
  render(
    <AuthGate>
      <p>Notebook</p>
    </AuthGate>,
  );
  await screen.findByRole('heading', { name: 'Sign in' });
}

test('signup shows confirmation steps and supports resending the email', async () => {
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
  expect(await screen.findByText('Return to IELTS Fieldbook in the tab that opens.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I confirmed it. Sign in' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }));
  expect(resend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'enoselinsa@gmail.com',
    options: { emailRedirectTo: window.location.origin },
  });
  expect(await screen.findByText('Confirmation email sent.')).toBeInTheDocument();
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
  expect(screen.queryByText('Confirm your email')).not.toBeInTheDocument();
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

test('system theme follows OS dark preference, switches to light mode, and exposes live auth roles', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  localStorage.clear();
  signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid login credentials' } } as never);
  signUp.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
  try {
    render(<ThemeProvider><AuthGate><p>Notebook</p></AuthGate></ThemeProvider>);
    const toggle = await screen.findByRole('button', { name: 'Use light theme' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.setup().click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpw');
    await userEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    await userEvent.type(screen.getByLabelText('Password'), 'secret1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    resend.mockResolvedValueOnce({ error: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Resend confirmation' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmation email sent.');
  } finally {
    vi.unstubAllGlobals();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  }
});

test('a stalled sign-in request times out and releases the busy button', async () => {
  vi.useFakeTimers();
  signInWithPassword.mockImplementationOnce(() => new Promise(() => {}));
  render(<AuthGate><p>Notebook</p></AuthGate>);
  await act(async () => { await Promise.resolve(); });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
  fireEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
  expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(15_000); });
  expect(screen.getByRole('alert')).toHaveTextContent(/took too long/i);
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
});

test('password toggle exposes aria-pressed and signup links the password requirement hint', async () => {
  await renderGate();
  const toggle = screen.getByRole('button', { name: 'Show password' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/At least 6 characters/);
});

test('cross-tab SIGNED_OUT clears previous owner tab session storage and resets matching account store while preserving other accounts', async () => {
  sessionStorage.clear();
  remoteOwner.current = 'account-a';
  sessionStorage.setItem('fieldbook:module-memory:v1:"account-a"', '{"version":1}');
  sessionStorage.setItem('fieldbook:module-memory:v1:"account-b"', '{"version":1}');
  getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'account-a' } } }, error: null } as never);
  render(<AuthGate><p>Notebook</p></AuthGate>);
  expect(await screen.findByText('Notebook')).toBeInTheDocument();
  const listener = onAuthStateChange.mock.calls[0][0];
  await act(async () => {
    listener('SIGNED_OUT', null);
  });
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  await waitFor(() => expect(resetAccountStore).toHaveBeenCalledOnce());
  expect(sessionStorage.getItem('fieldbook:module-memory:v1:"account-a"')).toBeNull();
  expect(sessionStorage.getItem('fieldbook:module-memory:v1:"account-b"')).not.toBeNull();
  sessionStorage.clear();
});

test('cross-tab cleanup does not wipe tab storage or store if the same account signs back in before async cleanup runs', async () => {
  sessionStorage.clear();
  remoteOwner.current = 'account-a';
  sessionStorage.setItem('fieldbook:module-memory:v1:"account-a"', '{"version":1}');
  getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'account-a' } } }, error: null } as never);
  render(<AuthGate><p>Notebook</p></AuthGate>);
  expect(await screen.findByText('Notebook')).toBeInTheDocument();
  const listener = onAuthStateChange.mock.calls[0][0];
  await act(async () => {
    listener('SIGNED_OUT', null);
    listener('SIGNED_IN', { user: { id: 'account-a' } });
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(screen.getByText('Notebook')).toBeInTheDocument();
  expect(resetAccountStore).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('fieldbook:module-memory:v1:"account-a"')).toBe('{"version":1}');
  sessionStorage.clear();
});

test('a slow initial getSession resolution or failure cannot overwrite a newer onAuthStateChange sign-in', async () => {
  let resolveSession!: (value: { data: { session: null }; error: null }) => void;
  getSession.mockImplementationOnce(() => new Promise(resolve => { resolveSession = resolve; }));
  render(<AuthGate><p>Notebook</p></AuthGate>);
  const listener = onAuthStateChange.mock.calls[0][0];
  await act(async () => {
    listener('SIGNED_IN', { user: { id: 'account-a' } });
  });
  expect(await screen.findByText('Notebook')).toBeInTheDocument();
  await act(async () => {
    resolveSession({ data: { session: null }, error: null });
    await Promise.resolve();
  });
  expect(screen.getByText('Notebook')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
});
