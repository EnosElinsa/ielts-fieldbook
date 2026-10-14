import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CommandSearch, MobileNavigation } from './WorkbenchNavigation';
import { canonicalListeningUrl, moduleFor, studyLinkActive } from './workspaceNavigation';
const { fb } = vi.hoisted(() => ({ fb: { state: { questions: [], speakingTopics: [], sessions: [], vocabulary: [], examAttempts: [] }, setSkill: vi.fn(), moduleStatus: undefined as any, ensureAccountModule: vi.fn(), ensureQuestionBank: vi.fn() } }));
vi.mock('../context/FieldbookContext', () => ({ useFieldbook: () => fb }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('../auth/AuthGate', () => ({ signOut: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); fb.moduleStatus = undefined; });
test('search routes reading and listening through skill selection', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CommandSearch open onClose={() => {}} /></MemoryRouter>);
  await user.type(screen.getByRole('combobox', { name: 'Search Fieldbook' }), 'Reading');
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
  await user.type(screen.getByRole('combobox', { name: 'Search Fieldbook' }), `${skill} review`);
  await user.click(screen.getByRole('option'));
  expect(fb.setSkill).toHaveBeenCalledWith(skill, `/${skill}/review`);
});

test('search remains open and dismissible while data is loading, and failed results offer retry', async () => {
  fb.moduleStatus = { productive: 'loading', vocabulary: 'loading', receptive: 'loading' };
  fb.ensureAccountModule.mockRejectedValue(new Error('Connection unavailable'));
  fb.ensureQuestionBank.mockResolvedValue([]);
  const close = vi.fn();
  render(<MemoryRouter><CommandSearch open onClose={close} /></MemoryRouter>);
  expect(screen.getByRole('dialog', { name: 'Search Fieldbook' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Search Fieldbook' })).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
  await userEvent.click(screen.getByRole('button', { name: 'Retry search' }));
  expect(fb.ensureAccountModule).toHaveBeenCalledTimes(6);
  await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  expect(close).toHaveBeenCalledOnce();
});

test('mobile module order follows test order and recognizes speaking review', () => {
  render(<MemoryRouter initialEntries={['/review?skill=speaking']}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(Array.from(nav.children).map(item => item.getAttribute('aria-label') || item.textContent)).toEqual(['Today', 'Listening', 'Reading', 'Writing', 'Speaking', 'Vocabulary', 'More']);
  expect(within(nav).getByRole('button', { name: 'Speaking' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('button', { name: 'Writing' })).not.toHaveAttribute('aria-current');
});

test('listening questions remains active across bank, standard practice, mock, and intensive paths', () => {
  for (const [path, search, expected] of [['/listening', '?mode=intensive', '/listening'], ['/listening/intensive/part1', '', '/listening'], ['/listening/part1', '', '/listening'], ['/listening/mock/paper1', '', '/listening'], ['/listening/review/a1', '', '/listening/review'], ['/listening/review', '', '/listening/review'], ['/listening', '', '/listening']]) {
    const active = ['/listening', '/listening/review'].filter(to => studyLinkActive(to, path, search, 'listening'));
    expect(active).toEqual([expected]);
  }
});

test.each(['/listening/part1', '/listening/intensive/part1', '/listening/mock/paper1', '/listening/review/a1'])('mobile listening remains active on %s', path => {
  render(<MemoryRouter initialEntries={[path]}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Listening' })).toHaveAttribute('aria-current', 'page');
});

test.each(['/planning', '/settings', '/settings/audio'])('planning and settings fit under mobile More on %s', path => {
  render(<MemoryRouter initialEntries={[path]}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: 'Planning' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
});

test('legacy listening bank canonicalization keeps filters, paging and hash', () => {
  expect(canonicalListeningUrl('/listening?mode=intensive&book=8&q=city+garden&page=3#results')).toBe('/listening?book=8&q=city+garden&page=3#results');
  expect(moduleFor('/today', '', 'writing')).toBe('today');
  expect(moduleFor('/planning', '', 'writing')).toBe('planning');
  expect(moduleFor('/settings/audio', '', 'writing')).toBe('settings');
});
