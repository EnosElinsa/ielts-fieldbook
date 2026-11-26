import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AccountPage } from './AccountPage';

const { state, resend, updateUser, rpc, signOut, localSignOut, clearLocal } = vi.hoisted(() => ({
  state: {
    user: {
      id: 'user-1',
      email: 'enoselinsa@gmail.com',
      created_at: '2026-09-25T12:00:00',
      last_sign_in_at: '2026-09-26T12:00:00',
      email_confirmed_at: '2026-09-25T12:05:00',
      user_metadata: { display_name: 'enoselinsa' },
    } as {
      id: string;
      email: string;
      created_at: string;
      last_sign_in_at: string;
      email_confirmed_at: string | null;
      user_metadata: { display_name: string };
    },
  },
  resend: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  localSignOut: vi.fn().mockResolvedValue({ error: null }),
  clearLocal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../auth/AuthGate', () => ({
  signOut,
}));

vi.mock('../../storage/accountCleanup', () => ({
  clearAccountLocalState: clearLocal,
}));

vi.mock('../../auth/useAuthUser', () => ({
  useAuthUser: () => state.user,
}));

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { resend, updateUser, signOut: localSignOut }, rpc }),
  supabaseConfigured: () => true,
}));

afterEach(() => {
  cleanup();
  resend.mockReset();
  updateUser.mockReset();
  rpc.mockReset();
  signOut.mockReset();
  localSignOut.mockReset().mockResolvedValue({ error: null });
  clearLocal.mockReset().mockResolvedValue(undefined);
  state.user.email_confirmed_at = '2026-09-25T12:05:00';
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );
}

describe('AccountPage identity', () => {
  test('shows English dates, initials, and a confirmed email', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'enoselinsa' })).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('25 Sept 2026')).toBeInTheDocument();
    expect(screen.getByText('26 Sept 2026')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
  });

  test('offers resend until the confirmation email is sent', async () => {
    state.user.email_confirmed_at = null;
    resend.mockResolvedValue({ error: null });
    renderPage();
    expect(screen.getByText('Not confirmed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'enoselinsa@gmail.com',
      options: { emailRedirectTo: window.location.origin },
    });
    expect(await screen.findByText(/Confirmation sent\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
    expect(screen.getByText('Not confirmed')).toBeInTheDocument();
  });

  test('shows the shared rate-limit sentence when resend fails', async () => {
    state.user.email_confirmed_at = null;
    resend.mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(await screen.findByText('Too many attempts. Wait a minute, then try again.')).toBeInTheDocument();
  });

  test('delete stays disabled until the typed email matches', async () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type your email'), 'other@gmail.com');
    expect(screen.getByText('Type the email shown above.')).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Type your email'));
    await userEvent.type(screen.getByLabelText('Type your email'), ' ENOSElinsa@gmail.com ');
    expect(button).toBeEnabled();
  });

  test('saves a new email with redirect options', async () => {
    updateUser.mockResolvedValue({ error: null, data: { user: state.user } });
    renderPage();
    await userEvent.type(screen.getByLabelText('New email'), 'next@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save email' }));
    expect(updateUser).toHaveBeenCalledWith(
      { email: 'next@example.com' },
      { emailRedirectTo: window.location.origin },
    );
  });

  test('renders sign-out errors only inside the leave panel and uses non-control metric labels', async () => {
    signOut.mockRejectedValueOnce(new Error('Network down'));
    const { container } = renderPage();
    expect(container.querySelectorAll('.metrics label')).toHaveLength(0);
    expect(container.querySelectorAll('.metrics .metric-label').length).toBeGreaterThanOrEqual(3);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const leavePanel = container.querySelector('.account-leave') as HTMLElement;
    const dangerPanel = container.querySelector('.account-danger') as HTMLElement;
    const alert = await screen.findByRole('alert');
    expect(leavePanel).toContainElement(alert);
    expect(alert).toHaveTextContent('Could not sign out. Try again.');
    expect(dangerPanel.querySelector('[role="alert"]')).toBeNull();
  });

  test('thrown network errors release busy controls and report alerts across account actions', async () => {
    state.user.email_confirmed_at = null;
    updateUser.mockRejectedValue(new TypeError('Failed to fetch'));
    resend.mockRejectedValue(new TypeError('Failed to fetch'));
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();

    await userEvent.type(screen.getByLabelText('New password'), 'secret1');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'secret1');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(screen.getByRole('button', { name: 'Resend' })).toBeEnabled();

    await userEvent.type(screen.getByLabelText('New email'), 'other@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save email' }));
    expect(screen.getByRole('button', { name: 'Save email' })).toBeEnabled();

    await userEvent.type(screen.getByLabelText('Type your email'), 'enoselinsa@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText('Could not delete this account. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeEnabled();
  });

  test('account deletion still clears local Supabase session and local data when remote sign-out fails after server deletion', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    signOut.mockRejectedValueOnce(new Error('Session already revoked'));
    renderPage();
    await userEvent.type(screen.getByLabelText('Type your email'), 'enoselinsa@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(rpc).toHaveBeenCalledWith('delete_own_account');
    expect(signOut).toHaveBeenCalledWith('user-1');
    expect(localSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearLocal).toHaveBeenCalledWith('user-1');
  });

  test('ignores concurrent account actions while another mutation is in flight', async () => {
    let resolveName!: (value: { error: null }) => void;
    updateUser.mockImplementationOnce(() => new Promise(resolve => { resolveName = resolve; }));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('form', { name: 'Name' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).not.toHaveBeenCalled();
    resolveName({ error: null });
    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  test('exposes accessible form labels, level-4 headings, password visibility toggle and non-live delete hint', async () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('h2, h3')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 4, name: 'enoselinsa' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Email address' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Delete account' })).toBeInTheDocument();
    expect(container.querySelector('section.account-leave')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Sign out' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');

    const deleteInput = screen.getByLabelText('Type your email');
    await userEvent.type(deleteInput, 'wrong@example.com');
    expect(deleteInput).toHaveAccessibleDescription('Type the email shown above.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('links validation errors via aria-invalid and aria-describedby and clears them on input', async () => {
    renderPage();
    const nameInput = screen.getByLabelText('Display name');
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAccessibleDescription('Enter a name.');
    await userEvent.type(nameInput, 'Alex');
    expect(nameInput).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();

    const passwordInput = screen.getByLabelText('New password');
    const confirmInput = screen.getByLabelText('Confirm password');
    await userEvent.type(passwordInput, 'secret1');
    await userEvent.type(confirmInput, 'secret2');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
    expect(confirmInput).toHaveAccessibleDescription('The two passwords do not match.');
    await userEvent.type(confirmInput, 'x');
    expect(passwordInput).not.toHaveAttribute('aria-invalid');
    expect(confirmInput).not.toHaveAttribute('aria-invalid');
  });
});
