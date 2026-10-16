import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ExamCatalog } from '../../domain/exam/types';
import { ExamBankPage } from './ExamBankPage';
import { ExamImage, ExamPracticePage, ExamStimulus } from './ExamPracticePage';
import { ExamReviewPage } from './ExamReviewPage';
import { ExamSourcePage } from './ExamSourcePage';
import { HeadingReference } from './ReadingPassage';
import { examCatalogKey, loadExamCatalog } from '../../storage/examCatalog';
import { cachedRead, clearReadCache } from '../../lib/readCache';

const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'one', catalog: null as any, recovery: new Map<string, any>() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('../../storage/examCatalog', async importOriginal => ({ ...await importOriginal<typeof import('../../storage/examCatalog')>(), loadExamCatalog: vi.fn(async () => mocks.catalog), loadExamSections: async () => mocks.catalog, resolveExamAsset: async () => '/audio.mp3' }));
vi.mock('../../storage/examRecovery', () => ({ readExamRecovery: (owner: string, key: string) => mocks.recovery.get(`${owner}:${key}`), readExamRecoveries: (owner: string, scope: string) => [...mocks.recovery].filter(([key]) => key === `${owner}:${scope}` || key.startsWith(`${owner}:${scope}:`)).map(([, data]) => structuredClone(data)), writeExamRecovery: (owner: string, key: string, data: any) => mocks.recovery.set(`${owner}:${key}`, structuredClone(data)), clearExamRecovery: (owner: string, key: string) => mocks.recovery.delete(`${owner}:${key}`) }));
const provenance = { sourceUrl: 'https://example.org/source', sourceVersion: '1', fetchedAt: '2026-01-01', contentHash: 'hash', authorization: 'owned' };
const catalog: ExamCatalog = { schemaVersion: 1, papers: [{ id: 'paper', book: 8, test: 1, title: 'Cambridge 8 Test 1', provenance }], sections: [{ id: 'section', paperId: 'paper', skill: 'reading', part: 1, title: 'The city garden', questionTypes: ['gap', 'true-false'], questionCount: 2, sentences: [], status: 'ready', provenance }], passages: [{ id: 'passage', sectionId: 'section', title: 'The city garden', paragraphs: [{ id: 'A', text: 'The garden opened in 1990.' }], provenance }], questions: [{ id: 'q1', paperId: 'paper', sectionId: 'section', skill: 'reading', number: 1, type: 'gap', prompt: 'The garden opened in _____.', answer: '1990', maxWords: 1, provenance }, { id: 'q2', paperId: 'paper', sectionId: 'section', skill: 'reading', number: 2, type: 'true-false', prompt: 'The garden opened in 2000.', answer: 'FALSE', explanation: 'The source gives 1990.', provenance }], assets: [] };
function Location() { return <output aria-label="URL">{useLocation().pathname}</output>; }
function SearchLocation() { return <output aria-label="Search URL">{useLocation().search}</output>; }
function practice(path = '/reading/section') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/reading" element={<ExamBankPage skill="reading" />} /><Route path="/reading/:sectionId" element={<ExamPracticePage skill="reading" />} /><Route path="/reading/mock/:paperId" element={<ExamPracticePage skill="reading" />} /><Route path="/reading/review/:attemptId" element={<ExamReviewPage skill="reading" />} /></Routes><Location /></MemoryRouter>); }
beforeEach(() => { clearReadCache(); mocks.catalog = structuredClone(catalog); mocks.owner = 'one'; mocks.recovery.clear(); sessionStorage.clear(); const state = { examAttempts: [], intensiveSessions: [], settings: { favoriteExamSectionIds: [] } }; mocks.fb = { state, stateRef: { current: state }, ensureAccountModule: vi.fn().mockResolvedValue(undefined), persistNow: vi.fn(async (draft: any) => { mocks.fb.stateRef.current = draft; mocks.fb.state = draft; return true; }), toast: vi.fn() }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

test('legacy letter and question markers restore real paragraphs without changing annotation anchors', async () => {
  mocks.catalog.passages[0].paragraphs = [
    { id: 'old-0', text: 'A 14' }, { id: 'old-1', text: 'The garden opened.' }, { id: 'old-2', text: 'It was green.' },
    { id: 'old-3', text: 'B 15' }, { id: 'old-4', text: 'Then it closed.' },
  ];
  practice();
  const first = await screen.findByText('The garden opened.');
  expect(first.closest('p')).toHaveTextContent('A The garden opened. It was green.');
  expect(first).toHaveAttribute('data-source-block', 'passage:passage:old-1');
  expect(screen.getByText('A 14')).not.toBeVisible();
  expect(screen.getByText('Then it closed.').closest('p')).toHaveTextContent('B Then it closed.');
});

test('embedded paragraph letters replace generated numbers while preserving source blocks', async () => {
  mocks.catalog.passages[0].paragraphs = [{ id: 'title', text: 'A garden in the city' }, { id: 'old-A', text: 'A The garden opened.' }, { id: 'old-B', text: 'B Then it closed.' }];
  practice(); await screen.findByRole('textbox', { name: 'Answer 1' });
  const source = document.getElementById('exam-panel-source')!;
  expect(within(source).getByLabelText('Paragraph A')).toBeVisible();
  expect(within(source).getByLabelText('Paragraph B')).toBeVisible();
  expect(within(source).queryByLabelText('Paragraph 1')).not.toBeInTheDocument();
  const block = source.querySelector<HTMLElement>('[data-source-block="passage:passage:old-A"]')!;
  expect(block.textContent).toBe('A The garden opened.');
  expect(within(block).getByText('A')).not.toBeVisible();
});

test('heading tasks display the complete shared list and name the real source paragraphs', async () => {
  mocks.catalog.passages[0].paragraphs = [{ id: 'legacy-0', text: 'A 1' }, { id: 'legacy-1', text: 'The garden opened.' }, { id: 'legacy-2', text: 'B 2' }, { id: 'legacy-3', text: 'Then it closed.' }];
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, type: 'heading', groupId: 'headings', prompt: `Question ${number} · Complete the marked gap in the text above.`, options: ['I. A garden', 'II. A closure'], answer: 'I. A garden', stimulusHtml: '<p>List of Headings:</p>' }));
  practice();
  await screen.findByRole('combobox', { name: 'Answer 1' });
  expect(screen.getByRole('list', { name: 'List of headings' })).toHaveTextContent('I. A garden');
  expect(screen.getByRole('list', { name: 'List of headings' })).toHaveTextContent('II. A closure');
  expect(screen.getByText('Paragraph A')).toBeInTheDocument();
  expect(screen.getByText('Paragraph B')).toBeInTheDocument();
  expect(screen.queryByText(/Complete the marked gap/)).not.toBeInTheDocument();
});

test('heading assignments share a group with their reference and keep full choices in the compact answer menu', async () => {
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, type: 'heading', maxWords: undefined, groupId: 'headings', prompt: `Paragraph ${String.fromCharCode(64 + number)}`, options: ['I. A garden', 'II. A closure'], answer: 'I. A garden', stimulusHtml: '<p>Choose the correct heading for each paragraph.</p>' }));
  practice();
  await screen.findByRole('combobox', { name: 'Answer 1' });
  const group = screen.getByRole('group', { name: 'Questions 1–2 · Matching headings' });
  expect(within(group).getByRole('list', { name: 'List of headings' })).toBeVisible();
  expect(within(group).getByRole('combobox', { name: 'Answer 2' })).toBeVisible();
  const instruction = within(group).getByText('Choose the correct heading for each paragraph.');
  expect(instruction).not.toBeVisible();
  await userEvent.setup().click(within(group).getByText('Instructions'));
  expect(instruction).toBeVisible();
  await userEvent.setup().click(within(group).getByRole('combobox', { name: 'Answer 1' }));
  await userEvent.setup().click(screen.getByRole('option', { name: /^II\s*\. A closure$/ }));
  expect(mocks.recovery.get('one:reading:practice:section').responses.q1).toBe('II. A closure');
});

test('question notes open from a compact accessible button and retain their content after collapsing', async () => {
  practice();
  await screen.findByRole('textbox', { name: 'Answer 1' });
  const user = userEvent.setup();
  const toggle = screen.getByRole('button', { name: 'Evidence & paraphrase for question 1' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox', { name: 'Evidence for question 1' })).not.toBeInTheDocument();
  await user.click(toggle);
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 1' }), 'opened in 1990');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(within(toggle).getByLabelText('Notes added')).toBeInTheDocument();
  await user.click(toggle);
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toHaveValue('opened in 1990');
});

test('matching tasks keep shared choices beside answers without changing saved values', async () => {
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, type: 'matching', maxWords: undefined, groupId: 'matching', prompt: `${number} Film ${number}`, options: ['A historical period', 'B a modern setting'], answer: 'B a modern setting' }));
  practice();
  await screen.findByRole('combobox', { name: 'Answer 1' });
  const group = screen.getByRole('group', { name: 'Questions 1–2 · Matching' });
  expect(within(group).getByRole('list', { name: 'Answer choices' })).toHaveTextContent('B a modern setting');
  const user = userEvent.setup();
  await user.click(within(group).getByRole('combobox', { name: 'Answer 2' }));
  await user.click(screen.getByRole('option', { name: /B\s+a modern setting/ }));
  expect(mocks.recovery.get('one:reading:practice:section').responses.q2).toBe('B a modern setting');
});

test('different matching choices are not presented as a shared reference', async () => {
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, type: 'matching', groupId: 'matching', options: [`A choice ${number}`], answer: `A choice ${number}` }));
  practice();
  await screen.findByRole('combobox', { name: 'Answer 1' });
  expect(screen.queryByRole('list', { name: 'Answer choices' })).not.toBeInTheDocument();
});

test.each(['reading', 'listening'] as const)('%s question numbers appear once while original annotation offsets remain intact', async skill => {
  mocks.catalog.sections[0].skill = skill;
  mocks.catalog.questions = [{ ...catalog.questions[0], skill, type: 'matching', prompt: '1. a description of an early timekeeping invention affected by cold temperatures', options: ['A', 'B'], answer: 'B' }];
  if (skill === 'listening') mocks.catalog.assets = [{ id: 'audio', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'audio.mp3', provenance }];
  render(<MemoryRouter initialEntries={[`/${skill}/section`]}><Routes><Route path={`/${skill}/:sectionId`} element={<ExamPracticePage skill={skill} />} /></Routes></MemoryRouter>);
  await screen.findByRole('combobox', { name: 'Answer 1' });
  const block = document.querySelector<HTMLElement>('[data-source-block="question:q1"]')!;
  expect(block.textContent).toBe(mocks.catalog.questions[0].prompt);
  expect(within(block).getByText('1.')).not.toBeVisible();
  expect(screen.getByText('a description of an early timekeeping invention affected by cold temperatures')).toBeVisible();
});

test('review evidence opens and highlights the original passage without leaving answers or notes', async () => {
  mocks.catalog.questions[1].evidence = { text: 'opened in 1990' };
  savedReview(); practice('/reading/review/saved?planId=plan');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'All answers (2)' }));
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'my unsaved evidence');
  const card = screen.getByRole('heading', { name: 'The garden opened in 2000.' }).closest('article')!;
  await user.click(within(card).getByRole('button', { name: 'Locate evidence' }));
  const source = await screen.findByRole('region', { name: 'Source evidence for question 2' });
  expect(source.querySelector('mark')).toHaveTextContent('opened in 1990');
  expect(source).toHaveTextContent('The garden');
  expect(within(card).getByText('TRUE')).toBeVisible();
  expect(within(card).getByText('FALSE')).toBeVisible();
  expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/review/saved');
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  await user.click(within(source).getByRole('button', { name: 'Close evidence' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 2' })).toHaveValue('my unsaved evidence');
  expect(screen.getByRole('button', { name: 'All answers (2)' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(card).getByRole('button', { name: 'Locate evidence' })).toHaveFocus();
});

test.each(['reading', 'listening'] as const)('%s sessions never reveal answers before submission, including legacy checked drafts', async skill => {
  mocks.catalog.sections[0].skill = skill;
  mocks.catalog.questions.forEach((q: any) => { q.skill = skill; q.explanation = 'Hidden answer explanation'; q.evidence = { text: 'Hidden answer evidence' }; });
  if (skill === 'listening') mocks.catalog.assets = [{ id: 'audio', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'audio.mp3', provenance }];
  mocks.recovery.set(`one:${skill}:practice:section`, { id: 'old-draft', skill, sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'active', responses: { q1: '2000' }, checkedQuestionIds: ['q1'], answerRevealed: true, evidence: {}, keywords: {}, errorReasons: {}, updatedAt: '2026-10-15', startedAt: '2026-10-15', elapsedSeconds: 0 });
  render(<MemoryRouter initialEntries={[`/${skill}/section`]}><Routes><Route path={`/${skill}/:sectionId`} element={<ExamPracticePage skill={skill} />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('2000');
  expect(screen.queryByRole('button', { name: /Check answer/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Hidden answer explanation')).not.toBeInTheDocument();
  expect(screen.queryByText('Hidden answer evidence')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discard session' })).toBeEnabled();
});

test('map answers can open the source beside the current answer and return without losing it', async () => {
  mocks.catalog.assets = [{ id: 'map', paperId: 'paper', kind: 'image', storagePath: 'map.png', sourceUrl: 'https://example.org/map', provenance }];
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, type: 'map', maxWords: undefined, groupId: 'map', prompt: `Building ${number}`, options: ['A', 'B'], answer: 'B', stimulusHtml: '<p>Label the map.</p><img src="exam-asset:map" alt="Library map">' }));
  practice();
  const answer = await screen.findByRole('combobox', { name: 'Answer 2' });
  const user = userEvent.setup();
  await user.click(answer);
  await user.click(screen.getByRole('option', { name: /^B$/ }));
  await user.click(screen.getByRole('button', { name: 'View map for question 2' }));
  const dialog = screen.getByRole('dialog', { name: 'Map reference' });
  expect(within(dialog).getByRole('img', { name: 'Library map' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'View map for question 2' })).toHaveFocus());
  expect(answer).toHaveTextContent('B');
});

test('heading references adapt to the available panel width without undoing manual collapse on content changes', async () => {
  let resize!: (entries: { contentRect: { width: number } }[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(callback: typeof resize) { resize = callback; } observe() {} disconnect = disconnect; });
  try {
    const page = render(<div><HeadingReference question={{ ...catalog.questions[0], type: 'heading', options: ['I. A garden'] }} /></div>);
    const reference = page.container.querySelector('details')!;
    act(() => resize([{ contentRect: { width: 500 } }]));
    expect(reference.open).toBe(true);
    await userEvent.setup().click(screen.getByText('List of headings'));
    expect(reference.open).toBe(false);
    act(() => resize([{ contentRect: { width: 500 } }]));
    expect(reference.open).toBe(false);
    act(() => resize([{ contentRect: { width: 300 } }]));
    expect(reference.open).toBe(false);
    act(() => resize([{ contentRect: { width: 500 } }]));
    expect(reference.open).toBe(true);
    page.unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

test('question navigation focuses the custom heading answer control', async () => {
  mocks.catalog.questions = [{ ...catalog.questions[0], type: 'heading', options: ['I. A garden'], prompt: 'Paragraph A' }];
  practice();
  const answer = await screen.findByRole('combobox', { name: 'Answer 1' });
  await userEvent.setup().click(screen.getByRole('link', { name: 'Go to question 1 · unanswered' }));
  await waitFor(() => expect(answer).toHaveFocus());
});

test('saved annotations reveal the original text inside collapsed heading instructions', async () => {
  const quote = 'Choose the correct heading for each paragraph.';
  mocks.catalog.questions = [{ ...catalog.questions[0], type: 'heading', groupId: 'headings', options: ['I. A garden'], prompt: 'Paragraph A', stimulusHtml: `<p>${quote}</p>` }];
  mocks.fb.state.examAnnotations = [{ id: 'instruction-note', skill: 'reading', sourceId: 'section', color: 'yellow', quote, note: 'Original instructions', updatedAt: '2026-10-14', anchors: [{ blockId: 'stimulus:headings:0-0:0', quote, start: 0, end: quote.length, prefix: '', suffix: '', contentVersion: 'hash' }] }];
  practice();
  await screen.findByRole('combobox', { name: 'Answer 1' });
  const instruction = within(screen.getByRole('group', { name: 'Question 1 · Matching headings' })).getByText(quote);
  expect(instruction).not.toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Go to annotation' }));
  await waitFor(() => expect(instruction).toBeVisible());
});

test('exam autosave scopes its records and shows the server error with a working retry', async () => {
  mocks.fb.persistNow.mockImplementation(async (_draft: any, options: any) => { options?.onError?.('The account server took too long to save. Your changes are still here. Retry saving.'); return false; });
  practice();
  fireEvent.change(await screen.findByRole('textbox', { name: 'Answer 1' }), { target: { value: '1990' } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The account server took too long'), { timeout: 3500 });
  expect(mocks.fb.persistNow.mock.calls.at(-1)[1].collections).toEqual(['examAttempts', 'plans']);
  expect(screen.getAllByRole('button', { name: 'Retry save' })).toHaveLength(1);
  mocks.fb.persistNow.mockResolvedValue(true);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry save' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
});

test('pooled multiple-choice slots count separately and limit choices without losing deselection', async () => {
  mocks.catalog.questions = [{ ...catalog.questions[0], type: 'multiple', number: 25, points: 2, options: ['A. First', 'B. Second', 'C. Third'], answer: ['A. First', 'B. Second'] }];
  practice();
  const first = await screen.findByRole('checkbox', { name: 'A. First' });
  expect(screen.getByText('0 / 2 answered')).toBeInTheDocument();
  fireEvent.click(first);
  expect(screen.getByText('1 / 2 answered')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'B. Second' }));
  expect(screen.getByRole('checkbox', { name: 'C. Third' })).toBeDisabled();
  expect(screen.getByText('2 / 2 answered')).toBeInTheDocument();
  fireEvent.click(first);
  expect(screen.getByRole('checkbox', { name: 'C. Third' })).toBeEnabled();
});

test('older multiple-choice content without a slot limit still allows multiple selections', async () => {
  mocks.catalog.questions = [{ ...catalog.questions[0], type: 'multiple', options: ['A. First', 'B. Second', 'C. Third'], answer: ['A. First', 'B. Second'] }];
  practice();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'A. First' }));
  expect(screen.getByRole('checkbox', { name: 'B. Second' })).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'B. Second' }));
  expect(screen.getByRole('checkbox', { name: 'B. Second' })).toBeChecked();
});

test.each(['reading', 'listening'] as const)('%s pooled questions show a range and keep partial selections in submission checks', async skill => {
  mocks.catalog.sections[0].skill = skill;
  mocks.catalog.questions = [{ ...catalog.questions[0], skill, type: 'multiple', number: 25, points: 2, prompt: '25-26 On what points do they disagree?', maxWords: undefined, options: ['A. First', 'B. Second', 'C. Third'], answer: ['A. First', 'B. Second'] }];
  if (skill === 'listening') mocks.catalog.assets = [{ id: 'audio', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'audio.mp3', provenance }];
  render(<MemoryRouter initialEntries={[`/${skill}/section`]}><Routes><Route path={`/${skill}/:sectionId`} element={<ExamPracticePage skill={skill} />} /></Routes></MemoryRouter>);
  const first = await screen.findByRole('checkbox', { name: 'A. First' });
  expect(screen.getByRole('link', { name: 'Go to questions 25–26 · unanswered' })).toHaveTextContent('25–26');
  const card = screen.getByRole('article', { name: 'Questions 25–26 details' });
  expect(within(card).getByText('25–26')).toBeVisible();
  const prompt = card.querySelector('[data-source-block="question:q1"]')!;
  expect(prompt.textContent).toBe('25-26 On what points do they disagree?');
  expect(within(prompt as HTMLElement).getByText('25-26')).not.toBeVisible();
  expect(within(card).getByText('Choose 2 options')).toBeVisible();
  fireEvent.click(first);
  expect(screen.getByRole('link', { name: 'Go to questions 25–26 · 1 of 2 answered' })).toHaveClass('partial');
  expect(within(card).getByText('1 / 2 selected')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Submit answers' }));
  const confirm = screen.getByRole('dialog', { name: 'Submit with unanswered questions?' });
  expect(confirm).toHaveTextContent('1 answer still missing');
  expect(confirm).toHaveTextContent('25–26 (1 more selection needed)');
  await userEvent.setup().click(within(confirm).getByRole('button', { name: 'Return to unanswered' }));
  expect(first).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'B. Second' }));
  expect(screen.getByRole('link', { name: 'Go to questions 25–26 · answered' })).toHaveClass('answered');
  expect(within(card).getByText('2 / 2 selected · Deselect an option to change your choices.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Next unanswered' })).not.toBeInTheDocument();
});

test('pooled question ranges stay consistent in results, evidence, and original text', async () => {
  mocks.catalog.questions = [{ ...catalog.questions[0], type: 'multiple', number: 25, points: 2, prompt: '25-26 On what points do they disagree?', options: ['A', 'B', 'C'], answer: ['A', 'B'], evidence: { text: 'opened in 1990' } }];
  savedReview();
  const page = practice('/reading/review/saved');
  expect(await screen.findByRole('heading', { name: 'On what points do they disagree?' })).toBeVisible();
  expect(screen.getByText('25–26')).toBeVisible();
  expect(screen.getByRole('button', { name: 'All answer groups (1)' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Locate evidence' }));
  expect(screen.getByRole('region', { name: 'Source evidence for questions 25–26' }).querySelector('mark')).toHaveTextContent('opened in 1990');
  page.unmount();
  render(<MemoryRouter initialEntries={['/reading/source/section?question=q1']}><Routes><Route path="/reading/source/:sectionId" element={<ExamSourcePage skill="reading" />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('Questions 25–26 · Original question')).toBeVisible();
  expect(screen.getByText('25–26')).toBeVisible();
});

test('submitted mock results provide exact Part vocabulary and reading evidence backlinks', async () => {
  const question = { ...catalog.questions[0], explanation: 'The opening year is stated in paragraph A.', sourceExplanation: 'Original explanation.', evidence: { paragraphId: 'A', text: 'opened in 1990' } };
  mocks.fb.state.examAttempts = [{ id: 'submitted', skill: 'reading', mode: 'mock', status: 'completed', sourceId: 'paper', sectionIds: ['section'], questionSnapshot: [question], responses: { q1: '1990' }, results: { q1: true }, evidence: {}, keywords: {}, errorReasons: {}, updatedAt: '2026-10-14', startedAt: '2026-10-14' }];
  render(<MemoryRouter initialEntries={['/reading/review/submitted']}><Routes><Route path='/reading/review/:attemptId' element={<ExamReviewPage skill='reading' />} /></Routes></MemoryRouter>);
  await screen.findByRole('region', { name: 'Part vocabulary' });
  expect(screen.getByRole('button', { name: /Saved/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Locate evidence' })).toBeEnabled();
  expect(screen.getByText('Original source explanation')).toBeInTheDocument();
  expect(screen.getByText('The opening year is stated in paragraph A.')).toBeInTheDocument();
});

test('direct result links do not expose an unsubmitted mock answer or vocabulary helper', async () => {
  mocks.fb.state.examAttempts = [{ id: 'active', skill: 'reading', mode: 'mock', status: 'active', sourceId: 'paper', sectionIds: ['section'], questionSnapshot: [catalog.questions[0]], responses: {}, evidence: {}, keywords: {}, errorReasons: {}, updatedAt: '2026-10-14', startedAt: '2026-10-14' }];
  render(<MemoryRouter initialEntries={['/reading/review/active']}><Routes><Route path='/reading/review/:attemptId' element={<ExamReviewPage skill='reading' />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('Submit this attempt to view its results.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Part vocabulary' })).not.toBeInTheDocument();
  expect(screen.queryByText('1990')).not.toBeInTheDocument();
});

test('a short planned section submits only its bound questions and records the plan identity', async () => {
  mocks.fb.state.plans = [{id:'short-reading',status:'in_progress',target:{type:'section',skill:'reading',sectionId:'section',mode:'practice',questionIds:['q1']}}];
  practice('/reading/section?planId=short-reading&questions=%5B%22q2%22%5D');
  const answer = await screen.findByRole('textbox',{name:'Answer 1'});
  expect(screen.queryByText('The garden opened in 2000.')).not.toBeInTheDocument();
  fireEvent.change(answer,{target:{value:'1990'}});
  await userEvent.setup().click(screen.getByRole('button',{name:'Submit answers'}));
  await waitFor(()=>expect(mocks.fb.stateRef.current.examAttempts[0]?.status).toBe('completed'));
  expect(mocks.fb.stateRef.current.examAttempts[0]).toMatchObject({planId:'short-reading',total:1,questionSnapshot:[{id:'q1'}]});
});

test('a planned subset cannot reuse answers or steal recovery from manual or other-plan practice',async()=>{
  const manual=practice();
  fireEvent.change(await screen.findByRole('textbox',{name:'Answer 1'}),{target:{value:'1990'}});
  manual.unmount();
  const original=structuredClone(mocks.recovery.get('one:reading:practice:section'));
  mocks.fb.state.examAttempts=[original];
  mocks.fb.state.plans=[{id:'new-plan',status:'in_progress',target:{type:'section',skill:'reading',sectionId:'section',mode:'practice',questionIds:['q1']}}];
  const planned=practice('/reading/section?planId=new-plan');
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox',{name:'Answer 1'}),{target:{value:'new answer'}});
  planned.unmount();
  expect(mocks.recovery.get('one:reading:practice:section')).toEqual(original);
  mocks.fb.state.plans.push({id:'second-plan',status:'in_progress',target:{type:'section',skill:'reading',sectionId:'section',mode:'practice',questionIds:['q1']}});
  const second=practice('/reading/section?planId=second-plan');
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toHaveValue('');
  second.unmount();practice('/reading/section?planId=new-plan');
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toHaveValue('new answer');
});

test('an explicit resume keeps its saved plan scope even without a plan query',async()=>{
  const planned=practice('/reading/section?planId=saved-plan');
  mocks.fb.state.plans=[{id:'saved-plan',status:'in_progress',target:{type:'section',skill:'reading',sectionId:'section',questionIds:['q1']}}];
  planned.unmount();
  const timestamp=new Date().toISOString();
  mocks.fb.state.examAttempts=[{id:'saved',skill:'reading',mode:'practice',sourceId:'section',planId:'saved-plan',status:'paused',sectionIds:['section'],questionSnapshot:[catalog.questions[0]],questionTypes:{q1:'gap'},responses:{q1:'1990'},evidence:{},keywords:{},errorReasons:{},startedAt:timestamp,updatedAt:timestamp,elapsedSeconds:0}];
  practice('/reading/section?attempt=saved');
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toHaveValue('1990');
  expect(screen.queryByText('The garden opened in 2000.')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button',{name:'Resume'}));
  await userEvent.setup().click(screen.getByRole('button',{name:'Submit answers'}));
  await waitFor(()=>expect(mocks.fb.stateRef.current.examAttempts[0]?.status).toBe('completed'));
  expect(mocks.fb.stateRef.current.examAttempts[0]).toMatchObject({id:'saved',planId:'saved-plan',total:1,questionSnapshot:[{id:'q1'}]});
});

test('a slow bank reload ignores the stale request and retains a real retry after failure', async () => {
  vi.useFakeTimers();
  let finishOld!: (value: ExamCatalog) => void;
  vi.mocked(loadExamCatalog)
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockRejectedValueOnce(new Error('The source connection was interrupted.'));
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading questions…');
  expect(screen.queryByRole('button', { name: 'Retry loading' })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10_000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry loading' })));
  expect(screen.getByRole('alert')).toHaveTextContent('The source connection was interrupted.');
  expect(screen.queryByText('Loading questions…')).not.toBeInTheDocument();
  await act(async () => finishOld(catalog));
  expect(screen.getByRole('alert')).toHaveTextContent('The source connection was interrupted.');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry loading' })));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('The city garden')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 test · 1 passage');
});

test('bank presents available sections but disables an incomplete full mock', async () => { render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>); expect(await screen.findByText('The city garden')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Full mock unavailable' })).toBeDisabled(); expect(screen.getByRole('link', { name: /Practise passage 1/ })).toHaveAttribute('href', '/reading/section'); });
test('a catalog refresh failure preserves cached sections and offers a working retry', async () => {
  await cachedRead(examCatalogKey('reading'), async () => catalog);
  vi.mocked(loadExamCatalog).mockRejectedValueOnce(new Error('Source refresh failed.'));
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Source refresh failed.');
  expect(screen.getByRole('link', { name: /Practise passage 1/ })).toHaveAttribute('href', '/reading/section');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('The city garden')).toBeInTheDocument();
});
test('recent work prioritises unfinished attempts and retains source and retry navigation', async () => {
  mocks.fb.state.examAttempts = [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `done${index}`, skill: 'reading', sectionIds: ['section'], mode: 'practice', status: 'completed', score: 2, total: 2, updatedAt: `2026-10-0${index + 2}` })),
    { id: 'paused', skill: 'reading', sectionIds: ['section'], mode: 'practice', status: 'paused', updatedAt: '2026-01-01', retryOfAttemptId: 'old retry' },
  ];
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Cambridge 8 Test 1' });
  const recent = within(screen.getByRole('complementary', { name: 'Your recent work' }));
  const links = recent.getAllByRole('link');
  expect(links).toHaveLength(4);
  expect(links[0]).toHaveTextContent('Cambridge 8 / Test 1');
  expect(links[0]).toHaveTextContent('The city garden');
  expect(links[0]).toHaveTextContent('Paused');
  expect(new URL(links[0].getAttribute('href')!, 'https://example.org').searchParams.get('retry')).toBe('old retry');
  expect(links[1]).toHaveAttribute('href', '/reading/review/done3');
  expect(screen.getByRole('link', { name: 'Review mistakes' })).toHaveAttribute('href', '/reading/review');
});
test('listening intensive bank mode opens the sentence workbench directly', async () => { mocks.catalog.sections[0].skill = 'listening'; render(<MemoryRouter initialEntries={['/listening?mode=intensive']}><ExamBankPage skill="listening" /></MemoryRouter>); expect(await screen.findByRole('link', { name: 'Open intensive part 1' })).toHaveAttribute('href', '/listening/intensive/section'); expect(screen.getByRole('link', { name: /Practise part 1/ })).toHaveAttribute('href', '/listening/section'); });
test('practice submission stays on the page on save failure and retries the same attempt', async () => { mocks.fb.persistNow.mockResolvedValueOnce(false); practice(); const user = userEvent.setup(); await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990'); await user.click(screen.getByRole('radio', { name: 'FALSE' })); await user.click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByRole('alert')).toHaveTextContent('Could not save'); expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/section'); const firstId = mocks.fb.persistNow.mock.calls[0][0].examAttempts[0].id; await user.click(screen.getByRole('button', { name: 'Retry submission' })); await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/review/')); expect(mocks.fb.persistNow.mock.calls[1][0].examAttempts[0].id).toBe(firstId); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('2 / 2'); });
test('practice recovers answers after leaving without carrying them into another account', async () => { const view = practice(); const user = userEvent.setup(); await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990'); view.unmount(); const resumed = practice(); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990'); resumed.unmount(); mocks.owner = 'two'; practice(); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue(''); });
test('mock begins explicitly and never exposes method hints or per-question checks', async () => { mocks.catalog.sections = [1, 2, 3].map(part => ({ ...catalog.sections[0], id: part === 1 ? 'section' : `section${part}`, part })); mocks.catalog.questions = [1, 2, 3].flatMap(part => catalog.questions.map(question => ({ ...question, id: `${question.id}-${part}`, sectionId: part === 1 ? 'section' : `section${part}` }))); mocks.catalog.passages = mocks.catalog.sections.map((section: any) => ({ ...catalog.passages[0], id: `p-${section.id}`, sectionId: section.id })); mocks.catalog.sections.forEach((section: any) => section.questionCount = 2); practice('/reading/mock/paper'); expect(await screen.findByRole('button', { name: 'Start mock' })).toBeInTheDocument(); expect(screen.queryByText('Locate · prove · paraphrase')).not.toBeInTheDocument(); await userEvent.setup().click(screen.getByRole('button', { name: 'Start mock' })); expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Check answer 1' })).not.toBeInTheDocument(); });
test('wrong-only retry starts with blank answers and evidence and grades only the retry questions', async () => { mocks.fb.state.examAttempts = [{ id: 'previous', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990', q2: 'TRUE' }, results: { q1: true, q2: false }, evidence: { q2: 'Old proof' }, keywords: {}, errorReasons: {}, score: 1, total: 2, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }]; practice('/reading/section?retry=previous'); await screen.findByRole('radio', { name: 'FALSE' }); expect(screen.queryByRole('textbox', { name: 'Answer 1' })).not.toBeInTheDocument(); await userEvent.setup().click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 2' })); expect(screen.getByRole('textbox', { name: 'Evidence for question 2' })).toHaveValue(''); await userEvent.setup().click(screen.getByRole('radio', { name: 'FALSE' })); await userEvent.setup().click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByRole('alert')).toHaveTextContent('Add fresh passage evidence for question 2'); expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/section'); expect(screen.getByRole('radio', { name: 'FALSE' })).toBeChecked(); await userEvent.setup().type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'The garden opened in 1990.'); await userEvent.setup().click(screen.getByRole('button', { name: 'Submit answers' })); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('1 / 1'); });
test('review preserves the submitted question snapshot when the live source changes', async () => { mocks.fb.state.examAttempts = [{ id: 'saved', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990' }, results: { q1: true }, questionSnapshot: [catalog.questions[0]], evidence: {}, keywords: {}, errorReasons: {}, score: 1, total: 1, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }]; mocks.catalog.questions[0].answer = '2000'; practice('/reading/review/saved'); expect(await screen.findByRole('heading', { name: 'The garden opened in _____.' })).toBeInTheDocument(); expect(screen.queryByText('2000')).not.toBeInTheDocument(); expect(screen.getAllByText('1990')).toHaveLength(2); });
test('source stimulus keeps tables and numbered gaps while stripping active HTML', () => { const { container } = render(<ExamStimulus html={'<table><tr><td colspan="2" onclick="alert(1)">Opened #####-1-#####<br>Source note</td></tr></table><script>steal()</script><iframe src="https://example.org"></iframe><p><a href="javascript:alert(1)">Safe text</a></p>'} />); expect(screen.getByRole('cell')).toHaveTextContent('Opened 〔1〕'); expect(screen.getByRole('cell')).toHaveAttribute('colspan', '2'); expect(container.querySelector('script,iframe,a,[onclick]')).toBeNull(); expect(screen.getByText('Safe text')).toBeInTheDocument(); expect(container.querySelector('br')).not.toBeNull(); });
test('integrated source gaps render controlled answers in the original table', () => {
  render(<ExamStimulus html={'<table><tr><td>Opened #####-1-#####</td><td>Unknown #####-99-#####</td></tr></table>'} renderGap={number => number === 1 ? <input aria-label="Answer 1" defaultValue="1990" /> : null} />);
  expect(within(screen.getAllByRole('cell')[0]).getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(screen.getAllByRole('cell')[1]).toHaveTextContent('〔99〕');
});
test('imported numbered blanks stay in the source while shared instructions and scaffold prompts are not repeated', async () => {
  const instructions = 'Complete the notes below. Write ONE WORD ONLY for each answer.';
  mocks.catalog.questions = [1, 2].map(number => ({ ...catalog.questions[0], id: `q${number}`, number, groupId: 'notes', instructions, prompt: `Question ${number} · Complete the marked gap in the text above.`, stimulusHtml: '<p>Complete the notes below.</p><p>Write <strong>ONE WORD ONLY</strong> for each answer.</p><table><tr><td>Opened [1 ____]</td><td>Closed [2 ____]</td></tr></table>' }));
  const view = practice(); const user = userEvent.setup();
  const answer = await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(within(screen.getAllByRole('cell')[0]).getByRole('textbox', { name: 'Answer 1' })).toBe(answer);
  expect(screen.queryByText(/Complete the marked gap/)).not.toBeInTheDocument();
  expect(screen.getAllByText('Complete the notes below.')).toHaveLength(1);
  expect(screen.getAllByText('Maximum 1 word')).toHaveLength(1);
  expect(view.container.querySelectorAll('.exam-question')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Check answer 1' })).not.toBeInTheDocument();
  await user.type(answer, '1990');
  expect(screen.queryByRole('button', { name: 'Check answer 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Go to question 2 · unanswered' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Answer 2' })).toHaveFocus());
  expect(screen.queryByRole('article', { name: 'Question 1 details' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  await user.click(screen.getByRole('button', { name: 'Split view' }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(view.container.querySelectorAll('.exam-question-material')).toHaveLength(0);
  expect(screen.getAllByText('Complete the notes below.')).toHaveLength(1);
  expect(screen.getAllByText('Maximum 1 word')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 2' }));
  await user.type(screen.getByRole('textbox', { name: 'Evidence for question 2' }), 'Fresh proof');
  expect(mocks.recovery.get('one:reading:practice:section').evidence).toMatchObject({ q2: 'Fresh proof' });
});

test.each(['reading', 'listening'] as const)('%s inline gaps expose independent notes without a detached current-question card', async skill => {
  mocks.catalog.sections[0].skill = skill;
  mocks.catalog.sections[0].questionCount = 10;
  const stimulusHtml = '<table><tr><td>Application notes</td></tr><tr><td>' + Array.from({ length: 10 }, (_, i) => `<p>Detail ${i + 1}: [${i + 1} ____]</p>`).join('') + '</td></tr></table>';
  mocks.catalog.questions = Array.from({ length: 10 }, (_, i) => ({ ...catalog.questions[0], skill, id: `q${i + 1}`, number: i + 1, type: 'gap', groupId: 'form', prompt: `Question ${i + 1} · Complete the marked gap in the text above.`, stimulusHtml }));
  if (skill === 'listening') mocks.catalog.assets = [{ id: 'audio', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'audio.mp3', provenance }];
  const page = render(<MemoryRouter initialEntries={[`/${skill}/section`]}><Routes><Route path={`/${skill}/:sectionId`} element={<ExamPracticePage skill={skill} />} /></Routes></MemoryRouter>);
  const answer1 = await screen.findByRole('textbox', { name: 'Answer 1' });
  const user = userEvent.setup();
  expect(page.container.querySelectorAll('.exam-stimulus')).toHaveLength(1);
  expect(page.container.querySelectorAll('.exam-question')).toHaveLength(0);
  expect(screen.getAllByRole('button', { name: /^Evidence & paraphrase for question \d+$/ })).toHaveLength(10);
  for (const number of [1, 5, 10]) expect(within(screen.getByRole('textbox', { name: `Answer ${number}` }).closest('.exam-inline-answer') as HTMLElement).getByRole('button', { name: `Evidence & paraphrase for question ${number}` })).toHaveAttribute('aria-expanded', 'false');
  await user.type(answer1, 'first');
  await user.click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 10' }));
  const evidence = screen.getByRole('textbox', { name: 'Evidence for question 10' });
  fireEvent.change(evidence, { target: { value: 'The last source detail' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Keywords & synonyms for question 10' }), { target: { value: 'plan → presentation' } });
  expect(screen.getByRole('combobox', { name: 'Question for notes' })).toHaveTextContent('Question 10');
  await user.click(screen.getByRole('combobox', { name: 'Question for notes' }));
  await user.click(screen.getByRole('option', { name: 'Question 1' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox', { name: 'Evidence for question 1' }), { target: { value: 'The first source detail' } });
  await user.click(screen.getByRole('button', { name: 'Return to answer 1' }));
  await waitFor(() => expect(answer1).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 10' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 10' })).toHaveValue('The last source detail');
  expect(screen.getByRole('textbox', { name: 'Keywords & synonyms for question 10' })).toHaveValue('plan → presentation');
  const saved = mocks.recovery.get(`one:${skill}:practice:section`);
  expect(saved.evidence).toMatchObject({ q1: 'The first source detail', q10: 'The last source detail' });
  expect(saved.responses.q1).toBe('first');
  await user.click(screen.getByRole('button', { name: 'Close question notes' }));
  expect(screen.queryByRole('textbox', { name: 'Evidence for question 10' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Evidence & paraphrase for question 10' })).toHaveFocus());
  expect(within(screen.getByRole('button', { name: 'Evidence & paraphrase for question 10' })).getByLabelText('Notes added')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Split view' }));
  await user.click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 10' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 10' })).toHaveValue('The last source detail');
});

test('source simplification preserves real stems, missing-gap scaffolds, diagrams and differing limits', async () => {
  mocks.catalog.questions = [
    { ...catalog.questions[0], groupId: 'notes', instructions: 'Answer the questions.', stimulusHtml: '<p>Opened [1 ____]</p>', assetId: 'diagram' },
    { ...catalog.questions[0], id: 'q2', number: 2, groupId: 'notes', instructions: 'Answer the questions.', stimulusHtml: '<p>Opened [1 ____]</p>', prompt: 'Question 2 · Complete the marked gap in the text above.', maxWords: 2 },
  ];
  mocks.catalog.assets = [{ id: 'diagram', paperId: 'paper', kind: 'image', storagePath: 'diagram', sourceUrl: '', provenance }];
  practice(); await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(screen.getByText('The garden opened in _____.')).toBeInTheDocument();
  expect(screen.getByText('Complete the marked gap in the text above.')).toBeVisible();
  expect(document.querySelector('[data-source-block="question:q2"]')).toHaveTextContent('Question 2 · Complete the marked gap in the text above.');
  expect(screen.getAllByText('Answer the questions.')).toHaveLength(1);
  expect(await screen.findByRole('img', { name: 'Question 1 diagram' })).toBeInTheDocument();
  expect(screen.getByText('Maximum 1 word')).toBeInTheDocument();
  expect(screen.getByText('Maximum 2 words')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer 1' }), { target: { value: 'too many' } });
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('word limit exceeded');
});
test('layout switching preserves the attempt and responses while showing real question material', async () => {
  practice();
  fireEvent.change(await screen.findByRole('textbox', { name: 'Answer 1' }), { target: { value: '1990' } });
  const workspace = screen.getByRole('region', { name: 'Questions and answers' });
  const layout = within(workspace).getByRole('group', { name: 'Question layout' });
  expect(within(layout).getByRole('button', { name: 'Integrated view' })).toHaveTextContent('With questions');
  expect(within(layout).getByRole('button', { name: 'Split view' })).toHaveTextContent('Separate panel');
  expect(within(layout).getByRole('button', { name: 'Integrated view' })).toHaveAttribute('aria-pressed', 'true');
  const original = mocks.recovery.get('one:reading:practice:section').id;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Split view' }));
  expect(within(layout).getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(mocks.recovery.get('one:reading:practice:section').id).toBe(original);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Integrated view' }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(mocks.recovery.get('one:reading:practice:section').id).toBe(original);
});

test('a source diagram embedded in group material is displayed once in either layout', async () => {
  mocks.catalog.questions[0].stimulusHtml = '<p><img src="exam-asset:diagram" alt="Garden plan"></p>';
  mocks.catalog.assets = [{ id: 'diagram', sectionId: 'section', paperId: 'paper', kind: 'image', storagePath: 'diagram', sourceUrl: '', provenance }];
  practice(); await screen.findByRole('img', { name: 'Garden plan' });
  expect(screen.getAllByRole('img')).toHaveLength(1);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Split view' }));
  await screen.findByRole('img', { name: 'Garden plan' });
  expect(screen.getAllByRole('img')).toHaveLength(1);
});

test('selecting an embedded answer keeps other real stems and unique word limits available', async () => {
  mocks.catalog.questions = [
    { ...catalog.questions[0], groupId: 'notes', stimulusHtml: '<p>Opened [1 ____], closed [2 ____]</p>' },
    { ...catalog.questions[0], id: 'q2', number: 2, groupId: 'notes', prompt: 'Question 2 · Complete the marked gap in the text above.', maxWords: 2, stimulusHtml: '<p>Opened [1 ____], closed [2 ____]</p>' },
  ];
  practice(); await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(screen.getByText('Maximum 2 words')).not.toHaveClass('sr-only');
  const user = userEvent.setup(); const answer = screen.getByRole('textbox', { name: 'Answer 2' });
  await user.click(answer);
  expect(screen.getByText('The garden opened in _____.')).toBeInTheDocument();
  expect(screen.getByText('Maximum 2 words')).not.toHaveClass('sr-only');
  await user.type(answer, 'more than two');
  expect(answer).toHaveAttribute('aria-invalid', 'true');
  expect(within(answer.closest('.exam-inline-answer') as HTMLElement).getByRole('alert')).toHaveTextContent('Question 2 · word limit exceeded');
});

test('an annotation on an old bracket blank remains viewable when the blank becomes an input', async () => {
  mocks.catalog.questions = [{ ...catalog.questions[0], groupId: 'notes', stimulusHtml: '<p>[1 ____]</p>', prompt: 'Question 1 · Complete the marked gap in the text above.' }];
  mocks.fb.state.examAnnotations = [{ id: 'legacy-note', skill: 'reading', sourceId: 'section', color: 'yellow', quote: '[1 ____]', note: 'Remember this clue', updatedAt: '2026-10-14', anchors: [{ blockId: 'stimulus:notes:0-0:0', quote: '[1 ____]', start: 0, end: 8, prefix: '', suffix: '', contentVersion: 'hash' }] }];
  practice(); await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(screen.getByText('Highlights & notes (1)')).toBeInTheDocument();
  expect(screen.getByText('Remember this clue')).toBeInTheDocument();
  expect(screen.getByText('Original position unavailable')).toBeInTheDocument();
});

test('source backlinks open passage material without creating or changing an attempt', async () => {
  render(<MemoryRouter initialEntries={['/reading/source/section?paragraph=A&quote=garden']}><Routes><Route path="/reading/source/:sectionId" element={<ExamSourcePage skill="reading" />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('The garden opened in 1990.')).toBeInTheDocument();
  expect(mocks.fb.stateRef.current.examAttempts).toEqual([]);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  expect(screen.getByText('The garden opened in 1990.')).toHaveFocus();
});
test('stimulus images render only imported assets through resolved source URLs', async () => { const asset = { id: 'diagram', paperId: 'paper', kind: 'image' as const, storagePath: 'diagram', sourceUrl: 'https://example.org/diagram.jpg', provenance }; render(<ExamStimulus assets={[asset]} html={'<img src="exam-asset:diagram" alt="Library map" onerror="alert(1)"><img src="https://untrusted.example/track.jpg" alt="Untrusted">'} />); expect(await screen.findByRole('img', { name: 'Library map' })).toHaveAttribute('src', '/audio.mp3'); expect(screen.queryByRole('img', { name: 'Untrusted' })).not.toBeInTheDocument(); });
test('a recovered mock uses its original deadline and submits after time expires', async () => { mocks.catalog.sections = [1, 2, 3].map(part => ({ ...catalog.sections[0], id: part === 1 ? 'section' : `section${part}`, part })); mocks.catalog.questions = mocks.catalog.sections.flatMap((section: any, index: number) => catalog.questions.map(question => ({ ...question, id: `${question.id}-${index}`, sectionId: section.id }))); mocks.catalog.passages = mocks.catalog.sections.map((section: any) => ({ ...catalog.passages[0], id: `p-${section.id}`, sectionId: section.id })); const timestamp = new Date(Date.now() - 3_700_000).toISOString(); mocks.recovery.set('one:reading:mock:paper', { id: 'expired', skill: 'reading', sourceId: 'paper', mode: 'mock', status: 'active', sectionIds: ['section', 'section2', 'section3'], responses: {}, evidence: {}, keywords: {}, errorReasons: {}, elapsedSeconds: 0, timeLimitSeconds: 3600, hintsEnabled: false, startedAt: timestamp, updatedAt: timestamp }); practice('/reading/mock/paper'); await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/review/expired')); expect(await screen.findByLabelText('Attempt score')).toHaveTextContent('0 / 6'); });
test('reading selection opens vocabulary capture with passage context and keeps technical paragraph IDs hidden', async () => {
  mocks.fb.setVocabularySeed = vi.fn(); mocks.fb.setEditingVocabularyId = vi.fn(); mocks.fb.openModal = vi.fn();
  mocks.catalog.passages[0].title = 'A garden in the city'; mocks.catalog.passages[0].paragraphs[0].id = 'paragraph:1330:0';
  practice(); await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(screen.getByRole('heading', { name: 'A garden in the city' })).toBeInTheDocument();
  expect(screen.queryByText('paragraph:1330:0')).not.toBeInTheDocument();
  const block = screen.getByText('The garden opened in 1990.');
  const range = document.createRange(); range.setStart(block.firstChild!, 4); range.setEnd(block.firstChild!, 10);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(block);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(mocks.fb.setVocabularySeed).toHaveBeenCalledWith(expect.objectContaining({ term: 'garden', skill: 'reading', sourceId: 'section', context: 'The garden opened in 1990.' }));
  expect(mocks.fb.openModal).toHaveBeenCalledWith('vocabulary'); selection.removeAllRanges();
});

test('practice captures each selected paragraph with its own exact quote, offsets and context', async () => {
  mocks.catalog.passages[0].paragraphs = [{ id: 'A', text: 'The garden opened.' }, { id: 'B', text: 'Then it closed.' }];
  mocks.fb.setVocabularySeed = vi.fn(); mocks.fb.setEditingVocabularyId = vi.fn(); mocks.fb.openModal = vi.fn();
  practice();
  const first = await screen.findByText('The garden opened.'); const second = screen.getByText('Then it closed.');
  const range = document.createRange(); range.setStart(first.firstChild!, 4); range.setEnd(second.firstChild!, 7);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(second); fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  const seed = mocks.fb.setVocabularySeed.mock.calls[0][0];
  expect(seed.term).toBe('garden opened. Then it');
  expect(seed.sources).toMatchObject([{ context: 'The garden opened.', exam: { blockId: 'passage:passage:A', paragraphId: 'A', quote: 'garden opened.', start: 4, end: 18 } }, { context: 'Then it closed.', exam: { blockId: 'passage:passage:B', paragraphId: 'B', quote: 'Then it', start: 0, end: 7 } }]);
  selection.removeAllRanges();
});


test('bank sorts papers by numeric book and test', async () => { mocks.catalog.papers = [[11, 4], [8, 2], [8, 1], [10, 1]].map(([book, test]) => ({ ...catalog.papers[0], id: `paper-${book}-${test}`, book, test, title: `Cambridge ${book} Test ${test}` })); mocks.catalog.sections = mocks.catalog.papers.map((paper: any) => ({ ...catalog.sections[0], id: `section-${paper.id}`, paperId: paper.id })); render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>); await screen.findByRole('heading', { name: 'Cambridge 8 Test 1' }); expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Cambridge 8 Test 1', 'Cambridge 8 Test 2', 'Cambridge 10 Test 1', 'Cambridge 11 Test 4']); });

test('bank search matches book and test even when the passage title differs', async () => {
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  await screen.findByText('The city garden');
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search reading sections' }), 'Cambridge 8 Test 1');
  expect(screen.getByText('The city garden')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 test · 1 passage');
});

test('clearing listening bank filters returns the canonical questions bank', async () => {
  mocks.catalog.sections[0].skill = 'listening';
  render(<MemoryRouter initialEntries={['/listening?mode=intensive&q=missing']}><ExamBankPage skill="listening" /><SearchLocation /></MemoryRouter>);
  await screen.findByText('No sections match these filters.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByLabelText('Search URL')).toHaveTextContent(/^$/);
  expect(await screen.findByRole('link', { name: 'Open intensive part 1' })).toBeInTheDocument();
});

test('legacy intensive query is removed while all remaining filters and paging survive', async () => {
  mocks.catalog.sections[0].skill = 'listening';
  render(<MemoryRouter initialEntries={['/listening?mode=intensive&book=8&part=1&q=city&page=2']}><ExamBankPage skill="listening" /><SearchLocation /></MemoryRouter>);
  await screen.findByRole('link', { name: 'Open intensive part 1' });
  expect(screen.getByLabelText('Search URL')).toHaveTextContent('?book=8&part=1&q=city&page=2');
  expect(screen.queryByRole('link', { name: 'Intensive listening bank' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Practise part 1/ })).toHaveAttribute('href', '/listening/section');
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
  expect(screen.getByRole('dialog')).toHaveTextContent('1 answer still missing');
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
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('0 / 2 answered');
  expect(screen.getByRole('link', { name: 'Go to question 1 · unanswered' })).not.toHaveClass('answered');
  expect(screen.getByRole('link', { name: 'Go to question 2 · unanswered' })).not.toHaveClass('answered');
  expect(screen.queryByRole('button', { name: 'Check answer 1' })).not.toBeInTheDocument();
});

test('pause disables evidence editing and capture until resumed', async () => {
  practice(); const user = userEvent.setup(); await screen.findByRole('textbox', { name: 'Answer 1' });
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  await user.click(screen.getByRole('button', { name: 'Evidence & paraphrase for question 1' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Keywords & synonyms for question 1' })).toBeDisabled();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  expect(screen.getByRole('combobox', { name: 'Question for selected evidence' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Resume' }));
  expect(screen.getByRole('textbox', { name: 'Evidence for question 1' })).toBeEnabled();
});

function savedReview() {
  mocks.fb.state.examAttempts = [{ id: 'saved', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed', responses: { q1: '1990', q2: 'TRUE' }, results: { q1: true, q2: false }, questionSnapshot: structuredClone(mocks.catalog.questions), evidence: {}, keywords: {}, errorReasons: {}, score: 1, total: 2, startedAt: '2026-01-01', updatedAt: '2026-01-01', elapsedSeconds: 0, hintsEnabled: true }];
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

test('listening recording and position survive layout and mobile panel changes', async () => {
  mocks.catalog.sections[0].skill = 'listening'; mocks.catalog.sections[0].assetId = 'recording';
  mocks.catalog.questions.forEach((question: any) => question.skill = 'listening');
  mocks.catalog.assets = [{ id: 'recording', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'recording.mp3', sourceUrl: '', duration: 100, provenance }];
  const { container } = render(<MemoryRouter initialEntries={['/listening/section']}><Routes><Route path="/listening/:sectionId" element={<ExamPracticePage skill="listening" />} /></Routes></MemoryRouter>);
  const user = userEvent.setup(); await screen.findByRole('textbox', { name: 'Answer 1' });
  const audio = container.querySelector('audio')!;
  await waitFor(() => expect(audio).toHaveAttribute('src', '/audio.mp3'));
  expect(audio.closest('.exam-source-panel')).toBeNull();
  audio.currentTime = 23;
  fireEvent.timeUpdate(audio);
  expect(screen.queryByRole('group', { name: 'Practice panels' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Split view' }));
  await user.click(screen.getByRole('button', { name: 'Answers' }));
  expect(screen.getByRole('button', { name: 'Answers' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Source notes' })).not.toBeInTheDocument();
  expect(container.querySelector('audio')).toBe(audio);
  expect(audio.currentTime).toBe(23);
  await user.click(screen.getByRole('button', { name: 'Integrated view' }));
  expect(container.querySelector('audio')).toBe(audio);
  expect(screen.queryByRole('group', { name: 'Practice panels' })).not.toBeInTheDocument();
  expect(audio.currentTime).toBe(23);
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

test('leaving ordinary practice pauses it and retains responses for resume', async () => {
  const user = userEvent.setup();
  const view = practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990');
  view.unmount();
  practice();
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(screen.getByRole('button', { name: /^Resume$/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Resume$/ }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toBeEnabled();
});

test('new sessions for the same passage keep independent recoveries and resume the requested snapshot', async () => {
  const user = userEvent.setup(); const view = practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), 'first answer');
  const first = structuredClone(mocks.recovery.get('one:reading:practice:section'));
  await user.click(screen.getByRole('button', { name: 'New session' }));
  await user.click(screen.getByRole('button', { name: 'Start new session' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue(''));
  const second = mocks.recovery.get('one:reading:practice:section');
  expect(second.id).not.toBe(first.id);
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'second answer');
  expect(mocks.recovery.get(`one:reading:practice:section:session:${first.id}`).responses.q1).toBe('first answer');
  view.unmount(); mocks.catalog.questions[0].prompt = 'The source changed after the first session.';
  const resumed = practice(`/reading/section?attempt=${first.id}`);
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('first answer');
  expect(screen.getByText('The garden opened in _____.')).toBeVisible();
  expect(screen.queryByText('The source changed after the first session.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  resumed.unmount(); practice(`/reading/section?attempt=${second.id}`);
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('second answer');
});

test('discard is confirmed, keeps other sessions, and cannot resurrect the discarded draft', async () => {
  savedReview();
  const user = userEvent.setup(); const view = practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), 'unfinished');
  const id = mocks.recovery.get('one:reading:practice:section').id;
  await user.click(screen.getByRole('button', { name: 'Discard session' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('unfinished');
  await user.click(screen.getByRole('button', { name: 'Discard session' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard session' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAttempts.find((a: any) => a.id === id)?.status).toBe('discarded'));
  expect(mocks.fb.stateRef.current.examAttempts.find((a: any) => a.id === 'saved')?.status).toBe('completed');
  view.unmount(); const stale = practice(`/reading/section?attempt=${id}`);
  expect(await screen.findByText(/This session was discarded/)).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Answer 1' })).not.toBeInTheDocument();
  stale.unmount(); practice();
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('');
  expect(mocks.recovery.get('one:reading:practice:section').id).not.toBe(id);
});

test('failed discard keeps answers available after remount and can be retried', async () => {
  const user = userEvent.setup(); const view = practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), 'kept-answer');
  const id = mocks.recovery.get('one:reading:practice:section').id;
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => { mocks.fb.stateRef.current = draft; mocks.fb.state = draft; return false; });
  await user.click(screen.getByRole('button', { name: 'Discard session' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard session' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not discard');
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('kept-answer');
  view.unmount(); practice(`/reading/section?attempt=${id}`);
  expect(await screen.findByRole('textbox', { name: 'Answer 1' })).toHaveValue('kept-answer');
  await user.click(screen.getByRole('button', { name: 'Discard session' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard session' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAttempts.find((a: any) => a.id === id)?.status).toBe('discarded'));
});

test('bank discovers unsynced local sessions and groups same-passage history', async () => {
  const view = practice();
  await userEvent.setup().type(await screen.findByRole('textbox', { name: 'Answer 1' }), 'local answer');
  const id = mocks.recovery.get('one:reading:practice:section').id;
  view.unmount();
  render(<MemoryRouter><ExamBankPage skill="reading" /></MemoryRouter>);
  const resume = await screen.findByRole('link', { name: 'Resume session' });
  expect(resume).toHaveAttribute('href', expect.stringContaining(`attempt=${id}`));
  expect(screen.getByRole('link', { name: 'New session' })).toHaveAttribute('href', '/reading/section?new=1');
  await userEvent.setup().click(screen.getByText('0 completed · 1 unfinished sessions'));
  expect(screen.getByRole('link', { name: `Resume session ${id}` })).toBeVisible();
});

test('save and exit syncs a paused session before leaving, retaining a failed save for retry', async () => {
  const user = userEvent.setup(); practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990');
  const id = mocks.recovery.get('one:reading:practice:section').id;
  mocks.fb.persistNow.mockResolvedValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Save & exit' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this session');
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('1990');
  expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  expect(screen.getByLabelText('URL')).toHaveTextContent('/reading/section');
  await user.click(screen.getByRole('button', { name: 'Save & exit' }));
  await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent(/^\/reading$/));
  expect(mocks.fb.stateRef.current.examAttempts.find((a: any) => a.id === id)).toMatchObject({ status: 'paused', responses: { q1: '1990' } });
});

test('starting another listening session resets audio while preserving the previous session position', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  mocks.catalog.sections[0].skill = 'listening'; mocks.catalog.sections[0].assetId = 'recording';
  mocks.catalog.questions.forEach((q: any) => q.skill = 'listening');
  mocks.catalog.assets = [{ id: 'recording', sectionId: 'section', paperId: 'paper', kind: 'audio', storagePath: 'recording.mp3', sourceUrl: '', duration: 100, provenance }];
  const { container } = render(<MemoryRouter initialEntries={['/listening/section']}><Routes><Route path="/listening/:sectionId" element={<ExamPracticePage skill="listening" />} /></Routes></MemoryRouter>);
  await screen.findByRole('textbox', { name: 'Answer 1' });
  const id = mocks.recovery.get('one:listening:practice:section').id;
  const audio = container.querySelector('audio')!;
  await waitFor(() => expect(audio).toHaveAttribute('src', '/audio.mp3'));
  audio.currentTime = 25; fireEvent.timeUpdate(audio);
  await userEvent.setup().click(screen.getByRole('button', { name: 'New session' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Start new session' }));
  await waitFor(() => expect(container.querySelector('audio')).not.toBe(audio));
  expect(container.querySelector('audio')?.currentTime).toBe(0);
  expect(mocks.recovery.get(`one:listening:practice:section:session:${id}`)).toMatchObject({ status: 'paused', audioPosition: 25 });
});

test('discard waits for an in-flight autosave so the stale active revision cannot resurrect it', async () => {
  const user = userEvent.setup(); practice();
  await user.type(await screen.findByRole('textbox', { name: 'Answer 1' }), '1990');
  const id = mocks.recovery.get('one:reading:practice:section').id;
  let resolveSave!: (value: boolean) => void;
  const commits: string[] = [];
  mocks.fb.persistNow.mockImplementationOnce(async (draft: any) => {
    await new Promise<boolean>(resolve => { resolveSave = resolve; });
    mocks.fb.stateRef.current = draft; mocks.fb.state = draft; commits.push(draft.examAttempts.find((a: any) => a.id === id).status); return true;
  }).mockImplementationOnce(async (draft: any) => {
    mocks.fb.stateRef.current = draft; mocks.fb.state = draft; commits.push(draft.examAttempts.find((a: any) => a.id === id).status); return true;
  });
  await waitFor(() => expect(mocks.fb.persistNow).toHaveBeenCalledTimes(1), { timeout: 2500 });
  await user.click(screen.getByRole('button', { name: 'Discard session' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard session' }));
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(1);
  await act(async () => resolveSave(true));
  await waitFor(() => expect(commits).toEqual(['active', 'discarded']));
  expect(mocks.fb.stateRef.current.examAttempts.find((a: any) => a.id === id)?.status).toBe('discarded');
});

test('source image network failure offers a real reload in both image layouts', async () => {
  const asset = { id: 'diagram', paperId: 'paper', kind: 'image' as const, storagePath: 'diagram', sourceUrl: 'https://example.org/diagram.jpg', provenance };
  for (const inline of [false, true]) {
    const view = render(<ExamImage asset={asset} label="Source map" inline={inline} />);
    fireEvent.error(await screen.findByRole('img', { name: 'Source map' }));
    expect(screen.getByRole('alert')).toHaveTextContent('image could not load');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry image' }));
    expect(await screen.findByRole('img', { name: 'Source map' })).toBeInTheDocument();
    view.unmount();
  }
});

test('passage panel scroll restores after leaving and stays isolated by account', async () => {
  const view = practice();
  await screen.findByRole('textbox', { name: 'Answer 1' });
  const panel = document.getElementById('exam-panel-source')!;
  panel.scrollTop = 240;
  fireEvent.scroll(panel);
  view.unmount();
  const restored = practice();
  await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(document.getElementById('exam-panel-source')!.scrollTop).toBe(240);
  restored.unmount();
  mocks.owner = 'two';
  practice();
  await screen.findByRole('textbox', { name: 'Answer 1' });
  expect(document.getElementById('exam-panel-source')!.scrollTop).toBe(0);
});
