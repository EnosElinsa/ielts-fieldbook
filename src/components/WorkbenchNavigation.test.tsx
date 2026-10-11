import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CommandSearch, MobileNavigation } from './WorkbenchNavigation';
import { studyLinkActive } from './workspaceNavigation';
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

test.each(['reading', 'listening'])('command search opens the %s review page in its module', async (skill) => {
  render(<MemoryRouter><CommandSearch open onClose={() => {}} /></MemoryRouter>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Search Fieldbook' }), `${skill} review`);
  await user.click(screen.getByRole('option'));
  expect(fb.setSkill).toHaveBeenCalledWith(skill, `/${skill}/review`);
});

test('mobile module order follows test order and recognizes speaking review', () => {
  render(<MemoryRouter initialEntries={['/review?skill=speaking']}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(Array.from(nav.children).map(item => item.getAttribute('aria-label') || item.textContent)).toEqual(['Today', 'Listening', 'Reading', 'Writing', 'Speaking', 'Vocabulary', 'More']);
  expect(within(nav).getByRole('button', { name: 'Speaking' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('button', { name: 'Writing' })).not.toHaveAttribute('aria-current');
});

test('only one listening child is active for intensive mode and detail routes', () => {
  for (const [path, search, expected] of [['/listening', '?mode=intensive', '/listening?mode=intensive'], ['/listening/intensive/part1', '', '/listening?mode=intensive'], ['/listening/review/a1', '', '/listening/review'], ['/listening', '', '/listening']]) {
    const active = ['/listening', '/listening?mode=intensive', '/listening/review'].filter(to => studyLinkActive(to, path, search, 'listening'));
    expect(active).toEqual([expected]);
  }
});
