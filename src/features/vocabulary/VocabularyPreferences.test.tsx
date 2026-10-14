import { selectChoice } from '../../../tests/selectChoice';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  render(<VocabularyPreferencesDialog open onClose={close} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  const user = userEvent.setup();
  await selectChoice(await screen.getByLabelText('Accent'), 'American English');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved practice settings?' })).getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Close dialog' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved practice settings?' })).getByRole('button', { name: 'Cancel' }));
  await user.keyboard('{Escape}');
  await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved practice settings?' })).getByRole('button', { name: 'Cancel' }));
  fireEvent.pointerDown(document.querySelector('.dialog-overlay')!, { pointerType: 'mouse', button: 0 });
  await user.click(within(await screen.findByRole('dialog', { name: 'Discard unsaved practice settings?' })).getByRole('button', { name: 'Cancel' }));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveTextContent('American English');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(close).toHaveBeenCalledOnce();
});

test('clean preferences close directly and reopened drafts use the saved baseline', async () => {
  const close = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(<VocabularyPreferencesDialog open onClose={close} onSave={() => true} preferences={DEFAULT_VOCABULARY_PREFERENCES} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
  await selectChoice(await screen.getByLabelText('Accent'), 'American English');
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
  await selectChoice(await screen.getByLabelText('Accent'), 'American English');
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish(false));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveTextContent('American English');
});
