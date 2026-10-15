import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { SourceAnnotations, AnnotatedText } from './SourceAnnotations';
import { makeTextAnchor } from '../../domain/exam/annotations';

const mocks = vi.hoisted(() => ({ owner: 'one', fb: null as any }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
beforeEach(() => {
  localStorage.clear(); mocks.owner = 'one';
  const state = { examAnnotations: [], settings: {} };
  mocks.fb = { state, stateRef: { current: state }, persistNow: vi.fn(async (next: any) => { mocks.fb.state = next; mocks.fb.stateRef.current = next; return true; }), toast: vi.fn() };
});
afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); });
function view(mock = false) {
  return render(<SourceAnnotations sourceId="s" skill="reading" mock={mock} questions={[{ id: 'q', number: 1 }]} focusedQuestion="q" onEvidence={vi.fn()}>
    <p><AnnotatedText blockId="p:A" text="The garden opened in 1990." version="1" /></p>
  </SourceAnnotations>);
}

function selectText(block: Element, start: number, end: number) {
  const range = document.createRange(); range.setStart(block.firstChild!, start); range.setEnd(block.firstChild!, end);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(block);
}

test('partial word selection expands both the displayed selection and vocabulary anchors', () => {
  const onVocabulary = vi.fn();
  render(<SourceAnnotations sourceId="s" skill="reading" onVocabulary={onVocabulary}><AnnotatedText blockId="p:A" text="The garden opened." version="1" /></SourceAnnotations>);
  selectText(screen.getByText('The garden opened.'), 6, 8);
  expect(window.getSelection()?.toString()).toBe('garden');
  fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(onVocabulary).toHaveBeenCalledWith(expect.objectContaining({ quote: 'garden', anchors: [expect.objectContaining({ start: 4, end: 10, quote: 'garden' })] }));
});

test('clicking a highlight offers direct removal which persists after reload', async () => {
  const first = view();
  selectText(screen.getByText('The garden opened in 1990.'), 6, 8);
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  fireEvent.click(first.container.querySelector('.source-highlight')!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(0));
  first.unmount(); const next = view();
  expect(next.container.querySelector('.source-highlight')).toBeNull();
});

test('changing the same highlight color updates it instead of stacking duplicates', async () => {
  const page = view();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  const id = mocks.fb.stateRef.current.examAnnotations[0].id;
  fireEvent.keyDown(page.container.querySelector('.source-highlight')!, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight green' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toMatchObject([{ id, color: 'green' }]));
  expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1);
});

test('removing highlight preserves its note, source anchor and future editability', async () => {
  const first = view();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Keep this explanation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(first.container.querySelector('.source-highlight')!);
  fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations[0]).toMatchObject({ note: 'Keep this explanation', highlighted: false }));
  first.unmount(); const next = view();
  expect(next.container.querySelector('.source-highlight')).toBeNull();
  expect(next.container.querySelector('.source-note-anchor')).toHaveTextContent('The garden opened in 1990.');
  fireEvent.keyDown(next.container.querySelector('.source-note-anchor')!, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('Keep this explanation');
});

test('failed highlight removal stays removed locally and retries after remount', async () => {
  const first = view();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  mocks.fb.persistNow.mockResolvedValueOnce(false);
  fireEvent.click(first.container.querySelector('.source-highlight')!);
  fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }));
  await screen.findByRole('alert'); first.unmount(); const next = view();
  expect(next.container.querySelector('.source-highlight')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry annotation save' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(0));
});

test('legacy highlights with truncated words collect the complete original word', () => {
  const text = 'The garden opened.'; const onVocabulary = vi.fn();
  mocks.fb.stateRef.current.examAnnotations = [{ id: 'legacy', sourceId: 's', skill: 'reading', color: 'yellow', quote: 'rd', note: '', updatedAt: '2026-10-14', anchors: [makeTextAnchor('p:A', text, 6, 8, '1')] }];
  const page = render(<SourceAnnotations sourceId="s" skill="reading" onVocabulary={onVocabulary}><AnnotatedText blockId="p:A" text={text} version="1" /></SourceAnnotations>);
  fireEvent.click(page.container.querySelector('.source-highlight')!);
  fireEvent.click(screen.getByRole('button', { name: 'Add selected text to vocabulary' }));
  expect(onVocabulary).toHaveBeenCalledWith(expect.objectContaining({ quote: 'garden', anchors: [expect.objectContaining({ quote: 'garden', start: 4, end: 10 })] }));
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('overlapping notes never block removal of the visible highlight and remain separately editable', async () => {
  const text = 'The garden opened in 1990.';
  const highlight = { id: 'highlight', sourceId: 's', skill: 'reading', color: 'yellow', quote: 'garden', note: '', updatedAt: '2026-10-14', anchors: [makeTextAnchor('p:A', text, 4, 10, '1')] };
  mocks.fb.stateRef.current.examAnnotations = [highlight, { ...highlight, id: 'note', note: 'A separate note', highlighted: false }];
  const page = view(); const user = userEvent.setup();
  await user.click(page.container.querySelector('.source-highlight')!);
  expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeEnabled();
  await user.click(screen.getByRole('combobox', { name: 'Overlapping annotation' }));
  await user.click(screen.getByRole('option', { name: '2. Note · A separate note' }));
  expect(screen.getByRole('button', { name: 'Edit note' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Remove highlight' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'Overlapping annotation' }));
  await user.click(screen.getByRole('option', { name: '1. yellow · garden' }));
  await user.click(screen.getByRole('button', { name: 'Remove highlight' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  expect(mocks.fb.stateRef.current.examAnnotations[0]).toMatchObject({ id: 'note', note: 'A separate note', highlighted: false });
  expect(page.container.querySelector('.source-highlight')).toBeNull();
  expect(page.container.querySelector('.source-note-anchor')).toHaveTextContent('garden');
});

test('hidden question labels preserve saved highlights and new selection offsets', async () => {
  const text = '1. The garden opened in 1990.';
  const page = () => <SourceAnnotations sourceId="s" skill="reading"><p><AnnotatedText blockId="question:q1" text={text} version="1" hiddenPrefixLength={3} /></p></SourceAnnotations>;
  const first = render(page());
  const block = first.container.querySelector('[data-source-block]')!;
  expect(block).toHaveTextContent(text);
  expect(screen.getByText('1.')).not.toBeVisible();
  const visible = block.firstElementChild!.lastChild!;
  const range = document.createRange(); range.setStart(visible, 4); range.setEnd(visible, 10);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(block); fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  expect(mocks.fb.stateRef.current.examAnnotations[0].anchors).toMatchObject([{ start: 7, end: 13, quote: 'garden' }]);
  selection.removeAllRanges(); first.unmount();
  const reopened = render(page());
  expect(reopened.container.querySelector('mark')).toHaveTextContent('garden');
  expect(screen.getByText('1.')).not.toBeVisible();
});

test('temporary evidence highlighting preserves saved annotations and original selection offsets', async () => {
  const text = 'The garden opened in 1990.';
  mocks.fb.stateRef.current.examAnnotations = [{ id: 'saved', sourceId: 's', skill: 'reading', color: 'yellow', quote: 'garden', note: '', updatedAt: '2026-10-14', anchors: [{ blockId: 'p:A', quote: 'garden', start: 4, end: 10, prefix: 'The ', suffix: ' opened in 1990.', contentVersion: '1' }] }];
  const page = (located: boolean) => <SourceAnnotations sourceId="s" skill="reading"><AnnotatedText blockId="p:A" text={text} version="1" evidenceRanges={located ? [{ start: 4, end: 20 }] : []} /></SourceAnnotations>;
  const view = render(page(true));
  const block = view.container.querySelector('[data-source-block]')!;
  expect(block.textContent).toBe(text);
  expect(view.container.querySelector('.source-highlight')).toHaveTextContent('garden');
  expect([...view.container.querySelectorAll('[data-evidence-highlight]')].map(mark => mark.textContent).join('')).toBe('garden opened in');
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  view.rerender(page(false));
  expect(view.container.querySelector('[data-evidence-highlight]')).toBeNull();
  expect(view.container.querySelector('.source-highlight')).toHaveTextContent('garden');
  expect(block.textContent).toBe(text);
});
test('keyboard selection creates a cloud-owned highlight and restores it after remount', async () => {
  const first = view();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  expect(mocks.fb.stateRef.current.examAnnotations[0]).toMatchObject({ sourceId: 's', skill: 'reading', anchors: [{ blockId: 'p:A', quote: 'The garden opened in 1990.' }] });
  first.unmount(); const second = view();
  expect(second.container.querySelector('mark')).toHaveTextContent('The garden opened in 1990.');
});
test('a failed note save survives remount and can retry without duplicate annotations', async () => {
  mocks.fb.persistNow.mockImplementationOnce(async () => false);
  const first = view();
  fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Date evidence' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  await screen.findByRole('alert'); first.unmount(); view();
  expect(screen.getByText('Date evidence')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry annotation save' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
});
test('mock selection offers highlights and notes without vocabulary or answer evidence', () => {
  view(true); fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add selected text to vocabulary' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Attach selected evidence' })).not.toBeInTheDocument();
});
test('another account cannot recover the first account note', async () => {
  mocks.fb.persistNow.mockResolvedValue(false);
  const first = view(); fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await screen.findByRole('alert'); first.unmount();
  mocks.owner = 'two'; mocks.fb.state = { examAnnotations: [], settings: {} }; mocks.fb.stateRef.current = mocks.fb.state;
  const second = view(); expect(second.container.querySelector('mark')).toBeNull();
});

test('a real multi-block range stores only selected text and restores both blocks', async () => {
  const page = render(<SourceAnnotations sourceId="s" skill="reading"><p><AnnotatedText blockId="p:A" text="The garden opened." version="1" /></p><p><AnnotatedText blockId="p:B" text="Then it closed." version="1" /></p></SourceAnnotations>);
  const first = screen.getByText('The garden opened.'); const second = screen.getByText('Then it closed.');
  const range = document.createRange(); range.setStart(first.firstChild!, 4); range.setEnd(second.firstChild!, 7);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.mouseUp(second); fireEvent.click(screen.getByRole('button', { name: 'Highlight green' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(1));
  expect(mocks.fb.stateRef.current.examAnnotations[0].anchors).toMatchObject([{ blockId: 'p:A', quote: 'garden opened.' }, { blockId: 'p:B', quote: 'Then it' }]);
  expect([...page.container.querySelectorAll('mark')].map(row => row.textContent)).toEqual(['garden opened.', 'Then it']);
  selection.removeAllRanges();
});

test('a late previous-account save cannot clear the next account recovery or show saved status', async () => {
  let finish!: (value: boolean) => void;
  mocks.fb.persistNow.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = view(); fireEvent.keyDown(screen.getByText('The garden opened in 1990.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight yellow' }));
  await waitFor(() => expect(mocks.fb.persistNow).toHaveBeenCalled()); first.unmount();
  mocks.owner = 'two'; mocks.fb.stateRef.current = { examAnnotations: [], settings: {} };
  const second = view(); await act(async () => finish(true));
  expect(second.container.querySelector('mark')).toBeNull();
  expect(screen.queryByText('Annotation saved.')).not.toBeInTheDocument();
  second.unmount(); mocks.owner = 'one'; view();
  expect(screen.getByRole('button', { name: 'Retry annotation save' })).toBeInTheDocument();
});

test('sentence visibility hides other source notes without deleting them on save', async () => {
  const hidden = { id: 'hidden', skill: 'listening', sourceId: 's', color: 'yellow', quote: 'Other sentence', note: 'Unrevealed words', updatedAt: '2026-10-14T00:00:00Z', anchors: [{ blockId: 'sentence:two', quote: 'Other sentence', start: 0, end: 14, prefix: '', suffix: '', contentVersion: '1' }] };
  mocks.fb.stateRef.current.examAnnotations = [hidden];
  render(<SourceAnnotations sourceId="s" skill="listening" allowedBlockIds={['sentence:one']}><AnnotatedText blockId="sentence:one" text="Compared words." version="1" /></SourceAnnotations>);
  expect(screen.queryByText('Unrevealed words')).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByText('Compared words.'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight blue' }));
  await waitFor(() => expect(mocks.fb.stateRef.current.examAnnotations).toHaveLength(2));
  expect(mocks.fb.stateRef.current.examAnnotations).toContainEqual(hidden);
});
