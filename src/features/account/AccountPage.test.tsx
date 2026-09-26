import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AccountPage } from './AccountPage';

const { state, resend } = vi.hoisted(() => ({
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
}));

vi.mock('../../auth/useAuthUser', () => ({
  useAuthUser: () => state.user,
}));

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { resend, updateUser: vi.fn(), signOut: vi.fn() } }),
  supabaseConfigured: () => true,
}));

afterEach(() => {
  cleanup();
  resend.mockReset();
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
});
