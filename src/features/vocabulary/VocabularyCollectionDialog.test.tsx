import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyModal } from './VocabularyModal';
import { emptyState } from '../../domain/state';
import { collectVocabularyChoice } from '../../domain/vocabulary/collection';
const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'one', lookup: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('./vocabularyCaptureLookup', () => ({ lookupVocabularyCapture: mocks.lookup }));
vi.mock('./Pronunciation', () => ({ Pronunciation: () => <span>Pronunciation controls</span> }));
const sense = { id: 'storage', definition: 'A lockable storage compartment.', example: 'Keep your bag in a locker.', pos: 'noun' };
const entry = { id: 'public-locker', term: 'locker', category: 'word', senses: [sense], meaning: sense.definition, example: sense.example, tags: [], sources: [] };
const seed = { term: 'locker', example: 'Use one of the lockers.', skill: 'listening', sources: [{ type: 'listening', id: 'part', context: 'Use one of the lockers.', exam: { sectionId: 'part', sentenceId: 's1', quote: 'lockers', start: 15, end: 22 } }] };
beforeEach(() => {
  mocks.owner = 'one'; mocks.lookup.mockReset();
  mocks.lookup.mockResolvedValue({ matches: [{ key: 'choice', entry, sense, saved: false }], entries: [entry], suggestions: [], unavailable: false });
  const state = emptyState();
  mocks.fb = { modal: 'vocabulary', vocabularySeed: structuredClone(seed), state, stateRef: { current: state }, ensureAccountModule: vi.fn(async () => {}), closeModal: vi.fn(), setVocabularySeed: vi.fn(), setEditingVocabularyId: vi.fn(), toast: vi.fn(), persistNow: vi.fn(async () => true),
    collectVocabularyEntry: vi.fn(async (choice: any) => { const draft = structuredClone(mocks.fb.stateRef.current); collectVocabularyChoice(draft, choice); mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return true; }) };
});
afterEach(cleanup);

test('collection shows matched meanings and stores the chosen identity with the original occurrence', async () => {
  render(<VocabularyModal />);
  const choice = await screen.findByRole('radio', { name: /A lockable storage compartment/ });
  expect(screen.getByText(/Save to My words\. Collecting/)).toBeInTheDocument();
  fireEvent.click(choice);
  fireEvent.click(screen.getByRole('button', { name: 'Save to My words' }));
  await waitFor(() => expect(mocks.fb.closeModal).toHaveBeenCalled());
  const saved = mocks.fb.state.vocabulary[0];
  expect(saved).toMatchObject({ id: entry.id, term: 'locker', senses: [sense] });
  expect(saved.sources[0]).toMatchObject({ senseId: sense.id, exam: seed.sources[0].exam });
  expect(mocks.fb.state.vocabularyEvidence).toEqual([]);
});

test('a personal unknown word stays pending and a failed save retains the editable draft for retry', async () => {
  mocks.fb.vocabularySeed.term = 'rucksack';
  mocks.lookup.mockResolvedValue({ matches: [], entries: [], suggestions: [], unavailable: false });
  mocks.fb.collectVocabularyEntry.mockResolvedValueOnce(false);
  render(<VocabularyModal />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add a personal meaning' }));
  expect(screen.getByText(/Pending definition/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'English definition' }), { target: { value: 'A bag carried on your back.' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save to My words' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save to My words' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/retry/i);
  expect(screen.getByRole('textbox', { name: 'English definition' })).toHaveValue('A bag carried on your back.');
  fireEvent.click(screen.getByRole('button', { name: 'Save to My words' }));
  await waitFor(() => expect(mocks.fb.closeModal).toHaveBeenCalled());
  expect(mocks.fb.state.vocabulary[0].term).toBe('rucksack');
  expect(mocks.fb.state.wordbookEnrollments).toEqual([]);
});

test('suggested dictionary forms require a visible choice and retain the original selection', async () => {
  mocks.fb.vocabularySeed.term = 'lockers';
  mocks.lookup.mockResolvedValueOnce({ matches: [], entries: [], suggestions: ['locker'], unavailable: false });
  render(<VocabularyModal />);
  fireEvent.click(await screen.findByRole('button', { name: 'Use locker' }));
  expect(screen.getByRole('textbox', { name: 'Word / phrase / pattern' })).toHaveValue('locker');
  expect(screen.getByText('lockers', { selector: 'blockquote' })).toBeInTheDocument();
  await screen.findByRole('radio', { name: /A lockable storage compartment/ });
  expect(mocks.fb.collectVocabularyEntry).not.toHaveBeenCalled();
});

test('assessment captures retain the assessment source when saving a personal meaning', async () => {
  mocks.fb.vocabularySeed = { term: 'locker', meaning: 'A suggested definition.', tags: 'suggestion; writing', sourceType: 'assessment', sourceId: 'assessment-one', skill: 'writing', context: 'My essay.' };
  render(<VocabularyModal />);
  const save = screen.getByRole('button', { name: 'Save to My words' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(mocks.fb.closeModal).toHaveBeenCalled());
  expect(mocks.fb.state.vocabulary[0].sources).toContainEqual(expect.objectContaining({ type: 'assessment', id: 'assessment-one', skill: 'writing', context: 'My essay.' }));
  expect(mocks.fb.state.vocabulary[0].tags).toEqual(['suggestion', 'writing']);
});

test('an unavailable dictionary still allows a pending personal word to be collected', async () => {
  mocks.fb.vocabularySeed.term = 'rucksack';
  mocks.lookup.mockResolvedValue({ matches: [], entries: [], suggestions: [], unavailable: true });
  render(<VocabularyModal />);
  await screen.findByText(/Some vocabulary sources could not be checked/);
  expect(screen.getByRole('button', { name: 'Retry lookup' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add a personal meaning' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save to My words' }));
  await waitFor(() => expect(mocks.fb.closeModal).toHaveBeenCalled());
  expect(mocks.fb.state.vocabulary[0]).toMatchObject({ term: 'rucksack', enrichmentPending: true });
});

test('late lookup results cannot replace a personal definition or allow saving in another account', async () => {
  let resolve: (value: any) => void = () => {};
  mocks.lookup.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
  const view = render(<VocabularyModal />);
  await waitFor(() => expect(mocks.lookup).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Add a personal meaning' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'English definition' }), { target: { value: 'My own meaning.' } });
  resolve({ matches: [{ key: 'choice', entry, sense, saved: false }], entries: [entry], suggestions: [], unavailable: false });
  await screen.findByRole('radio', { name: /A lockable storage compartment/ });
  expect(screen.getByRole('textbox', { name: 'English definition' })).toHaveValue('My own meaning.');
  mocks.owner = 'two';
  fireEvent.click(screen.getByRole('button', { name: 'Save to My words' }));
  expect(mocks.fb.collectVocabularyEntry).not.toHaveBeenCalled();
  view.unmount();
});
