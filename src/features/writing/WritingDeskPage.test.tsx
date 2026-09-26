import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { WritingDeskPage } from './WritingDeskPage';

const { persistNow, flushDraftPersist, toast } = vi.hoisted(() => ({
  persistNow: vi.fn(),
  flushDraftPersist: vi.fn(() => null),
  toast: vi.fn(),
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    const state = emptyState();
    const selected = {
      id: '1',
      type: '2',
      name: 'Essay',
      prompt: 'Discuss.',
      image: '',
      format: 'Essay',
      source: '',
    };
    return {
      state,
      stateRef: { current: state },
      selectedQuestion: selected,
      currentDeskMode: () => 'full',
      writingDraft: () => '',
      speakingDraft: () => ({ parentSessionId: null }),
      wordCount: (value: string) => (String(value || '').trim() ? String(value).trim().split(/\s+/).length : 0),
      setWritingDraft: vi.fn(),
      scheduleDraftPersist: vi.fn(),
      flushDraftPersist,
      persistNow,
      toast,
      setChecklistToastNeeded: vi.fn(),
      setPendingAttempt: vi.fn(),
      openModal: vi.fn(),
      setViewedSession: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  persistNow.mockReset();
  flushDraftPersist.mockReset();
  flushDraftPersist.mockReturnValue(null);
  toast.mockReset();
});

test('Save draft toasts only after the account write succeeds', async () => {
  persistNow.mockResolvedValue(false);
  render(<WritingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).not.toHaveBeenCalledWith('Draft saved.');
  persistNow.mockResolvedValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).toHaveBeenCalledWith('Draft saved.');
});
