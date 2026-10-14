import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StoryModal } from './StoryModal';
import { addStory, updateStory } from '../../domain';

const mock = vi.hoisted(() => ({ owner: 'one', fb: null as any }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mock.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mock.owner }));
beforeEach(() => {
  mock.owner = 'one';
  const state = { stories: [], speakingTopics: [] };
  mock.fb = { modal: 'story', state, stateRef: { current: state }, addStory, updateStory, completeStoriesPlan: vi.fn(), persistNow: vi.fn(), closeModal: vi.fn(), toast: vi.fn(), setEditingStoryId: vi.fn(), storyPresetTopicIds: [] };
});
afterEach(cleanup);

test('failed story save keeps all input and retries without claiming success', async () => {
  mock.fb.persistNow.mockImplementationOnce(async (draft: any) => { mock.fb.stateRef.current = draft; return false; }).mockImplementationOnce(async (draft: any) => { mock.fb.stateRef.current = draft; return true; });
  const user = userEvent.setup(); render(<StoryModal />);
  await user.type(screen.getByLabelText('Title'), 'A library visit');
  await user.type(screen.getByLabelText('What happened'), 'We finished an essay.');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are still here');
  expect(mock.fb.closeModal).not.toHaveBeenCalled();
  expect(mock.fb.toast).not.toHaveBeenCalled();
  expect(screen.getByLabelText('What happened')).toHaveValue('We finished an essay.');
  expect(mock.fb.persistNow.mock.calls[0][1].collections).toEqual(['stories', 'plans', 'profile']);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mock.fb.closeModal).toHaveBeenCalledTimes(1));
  expect(mock.fb.toast).toHaveBeenCalledWith('Story saved.');
  expect(mock.fb.stateRef.current.stories).toHaveLength(1);
});

test('pending story save prevents dismissal and duplicate submission; a changed owner cannot close or toast', async () => {
  let finish!: (value: boolean) => void;
  mock.fb.persistNow.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const user = userEvent.setup(); render(<StoryModal />);
  await user.type(screen.getByLabelText('Title'), 'A library visit');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  expect(screen.getByLabelText('Title')).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(mock.fb.closeModal).not.toHaveBeenCalled();
  mock.owner = 'two';
  await act(async () => { finish(true); });
  expect(mock.fb.closeModal).not.toHaveBeenCalled();
  expect(mock.fb.toast).not.toHaveBeenCalled();
});
