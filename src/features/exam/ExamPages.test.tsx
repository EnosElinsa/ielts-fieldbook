import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ExamCatalog } from '../../domain/exam/types';
import { ExamBankPage } from './ExamBankPage';
import { ExamPracticePage, ExamStimulus } from './ExamPracticePage';
import { ExamReviewPage } from './ExamReviewPage';

const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'one', catalog: null as any, recovery: new Map<string, any>() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('../../storage/examCatalog', () => ({ loadExamCatalog: async () => mocks.catalog, loadExamSections: async () => mocks.catalog, resolveExamAsset: async () => '/audio.mp3' }));
vi.mock('../../storage/examRecovery', () => ({ readExamRecovery: (owner: string, key: string) => mocks.recovery.get(`${owner}:${key}`), writeExamRecovery: (owner: string, key: string, data: any) => mocks.recovery.set(`${owner}:${key}`, structuredClone(data)), clearExamRecovery: (owner: string, key: string) => mocks.recovery.delete(`${owner}:${key}`) }));
const provenance = { sourceUrl: 'https://example.org/source', sourceVersion: '1', fetchedAt: '2026-01-01', contentHash: 'hash', authorization: 'owned' };
const catalog: ExamCatalog = { schemaVersion: 1, papers: [{ id: 'paper', book: 8, test: 1, title: 'Cambridge 8 Test 1', provenance }], sections: [{ id: 'section', paperId: 'paper', skill: 'reading', part: 1, title: 'The city garden', questionTypes: ['gap', 'true-false'], questionCount: 2, sentences: [], status: 'ready', provenance }], passages: [{ id: 'passage', sectionId: 'section', title: 'The city garden', paragraphs: [{ id: 'A', text: 'The garden opened in 1990.' }], provenance }], questions: [{ id: 'q1', paperId: 'paper', sectionId: 'section', skill: 'reading', number: 1, type: 'gap', prompt: 'The garden opened in _____.', answer: '1990', maxWords: 1, provenance }, { id: 'q2', paperId: 'paper', sectionId: 'section', skill: 'reading', number: 2, type: 'true-false', prompt: 'The garden opened in 2000.', answer: 'FALSE', explanation: 'The source gives 1990.', provenance }], assets: [] };
function Location() { return <output aria-label="URL">{useLocation().pathname}</output>; }
function SearchLocation() { return <output aria-label="Search URL">{useLocation().search}</output>; }
function practice(path = '/reading/section') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/reading/:sectionId" element={<ExamPracticePage skill="reading" />} /><Route path="/reading/mock/:paperId" element={<ExamPracticePage skill="reading" />} /><Route path="/reading/review/:attemptId" element={<ExamReviewPage skill="reading" />} /></Routes><Location /></MemoryRouter>); }
beforeEach(() => { mocks.catalog = structuredClone(catalog); mocks.owner = 'one'; mocks.recovery.clear(); const state = { examAttempts: [], intensiveSessions: [], settings: { favoriteExamSectionIds: [] } }; mocks.fb = { state, stateRef: { current: state }, persistNow: vi.fn(async (draft: any) => { mocks.fb.stateRef.current = draft; mocks.fb.state = draft; return true; }), toast: vi.fn() }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('bank presents available sections but disables an incomplete full mock', async () => { render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>); expect(await screen.findByText('The city garden')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Full mock unavailable' })).toBeDisabled(); expect(screen.getByRole('link', { name: /Practise passage 1/ })).toHaveAttribute('href', '/reading/section'); });
test('listening intensive bank mode opens the sentence workbench directly', async () => { mocks.catalog.sections[0].skill = 'listening'; render(<MemoryRouter initialEntries={['/listening?mode=intensive']}><ExamBankPage skill="listening" /></MemoryRouter>); expect(await screen.findByRole('link', { name: 'Open intensive part 1' })).toHaveAttribute('href', '/listening/intensive/section'); expect(screen.getByRole('link', { name: /Practise part 1/ })).toHaveAttribute('href', '/listening/section'); });
test('practice submission stays on the page on save failure and retries the same attempt', async () => { mocks.fb.persistNow.mockResolvedValueOnce(false); practice(); const user = userEvent.setup(); await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990'); await user.click(screen.getByRole('radio', { name: 'FALSE' })); await user.click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByRole('alert')).toHaveTextContent('Could not save'); expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/section'); const firstId = mocks.fb.persistNow.mock.calls[0][0].examAttempts[0].id; await user.click(screen.getByRole('button', { name: 'Retry submission' })); await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/review/')); expect(mocks.fb.persistNow.mock.calls[1][0].examAttempts[0].id).toBe(firstId); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('2 / 2'); });
test('practice recovers answers after leaving without carrying them into another account', async () => { const view = practice(); const user = userEvent.setup(); await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990'); view.unmount(); const resumed = practice(); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990'); resumed.unmount(); mocks.owner = 'two'; practice(); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue(''); });
test('mock begins explicitly and never exposes method hints or per-question checks', async () => { mocks.catalog.sections = [1, 2, 3].map(part => ({ ...catalog.sections[0], id: part === 1 ? 'section' : `section${part}`, part })); mocks.catalog.questions = [1, 2, 3].flatMap(part => catalog.questions.map(question => ({ ...question, id: `${question.id}-${part}`, sectionId: part === 1 ? 'section' : `section${part}` }))); mocks.catalog.passages = mocks.catalog.sections.map((section: any) => ({ ...catalog.passages[0], id: `p-${section.id}`, sectionId: section.id })); mocks.catalog.sections.forEach((section: any) => section.questionCount = 2); practice('/reading/mock/paper'); expect(await screen.findByRole('button', { name: 'Start mock' })).toBeInTheDocument(); expect(screen.queryByText('Locate · prove · paraphrase')).not.toBeInTheDocument(); await userEvent.setup().click(screen.getByRole('button', { name: 'Start mock' })); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Check answer 1' })).not.toBeInTheDocument(); });
test('wrong-only retry starts with blank answers and evidence and grades only the retry questions', async () => { mocks.fb.state.examAttempts = [{ id: 'previous', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990', q2: 'TRUE' }, results: { q1: true, q2: false }, evidence: { q2: 'Old proof' }, keywords: {}, errorReasons: {}, score: 1, total: 2, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }]; practice('/reading/section?retry=previous'); await screen.findByRole('radio', { name: 'FALSE' }); expect(screen.queryByRole('textbox', { name: 'Answer 1' })).not.toBeInTheDocument(); await userEvent.setup().click(screen.getByText('Evidence & paraphrase')); expect(screen.getByRole('textbox', { name: 'Evidence for question 2' })).toHaveValue(''); await userEvent.setup().click(screen.getByRole('radio', { name: 'FALSE' })); await userEvent.setup().click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByRole('alert')).toHaveTextContent('Add fresh passage evidence for question 2'); expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/section'); expect(screen.getByRole('radio', { name: 'FALSE' })).toBeChecked(); await userEvent.setup().type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'The garden opened in 1990.'); await userEvent.setup().click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('1 / 1'); });
test('review preserves the submitted question snapshot when the live source changes', async () => { mocks.fb.state.examAttempts = [{ id: 'saved', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990' }, results: { q1: true }, questionSnapshot: [catalog.questions[0]], evidence: {}, keywords: {}, errorReasons: {}, score: 1, total: 1, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }]; mocks.catalog.questions[0].answer = '2000'; practice('/reading/review/saved'); expect(await screen.findByRole('heading', { name: 'The garden opened in _____.' })).toBeInTheDocument(); expect(screen.queryByText('2000')).not.toBeInTheDocument(); expect(screen.getAllByText('1990')).toHaveLength(2); });
test('source stimulus keeps tables and numbered gaps while stripping active HTML', () => { const { container } = render(<ExamStimulus html={'<table><tr><td colspan="2" onclick="alert(1)">Opened #####-1-#####<br>Source note</td></tr></table><script>steal()</script><iframe src="https://example.org"></iframe><p><a href="javascript:alert(1)">Safe text</a></p>'} />); expect(screen.getByRole('cell')).toHaveTextContent('Opened 〔1〕'); expect(screen.getByRole('cell')).toHaveAttribute('colspan', '2'); expect(container.querySelector('script,iframe,a,[onclick]')).toBeNull(); expect(screen.getByText('Safe text')).toBeInTheDocument(); expect(container.querySelector('br')).not.toBeNull(); });
test('stimulus images render only imported assets through resolved source URLs', async () => { const asset = { id: 'diagram', paperId: 'paper', kind: 'image' as const, storagePath: 'diagram', sourceUrl: 'https://example.org/diagram.jpg', provenance }; render(<ExamStimulus assets={[asset]} html={'<img src="exam-asset:diagram" alt="Library map" onerror="alert(1)"><img src="https://untrusted.example/track.jpg" alt="Untrusted">'} />); expect(await screen.findByRole('img', { name: 'Library map' })).toHaveAttribute('src', '/audio.mp3'); expect(screen.queryByRole('img', { name: 'Untrusted' })).not.toBeInTheDocument(); });
test('a recovered mock uses its original deadline and submits after time expires', async () => { mocks.catalog.sections = [1, 2, 3].map(part => ({ ...catalog.sections[0], id: part === 1 ? 'section' : `section${part}`, part })); mocks.catalog.questions = mocks.catalog.sections.flatMap((section: any, index: number) => catalog.questions.map(question => ({ ...question, id: `${question.id}-${index}`, sectionId: section.id }))); mocks.catalog.passages = mocks.catalog.sections.map((section: any) => ({ ...catalog.passages[0], id: `p-${section.id}`, sectionId: section.id })); const timestamp = new Date(Date.now() - 3_700_000).toISOString(); mocks.recovery.set('one:reading:mock:paper', { id: 'expired', skill: 'reading', sourceId: 'paper', mode: 'mock', status: 'active', sectionIds: ['section', 'section2', 'section3'], responses: {}, evidence: {}, keywords: {}, errorReasons: {}, elapsedSeconds: 0, timeLimitSeconds: 3600, hintsEnabled: false, startedAt: timestamp, updatedAt: timestamp }); practice('/reading/mock/paper'); await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/review/expired')); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('0 / 6'); });
test('reading selection opens vocabulary capture with passage context and keeps technical paragraph IDs hidden', async () => { mocks.fb.setVocabularySeed = vi.fn(); mocks.fb.setEditingVocabularyId = vi.fn(); mocks.fb.openModal = vi.fn(); mocks.catalog.passages[0].title = 'A garden in the city'; mocks.catalog.passages[0].paragraphs[0].id = 'paragraph:1330:0'; vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'garden' } as Selection); practice(); await screen.findByRole('textbox', { name: 'Answer 1' }); expect(screen.getByRole('heading', { name: 'A garden in the city' })).toBeInTheDocument(); expect(screen.queryByText('paragraph:1330:0')).not.toBeInTheDocument(); fireEvent.mouseUp(screen.getByText('The garden opened in 1990.')); await userEvent.setup().click(screen.getByRole('button', { name: 'Add selected text to vocabulary' })); expect(mocks.fb.setVocabularySeed).toHaveBeenCalledWith(expect.objectContaining({ term: 'garden', skill: 'reading', sourceId: 'section', context: 'The garden opened in 1990.' })); expect(mocks.fb.openModal).toHaveBeenCalledWith('vocabulary'); });


test('bank sorts papers by numeric book and test', async () => { mocks.catalog.papers = [[11, 4], [8, 2], [8, 1], [10, 1]].map(([book, test]) => ({ ...catalog.papers[0], id: `paper-${book}-${test}`, book, test, title: `Cambridge ${book} Test ${test}` })); mocks.catalog.sections = mocks.catalog.papers.map((paper: any) => ({ ...catalog.sections[0], id: `section-${paper.id}`, paperId: paper.id })); render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>); await screen.findByRole('heading', { name: 'Cambridge 8 Test 1' }); expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Cambridge 8 Test 1', 'Cambridge 8 Test 2', 'Cambridge 10 Test 1', 'Cambridge 11 Test 4']); });

test('bank search matches book and test even when the passage title differs', async () => {
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  await screen.findByText('The city garden');
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search reading sections' }), 'Cambridge 8 Test 1');
  expect(screen.getByText('The city garden')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 test · 1 passage');
});

test('clearing bank filters preserves intensive mode', async () => {
  mocks.catalog.sections[0].skill = 'listening';
  render(<MemoryRouter initialEntries={['/listening?mode=intensive&q=missing']}><ExamBankPage skill="listening" /><SearchLocation /></MemoryRouter>);
  await screen.findByText('No sections match these filters.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByLabelText('Search URL')).toHaveTextContent('?mode=intensive');
  expect(await screen.findByRole('link', { name: 'Open intensive part 1' })).toBeInTheDocument();
});

test('favourite retry preserves the intended change after an optimistic failed save', async () => {
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return false; });
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Add favourite: The city garden' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your favourite');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry favourite save' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(mocks.fb.persistNow.mock.calls[1][0].settings.favoriteExamSectionIds).toEqual(['section']);
});

test('bank pagination keeps filters and returns to the first page on search', async () => {
  mocks.catalog.papers = Array.from({ length: 12 }, (_, i) => ({ ...catalog.papers[0], id: `p${i}`, book: 8 + Math.floor(i / 4), test: i % 4 + 1, title: `Cambridge ${8 + Math.floor(i / 4)} Test ${i % 4 + 1}` }));
  mocks.catalog.sections = mocks.catalog.papers.map((paper: any) => ({ ...catalog.sections[0], id: `s${paper.id}`, paperId: paper.id }));
  render(<MemoryRouter initialEntries={['/reading?status=ready']}><ExamBankPage skill="reading" /><SearchLocation /></MemoryRouter>);
  await screen.findByText('Page 1 of 2');
  expect(screen.getAllByRole('article')).toHaveLength(8);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next tests' }));
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(screen.getByLabelText('Search URL')).toHaveTextContent('status=ready&page=2');
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search reading sections' }), 'Cambridge 8');
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(screen.getByLabelText('Search URL')).not.toHaveTextContent('page=2');
});

test('pausing listening practice pauses playing audio and resumes it at the same position', async () => { mocks.catalog.sections[0].skill = 'listening'; mocks.catalog.sections[0].assetId = 'recording'; mocks.catalog.questions.forEach((question: any) => question.skill = 'listening'); mocks.catalog.assets = [{ id: 'recording', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'recording.mp3', sourceUrl: '', duration: 100, provenance }]; const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); const { container } = render(<MemoryRouter initialEntries={['/listening/section']}><Routes><Route path="/listening/:sectionId" element={<ExamPracticePage skill="listening" />} /></Routes></MemoryRouter>); await screen.findByRole('textbox', { name: 'Answer 1' }); const audio = container.querySelector('audio')!; await waitFor(() => expect(audio).toHaveAttribute('src', '/audio.mp3')); audio.currentTime = 25; fireEvent.play(audio); fireEvent.timeUpdate(audio); await userEvent.setup().click(screen.getByRole('button', { name: 'Pause' })); expect(pause).toHaveBeenCalled(); fireEvent.pause(audio); await userEvent.setup().click(screen.getByRole('button', { name: 'Resume' })); expect(play).toHaveBeenCalledTimes(1); expect(audio.currentTime).toBe(25); });


test('manual submission confirms blanks and returns to the first unanswered question without losing work', async () => {
  practice(); const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990');
  await user.click(screen.getByRole('button', { name: 'Submit answers' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('1 question still unanswered');
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Return to unanswered' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  await user.click(screen.getByRole('button', { name: 'Submit answers' }));
  await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
  expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('1 / 2');
  expect(screen.getByRole('heading', { name: 'The garden opened in 2000.' })).toBeInTheDocument();
});

test('whitespace and cleared multiple selections stay unanswered in the map and cannot reveal checks', async () => {
  mocks.catalog.questions[1] = { ...mocks.catalog.questions[1], type: 'multiple', options: ['A', 'B'], answer: ['A', 'B'] };
  practice(); const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '   ');
  await user.click(screen.getByRole('checkbox', { name: 'A' }));
  await user.click(screen.getByRole('checkbox', { name: 'A' }));
  expect(screen.getByText('0 / 2 answered')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to question 1 · unanswered' })).not.toHaveClass('answered');
  expect(screen.getByRole('link', { name: 'Go to question 2 · unanswered' })).not.toHaveClass('answered');
  expect(screen.getByRole('button', { name: 'Check answer 1' })).toBeDisabled();
});

test('pause disables evidence editing and capture until resumed', async () => {
  practice(); const user = userEvent.setup(); await screen.findByRole('textbox', { name: 'Answer 1' });
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  await user.click(screen.getAllByText('Evidence & paraphrase')[0]);
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Keywords & synonyms for question 1' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Question for selected evidence' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Resume' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toBeEnabled();
});

function savedReview() {
  mocks.fb.state.examAttempts = [{ id: 'saved', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990', q2: 'TRUE' }, results: { q1: true, q2: false }, questionSnapshot: catalog.questions, evidence: {}, keywords: {}, errorReasons: {}, score: 1, total: 2, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }];
}

test('review filters wrong answers, keeps local notes across navigation and clears recovery only after saving', async () => {
  savedReview(); const user = userEvent.setup(); const view = practice('/reading/review/saved');
  expect(screen.queryByRole('heading', { name: 'The garden opened in _____.' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save review notes' })).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'Fresh proof');
  view.unmount(); practice('/reading/review/saved');
  expect(screen.getByRole('textbox', { name: 'Evidence for question 2' })).toHaveValue('Fresh proof');
  expect(screen.getByText('Unsaved review notes')).toHaveAttribute('role', 'status');
  await user.click(screen.getByRole('button', { name: 'All answers (2)' }));
  expect(screen.getByRole('heading', { name: 'The garden opened in _____.' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save review notes' })).toBeDisabled());
  expect(mocks.fb.state.examAttempts[0].evidence.q2).toBe('Fresh proof');
  expect(mocks.recovery.has('one:review:saved')).toBe(false);
});

test('failed optimistic review-note saves remain retryable', async () => {
  savedReview(); practice('/reading/review/saved'); const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'Proof');
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return false; });
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save review notes');
  expect(screen.getByRole('button', { name: 'Save review notes' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(2);
});

test('listening recording is outside mobile panels and survives switching to source notes', async () => {
  mocks.catalog.sections[0].skill = 'listening'; mocks.catalog.sections[0].assetId = 'recording';
  mocks.catalog.questions.forEach((question: any) => question.skill = 'listening');
  mocks.catalog.assets = [{ id: 'recording', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'recording.mp3', sourceUrl: '', duration: 100, provenance }];
  const { container } = render(<MemoryRouter initialEntries={['/listening/section']}><Routes><Route path="/listening/:sectionId" element={<ExamPracticePage skill="listening" />} /></Routes></MemoryRouter>);
  const user = userEvent.setup(); await screen.findByRole('textbox', { name: 'Answer 1' });
  const audio = container.querySelector('audio')!;
  expect(audio.closest('.exam-source-panel')).toBeNull();
  expect(screen.getByRole('button', { name: 'Questions' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Source notes' }));
  expect(container.querySelector('audio')).toBe(audio);
  fireEvent.error(audio);
  expect(screen.getByRole('alert')).toHaveTextContent('The recording could not play');
  await user.click(screen.getByRole('button', { name: 'Retry recording' }));
  await waitFor(() => expect(container.querySelector('audio')).toHaveAttribute('src', '/audio.mp3'));
});


test('review remains pending after failed optimistic save and remount', async () => {
  savedReview(); const view = practice('/reading/review/saved'); const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'Cloud pending');
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return false; });
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  await screen.findByRole('alert'); view.unmount(); practice('/reading/review/saved');
  expect(screen.getByRole('button', { name: 'Save review notes' })).toBeEnabled();
  expect(screen.getByText('Unsaved review notes')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  await waitFor(() => expect(mocks.recovery.has('one:review:saved')).toBe(false));
});


test('an old review save cannot clear newer recovery after leaving and reopening the attempt', async () => {
  savedReview(); let resolveSave: (value: boolean) => void = () => {};
  mocks.fb.persistNow.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
  const user = userEvent.setup(); const view = practice('/reading/review/saved');
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'First note');
  await user.click(screen.getByRole('button', { name: 'Save review notes' }));
  view.unmount(); const reopened = practice('/reading/review/saved');
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), ' newer');
  await act(async () => resolveSave(true));
  reopened.unmount(); practice('/reading/review/saved');
  expect(screen.getByRole('textbox', { name: 'Evidence for question 2' })).toHaveValue('First note newer');
  expect(screen.getByRole('button', { name: 'Save review notes' })).toBeEnabled();
});


test('source images nested in paragraphs preserve valid HTML while loading and after resolution', async () => {
  const asset = { id: 'diagram', paperId: 'paper', kind: 'image' as const, storagePath: 'diagram', sourceUrl: 'https://example.org/diagram.jpg', provenance };
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { container } = render(<ExamStimulus assets={[asset]} html={'<p><span><img src="exam-asset:diagram" alt="Paragraph diagram"></span></p>'} />);
  await screen.findByRole('img', { name: 'Paragraph diagram' });
  expect(container.querySelector('p figure,p p')).toBeNull();
  expect(error).not.toHaveBeenCalled();
});
