import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useWorkspaceModuleMemory } from './useWorkspaceModuleMemory';
import { readModuleContext, moduleMemoryKey, rememberModuleContext, restoredModuleState, safeModuleUrl } from './workspaceModuleMemory';
import { useVocabularyPosition } from '../features/vocabulary/vocabularyNavigation';
import { WorkspaceScrollRestoration } from './WorkspaceScrollRestoration';

vi.mock('../storage/remote', () => ({ accountId: () => 'one' }));

const originState = { vocabularyReturn: { owner: 'one', url: '/vocabulary/words?tag=fruit', index: 0, parent: { owner: 'one', url: '/vocabulary' } } };

function Harness({ owner = 'one', ready = true }: { owner?: string; ready?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const memory = useWorkspaceModuleMemory({ owner, ready, activeSkill: 'writing', setSkill: () => {} });
  return <>
    <output aria-label="Location">{location.pathname + location.search + location.hash}</output>
    <output aria-label="State">{JSON.stringify(location.state)}</output>
    <button onClick={() => memory.selectModule('vocabulary')}>Vocabulary</button>
    <button onClick={() => memory.selectModule('writing')}>Writing</button>
    <button onClick={() => navigate('/vocabulary/entry/apple?bookId=fruit#sense', { state: originState })}>Apple</button>
    <button onClick={() => navigate('/vocabulary/words?tag=fruit')}>Words</button>
    <button onClick={() => navigate('/write/questions?tag=task2')}>Questions</button>
    <button onClick={() => navigate('/settings/schedule')}>Study time</button>
    <button onClick={() => navigate('/write')}>Practice</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
    <button onClick={() => memory.scrollRestoration.current.restoreAfterLayout?.()}>Refresh layout</button>
  </>;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('module clicks resume deep URLs, history return chains, and scroll after a reload', async () => {
  const user = userEvent.setup();
  const first = render(<MemoryRouter initialEntries={['/vocabulary/words?tag=fruit']}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Apple'));
  Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
  fireEvent.scroll(window);
  await user.click(screen.getByText('Writing'));
  first.unmount();
  render(<MemoryRouter initialEntries={['/write']}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Vocabulary'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/entry/apple?bookId=fruit#sense');
  const restored = JSON.parse(screen.getByLabelText('State').textContent!);
  expect(restored).toMatchObject({ vocabularyReturn: { owner: 'one', url: '/vocabulary/words?tag=fruit', parent: { owner: 'one', url: '/vocabulary' } }, vocabularyRestore: true });
  expect(restored.vocabularyReturn).not.toHaveProperty('index');
  await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 420));
});

test('the active module click keeps the current destination without requesting practice departure', async () => {
  const guard = vi.fn((event: Event) => event.preventDefault());
  document.addEventListener('fieldbook:before-navigate', guard);
  try {
    render(<MemoryRouter initialEntries={['/vocabulary/words?tag=fruit#saved']}><Harness /></MemoryRouter>);
    await userEvent.setup().click(screen.getByText('Vocabulary'));
    expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit#saved');
    expect(guard).not.toHaveBeenCalled();
  } finally { document.removeEventListener('fieldbook:before-navigate', guard); }
});

test('canceling a practice departure does not replace either remembered module', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/write/questions?tag=task2']}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Vocabulary'));
  await user.click(screen.getByText('Apple'));
  const guard = (event: Event) => event.preventDefault();
  document.addEventListener('fieldbook:before-navigate', guard);
  try { await user.click(screen.getByText('Writing')); } finally { document.removeEventListener('fieldbook:before-navigate', guard); }
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/entry/apple?bookId=fruit#sense');
  await user.click(screen.getByText('Writing'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/write/questions?tag=task2');
  await user.click(screen.getByText('Vocabulary'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/entry/apple?bookId=fruit#sense');
});

test('browser back and forward update the remembered context without a redirect', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/vocabulary']}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Words'));
  await user.click(screen.getByText('Apple'));
  await user.click(screen.getByText('Back'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit');
  await user.click(screen.getByText('Forward'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/entry/apple?bookId=fruit#sense');
  await user.click(screen.getByText('Back'));
  await user.click(screen.getByText('Writing'));
  await user.click(screen.getByText('Vocabulary'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit');
});

test('changing accounts cannot resume another owner’s destination or history state', async () => {
  const user = userEvent.setup();
  const first = render(<MemoryRouter><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Apple'));
  await user.click(screen.getByText('Writing'));
  first.unmount();
  render(<MemoryRouter initialEntries={['/write']}><Harness owner="two" /></MemoryRouter>);
  await user.click(screen.getByText('Vocabulary'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary');
  expect(screen.getByLabelText('State')).toHaveTextContent('null');
});

test.each(['https://evil.example/vocabulary', '//evil.example/vocabulary', '/vocabulary-evil', '/vocabulary/../account', '/write', '/vocabulary\\evil', '/vocabulary/%2e%2e/account'])('invalid saved URL %s falls back to the module landing page', (url) => {
  sessionStorage.setItem(moduleMemoryKey('one'), JSON.stringify({ version: 1, owner: 'one', modules: { vocabulary: { url, state: originState, scroll: { x: 0, y: 40 } } } }));
  expect(readModuleContext('one', 'vocabulary')).toBeNull();
});

test('an unloaded workspace cannot overwrite a previous owner context', async () => {
  const first = render(<MemoryRouter initialEntries={['/vocabulary/words?tag=fruit']}><Harness /></MemoryRouter>);
  first.unmount();
  const waiting = render(<MemoryRouter initialEntries={['/vocabulary']}><Harness ready={false} /></MemoryRouter>);
  waiting.unmount();
  expect(readModuleContext('one', 'vocabulary')?.url).toBe('/vocabulary/words?tag=fruit');
});

test('a delayed practice confirmation cannot navigate after its owner changes', async () => {
  let proceed: (() => void) | undefined;
  const guard = (event: Event) => { event.preventDefault(); proceed = (event as CustomEvent).detail.proceed; };
  document.addEventListener('fieldbook:before-navigate', guard);
  try {
    const view = render(<MemoryRouter initialEntries={['/vocabulary/words']}><Harness /></MemoryRouter>);
    await userEvent.setup().click(screen.getByText('Writing'));
    view.rerender(<MemoryRouter initialEntries={['/vocabulary/words']}><Harness owner="two" /></MemoryRouter>);
    proceed?.();
    expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words');
  } finally { document.removeEventListener('fieldbook:before-navigate', guard); }
});

test('secondary page destinations stay explicit after a module has remembered a different page', async () => {
  render(<MemoryRouter initialEntries={['/write?question=q1']}><Harness /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByText('Vocabulary'));
  await user.click(screen.getByText('Questions'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/write/questions?tag=task2');
  await user.click(screen.getByText('Vocabulary'));
  await user.click(screen.getByText('Writing'));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/write/questions?tag=task2');
});

test('module restoration preserves non-object history state for study routes', () => {
  expect(restoredModuleState({ url: '/reading/review/a1', state: ['chapter', 2], scroll: { x: 0, y: 0 } }, 'one', 'reading')).toEqual(['chapter', 2]);
});

test('mismatched owners in a stored envelope cannot supply a remembered URL', () => {
  sessionStorage.setItem(moduleMemoryKey('two'), JSON.stringify({ version: 1, owner: 'one', modules: { vocabulary: { url: '/vocabulary/words', state: originState, scroll: { x: 0, y: 40 } } } }));
  expect(readModuleContext('two', 'vocabulary')).toBeNull();
});

test('restored scroll waits for delayed page content instead of losing a clamped position', async () => {
  const user = userEvent.setup();
  const first = render(<MemoryRouter initialEntries={['/vocabulary/words']}><Harness /></MemoryRouter>);
  Object.defineProperty(window, 'scrollY', { value: 650, configurable: true });
  fireEvent.scroll(window);
  await user.click(screen.getByText('Writing'));
  first.unmount();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  let loaded = false;
  vi.stubGlobal('scrollTo', vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, 'scrollY', { value: loaded ? y : 0, configurable: true });
  }));
  render(<MemoryRouter initialEntries={['/write']}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Vocabulary'));
  await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 650));
  loaded = true;
  const content = document.createElement('div');
  document.body.append(content);
  await waitFor(() => expect(window.scrollY).toBe(650));
  content.remove();
});

test('old listening bank memory resumes its canonical bank with query and scroll intact', () => {
  const context = { url: '/listening?mode=intensive&book=12&page=3&q=train#results', state: { filter: 'train' }, scroll: { x: 0, y: 350 } };
  sessionStorage.setItem(moduleMemoryKey('one'), JSON.stringify({ version: 1, owner: 'one', modules: { listening: context } }));
  expect(readModuleContext('one', 'listening')).toEqual({ ...context, url: '/listening?book=12&page=3&q=train#results' });
  rememberModuleContext('one', 'listening', context);
  expect(JSON.parse(sessionStorage.getItem(moduleMemoryKey('one'))!).modules.listening.url).toBe('/listening?book=12&page=3&q=train#results');
  expect(readModuleContext('two', 'listening')).toBeNull();
});

test('today alias, planning and registered settings categories are valid memory destinations', () => {
  expect(safeModuleUrl('/today', 'today')).toBe(true);
  expect(safeModuleUrl('/planning?date=2026-10-20', 'planning')).toBe(true);
  expect(safeModuleUrl('/settings/audio', 'settings')).toBe(true);
  expect(safeModuleUrl('/settings/unknown', 'settings')).toBe(false);
});

test('a new page starts at the top instead of inheriting the previous page scroll', async () => {
  render(<MemoryRouter initialEntries={['/write/questions']}><Harness /></MemoryRouter>);
  Object.defineProperty(window, 'scrollY', { value: 560, configurable: true });
  fireEvent.scroll(window);
  await userEvent.setup().click(screen.getByText('Study time'));
  await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0));
});

test('a layout restoration request replaces an already queued restoration frame', async () => {
  rememberModuleContext('one', 'writing', { url: '/write', state: null, scroll: { x: 0, y: 300 } });
  vi.stubGlobal('scrollTo', vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }));
  render(<MemoryRouter initialEntries={['/write']}><Harness /></MemoryRouter>);
  fireEvent.click(screen.getByText('Refresh layout'));
  await waitFor(() => expect(window.scrollY).toBe(300));
});

test('back and forward restore each history entry rather than the latest scroll in its module', async () => {
  vi.stubGlobal('scrollTo', vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }));
  render(<MemoryRouter initialEntries={['/write/questions']}><Harness /></MemoryRouter>);
  const user = userEvent.setup();
  Object.defineProperty(window, 'scrollY', { value: 560, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('Practice'));
  Object.defineProperty(window, 'scrollY', { value: 180, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('Back'));
  await waitFor(() => expect(window.scrollY).toBe(560));
  await user.click(screen.getByText('Forward'));
  await waitFor(() => expect(window.scrollY).toBe(180));
});

test('history entries keep their separate scroll positions after reloading the workspace', async () => {
  vi.stubGlobal('scrollTo', vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }));
  const entries = [
    { pathname: '/write/questions', key: 'bank' },
    { pathname: '/write', key: 'desk' },
    { pathname: '/settings/schedule', key: 'settings' },
  ];
  const first = render(<MemoryRouter initialEntries={entries} initialIndex={0}><Harness /></MemoryRouter>);
  const user = userEvent.setup();
  Object.defineProperty(window, 'scrollY', { value: 650, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('Forward'));
  Object.defineProperty(window, 'scrollY', { value: 180, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('Forward'));
  first.unmount();
  render(<MemoryRouter initialEntries={entries} initialIndex={2}><Harness /></MemoryRouter>);
  await user.click(screen.getByText('Back'));
  await waitFor(() => expect(window.scrollY).toBe(180));
  await user.click(screen.getByText('Back'));
  await waitFor(() => expect(window.scrollY).toBe(650));
});

function VocabularyPositionHarness() {
  const { scrollRestoration } = useWorkspaceModuleMemory({ owner: 'one', ready: true, activeSkill: 'writing', setSkill: () => {} });
  return <WorkspaceScrollRestoration.Provider value={scrollRestoration}><VocabularyPositionContent /></WorkspaceScrollRestoration.Provider>;
}

function VocabularyPositionContent() {
  const location = useLocation();
  const navigate = useNavigate();
  useVocabularyPosition(location.pathname + location.search, true);
  return <>
    <output aria-label="Location">{location.pathname}</output>
    <button onClick={() => navigate('/vocabulary/words?tag=scroll-regression')}>My words</button>
    <button onClick={() => navigate('/vocabulary/history')}>History</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <details><summary>Chapter</summary><div id="hash-target">Saved group</div></details>
  </>;
}

test('vocabulary URL recovery does not overwrite an earlier history entry scroll', async () => {
  vi.stubGlobal('scrollTo', vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }));
  render(<MemoryRouter initialEntries={['/vocabulary/words?tag=scroll-regression']}><VocabularyPositionHarness /></MemoryRouter>);
  const user = userEvent.setup();
  // Let each route's delayed vocabulary restoration finish before scrolling.
  const settle = () => new Promise(resolve => requestAnimationFrame(resolve));
  await settle();
  Object.defineProperty(window, 'scrollY', { value: 100, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('History')); await settle();
  await user.click(screen.getByText('My words')); await settle();
  Object.defineProperty(window, 'scrollY', { value: 500, configurable: true }); fireEvent.scroll(window);
  await user.click(screen.getByText('History')); await settle();
  await user.click(screen.getByText('Back')); await settle();
  await user.click(screen.getByText('Back')); await settle();
  await user.click(screen.getByText('Back')); await settle();
  expect(window.scrollY).toBe(100);
});

test.each([true, false])('a restored hash target expands its chapter without overriding history scroll (cached=%s)', async cached => {
  const origin = `/vocabulary/wordbooks/ielts-vocabulary?cached=${cached}`;
  const url = origin + '#hash-target';
  if (cached) sessionStorage.setItem(`fieldbook:vocabulary-position:one:${origin}`, JSON.stringify({ scroll: 500, focus: '' }));
  rememberModuleContext('one', 'vocabulary', { url, state: null, scroll: { x: 0, y: 250 } });
  const intoView = vi.fn();
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = intoView;
  try {
    render(<MemoryRouter initialEntries={[url]}><VocabularyPositionHarness /></MemoryRouter>);
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(screen.getByText('Saved group').closest('details')).toHaveAttribute('open');
    expect(intoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 250);
  } finally { Element.prototype.scrollIntoView = original; }
});
