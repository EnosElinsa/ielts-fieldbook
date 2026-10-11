import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CommandSearch, MobileNavigation } from './WorkbenchNavigation';
const { fb } = vi.hoisted(() => ({ fb: { state: { questions: [], speakingTopics: [], sessions: [], vocabulary: [], examAttempts: [] }, setSkill: vi.fn() } }));
vi.mock('../context/FieldbookContext', () => ({ useFieldbook: () => fb }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('../auth/AuthGate', () => ({ signOut: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test('search routes reading and listening through skill selection', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CommandSearch open onClose={() => {}} /></MemoryRouter>);
  await user.type(screen.getByRole('textbox', { name: 'Search Fieldbook' }), 'Reading');
  await user.click(screen.getByRole('option', { name: 'Reading Page' }));
  expect(fb.setSkill).toHaveBeenCalledWith('reading', '/reading');
});
test('mobile navigation gives listening and reading direct guarded entry points', async () => {
  render(<MemoryRouter><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Listening' }));
  expect(fb.setSkill).toHaveBeenCalledWith('listening', '/listening');
  await user.click(screen.getByRole('button', { name: 'Reading' }));
  expect(fb.setSkill).toHaveBeenCalledWith('reading', '/reading');
});
