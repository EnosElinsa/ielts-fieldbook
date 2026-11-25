import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SpeakingTopicPage } from './SpeakingTopicPage';
import { speakingPrompts } from '../../domain/speaking';

const mocks = vi.hoisted(() => ({
  fb: null as any,
}));

vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));

const topic = {
  id: 'topic-2',
  title: 'A useful journey',
  part: 2,
  cueCard: 'Describe a journey that was memorable.',
  bullets: ['Where you went', 'Who you travelled with'],
  part3: ['Why do people travel far from home?'],
};
const [part2Prompt] = speakingPrompts(topic, '2');

function mount(id = 'topic-2') {
  return render(
    <MemoryRouter initialEntries={[`/speak/topics/${id}`]}>
      <Routes>
        <Route path="/speak/topics/:id" element={<SpeakingTopicPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  const drafts: Record<string, any> = {};
  const statuses: Record<string, string> = {};
  mocks.fb = {
    state: { speakingTopics: [topic], stories: [] },
    stateRef: { current: { speakingTopics: [topic], stories: [] } },
    selectedTopic: topic,
    speakingDraft: (_id: string, key?: string) => drafts[key || 'legacy'] || { notes: '' },
    draftSaveStatus: (_id: string, key?: string) => statuses[key || 'legacy'] || 'saved',
    setSpeakingDraft: vi.fn((_id: string, patch: any) => {
      drafts[patch.promptKey || 'legacy'] = { ...drafts[patch.promptKey || 'legacy'], ...patch };
    }),
    scheduleDraftPersist: vi.fn(),
    flushDraftPersist: vi.fn(() => null),
    persistNow: vi.fn(async () => true),
    ensureSpeakingSample: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 'topic-2', sampleAnswer: 'A sample journey answer.' }),
    startSpeakingPractice: vi.fn(),
    toast: vi.fn(),
    openModal: vi.fn(),
    setEditingStoryId: vi.fn(),
    setStoryPresetTopicIds: vi.fn(),
    updateStory: vi.fn(),
    _statuses: statuses,
    _drafts: drafts,
  };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('Part 2 topic notes scope to the Part 2 promptKey, show draft save status, and retry failed saves', async () => {
  mocks.fb._drafts[part2Prompt.promptKey] = { notes: 'Initial bullet notes' };
  mocks.fb._statuses[part2Prompt.promptKey] = 'failed';
  mount();
  const notes = screen.getByRole('textbox', { name: 'Topic notes' });
  expect(notes).toHaveValue('Initial bullet notes');
  expect(screen.getByText('Notes could not be saved.')).toBeInTheDocument();

  fireEvent.change(notes, { target: { value: 'Updated Part 2 plan' } });
  expect(mocks.fb.setSpeakingDraft).toHaveBeenCalledWith(
    'topic-2',
    expect.objectContaining({ promptKey: part2Prompt.promptKey, part: '2', notes: 'Updated Part 2 plan' }),
  );
  expect(mocks.fb.scheduleDraftPersist).toHaveBeenCalled();

  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry save' }));
  expect(mocks.fb.flushDraftPersist).toHaveBeenCalled();
  expect(mocks.fb.persistNow).toHaveBeenCalledWith(undefined, { collections: ['drafts'] });
});

test('retrying a failed speaking sample forces a fresh fetch with { force: true }', async () => {
  mount();
  expect(await screen.findByText(/Sample could not be loaded/)).toBeInTheDocument();
  expect(mocks.fb.ensureSpeakingSample).toHaveBeenCalledWith('topic-2', { force: false });

  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mocks.fb.ensureSpeakingSample).toHaveBeenNthCalledWith(2, 'topic-2', { force: true }));
});
