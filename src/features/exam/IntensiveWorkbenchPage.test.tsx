import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveWorkbenchPage } from './IntensiveWorkbenchPage';
import type { ExamCatalog } from '../../domain/exam/types';
import { createIntensiveSession } from '../../domain/exam/intensive';

const mocks = vi.hoisted(() => ({ owner: 'one', fb: null as any, catalog: null as any, recovery: new Map(), putAudio: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('../../storage/examCatalog', async importOriginal => ({ ...await importOriginal<typeof import('../../storage/examCatalog')>(), loadExamSections: async () => mocks.catalog, resolveExamAsset: async () => '/audio.mp3' }));
vi.mock('../../storage/examRecovery', () => ({ readExamRecovery: (owner: string, key: string) => mocks.recovery.get(`${owner}:${key}`), writeExamRecovery: (owner: string, key: string, data: unknown) => mocks.recovery.set(`${owner}:${key}`, structuredClone(data)), clearExamRecovery: (owner: string, key: string) => mocks.recovery.delete(`${owner}:${key}`) }));
vi.mock('../../storage/audio', () => ({ putAudio: mocks.putAudio, getAudio: async () => null }));
vi.mock('../../storage/pendingAudio', () => ({ readPendingAudio: async () => null, writePendingAudio: async () => true, deletePendingAudio: async () => true }));
vi.mock('../../components/SessionAudioPlayer', () => ({ RecordingPlayer: () => <p>Recording preview</p>, SessionAudioPlayer: () => <p>Saved recording</p> }));
vi.mock('./IntensiveAudio', () => ({ IntensiveAudio: (props: any) => <><button onClick={() => { props.onReplay(); props.onSentenceEnd(); }}>Play test sentence</button><button onClick={props.onSentenceEnd}>Finish ongoing play</button></> }));

const provenance = { sourceUrl: 'https://example.org', sourceVersion: '1', fetchedAt: '2026-01-01', contentHash: 'hash', authorization: 'owned' };
const catalog: ExamCatalog = { schemaVersion: 1, papers: [], questions: [], passages: [], sections: [{ id: 'part', paperId: 'paper', skill: 'listening', part: 1, title: 'Journey', questionTypes: [], questionCount: 0, assetId: 'audio', status: 'ready', provenance, sentences: [{ id: 's1', text: 'The train leaves at nine.', start: 0, end: 3, alignment: 'source' }, { id: 's2', text: 'Please bring your ticket.', start: 3, end: 6, alignment: 'source' }] }], assets: [{ id: 'audio', paperId: 'paper', kind: 'audio', storagePath: 'audio.mp3', sourceUrl: 'https://example.org/audio', provenance }] };
const open = (path = '/') => render(<MemoryRouter initialEntries={[path]}><IntensiveWorkbenchPage sectionId="part" /></MemoryRouter>);
function NavigationProbe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="Sentence URL">{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
beforeEach(() => {
  mocks.catalog = structuredClone(catalog); mocks.owner = 'one'; mocks.recovery.clear(); mocks.putAudio.mockReset().mockResolvedValue(undefined);
  const state = { intensiveSessions: [] };
  mocks.fb = { state, stateRef: { current: state }, setEditingVocabularyId: vi.fn(), setVocabularySeed: vi.fn(), openModal: vi.fn(), persistNow: vi.fn(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return true; }) };
  const NativeURL = globalThis.URL;
  vi.stubGlobal('URL', Object.assign(NativeURL, { createObjectURL: () => 'blob:recording', revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('stores sentence navigation in history and restores the last sentence after reopening', async () => {
  const user = userEvent.setup();
  const view = render(<MemoryRouter><IntensiveWorkbenchPage sectionId="part" /><NavigationProbe /></MemoryRouter>);
  await user.type(await screen.findByRole('textbox', { name: 'Sentence dictation' }), 'first draft');
  await user.selectOptions(screen.getByLabelText('Jump to sentence'), '1');
  expect(screen.getByLabelText('Sentence URL')).toHaveTextContent('sentence=s2');
  await user.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(await screen.findByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('first draft');
  await user.selectOptions(screen.getByLabelText('Jump to sentence'), '1');
  view.unmount(); open();
  expect(await screen.findByRole('heading', { name: 'Sentence 2 / 2' })).toBeInTheDocument();
});

it('keeps a failed completion pending across reopening and retries the same scheduled cycle', async () => {
  const ready = { ...createIntensiveSession('part', 's1'), stage: 4, listened: true, dictationResult: 'correct' as const, shadowingAudioId: 'recording', blindReplayDone: true, selfRating: 5 as const };
  mocks.fb.state.intensiveSessions = [ready];
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return false; });
  const user = userEvent.setup(); const view = open();
  await user.click(await screen.findByRole('button', { name: 'Finish and schedule review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.queryByRole('button', { name: 'Review scheduled' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start blind review' })).not.toBeInTheDocument();
  const cycle = mocks.recovery.get('one:intensive:part').s1;
  view.unmount(); open();
  await user.click(await screen.findByRole('button', { name: 'Retry scheduling review' }));
  expect(await screen.findByRole('button', { name: 'Review scheduled' })).toBeDisabled();
  expect(mocks.fb.state.intensiveSessions[0].completedAt).toBe(cycle.completedAt);
  expect(mocks.fb.state.intensiveSessions[0].nextReviewAt).toBe(cycle.nextReviewAt);
});

it('serializes saves while switching sentences so a later draft cannot be overwritten', async () => {
  let resolveFirst: (saved: boolean) => void = () => {};
  mocks.fb.persistNow.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveFirst = resolve; }));
  const user = userEvent.setup(); open();
  await user.type(await screen.findByRole('textbox', { name: 'Sentence dictation' }), 'first');
  await user.selectOptions(screen.getByLabelText('Jump to sentence'), '1');
  await user.type(screen.getByLabelText('Sentence dictation'), 'second');
  await user.selectOptions(screen.getByLabelText('Jump to sentence'), '0');
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(1);
  resolveFirst(true);
  await waitFor(() => expect(mocks.fb.state.intensiveSessions.find((row: any) => row.sentenceId === 's2')?.transcriptInput).toBe('second'));
});

it('keeps saved due sentences eligible for blind recall when another sentence has an unsaved draft', async () => {
  const completed = { ...createIntensiveSession('part', 's1'), stage: 6, listened: true, revealed: true, transcriptInput: 'old answer', dictationResult: 'correct' as const, shadowingAudioId: 'recording', completedAt: '2026-01-01', nextReviewAt: '2099-01-01' };
  mocks.fb.state.intensiveSessions = [completed];
  const user = userEvent.setup(); const view = open();
  await user.selectOptions(await screen.findByLabelText('Jump to sentence'), '1');
  await user.type(screen.getByLabelText('Sentence dictation'), 'unsaved second sentence');
  view.unmount();
  // Time passes while the draft for the other sentence remains local.
  mocks.fb.state.intensiveSessions[0].nextReviewAt = '2026-01-02';
  mocks.recovery.get('one:intensive:part').s1.nextReviewAt = '2026-01-02';
  open('/?sentence=s1');
  expect(await screen.findByLabelText('Sentence dictation')).toHaveValue('');
  expect(screen.queryByText('old answer')).not.toBeInTheDocument();
});

it('jumps directly to a sentence while preserving the current dictation', async () => {
  const user = userEvent.setup(); open();
  await user.type(await screen.findByRole('textbox', { name: 'Sentence dictation' }), 'My first draft');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Jump to sentence' }), '1');
  expect(screen.getByRole('heading', { name: 'Sentence 2 / 2' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Jump to sentence' }), '0');
  expect(screen.getByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('My first draft');
  expect(screen.getByRole('link', { name: 'Listening practice' })).toHaveAttribute('href', '/listening/part');
});

it('explains pending requirements and updates the completion checklist', async () => {
  const user = userEvent.setup(); open();
  const compare = await screen.findByRole('button', { name: 'Compare with transcript' });
  expect(compare).toHaveAccessibleDescription('Play this sentence to the end before comparing.');
  expect(screen.getByRole('button', { name: 'Record shadowing' })).toHaveAccessibleDescription('Compare your dictation with the transcript to unlock recording.');
  expect(screen.getByRole('link', { name: 'Sentence dictation' })).toHaveAttribute('href', '#intensive-dictation');
  await user.click(await screen.findByRole('button', { name: 'Play test sentence' }));
  expect(compare).toHaveAccessibleDescription('Write your first attempt before comparing.');
  await user.type(screen.getByRole('textbox', { name: 'Sentence dictation' }), 'The train leaves at nine');
  await user.click(compare);
  expect(screen.getByRole('list', { name: 'Sentence completion checklist' })).toHaveTextContent('Dictation compared · Complete');
});

it('captures source vocabulary after comparison and hides source tools for blind listening', async () => {
  const ready = { ...createIntensiveSession('part', 's1'), stage: 3, listened: true, revealed: true, transcriptInput: 'The train leaves', dictationResult: 'partial' as const, shadowingAudioId: 'recording' };
  mocks.fb.state.intensiveSessions = [ready];
  const user = userEvent.setup(); open();
  const original = await screen.findByText('The train leaves at nine.');
  fireEvent.keyDown(original, { key: 'Enter' });
  await user.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(mocks.fb.setVocabularySeed).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'part', sources: [expect.objectContaining({ exam: expect.objectContaining({ sectionId: 'part', sentenceId: 's1', blockId: 'sentence:s1', start: 0, end: 25 }) })] }));
  await user.click(screen.getByRole('button', { name: 'Hide transcript for blind re-listening' }));
  expect(screen.queryByText('The train leaves at nine.')).not.toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Selected text tools' })).not.toBeInTheDocument();
});

it('does not report all changes saved when newer dictation is still pending', async () => {
  let resolveSave: (saved: boolean) => void = () => {};
  mocks.fb.persistNow.mockImplementation(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
  const user = userEvent.setup(); open();
  const input = await screen.findByRole('textbox', { name: 'Sentence dictation' });
  await user.type(input, 'first');
  await user.click(screen.getByRole('button', { name: 'Save progress' }));
  await user.type(input, ' newer');
  resolveSave(true);
  expect(await screen.findByText('New changes waiting to save.')).toBeInTheDocument();
  expect(screen.queryByText('Progress saved.')).not.toBeInTheDocument();
  expect(mocks.recovery.get('one:intensive:part').s1.transcriptInput).toBe('first newer');
});

it('keeps the transcript blind until listening and dictation, recovers per account', async () => {
  const user = userEvent.setup();
  const view = open();
  const dictation = await screen.findByRole('textbox', { name: 'Sentence dictation' });
  expect(screen.queryByText('The train leaves at nine.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Compare with transcript' })).toBeDisabled();
  await user.click(await screen.findByRole('button', { name: 'Play test sentence' }));
  await user.type(dictation, 'The train leaves nine');
  await user.click(screen.getByRole('button', { name: 'Compare with transcript' }));
  expect(await screen.findByText('Missing words')).toBeInTheDocument();
  expect(screen.getByText('at')).toHaveClass('dictation-missing');
  view.unmount();
  const resumed = open();
  expect(await screen.findByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('The train leaves nine');
  resumed.unmount(); mocks.owner = 'two'; mocks.fb.state = { intensiveSessions: [] }; mocks.fb.stateRef.current = mocks.fb.state; open();
  expect(await screen.findByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('');
});

it('shows unavailable timing explicitly and preserves unsaved work on save failure', async () => {
  mocks.catalog.sections[0].sentences[0].start = undefined;
  mocks.catalog.sections[0].sentences[0].end = undefined;
  mocks.fb.persistNow.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  open(); const user = userEvent.setup();
  expect(await screen.findByText(/Sentence timing unavailable/)).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Sentence dictation' }), 'notes');
  await user.click(screen.getByRole('button', { name: 'Save progress' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  await user.click(screen.getByRole('button', { name: 'Save progress' }));
  expect(await screen.findByText('Progress saved.')).toBeInTheDocument();
  expect(mocks.fb.persistNow.mock.calls[1][0].intensiveSessions[0].transcriptInput).toBe('notes');
});

it('recovers a denied microphone without marking the shadowing step complete', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
  vi.stubGlobal('MediaRecorder', class {});
  const user = userEvent.setup(); open();
  await user.click(await screen.findByRole('button', { name: 'Play test sentence' }));
  await user.type(screen.getByRole('textbox', { name: 'Sentence dictation' }), 'The train leaves at nine');
  await user.click(screen.getByRole('button', { name: 'Compare with transcript' }));
  await user.click(screen.getByRole('button', { name: 'Record shadowing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Microphone');
  expect(screen.getByRole('button', { name: 'Record shadowing' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Finish and schedule review' })).toBeDisabled();
});

it('does not reveal another account’s state after a save changes account', async () => {
  const user = userEvent.setup(); open();
  await screen.findByRole('textbox', { name: 'Sentence dictation' });
  mocks.fb.persistNow.mockImplementation(async () => { mocks.owner = 'two'; return true; });
  await user.click(screen.getByRole('button', { name: 'Save progress' }));
  await waitFor(() => expect(screen.queryByText('Progress saved.')).not.toBeInTheDocument());
});
it('a due sentence opens with blank recall instead of displaying the previous answer', async () => {
  mocks.fb.state.intensiveSessions = [{ id: 'i1', sectionId: 'part', sentenceId: 's1', stage: 6, gist: 'old gist', transcriptInput: 'The train leaves at nine', errorReasons: [], dictationResult: 'correct', completedAt: '2020-01-01', nextReviewAt: '2020-01-02', updatedAt: '2020-01-01', speed: 1, loop: false, selfRating: 5, shadowingAudioId: 'old', replayCount: 1, listened: true, revealed: false }];
  open();
  expect(await screen.findByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('');
  expect(screen.getByLabelText('Main idea or situation')).toHaveValue('');
  expect(screen.queryByText('Saved recording')).not.toBeInTheDocument();
});
it('only the selected due sentence enters recall and untouched due sentences survive progress saves', async () => {
  const first = { id: 'i1', sectionId: 'part', sentenceId: 's1', stage: 6, gist: 'old gist', transcriptInput: 'The train leaves at nine', errorReasons: [], dictationResult: 'correct', completedAt: '2020-01-01', nextReviewAt: '2020-01-02', updatedAt: '2020-01-01', speed: 1, loop: false, selfRating: 5, shadowingAudioId: 'old-1', replayCount: 1, listened: true, revealed: false };
  const second = { ...first, id: 'i2', sentenceId: 's2', transcriptInput: 'Please bring your ticket', shadowingAudioId: 'old-2' };
  mocks.fb.state.intensiveSessions = [first, second];
  open('/?sentence=s2');
  expect(await screen.findByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Save progress' }));
  const savedFirst = mocks.fb.stateRef.current.intensiveSessions.find((row: any) => row.id === 'i1');
  expect(savedFirst).toEqual(first);
  expect(mocks.fb.stateRef.current.intensiveSessions.find((row: any) => row.id === 'i2').completedAt).toBeUndefined();
  await userEvent.click(screen.getByRole('button', { name: /Sentence 1 100%/ }));
  expect(screen.getByRole('textbox', { name: 'Sentence dictation' })).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Save progress' }));
  const reviewingFirst = mocks.fb.stateRef.current.intensiveSessions.find((row: any) => row.id === 'i1');
  expect(reviewingFirst.completedAt).toBeUndefined();
  expect(reviewingFirst.reviewHistory[0].shadowingAudioId).toBe('old-1');
});

it('completes shadowing and schedules only after a fresh blind replay, retaining a failed upload', async () => {
  const tracks = [{ stop: vi.fn() }];
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) } });
  vi.stubGlobal('MediaRecorder', class {
    state = 'inactive'; mimeType = 'audio/webm';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) }); this.onstop?.(); }
  });
  mocks.putAudio.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const user = userEvent.setup(); open();
  await user.click(await screen.findByRole('button', { name: 'Play test sentence' }));
  await user.type(screen.getByRole('textbox', { name: 'Sentence dictation' }), 'The train leaves at nine');
  await user.click(screen.getByRole('button', { name: 'Compare with transcript' }));
  await user.click(screen.getByRole('button', { name: 'Record shadowing' }));
  await user.click(await screen.findByRole('button', { name: 'Stop recording' }));
  await user.click(await screen.findByRole('button', { name: 'Save shadowing recording' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Recording could not upload');
  expect(screen.getByText('Recording preview')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save shadowing recording' }));
  await screen.findByText('Saved recording');
  expect(mocks.putAudio.mock.calls[0][0]).toBe(mocks.putAudio.mock.calls[1][0]);
  await user.click(screen.getByRole('button', { name: 'Hide transcript for blind re-listening' }));
  expect(screen.queryByRole('textbox', { name: 'Sentence dictation' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sentence dictation' })).toHaveAttribute('href', '#intensive-player');
  await user.selectOptions(screen.getByLabelText('Self rating'), '5');
  await user.click(screen.getByRole('button', { name: 'Finish ongoing play' }));
  expect(screen.getByRole('button', { name: 'Finish and schedule review' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Play test sentence' }));
  await user.click(screen.getByRole('button', { name: 'Finish and schedule review' }));
  expect(await screen.findByText(/Next review:/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review scheduled' })).toBeDisabled();
  const session = mocks.fb.stateRef.current.intensiveSessions[0];
  expect(session.stage).toBe(6);
  expect(session.shadowingAudioId).toBeTruthy();
  expect(session.nextReviewAt).toBeTruthy();
});
