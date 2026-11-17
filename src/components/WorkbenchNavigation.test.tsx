import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
test.each([{ isComposing: true }, { keyCode: 229 }])('search ignores IME confirmation Enter (%j) but accepts the next Enter', async (composition) => {
  const close = vi.fn();
  render(<MemoryRouter><CommandSearch open onClose={close} /></MemoryRouter>);
  const search = screen.getByRole('combobox', { name: 'Search Fieldbook' });
  fireEvent.change(search, { target: { value: 'Reading review' } });
  fireEvent.keyDown(search, { key: 'Enter', ...composition });
  expect(close).not.toHaveBeenCalled();
  expect(fb.setSkill).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: 'Enter', keyCode: 13 });
  expect(close).toHaveBeenCalledOnce();
  expect(fb.setSkill).toHaveBeenCalledWith('reading', '/reading/review');
});
test('search routes reading and listening through skill selection', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CommandSearch open onClose={() => {}} /></MemoryRouter>);
  await user.type(screen.getByRole('combobox', { name: 'Search Fieldbook' }), 'Reading');
  await user.click(screen.getByRole('option', { name: 'Reading Page' }));
  expect(fb.setSkill).toHaveBeenCalledWith('reading', '/reading');
});
test.each(['Listening', 'Reading', 'Writing', 'Speaking'])('mobile Study offers %s equally and closes before navigating', async label => {
  const select = vi.fn(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  render(<MemoryRouter><MobileNavigation onMore={() => {}} onSelectModule={select} /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Study' }));
  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Listening', 'Reading', 'Writing', 'Speaking']);
  await user.click(within(menu).getByRole('menuitem', { name: label }));
  expect(select).toHaveBeenCalledWith(label.toLowerCase());
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
  expect(fb.ensureAccountModule).not.toHaveBeenCalled();
  expect(fb.ensureQuestionBank).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole('combobox', {name:'Search Fieldbook'}), 'reading');
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
  await userEvent.click(screen.getByRole('button', { name: 'Retry search' }));
  expect(fb.ensureAccountModule).toHaveBeenCalledTimes(6);
  await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  expect(close).toHaveBeenCalledOnce();
});

test('mobile navigation promotes planning and shows the active skill in Study', () => {
  render(<MemoryRouter initialEntries={['/review?skill=speaking']}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(Array.from(nav.children).map(item => item.getAttribute('aria-label') || item.textContent)).toEqual(['Today', 'Planning', 'Study: Speaking', 'Vocabulary', 'More']);
  expect(within(nav).getByRole('button', { name: 'Study: Speaking' })).toHaveAttribute('aria-current', 'page');
});

test('listening questions remains active across bank, standard practice, mock, and intensive paths', () => {
  for (const [path, search, expected] of [['/listening', '?mode=intensive', '/listening'], ['/listening/intensive/part1', '', '/listening'], ['/listening/intensive/part1', '?sentence=s1&review=sentence', '/listening/review'], ['/listening/part1', '', '/listening'], ['/listening/mock/paper1', '', '/listening'], ['/listening/review/a1', '', '/listening/review'], ['/listening/review', '', '/listening/review'], ['/listening', '', '/listening']]) {
    const active = ['/listening', '/listening/review'].filter(to => studyLinkActive(to, path, search, 'listening'));
    expect(active).toEqual([expected]);
  }
});

test.each(['/listening/part1', '/listening/intensive/part1', '/listening/mock/paper1', '/listening/review/a1'])('mobile listening remains active on %s', path => {
  render(<MemoryRouter initialEntries={[path]}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Study: Listening' })).toHaveAttribute('aria-current', 'page');
});

test.each(['/settings', '/settings/audio'])('settings remains available under mobile More on %s', path => {
  render(<MemoryRouter initialEntries={[path]}><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: 'Planning' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
});

test('planning has a direct guarded link with its own current state', async () => {
  const select = vi.fn();
  render(<MemoryRouter initialEntries={['/planning']}><MobileNavigation onMore={() => {}} onSelectModule={select}/></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Planning' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'More' })).not.toHaveAttribute('aria-current');
  await userEvent.click(screen.getByRole('link', { name: 'Planning' }));
  expect(select).toHaveBeenCalledWith('planning');
});

test('legacy listening bank canonicalization keeps filters, paging and hash', () => {
  expect(canonicalListeningUrl('/listening?mode=intensive&book=8&q=city+garden&page=3#results')).toBe('/listening?book=8&q=city+garden&page=3#results');
  expect(moduleFor('/today', '', 'writing')).toBe('today');
  expect(moduleFor('/planning', '', 'writing')).toBe('planning');
  expect(moduleFor('/settings/audio', '', 'writing')).toBe('settings');
});


test('mobile Study supports keyboard dismissal and guarded skill selection', async () => {
  render(<MemoryRouter><MobileNavigation onMore={() => {}} /></MemoryRouter>);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', {name:'Study'});
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', {name:'Speaking'}));
  expect(fb.setSkill).toHaveBeenCalledWith('speaking', '/speak');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
