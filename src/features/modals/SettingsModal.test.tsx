import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SettingsModal } from './SettingsModal';
import { DEFAULT_VOCABULARY_PREFERENCES } from '../../domain/vocabulary/preferences';

const context = vi.hoisted(() => ({ current: null as any }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => context.current }));

beforeEach(() => {
  const state = {
    settings: {
      examDate: '', targetBand: '', dailyMinutes: 30, focus: 'balanced',
      skillMix: 'mixed', speakingFocus: 'balanced', days: [1],
      vocabulary: { ...DEFAULT_VOCABULARY_PREFERENCES },
    },
    plans: [{ id: 'pending', status: 'pending' }, { id: 'started', status: 'in_progress' }],
    activePlanId: 'pending',
  };
  context.current = {
    modal: 'settings', state, stateRef: { current: state },
    closeModal: vi.fn(), toast: vi.fn(),
    saveVocabularyPreferences: vi.fn().mockResolvedValue(true),
    saveStudySettings: vi.fn().mockResolvedValue(true),
    persistNow: vi.fn().mockResolvedValue(true), ensurePlansForSkill: vi.fn(),
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('global settings exposes account vocabulary preferences and retains failures', async () => {
  context.current.saveVocabularyPreferences.mockResolvedValue(false);
  render(<SettingsModal />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Vocabulary practice' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveVocabularyPreferences).toHaveBeenCalledWith(expect.objectContaining({ accent: 'us' }));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveValue('us');
  expect(context.current.closeModal).not.toHaveBeenCalled();
});

test('settings save study and vocabulary edits together regardless of active tab', async () => {
  render(<SettingsModal />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Minutes a day/i }), { target: { value: '45' } });
  await user.click(screen.getByRole('tab', { name: 'Vocabulary practice' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith(expect.objectContaining({
    dailyMinutes: 45, vocabulary: expect.objectContaining({ accent: 'us' }),
  }));
  expect(context.current.closeModal).toHaveBeenCalledOnce();
});

test('background settings refresh leaves the open draft intact across tabs', async () => {
  const view = render(<SettingsModal />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Minutes a day/i }), { target: { value: '45' } });
  await user.click(screen.getByRole('tab', { name: 'Vocabulary practice' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  const state = { ...context.current.state, settings: { ...context.current.state.settings, dailyMinutes: 60 } };
  context.current = { ...context.current, state, stateRef: { current: state } };
  view.rerender(<SettingsModal />);
  expect(screen.getByRole('combobox', { name: 'Accent' })).toHaveValue('us');
  await user.click(screen.getByRole('tab', { name: 'Study plan' }));
  expect(screen.getByRole('spinbutton', { name: /Minutes a day/i })).toHaveValue(45);
});

test('saving an accent edit preserves preferences refreshed in the background', async () => {
  const view = render(<SettingsModal />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Vocabulary practice' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Accent' }), 'us');
  const state = { ...context.current.state, settings: { ...context.current.state.settings, vocabulary: { ...DEFAULT_VOCABULARY_PREFERENCES, volume: 0.4 } } };
  context.current = { ...context.current, state, stateRef: { current: state } };
  view.rerender(<SettingsModal />);
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveVocabularyPreferences).toHaveBeenCalledWith({ accent: 'us' });
});

test('dirty settings ask for confirmation for Cancel, close button and Escape', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SettingsModal />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Minutes a day/i }), { target: { value: '45' } });
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Close dialog' }));
  await user.keyboard('{Escape}');
  expect(confirmSpy).toHaveBeenCalledTimes(3);
  expect(context.current.closeModal).not.toHaveBeenCalled();
  confirmSpy.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(context.current.closeModal).toHaveBeenCalledOnce();
});

test('study save failure keeps edits and error visible and allows retry', async () => {
  context.current.saveStudySettings.mockResolvedValueOnce(false).mockResolvedValue(true);
  context.current.persistNow.mockResolvedValue(false);
  render(<SettingsModal />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Minutes a day/i }), { target: { value: '45' } });
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('spinbutton', { name: /Minutes a day/i })).toHaveValue(45);
  expect(context.current.closeModal).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.closeModal).toHaveBeenCalledOnce();
});

test('save in flight blocks repeated saves, edits and every close path', async () => {
  let resolveSave!: (saved: boolean) => void;
  const pendingSave = new Promise<boolean>((resolve) => { resolveSave = resolve; });
  context.current.saveStudySettings.mockReturnValue(pendingSave);
  context.current.persistNow.mockReturnValue(pendingSave);
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<SettingsModal />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Minutes a day/i }), { target: { value: '45' } });
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(screen.getByRole('spinbutton', { name: /Minutes a day/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Close dialog' }));
  await user.keyboard('{Escape}');
  expect(context.current.closeModal).not.toHaveBeenCalled();
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(context.current.saveStudySettings).toHaveBeenCalledOnce();
  await act(async () => resolveSave(false));
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
});
