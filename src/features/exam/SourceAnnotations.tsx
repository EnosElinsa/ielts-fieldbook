import { SelectField } from '../../components/SelectField';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookmarkPlus, BookOpen, Eraser, MessageSquarePlus, Pencil, Trash2, LocateFixed, X } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';
import { accountId } from '../../storage/remote';
import { readExamRecovery, writeExamRecovery, clearExamRecovery } from '../../storage/examRecovery';
import { annotationSegments, HIGHLIGHT_COLORS, makeTextAnchor, normalizeExamAnnotations, resolveTextAnchor, type ExamAnnotation, type HighlightColor, type TextAnchor } from '../../domain/exam/annotations';
import type { ExamSkill } from '../../domain/exam/types';
import type { EvidenceRange } from './evidenceLocation';
import { snapTextSelection, vocabularySelectionText } from '../../domain/exam/textSelection';
import './source-annotations.css';

type SelectionData = { quote: string; anchors: TextAnchor[]; context: string; x?: number; y?: number; annotationId?: string; annotationIds?: string[] };
export type SourceSelection = SelectionData;
type Block = { text: string; version: string };
type Recovery = { upserts: ExamAnnotation[]; deletes: { id: string; updatedAt: string }[] };
const emptyRecovery = (): Recovery => ({ upserts: [], deletes: [] });
const SourceContext = createContext<{
  rows: ExamAnnotation[]; selectBlock: (blockId: string, text: string, version: string) => void;
  open: (id: string, trigger: HTMLElement, keyboard?: boolean, annotationIds?: string[]) => void; register: (id: string, block: Block) => () => void;
} | null>(null);

function toolViewport() {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0; const top = viewport?.offsetTop || 0;
  const width = viewport?.width || window.innerWidth; const height = viewport?.height || window.innerHeight;
  const navigation = document.querySelector('.mobile-navigation')?.getBoundingClientRect();
  const bottom = navigation?.width ? Math.min(top + height, navigation.top) : top + height;
  return { left, top, width, bottom };
}

function toolPosition(rect?: DOMRect) {
  if (!rect) return {};
  const { left, top, width, bottom } = toolViewport();
  return { x: Math.max(left + 12, Math.min(rect.left, left + width - Math.min(340, width - 24))), y: Math.max(top + 12, Math.min(rect.bottom + 8, bottom - 230)) };
}

function textPosition(block: Node, offset: number): [Node, number] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (offset <= (node.textContent?.length || 0)) return [node, offset];
    offset -= node.textContent?.length || 0;
  }
  return [block, block.childNodes.length];
}

export function AnnotatedText({ blockId, text, version, hiddenPrefixLength = 0, evidenceRanges = [] }: { blockId: string; text: string; version: string; hiddenPrefixLength?: number; evidenceRanges?: EvidenceRange[] }) {
  const context = useContext(SourceContext);
  const register = context?.register;
  useEffect(() => register?.(blockId, { text, version }), [register, blockId, text, version]);
  const segments = annotationSegments(blockId, text, version, context?.rows || []).flatMap(segment => {
    const end = segment.start + segment.text.length;
    const boundaries = [...new Set([segment.start, end, ...evidenceRanges.flatMap(range => [range.start, range.end]).filter(offset => offset > segment.start && offset < end)])].sort((a, b) => a - b);
    return boundaries.slice(0, -1).map((start, index) => ({ ...segment, start, text: text.slice(start, boundaries[index + 1]), evidence: evidenceRanges.some(range => start >= range.start && boundaries[index + 1] <= range.end) }));
  });
  return <span data-source-block={blockId} data-source-version={version} data-evidence-block={evidenceRanges.length ? true : undefined} tabIndex={context ? 0 : evidenceRanges.length ? -1 : undefined}
    title={context ? 'Annotate this text' : undefined}
    onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); context?.selectBlock(blockId, text, version); } }}>
    {segments.map(segment => {
      // Keep the complete source in the DOM and registry so saved ranges retain their offsets.
      const hiddenLength = Math.max(0, Math.min(segment.text.length, hiddenPrefixLength - segment.start));
      const visible = segment.text.slice(hiddenLength);
      const highlighted = segment.evidence ? <mark key={segment.start} className="exam-evidence-highlight" data-evidence-highlight>{visible}</mark> : visible;
      const Tag = segment.color ? 'mark' : 'span';
      const content = visible && (segment.annotationIds.length ? <Tag key={segment.start} className={`source-annotation-anchor ${segment.color ? `source-highlight source-highlight-${segment.color}` : 'source-note-anchor'}`} title="Annotation options" tabIndex={0} role="button"
      onClick={event => { if (!window.getSelection()?.isCollapsed) return; context?.open(segment.primaryAnnotationId!, event.currentTarget, false, segment.annotationIds); }}
      onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); context?.open(segment.primaryAnnotationId!, event.currentTarget, true, segment.annotationIds); } }}>{highlighted}</Tag> : highlighted);
      return hiddenLength ? <span key={segment.start}><span hidden aria-hidden="true">{segment.text.slice(0, hiddenLength)}</span>{content}</span> : content;
    })}
  </span>;
}

function applyRecovery(rows: ExamAnnotation[], pending: Recovery): ExamAnnotation[] {
  const result = new Map(rows.map(row => [row.id, row]));
  pending.upserts.forEach(row => { if (!result.has(row.id) || row.updatedAt >= result.get(row.id)!.updatedAt) result.set(row.id, row); });
  pending.deletes.forEach(row => { if (row.updatedAt >= (result.get(row.id)?.updatedAt || '')) result.delete(row.id); });
  return [...result.values()];
}

export function SourceAnnotations({ sourceId, skill, mock = false, disabled = false, allowedBlockIds, questions = [], focusedQuestion = '', onQuestionChange, onEvidence, onVocabulary, onRevealBlock, children }: {
  sourceId: string; skill: ExamSkill; mock?: boolean; disabled?: boolean;
  questions?: { id: string; number: number }[]; focusedQuestion?: string;
  onQuestionChange?: (id: string) => void; onEvidence?: (id: string, quote: string) => void;
  onVocabulary?: (selection: SelectionData) => void; children: ReactNode;
  onRevealBlock?: (blockId: string) => void;
  allowedBlockIds?: string[];
}) {
  const fb = useFieldbook(); const owner = accountId(); const scope = `${owner}:${skill}:${sourceId}`;
  const recoveryKey = `source-annotations:${skill}:${sourceId}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const mounted = useRef(true); const lock = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const load = () => {
    const saved = readExamRecovery<Recovery>(owner, recoveryKey);
    return saved && Array.isArray(saved.upserts) && Array.isArray(saved.deletes) ? { upserts: normalizeExamAnnotations(saved.upserts), deletes: saved.deletes.filter(row => typeof row.id === 'string' && typeof row.updatedAt === 'string') } : emptyRecovery();
  };
  const [local, setLocal] = useState(() => ({ scope, pending: load() }));
  const pending = local.scope === scope ? local.pending : load();
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [editing, setEditing] = useState<ExamAnnotation | null>(null);
  const [noteOpen, setNoteOpen] = useState(false); const [note, setNote] = useState('');
  const [color, setColor] = useState<HighlightColor>('yellow');
  const [noteHighlighted, setNoteHighlighted] = useState(true);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const [questionId, setQuestionId] = useState(focusedQuestion);
  const [blocks, setBlocks] = useState<Record<string, Block>>({});
  const allowedBlockKey = allowedBlockIds ? JSON.stringify([...new Set(allowedBlockIds)].sort()) : '*';
  const allowedBlocks = useRef<Set<string> | null>(null);
  allowedBlocks.current = allowedBlockIds ? new Set(allowedBlockIds) : null;
  const accessible = (anchors: TextAnchor[]) => !allowedBlocks.current || anchors.every(anchor => allowedBlocks.current!.has(anchor.blockId));
  const { confirm, dialog } = useConfirmationDialog(`${scope}:${allowedBlockKey}`);
  const register = useCallback((id: string, block: Block) => {
    setBlocks(previous => ({ ...previous, [id]: block }));
    return () => setBlocks(previous => { const next = { ...previous }; delete next[id]; return next; });
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setLocal({ scope, pending: load() }); setSelection(null); setEditing(null); setNoteOpen(false); setError(''); setStatus(''); setSaving(false); lock.current = false; }, [scope]);
  useEffect(() => setQuestionId(focusedQuestion), [focusedQuestion]);
  useEffect(() => { setSelection(null); setEditing(null); setNoteOpen(false); }, [allowedBlockKey]);
  useEffect(() => {
    if (!selection) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.source-selection-tools,.source-annotation-anchor,[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]')) setSelection(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !noteOpen && !document.querySelector('[role="listbox"]')) { setSelection(null); window.getSelection()?.removeAllRanges(); selectionTrigger.current?.focus({ preventScroll: true }); }
    };
    const scroll = (event: Event) => {
      if (noteOpen || event.target instanceof Element && event.target.closest('.source-selection-tools,[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]')) return;
      const selected = window.getSelection();
      const rect = selected?.rangeCount && !selected.isCollapsed ? selected.getRangeAt(0).getBoundingClientRect?.() : selectionTrigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = toolViewport();
      const position = toolPosition(rect);
      setSelection(previous => !previous || rect.bottom < viewport.top || rect.top > viewport.bottom ? null : previous.x === position.x && previous.y === position.y ? previous : { ...previous, ...position });
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); };
  }, [Boolean(selection), noteOpen]);
  useEffect(() => {
    if (!selection?.x) return;
    const dismiss = () => setSelection(null);
    window.addEventListener('resize', dismiss);
    window.visualViewport?.addEventListener('resize', dismiss);
    return () => { window.removeEventListener('resize', dismiss); window.visualViewport?.removeEventListener('resize', dismiss); };
  }, [selection?.x]);
  const rows = applyRecovery(normalizeExamAnnotations(fb.stateRef.current.examAnnotations).filter(row => row.sourceId === sourceId && row.skill === skill), pending).filter(row => accessible(row.anchors));
  const sameAnchors = (row: ExamAnnotation) => selection && row.anchors.length === selection.anchors.length && row.anchors.every((anchor, index) => {
    const target = selection.anchors[index]; const block = blocks[anchor.blockId];
    const resolved = block && resolveTextAnchor(anchor, block.text, block.version);
    return anchor.blockId === target.blockId && resolved?.start === target.start && resolved.end === target.end;
  });
  const selectedRow = rows.find(row => row.id === selection?.annotationId) || [...rows].reverse().find(sameAnchors);
  const hasPending = pending.upserts.length > 0 || pending.deletes.length > 0;
  const current = () => mounted.current && accountId() === owner && scopeRef.current === scope;
  const setPending = (next: Recovery) => {
    pendingRef.current = next; setLocal({ scope, pending: next }); writeExamRecovery(owner, recoveryKey, next);
  };
  const persist = async (snapshot: Recovery) => {
    if (!current() || lock.current) return false;
    lock.current = true; setSaving(true); setError('');
    let saved = false;
    let feedback = '';
    try {
      await fb.ensureAccountModule?.('receptive');
      if (!current()) return false;
      const draft = structuredClone(fb.stateRef.current);
      const all = normalizeExamAnnotations(draft.examAnnotations);
      draft.examAnnotations = [...all.filter(row => row.sourceId !== sourceId || row.skill !== skill), ...applyRecovery(all.filter(row => row.sourceId === sourceId && row.skill === skill), snapshot)];
      saved = await fb.persistNow(draft, { collections: ['examAnnotations'], onError: (message: string) => { feedback = message; } });
    } catch { saved = false; }
    finally { if (current()) { lock.current = false; setSaving(false); } }
    if (!current()) return false;
    if (!saved) { setError(`${feedback || 'Annotations could not be saved.'} Your edits remain in this browser.`); return false; }
    if (JSON.stringify(pendingRef.current) === JSON.stringify(snapshot)) {
      clearExamRecovery(owner, recoveryKey); pendingRef.current = emptyRecovery(); setLocal({ scope, pending: emptyRecovery() });
    }
    setStatus('Annotation saved.'); return true;
  };
  const saveRow = async (row: ExamAnnotation) => {
    if (disabled || saving || lock.current || !current() || !accessible(row.anchors)) return false;
    const next = { upserts: [...pendingRef.current.upserts.filter(item => item.id !== row.id), row], deletes: pendingRef.current.deletes.filter(item => item.id !== row.id) };
    setPending(next); return persist(next);
  };
  const selectBlock = useCallback((blockId: string, text: string, version: string) => {
    if (allowedBlocks.current && !allowedBlocks.current.has(blockId)) return;
    setSelection({ quote: text, anchors: [makeTextAnchor(blockId, text, 0, text.length, version)], context: text }); setStatus('');
  }, []);
  const edit = (id: string) => {
    const row = rows.find(item => item.id === id); if (!row || disabled || !accessible(row.anchors)) return;
    setEditing(row); setNote(row.note); setColor(row.color); setNoteHighlighted(row.highlighted !== false); setNoteOpen(true);
  };
  const closeSelection = () => { setSelection(null); window.getSelection()?.removeAllRanges(); };
  const open = (id: string, trigger: HTMLElement, keyboard = false, annotationIds = [id]) => {
    const row = rows.find(item => item.id === id); if (!row || disabled || saving || !accessible(row.anchors)) return;
    const anchors = row.anchors.flatMap(anchor => {
      const block = blocks[anchor.blockId]; const range = block && resolveTextAnchor(anchor, block.text, block.version);
      const snapped = range && (snapTextSelection(block.text, range.start, range.end) || range);
      return snapped ? [makeTextAnchor(anchor.blockId, block.text, snapped.start, snapped.end, block.version)] : [];
    });
    if (anchors.length !== row.anchors.length) { edit(id); return; }
    window.getSelection()?.removeAllRanges(); selectionTrigger.current = trigger;
    setSelection({ annotationId: id, annotationIds, quote: anchors.map(anchor => anchor.quote).join(' '), anchors, context: anchors.map(anchor => blocks[anchor.blockId].text).join(' '), ...toolPosition(trigger.getBoundingClientRect()) });
    setStatus('');
    if (keyboard) requestAnimationFrame(() => container.current?.querySelector<HTMLElement>('.source-selection-tools button')?.focus({ preventScroll: true }));
  };
  const capture = (event?: { target: EventTarget | null }) => {
    if (disabled || saving || noteOpen || event?.target instanceof Element && event.target.closest('.source-selection-tools,.source-annotation-list,[role="dialog"]')) return;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !container.current) return;
    const range = selected.getRangeAt(0);
    if (!container.current.contains(range.commonAncestorContainer)) return;
    const anchors: TextAnchor[] = []; const contexts: string[] = []; const selectedBlocks: HTMLElement[] = [];
    for (const block of container.current.querySelectorAll<HTMLElement>('[data-source-block]')) {
      if (!range.intersectsNode(block) || allowedBlocks.current && !allowedBlocks.current.has(block.dataset.sourceBlock!)) continue;
      const text = block.textContent || ''; if (!text.trim()) continue;
      const before = document.createRange(); before.selectNodeContents(block);
      let start = 0; let end = text.length;
      if (block.contains(range.startContainer)) { before.setEnd(range.startContainer, range.startOffset); start = before.toString().length; }
      if (block.contains(range.endContainer)) { before.selectNodeContents(block); before.setEnd(range.endContainer, range.endOffset); end = before.toString().length; }
      const snapped = snapTextSelection(text, start, end);
      if (snapped) { anchors.push(makeTextAnchor(block.dataset.sourceBlock!, text, snapped.start, snapped.end, block.dataset.sourceVersion || '')); contexts.push(text); selectedBlocks.push(block); }
    }
    if (!anchors.length) { setSelection(null); return; }
    const snappedRange = document.createRange();
    snappedRange.setStart(...textPosition(selectedBlocks[0], anchors[0].start));
    snappedRange.setEnd(...textPosition(selectedBlocks.at(-1)!, anchors.at(-1)!.end));
    selected.removeAllRanges(); selected.addRange(snappedRange);
    selectionTrigger.current = selectedBlocks[0];
    setSelection({ quote: anchors.map(anchor => anchor.quote).join(' '), anchors, context: contexts.join(' '), ...toolPosition(snappedRange.getBoundingClientRect?.()) });
    setStatus('');
  };
  const create = (selectedColor: HighlightColor, noteText = selectedRow?.note || ''): ExamAnnotation | null => selection && accessible(selection.anchors) ? { id: selectedRow?.id || crypto.randomUUID(), sourceId, skill, color: selectedColor, quote: selection.quote, note: noteText, anchors: selection.anchors, updatedAt: new Date().toISOString() } : null;
  const deleteRow = async (row: ExamAnnotation) => {
    if (disabled || saving || lock.current || !current() || !accessible(row.anchors)) return false;
    const next = { upserts: pendingRef.current.upserts.filter(item => item.id !== row.id), deletes: [...pendingRef.current.deletes.filter(item => item.id !== row.id), { id: row.id, updatedAt: new Date().toISOString() }] };
    setPending(next); return persist(next);
  };
  const removeHighlight = async (row: ExamAnnotation) => {
    closeSelection(); setNoteOpen(false);
    const saved = row.note.trim() ? await saveRow({ ...row, highlighted: false, updatedAt: new Date().toISOString() }) : await deleteRow(row);
    if (saved && current()) setStatus(row.note.trim() ? 'Highlight removed. Your note is kept and marked with a dotted underline.' : 'Highlight removed.');
    if (current()) selectionTrigger.current?.closest<HTMLElement>('[data-source-block]')?.focus({ preventScroll: true });
  };
  const jump = (row: ExamAnnotation) => {
    const anchor = row.anchors.find(item => { const block = blocks[item.blockId]; return block && resolveTextAnchor(item, block.text, block.version); });
    if (!anchor) { setStatus('This annotation is saved, but its original text could not be located.'); return; }
    onRevealBlock?.(anchor.blockId);
    requestAnimationFrame(() => {
      const node = [...(container.current?.querySelectorAll<HTMLElement>('[data-source-block]') || [])].find(item => item.dataset.sourceBlock === anchor.blockId);
      for (let parent = node?.parentElement; parent && parent !== container.current; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); node?.focus({ preventScroll: true });
    });
  };
  const contextValue = useMemo(() => ({ rows, selectBlock, open, register }), [JSON.stringify(rows), selectBlock, register, disabled, saving, blocks, scope, allowedBlockKey]);
  return <SourceContext.Provider value={contextValue}><div className="source-annotations-workspace" ref={container} onMouseUp={capture} onTouchEnd={capture} onKeyUp={event => { if (event.shiftKey) capture(); }}>
    {children}
    {selection && !noteOpen && accessible(selection.anchors) && <div className={`source-selection-tools${selection.x !== undefined ? ' is-floating' : ''}`} role="toolbar" aria-label="Selected text tools" style={selection.x !== undefined ? { left: selection.x, top: selection.y, maxHeight: Math.max(80, toolViewport().bottom - (selection.y || 0) - 12) } : undefined}>
      <div className="source-selection-header"><div className="source-selection-preview">{selection.quote}</div><button className="icon-button" type="button" title="Close selection tools" aria-label="Close selection tools" onClick={closeSelection}><X size={16} /></button></div><div className="source-tool-row">
        {HIGHLIGHT_COLORS.map(value => <button key={value} className={`source-color-swatch source-highlight-${value}`} type="button" title={`Highlight ${value}`} aria-label={`Highlight ${value}`} aria-pressed={selectedRow?.highlighted !== false && selectedRow?.color === value} disabled={disabled || saving} onMouseDown={event => event.preventDefault()} onClick={async () => { const row = create(value); if (row && await saveRow(row)) closeSelection(); }} />)}
        <button className="icon-button" type="button" title={selectedRow?.note ? 'Edit note' : 'Add note'} aria-label={selectedRow?.note ? 'Edit note' : 'Add note'} disabled={disabled || saving} onClick={() => { if (selectedRow) edit(selectedRow.id); else { setEditing(null); setNote(''); setColor('yellow'); setNoteHighlighted(true); setNoteOpen(true); } }}><MessageSquarePlus size={17} /></button>
        {!mock && onVocabulary && <button className="icon-button" type="button" title="Add selected text to vocabulary" aria-label="Add selected text to vocabulary" disabled={disabled || saving || !vocabularySelectionText(selection.quote)} onClick={() => { if (current() && accessible(selection.anchors)) { onVocabulary(selection); closeSelection(); } }}><BookOpen size={17} /></button>}
      </div>
      {selection.annotationIds && selection.annotationIds.length > 1 && <label className="source-overlap-picker">Overlapping annotations<SelectField aria-label="Overlapping annotation" value={selectedRow?.id || ''} disabled={saving || disabled} onChange={event => { if (selectionTrigger.current) open(event.target.value, selectionTrigger.current, false, selection.annotationIds); }}>{selection.annotationIds.map((id, index) => { const row = rows.find(item => item.id === id); return row && <option key={id} value={id}>{index + 1}. {row.highlighted === false ? 'Note' : row.color} · {row.note || row.quote}</option>; })}</SelectField></label>}
      {selectedRow && selectedRow.highlighted !== false && <button className="source-remove-highlight" aria-label="Remove highlight" type="button" disabled={disabled || saving} onClick={() => void removeHighlight(selectedRow)}><Eraser size={15} />Remove highlight{selectedRow.note.trim() ? ' · keep note' : ''}</button>}
      <p className="source-selection-hint">{selectedRow ? 'Change color, edit a note, or remove the highlight.' : 'Whole words selected.'}{!mock && onVocabulary ? ' Collect a word or phrase with the book icon.' : ''}</p>
      {!mock && onEvidence && <div className="source-evidence-tools"><SelectField aria-label="Question for selected evidence" disabled={disabled} value={questionId} onChange={event => { setQuestionId(event.target.value); onQuestionChange?.(event.target.value); }}><option value="">Choose a question</option>{questions.map(question => <option key={question.id} value={question.id}>Question {question.number}</option>)}</SelectField><button className="icon-button" type="button" title="Attach selected evidence" aria-label="Attach selected evidence" disabled={disabled || !questionId} onClick={() => { onEvidence(questionId, selection.quote); closeSelection(); setStatus(`Evidence attached to question ${questions.find(question => question.id === questionId)?.number}.`); }}><BookmarkPlus size={17} /></button></div>}
    </div>}
    {error && !noteOpen && <div className="source-annotation-error" role="alert">{error}<button className="btn line" disabled={saving} onClick={() => void persist(pendingRef.current)} aria-label="Retry annotation save">Retry save</button></div>}
    {status && <p className="source-annotation-status" role="status">{status}</p>}
    {(rows.length > 0 || hasPending) && <details className="source-annotation-list" open><summary>Highlights & notes ({rows.length}){saving ? ' · Saving…' : hasPending ? ' · Unsaved' : ''}</summary>{hasPending && !error && <button className="btn line" aria-label="Retry annotation save" disabled={saving} onClick={() => void persist(pendingRef.current)}>Save pending annotations</button>}
      {rows.map(row => { const located = row.anchors.every(anchor => { const block = blocks[anchor.blockId]; return block && resolveTextAnchor(anchor, block.text, block.version); }); return <div className="source-annotation-row" key={row.id}><span className={`source-note-color ${row.highlighted === false ? 'source-note-only' : `source-highlight-${row.color}`}`} /><div><blockquote>{row.quote}</blockquote>{row.note && <p>{row.note}</p>}{!located && <small>Original position unavailable</small>}</div><div className="source-note-actions"><button className="icon-button" title="Go to annotation" aria-label="Go to annotation" onClick={() => jump(row)}><LocateFixed size={16} /></button><button className="icon-button" title="Edit annotation" aria-label="Edit annotation" disabled={disabled || saving} onClick={() => edit(row.id)}><Pencil size={16} /></button><button className="icon-button" title="Delete annotation" aria-label="Delete annotation" disabled={disabled || saving} onClick={async () => { if (await confirm({ title: 'Delete this annotation?', description: row.note ? `${row.quote}\n\nThis also deletes its note.` : row.quote, confirmLabel: 'Delete annotation', destructive: true })) await deleteRow(row); }}><Trash2 size={16} /></button></div></div>; })}
    </details>}
    <ModalFrame open={noteOpen && Boolean(editing ? accessible(editing.anchors) : selection && accessible(selection.anchors))} title={editing ? 'Edit annotation' : 'Add note'} onClose={() => { if (!saving) setNoteOpen(false); }} busy={saving} description={editing?.quote || selection?.quote} footer={<>
      {editing && editing.highlighted !== false && <button className="btn line" disabled={saving || disabled} onClick={() => void removeHighlight({ ...editing, note })}><Eraser size={15} />Remove highlight</button>}
      <button className="btn line" disabled={saving} onClick={() => setNoteOpen(false)}>Cancel</button><button className="btn primary" disabled={saving || disabled || !noteHighlighted && !note.trim() && !editing} onClick={async () => {
        const row = editing ? { ...editing, note, color, highlighted: noteHighlighted, updatedAt: new Date().toISOString() } : create(color, note);
        if (row && await (!noteHighlighted && !note.trim() && editing ? deleteRow(editing) : saveRow({ ...row, highlighted: noteHighlighted }))) { setNoteOpen(false); closeSelection(); }
      }}>{saving ? 'Saving…' : 'Save note'}</button></>}>
      <label className="source-note-field">Note<textarea aria-label="Note" value={note} onChange={event => setNote(event.target.value)} disabled={saving} /></label>
      <label className="source-highlight-toggle"><input type="checkbox" checked={noteHighlighted} disabled={saving} onChange={event => setNoteHighlighted(event.target.checked)} />Highlight text</label>
      {noteHighlighted ? <div className="source-tool-row">{HIGHLIGHT_COLORS.map(value => <button type="button" key={value} className={`source-color-swatch source-highlight-${value}`} aria-label={`Note color ${value}`} aria-pressed={color === value} title={`Note color ${value}`} disabled={saving} onClick={() => setColor(value)} />)}</div> : <p className="source-selection-hint">Your note stays attached to the text with a dotted underline.</p>}{error && <p className="source-note-save-error" role="alert">{error}</p>}
    </ModalFrame>{dialog}
  </div></SourceContext.Provider>;
}
