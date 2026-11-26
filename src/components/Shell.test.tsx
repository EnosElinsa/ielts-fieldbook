import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { IconButton, TooltipProvider } from './IconButton';
import { Shell } from './Shell';

const { fb } = vi.hoisted(() => ({
  fb: {
    booted: true,
    loadError: '',
    retryLoad: vi.fn(),
    saveFailed: false,
    saveFailureMessage: '',
    saveStatus: 'saved',
    persistNow: vi.fn(async () => true),
    recoveryDrafts: null,
    resolveDraftRecovery: vi.fn(),
    activeSkill: 'writing',
    setSkill: vi.fn(),
    selectedQuestion: null,
    selectedTopic: null,
    state: {
      questions: [],
      speakingTopics: [],
      sessions: [],
      vocabulary: [],
      examAttempts: [],
      plans: [],
    },
    modal: null,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openFeedbackImport: vi.fn(),
    toast: vi.fn(),
    toastMessage: '',
    toastVisible: false,
    toastRevision: 0,
    moduleStatus: { productive: 'ready', receptive: 'ready', vocabulary: 'ready', vocabularyCore: 'ready', planning: 'ready' },
    bankStatus: { writing: 'ready', speaking: 'ready' },
    ensureAccountModule: vi.fn(async () => true),
    ensureQuestionBank: vi.fn(async () => true),
  },
}));

vi.mock('../context/FieldbookContext', () => ({ useFieldbook: () => fb }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('../auth/useAuthUser', () => ({ useAuthUser: () => ({ id: 'user-1', email: 'learner@example.test', user_metadata: { display_name: 'Learner' } }) }));
vi.mock('../auth/AuthGate', () => ({ signOut: vi.fn() }));
vi.mock('../storage/remote', () => ({ accountId: () => 'user-1' }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/today" element={<div>Today content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shell keyboard shortcuts', () => {
  test.each([
    { isComposing: true },
    { keyCode: 229 },
    { shiftKey: true },
    { altKey: true },
  ])('ignores Ctrl/Cmd+K during IME composition or extra modifiers (%j)', (extra) => {
    renderShell();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true, ...extra });
    expect(screen.queryByRole('dialog', { name: 'Search Fieldbook' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'k', metaKey: true, ...extra });
    expect(screen.queryByRole('dialog', { name: 'Search Fieldbook' })).not.toBeInTheDocument();
  });

  test('toggles CommandSearch on plain Ctrl+K and Cmd+K', () => {
    renderShell();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Search Fieldbook' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Search Fieldbook' })).not.toBeInTheDocument();
  });
});

describe('IconButton tooltip provider compatibility', () => {
  test('renders standalone without an ancestor TooltipProvider and inside a shared TooltipProvider', () => {
    const standalone = render(<IconButton label="Standalone action">S</IconButton>);
    expect(screen.getByRole('button', { name: 'Standalone action' })).toBeInTheDocument();
    standalone.unmount();

    render(
      <TooltipProvider delayDuration={350}>
        <IconButton label="Shared action one">1</IconButton>
        <IconButton label="Shared action two">2</IconButton>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Shared action one' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shared action two' })).toBeInTheDocument();
  });
});
