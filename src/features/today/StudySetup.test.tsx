import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { needsStudySetup, StudySetup } from './StudySetup';

const mock = vi.hoisted(() => ({ state: null as any, save: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: mock.state, saveStudySettings: mock.save }) }));
vi.mock('../../storage/remote', () => ({ accountId: () => 'test-account' }));
beforeEach(() => { mock.state = emptyState(); mock.save.mockReset().mockResolvedValue(true); });
afterEach(cleanup);
const mount = () => render(<MemoryRouter><StudySetup /></MemoryRouter>);

test('existing learning, a personal target, or completed setup preserves the normal Today view', () => {
  expect(needsStudySetup(mock.state)).toBe(true);
  mock.state.sessions.push({ id: 'attempt' });
  expect(needsStudySetup(mock.state)).toBe(false);
  mock.state = emptyState(); mock.state.settings.targetBand = '7';
  expect(needsStudySetup(mock.state)).toBe(false);
  mock.state = emptyState(); mock.state.settings.studySetupCompletedAt = '2026-10-14';
  expect(needsStudySetup(mock.state)).toBe(false);
});

test('saves selected time and skills through the existing study-plan transaction', async () => {
  mount(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '45 min' }));
  await user.click(screen.getByRole('checkbox', { name: 'Speaking' }));
  await user.click(screen.getByRole('button', { name: 'Save study plan' }));
  await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
  expect(mock.save.mock.calls[0][0]).toMatchObject({ dailyMinutes: 45, skills: ['writing', 'reading', 'listening'], studySetupCompletedAt: expect.any(String) });
  expect(screen.queryByRole('heading', { name: 'Your study plan' })).not.toBeInTheDocument();
});

test('failed setup retains selected values and offers retry instead of dismissing itself', async () => {
  mock.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mount(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '60 min' }));
  await user.click(screen.getByRole('button', { name: 'Save study plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(60);
  await user.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(mock.save).toHaveBeenCalledTimes(2);
});

test('a schedule with no days cannot be submitted and current-plan acceptance ignores unsaved edits', async () => {
  mount(); const user = userEvent.setup();
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) await user.click(screen.getByRole('checkbox', { name: label }));
  await user.click(screen.getByRole('button', { name: 'Save study plan' }));
  expect(screen.getByRole('alert')).toHaveTextContent('at least one study day');
  expect(mock.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Use current plan' }));
  expect(mock.save).toHaveBeenCalledWith({ studySetupCompletedAt: expect.any(String) });
});
