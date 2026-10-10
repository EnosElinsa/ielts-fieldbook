import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyPreferencesDialog } from './VocabularyPreferences';
import { DEFAULT_VOCABULARY_PREFERENCES } from '../../domain/vocabulary/preferences';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('preferences group practice, audio and shortcuts with a visible dialog heading', () => {
  render(<VocabularyPreferencesDialog open onClose={() => {}} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  expect(screen.getByRole('group', { name: 'Practice' })).toBeVisible();
  expect(screen.getByRole('group', { name: 'Audio' })).toBeVisible();
  expect(screen.getByRole('group', { name: 'Shortcuts' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Practice settings' })).not.toHaveClass('sr-only');
});

test('dirty preferences protect Cancel, close button, Escape and outside dismissal', async () => {
  const close = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<VocabularyPreferencesDialog open onClose={close} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Close dialog' }));
  await user.keyboard('{Escape}');
  fireEvent.pointerDown(document.querySelector('.dialog-overlay')!, { pointerType: 'mouse', button: 0 });
  expect(confirm).toHaveBeenCalledTimes(4);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveValue('us');
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
});

test('clean preferences close directly and reopened drafts use the saved baseline', async () => {
  const close = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(<VocabularyPreferencesDialog open onClose={close} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  view.rerender(<VocabularyPreferencesDialog open={false} onClose={close} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  view.rerender(<VocabularyPreferencesDialog open onClose={close} onSave={() => true} preferences={{ ...DEFAULT_VOCABULARY_PREFERENCES, accent: 'us' }} />);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledTimes(2);
  expect(confirm).not.toHaveBeenCalled();
});
test('preference failure retains changed values and blocks close until saving finishes', async () => {
  const close = vi.fn();
  let finish!: (saved: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  render(<VocabularyPreferencesDialog open onClose={close} onSave={save} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish(false));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveValue('us');
});
