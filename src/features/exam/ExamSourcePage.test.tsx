import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamSourcePage } from './ExamSourcePage';
import { createIntensiveSession } from '../../domain/exam/intensive';
import { writeExamRecovery } from '../../storage/examRecovery';
import { useExamAttempt } from './useExamAttempt';

const mocks = vi.hoisted(() => ({ fb: null as any, catalog: null as any, owner: 'owner' }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('./useExamCatalog', () => ({ useExamCatalog: () => ({ loading: false, error: '', reload: vi.fn(), catalog: mocks.catalog }), useExamAsset: () => ({ url: '', error: '', reload: vi.fn() }) }));
const catalog = {
  sections: [{ id: 'part', skill: 'listening', part: 1, title: 'Listening Part 1', provenance: { sourceVersion: '1' }, sentences: [{ id: 'one', text: 'The destination is Wellington.', start: 0, end: 2 }, { id: 'two', text: 'The date is November.', start: 2, end: 5 }] }], passages: []
};
beforeEach(() => {
  localStorage.clear();
  mocks.owner = 'owner';
  mocks.catalog = structuredClone(catalog);
  const state = { examAttempts: [], intensiveSessions: [], examAnnotations: [] };
  mocks.fb = { state, stateRef: { current: state }, setEditingVocabularyId: vi.fn(), setVocabularySeed: vi.fn(), openModal: vi.fn(), persistNow: vi.fn() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const page = () => <MemoryRouter initialEntries={['/listening/source/part']}><Routes><Route path="/listening/source/:sectionId" element={<ExamSourcePage skill="listening" />} /></Routes></MemoryRouter>;
const view = () => render(page());

test('direct source navigation hides unrevealed transcript and vocabulary tools', () => {
  view();
  expect(screen.getByText('Transcript hidden.')).toBeInTheDocument();
  expect(screen.queryByText('The destination is Wellington.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('comparison unlocks only the selected intensive sentence and its capture action', () => {
  mocks.fb.state.intensiveSessions = [{ ...createIntensiveSession('part', 'one'), stage: 2, revealed: true, dictationResult: 'correct' }];
  view();
  const text = screen.getByText('The destination is Wellington.');
  expect(screen.queryByText('The date is November.')).not.toBeInTheDocument();
  fireEvent.keyDown(text, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(mocks.fb.setVocabularySeed).toHaveBeenCalledWith(expect.objectContaining({ sources: [expect.objectContaining({ exam: expect.objectContaining({ sectionId: 'part', sentenceId: 'one' }) })] }));
});

test('blind local recovery hides an earlier cloud reveal and its saved note', () => {
  const session = { ...createIntensiveSession('part', 'one', '2026-10-14T00:00:00Z'), stage: 3, revealed: true, dictationResult: 'correct' as const };
  mocks.fb.state.intensiveSessions = [session];
  mocks.fb.state.examAnnotations = [{ id: 'note', skill: 'listening', sourceId: 'part', color: 'yellow', quote: 'The destination is Wellington.', note: 'Hidden destination answer', updatedAt: session.updatedAt, anchors: [{ blockId: 'sentence:one', quote: 'Wellington', start: 19, end: 29, prefix: '', suffix: '', contentVersion: '1' }] }];
  writeExamRecovery('owner', 'intensive:part', { one: { ...session, revealed: false, updatedAt: '2026-10-14T00:01:00Z' } });
  view();
  expect(screen.queryByText('The destination is Wellington.')).not.toBeInTheDocument();
  expect(screen.queryByText('Hidden destination answer')).not.toBeInTheDocument();
});

test('a submitted part exposes its full source without creating another attempt', () => {
  mocks.fb.state.examAttempts = [{ skill: 'listening', status: 'completed', sectionIds: ['part'] }];
  view();
  expect(screen.getByText('The destination is Wellington.')).toBeInTheDocument();
  expect(screen.getByText('The date is November.')).toBeInTheDocument();
  expect(screen.queryByText('Transcript hidden.')).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('hiding an eligible sentence closes its stale vocabulary toolbar and note modal', () => {
  const session = { ...createIntensiveSession('part', 'one'), stage: 2, revealed: true, dictationResult: 'correct' };
  mocks.fb.state.intensiveSessions = [session];
  const rendered = view();
  fireEvent.keyDown(screen.getByText('The destination is Wellington.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add selected text to vocabulary' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  session.revealed = false;
  rendered.rerender(page());
  expect(screen.getByText('Transcript hidden.')).toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Selected text tools' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('source viewer captures a real range spanning both unlocked transcript sentences', () => {
  mocks.fb.state.examAttempts = [{ skill: 'listening', status: 'completed', sectionIds: ['part'] }];
  view();
  const first = screen.getByText('The destination is Wellington.'); const second = screen.getByText('The date is November.');
  const range = document.createRange(); range.setStart(first.firstChild!, 19); range.setEnd(second.firstChild!, 8);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(second); fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(mocks.fb.setVocabularySeed.mock.calls[0][0].sources).toMatchObject([{ context: 'The destination is Wellington.', exam: { sentenceId: 'one', quote: 'Wellington.', start: 19, end: 30 } }, { context: 'The date is November.', exam: { sentenceId: 'two', quote: 'The date', start: 0, end: 8 } }]);
  selection.removeAllRanges();
});

test.each(['question:q1', 'stimulus:group:0-0:0'])('source backlink focuses the original %s block without answers, explanations or hidden transcript', block => {
  mocks.catalog.questions = [{ id: 'q1', sectionId: 'part', skill: 'listening', number: 1, prompt: 'Choose the destination.', instructions: 'Choose one answer.', groupId: 'group', stimulusHtml: '<p>Journey destination #####-1-#####</p><script>Secret script</script>', answer: 'Answer secret', explanation: 'Explanation secret', sourceExplanation: 'Original secret', provenance: { sourceVersion: '1' } }];
  mocks.catalog.assets = [];
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  render(<MemoryRouter initialEntries={[`/listening/source/part?block=${encodeURIComponent(block)}`]}><Routes><Route path='/listening/source/:sectionId' element={<ExamSourcePage skill='listening' />} /></Routes></MemoryRouter>);
  const target = document.querySelector<HTMLElement>(`[data-source-block="${block}"]`);
  expect(target).not.toBeNull(); expect(focus.mock.instances).toContain(target);
  expect(screen.getByText('Choose the destination.')).toBeInTheDocument();
  expect(screen.queryByText('Answer secret')).not.toBeInTheDocument();
  expect(screen.queryByText('Explanation secret')).not.toBeInTheDocument();
  expect(screen.queryByText('Original secret')).not.toBeInTheDocument();
  expect(screen.queryByText('Secret script')).not.toBeInTheDocument();
  expect(screen.queryByText('The destination is Wellington.')).not.toBeInTheDocument();
  expect(screen.getByText('Transcript hidden.')).toBeInTheDocument();
  fireEvent.keyDown(target!, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add selected text to vocabulary' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(mocks.fb.setVocabularySeed.mock.calls[0][0].sources[0].exam.blockId).toBe(block);
});

test('a source backlink during an active mock keeps question material readable without lookup tools', () => {
  mocks.fb.state.examAttempts = [{ skill: 'listening', status: 'active', mode: 'mock', sectionIds: ['part'] }];
  mocks.catalog.questions = [{ id: 'q1', sectionId: 'part', skill: 'listening', number: 1, prompt: 'Choose the destination.', answer: 'Wellington', provenance: { sourceVersion: '1' } }];
  view();
  fireEvent.keyDown(screen.getByText('Choose the destination.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
  expect(screen.queryByText('The destination is Wellington.')).not.toBeInTheDocument();
});

function LocalMockStart({ planId, retryId }: { planId?: string; retryId?: string }) {
  const controller = useExamAttempt('listening', 'paper', 'mock', mocks.catalog, undefined, retryId, planId);
  return <><button onClick={controller.start}>Start local mock</button><Link to='/listening/source/part'>Open original source</Link></>;
}

test.each([{}, { planId: 'planned' }, { retryId: 'previous', planId: 'retry-plan' }])('local mock transition keeps source lookup gated before autosave for scope %j and isolates accounts', scope => {
  mocks.catalog.sections[0].paperId = 'paper';
  mocks.catalog.assets = [];
  mocks.catalog.questions = [{ id: 'q1', sectionId: 'part', skill: 'listening', number: 1, prompt: 'Choose the destination.', answer: 'Wellington', provenance: { sourceVersion: '1' } }];
  const app = <MemoryRouter initialEntries={['/start']}><Routes><Route path='/start' element={<LocalMockStart {...scope} />} /><Route path='/listening/source/:sectionId' element={<ExamSourcePage skill='listening' />} /></Routes></MemoryRouter>;
  const rendered = render(app);
  fireEvent.click(screen.getByRole('button', { name: 'Start local mock' }));
  expect(mocks.fb.state.examAttempts).toEqual([]);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Open original source' }));
  fireEvent.keyDown(screen.getByText('Choose the destination.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
  mocks.owner = 'other-owner';
  rendered.unmount();
  view();
  fireEvent.keyDown(screen.getByText('Choose the destination.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add selected text to vocabulary' })).toBeInTheDocument();
});

test('later submitted cloud mock supersedes stale local recovery while a newer scoped mock still gates lookup', () => {
  mocks.catalog.sections[0].paperId = 'paper';
  mocks.catalog.questions = [{ id: 'q1', sectionId: 'part', skill: 'listening', number: 1, prompt: 'Choose the destination.', provenance: { sourceVersion: '1' } }];
  const stale = { id: 'attempt', skill: 'listening', mode: 'mock', status: 'active', sourceId: 'paper', sectionIds: ['part'], updatedAt: '2026-10-14T00:00:00Z' };
  writeExamRecovery('owner', 'listening:mock:paper', stale);
  mocks.fb.state.examAttempts = [{ ...stale, status: 'completed', updatedAt: '2026-10-14T00:01:00Z' }];
  const rendered = view();
  fireEvent.keyDown(screen.getByText('Choose the destination.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add selected text to vocabulary' })).toBeInTheDocument();
  writeExamRecovery('owner', 'listening:mock:paper:retry:attempt:plan:next', { ...stale, id: 'next', retryOfAttemptId: 'attempt', planId: 'next', updatedAt: '2026-10-14T00:02:00Z' });
  rendered.rerender(page());
  fireEvent.keyDown(document.querySelector('[data-source-block="question:q1"]')!, { key: 'Enter' });
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
});

test('a real failed mock autosave still gates source lookup through its local recovery', async () => {
  vi.useFakeTimers();
  mocks.catalog.sections[0].paperId = 'paper';
  mocks.catalog.assets = [];
  mocks.catalog.questions = [{ id: 'q1', sectionId: 'part', skill: 'listening', number: 1, prompt: 'Choose the destination.', answer: 'Wellington', provenance: { sourceVersion: '1' } }];
  mocks.fb.persistNow.mockResolvedValue(false);
  render(<MemoryRouter initialEntries={['/start']}><Routes><Route path='/start' element={<LocalMockStart />} /><Route path='/listening/source/:sectionId' element={<ExamSourcePage skill='listening' />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Start local mock' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(1);
  expect(mocks.fb.state.examAttempts).toEqual([]);
  fireEvent.click(screen.getByRole('link', { name: 'Open original source' }));
  fireEvent.keyDown(screen.getByText('Choose the destination.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
});
