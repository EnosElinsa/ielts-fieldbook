import { SelectField } from '../../components/SelectField';
import { SaveFailure } from '../../components/SaveFailure';
import { ReadingPassage, readingQuestionPrompt, HeadingList, HeadingReference, QuestionReference } from './ReadingPassage';
import { useWorkspacePageState } from '../../lib/workspacePageState';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { InlineLoadingState, PageLoadingState, StateMessage } from '../../components/AsyncState';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pause, Play, Compass, Send, Columns2, Rows3, NotebookPen, Map as MapIcon } from 'lucide-react';
import type { ExamAsset, ExamQuestion, ExamSkill } from '../../domain/exam/types';
import { isQuestionAnswered, questionAnsweredSlots, questionEndNumber, questionLabel, questionNumberLabel, questionSlotCount, selectedExamChoices } from '../../domain/exam/questionSlots';
import { examVocabularySeed } from './vocabularyCapture';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';
import { accountId } from '../../storage/remote';
import { ExamSessionHistory } from './ExamSessionHistory';
import { InlineQuestionNotes, QuestionNotes } from './QuestionNotes';
import { recoveredExamSessions } from './sessionRecovery';
import { useFieldbook } from '../../context/FieldbookContext';
import { MethodGuide } from './MethodGuide';
import { EMPTY_EXAM_CATALOG, examClock, QUESTION_TYPE_NAMES, useExamAsset, useExamCatalog } from './useExamCatalog';
import { useExamAttempt } from './useExamAttempt';
import { ExamMockAudio } from './ExamMockAudio';
import { ModalFrame } from '../../components/ModalFrame';
import { SourceAnnotations, AnnotatedText, type SourceSelection } from './SourceAnnotations';
import { examGapMatches, examGapNumber, questionPresentation, questionNumberPrefixLength } from './questionPresentation';
import '../../styles/exam.css';

export function ExamImage({ asset, label, inline = false }: { asset?: ExamAsset; label: string; inline?: boolean }) {
  const { url, error, reload } = useExamAsset(asset);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const retry = () => { setFailedImage(null); reload(); };
  const imageError = error || (failedImage === `${asset?.id}:${url}` ? 'The source image could not load. Check your connection and retry.' : '');
  const image = <img src={url} alt={label} onError={() => setFailedImage(`${asset?.id}:${url}`)} />;
  if (inline) return imageError ? <StateMessage inline kind="error" message={imageError} onRetry={retry} retryLabel="Retry image" /> : url ? <span className="exam-figure exam-inline-figure">{image}</span> : asset ? <InlineLoadingState message="Loading source image…" onRetry={retry} retryLabel="Retry image" /> : null;
  return imageError ? <StateMessage kind="error" message={imageError} onRetry={retry} retryLabel="Retry image" /> : url ? <figure className="exam-figure">{image}</figure> : asset ? <InlineLoadingState message="Loading source image…" onRetry={retry} retryLabel="Retry image" /> : null;
}
// Source HTML is converted into React nodes through a restricted tag/attribute list.
export function examStimulusBlockIds(html: string, blockPrefix: string): string[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: string[] = [];
  const visit = (node: Node, key: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''; let offset = 0;
      for (const match of examGapMatches(text)) {
        // Bracket blanks used to be one annotated text node. Keep its old ID
        // eligible so a saved note remains in the list if its text is now an input.
        if (match[2]) blocks.push(`${blockPrefix}:${key}:0`);
        if (match.index! > offset) blocks.push(`${blockPrefix}:${key}:${offset}`);
        offset = match.index! + match[0].length;
      }
      if (offset < text.length) blocks.push(`${blockPrefix}:${key}:${offset}`);
    } else if (node instanceof Element && !['img', 'script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input'].includes(node.tagName.toLowerCase())) {
      Array.from(node.childNodes).forEach((child, index) => visit(child, `${key}-${index}`));
    }
  };
  Array.from(parsed.body.childNodes).forEach((node, index) => visit(node, String(index)));
  return [...new Set(blocks)];
}
export function ExamStimulus({ html, assets = [], renderGap, blockPrefix = 'stimulus', version = '' }: { html: string; assets?: ExamAsset[]; renderGap?: (number: number) => ReactNode; blockPrefix?: string; version?: string }) {
  const nodes = useMemo(() => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const allowed = new Set(['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'blockquote', 'sup', 'sub']);
    const convert = (node: Node, key: string): ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''; const result: ReactNode[] = []; let offset = 0;
        for (const match of examGapMatches(text)) {
          if (match.index! > offset) result.push(<AnnotatedText key={`${key}:${offset}`} blockId={`${blockPrefix}:${key}:${offset}`} text={text.slice(offset, match.index)} version={version} />);
          result.push(<span key={`${key}:gap:${match.index}`} className="exam-inline-gap" data-exam-gap={examGapNumber(match)} tabIndex={renderGap ? undefined : -1}>{renderGap && <wbr />}{renderGap?.(examGapNumber(match)) || (match[2] ? match[0] : `〔${examGapNumber(match)}〕`)}{renderGap && <wbr />}</span>);
          offset = match.index! + match[0].length;
        }
        if (offset < text.length) result.push(<AnnotatedText key={`${key}:${offset}`} blockId={`${blockPrefix}:${key}:${offset}`} text={text.slice(offset)} version={version} />);
        return result;
      }
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      if (['p', 'div'].includes(tag) && !node.textContent?.trim() && !node.querySelector('img')) return null;
      if (tag === 'img') { const source = node.getAttribute('src') || ''; const asset = source.startsWith('exam-asset:') ? assets.find(row => row.id === source.slice('exam-asset:'.length) && row.kind === 'image') : undefined; return asset ? <ExamImage inline key={key} asset={asset} label={node.getAttribute('alt') || 'Source diagram'} /> : null; }
      if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input'].includes(tag)) return null;
      const children = Array.from(node.childNodes).map((child, index) => convert(child, `${key}-${index}`));
      if (!allowed.has(tag)) return children;
      const props: Record<string, unknown> = {}; if (tag === 'td' || tag === 'th') { const span = Number(node.getAttribute('colspan')); if (span > 0 && span < 20) props.colSpan = span; const row = Number(node.getAttribute('rowspan')); if (row > 0 && row < 20) props.rowSpan = row; }
      return <SourceTag key={key} tag={tag} props={props}>{children}</SourceTag>;
    };
    return Array.from(document.body.childNodes).map((node, index) => convert(node, String(index)));
  }, [html, assets, renderGap, blockPrefix, version]);
  return <div className="exam-stimulus">{nodes}</div>;
}
function SourceTag({ tag, props, children }: { tag: string; props: Record<string, unknown>; children: ReactNode }) { if (tag === 'br') return <br />; const Tag = tag as 'div'; return <Tag {...props}>{children}</Tag>; }
export function ExamAnswerInput({ question, value, onChange, disabled, describedBy, compactOptions = false }: { question: ExamQuestion; value: string | string[]; onChange: (value: string | string[]) => void; disabled: boolean; describedBy?: string; compactOptions?: boolean }) {
  const options = question.type === 'true-false' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : question.type === 'yes-no' ? ['YES', 'NO', 'NOT GIVEN'] : question.options || [];
  if (question.type === 'multiple') {
    const selected = selectedExamChoices(value).filter(choice => options.includes(choice));
    const limit = question.points || options.length;
    const selectionId = `exam-selection-${question.id}`;
    return <fieldset className="exam-multiple" aria-describedby={selectionId}>
      <legend>{question.points ? `Choose ${limit} ${limit === 1 ? 'option' : 'options'}` : 'Choose the required options'}</legend>
      <p id={selectionId} className={`exam-choice-count${selected.length === limit ? ' is-complete' : ''}`} role="status" aria-label={`Selection for ${questionLabel(question).toLowerCase()}`}>{question.points ? `${selected.length} / ${limit} selected` : `${selected.length} selected`}{selected.length === limit ? ' · Deselect an option to change your choices.' : ''}</p>
      <div className="exam-options">{options.map(option => <label key={option}><input type="checkbox" disabled={disabled || selected.length >= limit && !selected.includes(option)} aria-describedby={selectionId} checked={selected.includes(option)} onChange={event => onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option))} /><span>{option}</span></label>)}</div>
    </fieldset>;
  }
  if (question.type === 'single' || question.type === 'true-false' || question.type === 'yes-no') return <div className="exam-options">{options.map(option => <label key={option}><input type="radio" name={question.id} disabled={disabled} checked={value === option} onChange={() => onChange(option)} /><span>{option}</span></label>)}</div>;
  if (options.length) return <SelectField aria-label={`Answer ${question.number}`} title={typeof value === 'string' && value ? value : question.type === 'heading' ? 'Choose a heading' : undefined} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} disabled={disabled}><option value="">{question.type === 'heading' || compactOptions ? '—' : 'Choose an answer'}</option>{options.map(option => {
    const code = (compactOptions || question.type === 'heading') && option.match(/^([A-Z]|[ivxlcdm]+)(?=$|[.)\s])/i)?.[1];
    return <option key={option} value={option}>{code ? <span className="exam-heading-choice"><span>{code}</span><span className="exam-heading-choice-title">{option.slice(code.length)}</span></span> : option}</option>;
  })}</SelectField>;
  const exceeded = Boolean(question.maxWords && typeof value === 'string' && value.trim().split(/\s+/).filter(Boolean).length > question.maxWords);
  return <input className="exam-gap" aria-label={`Answer ${question.number}`} aria-describedby={describedBy} aria-invalid={exceeded || undefined} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} disabled={disabled} autoComplete="off" spellCheck={false} placeholder="Your answer" />;
}
function SourceAudio({ asset, mock, started, paused, startPosition, onPosition }: { asset: ExamAsset; mock: boolean; started: boolean; paused: boolean; startPosition: number; onPosition: (value: number) => void }) {
  const { url, error, reload } = useExamAsset(asset); const [mediaError, setMediaError] = useState(false); const audio = useRef<HTMLAudioElement>(null); const [playing, setPlaying] = useState(false); const position = useRef(startPosition);
  useEffect(() => setMediaError(false), [url]);
  const wasPlaying = useRef(false); const resumeAfterPause = useRef(false);
  useEffect(() => { if (!audio.current || !url) return; audio.current.currentTime = position.current; if (mock && started && !paused) void audio.current.play().catch(() => setPlaying(false)); }, [url, started, mock]);
  useEffect(() => { if (paused) { resumeAfterPause.current = wasPlaying.current; audio.current?.pause(); } else if (resumeAfterPause.current && url) { resumeAfterPause.current = false; void audio.current?.play().catch(() => setPlaying(false)); } }, [paused, url]);
  return <div className="exam-source-audio">{error || mediaError ? <StateMessage kind="error" message={error || 'The recording could not play. Check your connection and retry.'} onRetry={() => { setMediaError(false); reload(); }} retryLabel="Retry recording" /> : <>{!url && <InlineLoadingState message="Loading recording…" onRetry={reload} retryLabel="Retry recording" />}<audio ref={audio} src={url || undefined} controls={!mock} aria-label="Practice recording" onLoadedMetadata={() => { if (audio.current) audio.current.currentTime = position.current; }} onError={() => { if (url) setMediaError(true); }} onPlay={() => { if (paused) { audio.current?.pause(); return; } wasPlaying.current = true; setPlaying(true); }} onPause={() => { wasPlaying.current = false; setPlaying(false); }} onTimeUpdate={event => { position.current = event.currentTarget.currentTime; onPosition(position.current); }} onEnded={() => { wasPlaying.current = false; setPlaying(false); }} preload="metadata" />{mock && <><p>{playing ? 'Recording playing · continuous exam playback' : 'Recording ready'}</p>{!playing && started && <button className="btn line" onClick={() => void audio.current?.play()}>Continue recording</button>}</>}</>}</div>;
}

export function ExamPracticePage({ skill }: { skill: ExamSkill }) {
  const [mapPreview, setMapPreview] = useState<ExamQuestion | null>(null);
  const mapTrigger = useRef<HTMLButtonElement | null>(null);
  const fb = useFieldbook(); const { sectionId, paperId } = useParams(); const [params, setParams] = useSearchParams(); const mode = paperId ? 'mock' : 'practice'; const sourceId = paperId || sectionId || ''; const retryId = params.get('retry');
  const owner = accountId();
  const sessionRows = useMemo(() => recoveredExamSessions(owner, skill, fb.state.examAttempts || []), [owner, skill, fb.state.examAttempts, params.get('attempt'), retryId, params.get('new')]);
  const retryAttempt = sessionRows.find(attempt => attempt.id === retryId);
  const retryQuestionIds = retryAttempt ? new Set(Object.entries(retryAttempt.results || {}).filter(([, correct]) => !correct).map(([id]) => id)) : null;
  const requestedAttempt = sessionRows.find(row => row.id === params.get('attempt') && row.skill === skill && row.sourceId === sourceId);
  const boundPlanId = requestedAttempt?.planId || params.get('planId');
  const plan = ((fb.state.plans || []) as import('../../domain/plans').StudyPlan[]).find(row => row.id === boundPlanId && row.status === 'in_progress');
  const target = plan?.target;
  const plannedQuestionIds = mode === 'practice' && target?.type === 'section' && target.skill === skill && target.sectionId === sectionId && target.questionIds?.length ? new Set(target.questionIds) : null;
  const metadata = useExamCatalog(skill); const selectedIds = useMemo(() => retryAttempt ? retryAttempt.sectionIds : metadata.catalog.sections.filter(section => section.skill === skill && (paperId ? section.paperId === paperId : section.id === sectionId)).sort((a, b) => a.part - b.part).map(section => section.id), [metadata.catalog, paperId, sectionId, skill, retryAttempt]);
  const source = useExamCatalog(skill, undefined, selectedIds); const catalog = source.catalog;
  const sections = catalog.sections.filter(section => selectedIds.includes(section.id) && section.skill === skill).sort((a, b) => a.part - b.part);
  const questions = (requestedAttempt?.questionSnapshot || catalog.questions).filter(question => selectedIds.includes(question.sectionId) && question.skill === skill && (!retryQuestionIds || retryQuestionIds.has(question.id)) && (!plannedQuestionIds || plannedQuestionIds.has(question.id))).sort((a, b) => a.number - b.number);
  const valid = sections.length > 0 && sections.every(section => section.status === 'ready' && catalog.questions.filter(question => question.sectionId === section.id).length > 0 && (skill === 'reading' ? catalog.passages.some(passage => passage.sectionId === section.id) : catalog.assets.some(asset => asset.kind === 'audio' && (asset.id === section.assetId || asset.sectionId === section.id || !asset.sectionId)))) && (mode !== 'mock' || (sections.length === (skill === 'reading' ? 3 : 4) && (skill !== 'listening' || catalog.assets.filter(asset => asset.kind === 'audio').every(asset => !!asset.duration))));
  const scoped = useMemo(() => valid ? { ...catalog, sections, questions } : EMPTY_EXAM_CATALOG, [catalog, selectedIds.join('|'), questions.map(question => question.id).join('|'), valid]);
  const controller = useExamAttempt(skill, sourceId, mode, scoped, params.get('attempt'), retryId, boundPlanId, params.get('new') === '1'); const { attempt, update } = controller;
  const { confirm, dialog: sessionDialog } = useConfirmationDialog(`${accountId()}:${attempt?.id}`);
  useEffect(() => {
    if (!attempt || params.get('attempt') === attempt.id && !params.has('new')) return;
    const next = new URLSearchParams(params); next.set('attempt', attempt.id); next.delete('new');
    setParams(next, { replace: true });
  }, [attempt?.id, params, setParams]);
  const discardSession = async () => {
    if (await confirm({ title: 'Discard this session?', description: 'This session will end without a score. Other sessions, completed results and passage annotations are kept.', confirmLabel: 'Discard session', destructive: true })) await controller.discard();
  };
  const startNewSession = async () => {
    if (await confirm({ title: 'Start a new session?', description: 'This session will be paused and kept for Resume. The new session starts with blank answers and separate review notes.', confirmLabel: 'Start new session' })) {
      if (!await controller.keepSession()) return;
      const next = new URLSearchParams(params); next.delete('attempt'); next.set('new', '1'); setParams(next);
    }
  };
  const [activeSectionId, setActiveSectionId] = useWorkspacePageState(`exam:${skill}:${mode}:${sourceId}:${retryId || ''}:section`, ''); const [focusedQuestion, setFocusedQuestion] = useState(''); const [mobileTab, setMobileTab] = useWorkspacePageState(`exam:${skill}:${mode}:${sourceId}:tab`, skill === 'listening' ? 'questions' : 'source');
  const preferredLayout = (fb.state.settings as { examPractice?: { layoutBySkill?: Partial<Record<ExamSkill, 'integrated' | 'split'>> } }).examPractice?.layoutBySkill?.[skill];
  const [layout, setLayout] = useWorkspacePageState<'integrated' | 'split'>(`exam:${skill}:${mode}:layout`, mode === 'mock' ? 'split' : preferredLayout || 'integrated', (value): value is 'integrated' | 'split' => value === 'integrated' || value === 'split');
  const [layoutError, setLayoutError] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [openNotes, setOpenNotes] = useState<string[]>([]);
  const [inlineNotesId, setInlineNotesId] = useState('');
  useEffect(() => { setOpenNotes([]); setInlineNotesId(''); setFocusedQuestion(''); }, [attempt?.id]);
  useEffect(() => { if (selectedIds.length && !selectedIds.includes(activeSectionId)) setActiveSectionId(selectedIds[0]); setFocusedQuestion(''); }, [sourceId, selectedIds.join('|')]);
  const activeSection = sections.find(section => section.id === activeSectionId) || sections[0]; const currentQuestions = questions.filter(question => question.sectionId === activeSection?.id); const passages = catalog.passages.filter(passage => passage.sectionId === activeSection?.id);
  const paper = metadata.catalog.papers.find(row => row.id === sections[0]?.paperId); const disabled = !attempt || attempt.status !== 'active' || controller.saving;
  const answerSlots = questions.reduce((sum, question) => sum + questionSlotCount(question), 0);
  const answered = questions.reduce((sum, question) => sum + questionAnsweredSlots(question, attempt?.responses[question.id]), 0);
  const sourcePanel = useRef<HTMLDivElement>(null);
  const [sourceScroll, setSourceScroll] = useWorkspacePageState(`exam:${skill}:${mode}:${sourceId}:${retryId || ''}:${activeSection?.id || ''}:source-scroll`, 0, (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  useEffect(() => {
    if (sourcePanel.current) sourcePanel.current.scrollTop = sourceScroll;
  }, [activeSection?.id, mobileTab, source.loading, metadata.loading, attempt?.id]);
  const unanswered = questions.filter(question => !isQuestionAnswered(question, attempt?.responses[question.id]));
  const focusAnswer = (question: ExamQuestion) => {
    setActiveSectionId(question.sectionId); setFocusedQuestion(question.id); setMobileTab(layout === 'split' ? 'answers' : 'questions');
    requestAnimationFrame(() => { const target = document.getElementById(`exam-inline-${question.id}`) || document.getElementById(`exam-question-${question.id}`); target?.scrollIntoView?.({ block: 'center' }); const input = target?.querySelector<HTMLElement>('input:not([type="hidden"]),[role="combobox"],select,textarea') || target; input?.focus({ preventScroll: true }); });
  };
  const goToUnanswered = () => {
    const question = unanswered[0];
    if (!question) return;
    setConfirmSubmit(false); focusAnswer(question);
  };
  const requestSubmit = () => { if (attempt?.status !== 'completed' && unanswered.length) setConfirmSubmit(true); else void controller.submit(); };
  const captureVocabulary = (selection: SourceSelection) => {
    if (!selection.quote || mode === 'mock') return;
    const seed = examVocabularySeed(selection, { catalog, sectionId: activeSection!.id, skill, attemptId: attempt?.id });
    if (!seed) return;
    fb.setEditingVocabularyId(null);
    fb.setVocabularySeed(seed);
    fb.openModal('vocabulary');
  };
  const chooseLayout = (next: 'integrated' | 'split') => {
    if (next === layout) return;
    setLayout(next); setLayoutError('');
    if (next === 'integrated' && mobileTab === 'answers') setMobileTab('questions');
    if (mode === 'practice') {
      const draft = structuredClone(fb.stateRef.current);
      const prior = draft.settings.examPractice || {};
      draft.settings.examPractice = { ...prior, layoutBySkill: { ...prior.layoutBySkill, [skill]: next } };
      let message = '';
      void fb.persistNow(draft, { collections: ['profile'], onError: (feedback: string) => { message = feedback; } }).then((saved: boolean) => { if (!saved) setLayoutError(`${message || 'Layout preference could not sync.'} This view is still available.`); }).catch(() => setLayoutError('Layout preference could not sync. This view is still available.'));
    }
  };
  const response = (question: ExamQuestion, value: string | string[]) => { if (!attempt) return; update({ responses: { ...attempt.responses, [question.id]: value } }); };
  const audioAsset = catalog.assets.find(asset => asset.kind === 'audio' && (asset.id === activeSection?.assetId || asset.sectionId === activeSection?.id || !asset.sectionId));
  const mockAssets = useMemo(() => { const ordered = sections.flatMap(section => { const asset = catalog.assets.find(row => row.kind === 'audio' && (row.id === section.assetId || row.sectionId === section.id || !row.sectionId)); return asset ? [asset] : []; }); return [...new Map(ordered.map(asset => [asset.id, asset])).values()]; }, [catalog.assets, selectedIds.join('|')]);
  const materialGroups = currentQuestions.filter((question, index) => !question.groupId || currentQuestions[index - 1]?.groupId !== question.groupId);
  const presentation = useMemo(() => questionPresentation(currentQuestions), [catalog.questions, requestedAttempt?.questionSnapshot, activeSection?.id, currentQuestions.map(question => question.id).join('|')]);
  const gapCounts = useMemo(() => {
    const counts = new Map<number, number>();
    materialGroups.forEach(question => {
      const parsed = new DOMParser().parseFromString(question.stimulusHtml || '', 'text/html');
      const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) for (const match of examGapMatches(walker.currentNode.textContent || '')) { const number = examGapNumber(match); counts.set(number, (counts.get(number) || 0) + 1); }
    });
    return counts;
  }, [presentation]);
  const embeddedAssetIds = useMemo(() => new Set(materialGroups.flatMap(question => {
    const parsed = new DOMParser().parseFromString(question.stimulusHtml || '', 'text/html');
    return [...parsed.querySelectorAll('img')].map(image => image.getAttribute('src') || '').filter(src => src.startsWith('exam-asset:')).map(src => src.slice('exam-asset:'.length));
  })), [presentation]);
  const inlineQuestions = new Set(layout === 'integrated' ? currentQuestions.filter(question => gapCounts.get(question.number) === 1 && !question.options?.length && ['gap', 'summary', 'map', 'flow'].includes(question.type)).map(question => question.id) : []);
  const limitId = (question: ExamQuestion) => { const info = presentation[currentQuestions.indexOf(question)]; return `exam-limit-${info.sharedLimit ? info.group[0].id : question.id}`; };
  const wordLimit = (question: ExamQuestion) => question.maxWords ? `Maximum ${question.maxWords} ${question.maxWords === 1 ? 'word' : 'words'}` : '';
  const noteAdded = (question: ExamQuestion) => Boolean(attempt?.evidence[question.id]?.trim() || attempt?.keywords[question.id]?.trim());
  const selectInlineNotes = (id: string, focus = false) => {
    setInlineNotesId(id);
    if (focus) requestAnimationFrame(() => { const panel = document.getElementById(`exam-notes-${id}`); panel?.closest('.exam-inline-notes')?.scrollIntoView?.({ block: 'start' }); panel?.querySelector('textarea')?.focus({ preventScroll: true }); });
  };
  const closeInlineNotes = () => {
    const id = inlineNotesId; setInlineNotesId('');
    requestAnimationFrame(() => { const trigger = document.getElementById(`exam-inline-notes-toggle-${id}`); trigger?.scrollIntoView?.({ block: 'center' }); trigger?.focus({ preventScroll: true }); });
  };
  const groupHeading = (question: ExamQuestion, index: number) => {
    const info = presentation[index];
    if (!info.groupStart || info.group.length < 2) return null;
    return <div className="exam-question-group-heading"><strong>Questions {info.group[0].number}–{questionEndNumber(info.group.at(-1)!)}</strong>{info.sharedType && <span>{QUESTION_TYPE_NAMES[question.type]}</span>}{info.sharedLimit && <span id={limitId(question)}>{wordLimit(question)}</span>}</div>;
  };
  const renderGap = (number: number) => {
    const question = currentQuestions.find(row => row.number === number && inlineQuestions.has(row.id));
    if (!question) return null;
    const value = attempt?.responses[question.id] || '';
    const info = presentation[currentQuestions.indexOf(question)];
    const exceeded = Boolean(question.maxWords && typeof value === 'string' && value.trim().split(/\s+/).filter(Boolean).length > question.maxWords);
    const errorId = `exam-inline-limit-error-${question.id}`;
    return <span id={`exam-inline-${question.id}`} className="exam-inline-answer" onFocus={() => setFocusedQuestion(question.id)}><span className="exam-inline-number">{number}</span><span className="exam-inline-field"><ExamAnswerInput question={question} value={value} disabled={disabled} describedBy={`${limitId(question)}${exceeded ? ` ${errorId}` : ''}`} onChange={value => response(question, value)} />{question.maxWords && !info.sharedLimit && <span id={limitId(question)} className="exam-word-limit">{wordLimit(question)}</span>}{exceeded && <span id={errorId} className="exam-word-limit exam-word-limit-error" role="alert">Question {number} · word limit exceeded</span>}</span>{mode === 'practice' && attempt && <button id={`exam-inline-notes-toggle-${question.id}`} type="button" className="exam-notes-toggle exam-inline-notes-button" aria-label={`Evidence & paraphrase for ${questionLabel(question).toLowerCase()}`} aria-expanded={inlineNotesId === question.id} aria-controls={`exam-notes-${question.id}`} title={`Notes for ${questionLabel(question).toLowerCase()}${noteAdded(question) ? ' · Notes added' : ''}`} onClick={() => inlineNotesId === question.id ? closeInlineNotes() : selectInlineNotes(question.id, true)}><NotebookPen size={16} aria-hidden="true" />{noteAdded(question) && <span className="exam-note-dot" aria-label="Notes added" />}</button>}</span>;
  };
  const headingPrompt = (question: ExamQuestion) => readingQuestionPrompt(question, catalog.questions, passages.flatMap(passage => passage.paragraphs));
  const headingList = (question: ExamQuestion) => <HeadingList question={question} />;
  const questionNavigation = <nav className="exam-question-nav" aria-label="Question navigation">{currentQuestions.map(question => {
    const count = questionAnsweredSlots(question, attempt?.responses[question.id]);
    const complete = isQuestionAnswered(question, attempt?.responses[question.id]);
    const status = complete ? 'answered' : count ? `${count} of ${questionSlotCount(question)} answered` : 'unanswered';
    return <a key={question.id} href={`#exam-question-${question.id}`} className={complete ? 'answered' : count ? 'partial' : ''} aria-current={focusedQuestion === question.id ? 'location' : undefined} aria-label={`Go to ${questionLabel(question).toLowerCase()} · ${status}`} onClick={event => { event.preventDefault(); focusAnswer(question); }}>{questionNumberLabel(question)}</a>;
  })}</nav>;
  const renderQuestionMaterial = (question: ExamQuestion, index: number) => {
    const info = presentation[index];
    const showStimulus = question.stimulusHtml && (!question.groupId || currentQuestions[index - 1]?.groupId !== question.groupId);
    const image = catalog.assets.find(asset => asset.id === question.assetId && asset.kind === 'image');
    return <div key={question.id}>{info.showInstructions && <p className="exam-instruction">{question.instructions}</p>}{showStimulus && <ExamStimulus html={question.stimulusHtml!} assets={catalog.assets} blockPrefix={`stimulus:${question.groupId || question.id}`} version={question.provenance.contentHash || question.provenance.sourceVersion} />}{info.groupStart && headingList(question)}
      {(info.showPrompt || image) && <article className="exam-question-material"><span className={`exam-number${questionSlotCount(question) > 1 ? " is-range" : ""}`}>{questionNumberLabel(question)}</span>{info.showPrompt && <p className="exam-prompt"><AnnotatedText blockId={`question:${question.id}`} text={headingPrompt(question)} hiddenPrefixLength={questionNumberPrefixLength(headingPrompt(question), question.number, questionEndNumber(question))} version={question.provenance.contentHash || question.provenance.sourceVersion} /></p>}<ExamImage asset={image} label={`${questionLabel(question)} diagram`} /></article>}</div>;
  };
  const renderAnswer = (question: ExamQuestion, index: number, grouped = false) => {
    const info = presentation[index]; const value = attempt?.responses[question.id] || (question.type === 'multiple' ? [] : '');
    const exceeded = Boolean(question.maxWords && typeof value === 'string' && value.trim().split(/\s+/).filter(Boolean).length > question.maxWords);
    const showTools = !inlineQuestions.has(question.id) || info.showPrompt || Boolean(question.assetId);
    const showStimulus = layout === 'integrated' && question.stimulusHtml && (!question.groupId || currentQuestions[index - 1]?.groupId !== question.groupId);
    const compact = layout === 'split' && !question.options?.length && ['gap', 'summary', 'map', 'flow'].includes(question.type);
    const headingAnswer = layout === 'integrated' && (grouped || question.type === 'heading');
    const notesOpen = openNotes.includes(question.id);
    const hasNotes = Boolean(attempt?.evidence[question.id]?.trim() || attempt?.keywords[question.id]?.trim());
    return <div key={question.id}>{!grouped && <>{groupHeading(question, index)}{layout === 'integrated' && info.showInstructions && <p className="exam-instruction">{question.instructions}</p>}{showStimulus && <ExamStimulus html={question.stimulusHtml!} assets={catalog.assets} renderGap={renderGap} blockPrefix={`stimulus:${question.groupId || question.id}`} version={question.provenance.contentHash || question.provenance.sourceVersion} />}{layout === 'integrated' && info.groupStart && headingList(question)}</>}
      {showTools && <article id={`exam-question-${question.id}`} tabIndex={-1} aria-label={`${questionLabel(question)} details`} className={`exam-question${compact ? ' exam-question-compact' : ''}${headingAnswer ? ' exam-heading-answer' : ''}${grouped && question.type === 'map' ? ' exam-map-answer' : ''}`} onFocus={() => setFocusedQuestion(question.id)}>
        <div className="exam-question-heading"><span className={`exam-number${questionSlotCount(question) > 1 ? " is-range" : ""}`}>{questionNumberLabel(question)}</span>{!info.sharedType && !headingAnswer && <span className="exam-eyebrow">{QUESTION_TYPE_NAMES[question.type]}</span>}{mode === 'practice' && attempt && !inlineQuestions.has(question.id) && <button type="button" className="exam-notes-toggle" aria-label={`Evidence & paraphrase for ${questionLabel(question).toLowerCase()}`} aria-expanded={notesOpen} aria-controls={`exam-notes-${question.id}`} title={hasNotes ? 'Evidence & paraphrase · Notes added' : 'Evidence & paraphrase'} onClick={() => setOpenNotes(ids => notesOpen ? ids.filter(id => id !== question.id) : [...ids, question.id])}><NotebookPen size={16} aria-hidden="true" />{hasNotes && <span className="exam-note-dot" aria-label="Notes added" />}</button>}</div>
        {layout === 'integrated' && <>{info.showPrompt && <p className="exam-prompt"><AnnotatedText blockId={`question:${question.id}`} text={headingPrompt(question)} hiddenPrefixLength={questionNumberPrefixLength(headingPrompt(question), question.number, questionEndNumber(question))} version={question.provenance.contentHash || question.provenance.sourceVersion} /></p>}<ExamImage asset={catalog.assets.find(asset => asset.id === question.assetId && asset.kind === 'image')} label={`${questionLabel(question)} diagram`} /></>}
        {!inlineQuestions.has(question.id) && <ExamAnswerInput question={question} value={value} disabled={disabled} compactOptions={grouped} describedBy={limitId(question)} onChange={value => response(question, value)} />}
        {grouped && question.type === 'map' && <button type="button" className="exam-notes-toggle exam-map-toggle" aria-label={`View map for ${questionLabel(question).toLowerCase()}`} title="View map" onClick={event => { mapTrigger.current = event.currentTarget; setMapPreview(question); }}><MapIcon size={16} aria-hidden="true" /></button>}
        {question.maxWords && !info.sharedLimit && !inlineQuestions.has(question.id) && <span id={limitId(question)} className="exam-word-limit">{wordLimit(question)}</span>}
        {exceeded && !inlineQuestions.has(question.id) && <span className="exam-word-limit exam-word-limit-error" role="alert">Question {question.number} · word limit exceeded</span>}
        {mode === 'practice' && attempt && !inlineQuestions.has(question.id) && notesOpen && <QuestionNotes question={question} skill={skill} disabled={disabled} evidence={attempt.evidence[question.id] || ''} keywords={attempt.keywords[question.id] || ''} onEvidence={value => update({ evidence: { ...attempt.evidence, [question.id]: value } })} onKeywords={value => update({ keywords: { ...attempt.keywords, [question.id]: value } })} />}

      </article>}</div>;
  };
  const renderIntegratedQuestions = () => currentQuestions.flatMap((question, index) => {
    const info = presentation[index];
    const inlineRows = info.group.filter(row => inlineQuestions.has(row.id));
    if (inlineRows.length) {
      if (!info.groupStart) return [];
      return [<section key={question.id} className="exam-inline-group" role="group" aria-label={info.group.length > 1 ? `Questions ${question.number}–${questionEndNumber(info.group.at(-1)!)} · ${QUESTION_TYPE_NAMES[question.type]}` : questionLabel(question)}>
        {info.group.map(row => renderAnswer(row, currentQuestions.indexOf(row)))}
        {mode === 'practice' && attempt && <InlineQuestionNotes questions={inlineRows} selectedId={inlineNotesId} onSelect={id => selectInlineNotes(id)} onClose={closeInlineNotes} onReturn={focusAnswer} skill={skill} disabled={disabled} evidence={attempt.evidence} keywords={attempt.keywords} onEvidence={(id, value) => update({ evidence: { ...attempt.evidence, [id]: value } })} onKeywords={(id, value) => update({ keywords: { ...attempt.keywords, [id]: value } })} />}
      </section>];
    }
    const sharedChoices = question.options?.length && info.group.every(row => row.type === question.type && JSON.stringify(row.options) === JSON.stringify(question.options) && row.stimulusHtml === question.stimulusHtml && !catalog.assets.some(asset => asset.id === row.assetId && asset.kind === 'image'));
    if (!['heading', 'matching', 'map'].includes(question.type) || !sharedChoices || (question.type === 'map' && !question.stimulusHtml)) return [renderAnswer(question, index)];
    if (!info.groupStart) return [];
    const range = info.group.length > 1 ? `Questions ${question.number}–${info.group.at(-1)!.number}` : `Question ${question.number}`;
    const map = question.type === 'map';
    const source = question.stimulusHtml && <ExamStimulus html={question.stimulusHtml} assets={catalog.assets} blockPrefix={`stimulus:${question.groupId || question.id}`} version={question.provenance.contentHash || question.provenance.sourceVersion} />;
    return [<section key={question.id} className={`exam-heading-group exam-group-${question.type}${question.type === 'matching' && question.options!.every(option => /^[A-Z]\.?$/.test(option.trim())) ? ' exam-letter-choices' : ''}`} role="group" aria-label={`${range} · ${QUESTION_TYPE_NAMES[question.type]}`}>
      <header className="exam-heading-group-header"><div className="exam-question-group-heading"><strong>{range}</strong><span>{QUESTION_TYPE_NAMES[question.type]}</span></div>{(info.showInstructions || (!map && source)) && <details className="exam-group-instructions"><summary>Instructions</summary>{info.showInstructions && <p className="exam-instruction">{question.instructions}</p>}{!map && source}</details>}</header>
      <div className="exam-heading-workspace">{question.type === 'heading' ? <HeadingReference question={question} /> : <QuestionReference label={map ? 'Map reference' : 'Answer choices'} count={map ? undefined : question.options!.length}>{map ? source : <ul className="exam-heading-list" aria-label="Answer choices">{question.options!.map(option => <li key={option}>{option}</li>)}</ul>}</QuestionReference>}<div className="exam-heading-answers">{info.group.map(row => renderAnswer(row, currentQuestions.indexOf(row), true))}</div></div>
    </section>];
  });
  if (metadata.loading || source.loading) return <section className="view active"><PageLoadingState variant="workbench" message="Loading source material…" onRetry={() => { metadata.reload(); source.reload(); }} /></section>;
  if (metadata.error || source.error) return <section className="view active"><StateMessage kind="error" message={metadata.error || source.error} onRetry={() => { metadata.reload(); source.reload(); }} /></section>;
  if (!valid) return <section className="view active"><Link to={`/${skill}`} className="btn text"><ArrowLeft size={15} />Back to bank</Link><StateMessage title={`This ${mode === 'mock' ? 'full test' : 'part'} is not ready.`} message="The source content, answer key or required parts are incomplete. Practice will open when the verified source is available." /></section>;
  if (!attempt && controller.error) return <section className="view active"><Link className="btn line" to={`/${skill}`}>Back to bank</Link><StateMessage message={controller.error} /></section>;
  if (mode === 'practice' && !attempt) return <section className="view active"><PageLoadingState variant="workbench" message="Restoring your practice…" /></section>;
  return <section className={`view active exam-workspace exam-workspace-${skill}`}><div className="exam-workspace-head"><Link className="btn text back-link" to={`/${skill}`}><ArrowLeft size={15} />Bank</Link><div><span className="exam-eyebrow">{paper ? `Cambridge ${paper.book} / Test ${paper.test}` : skill} · {mode === 'mock' ? 'Full mock' : skill === 'reading' ? 'Passage practice' : 'Part practice'}</span><h2>{mode === 'mock' ? paper?.title || 'Full mock' : activeSection?.title}</h2></div><div className="exam-timer"><span>{mode === 'mock' ? 'Time remaining' : 'Practice time'}</span><strong role="timer">{examClock(mode === 'mock' ? (attempt?.timeLimitSeconds || (skill === 'reading' ? 3600 : 0)) - controller.elapsed : controller.elapsed)}</strong></div></div>
    <SaveFailure failed={Boolean(controller.error)} role="alert" message={controller.error} saving={controller.saving} onRetry={attempt?.status !== 'completed' ? () => void controller.retrySave() : () => void controller.submit()} />
    {mode === 'mock' && !attempt ? <div className="exam-start"><span className="exam-eyebrow">Exam conditions</span><h3>Settle in before you start.</h3><p>{skill === 'reading' ? 'You have 60 minutes for all three passages.' : 'The recording plays continuously, followed by two minutes to check your answers.'} The clock continues if you leave this page. Method notes and answer checks become available after submission.</p><button className="btn primary" onClick={controller.start}><Play size={16} />Start mock</button></div> : <>
      <div className="exam-session-bar" aria-label="Current session"><div><strong>{attempt?.status === 'paused' ? 'Session paused' : attempt?.status === 'completed' ? 'Submission pending' : 'Session in progress'}</strong><span>Started {new Date(attempt?.startedAt || Date.now()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · Answers unlock after submission{mode === 'mock' ? ' · Mock clock continues while away' : ''}{attempt?.retryOfAttemptId ? ' · Wrong-answer retry' : ''}</span></div><div className="btn-row"><button type="button" className="btn line" disabled={controller.saving || attempt?.status === 'completed'} onClick={() => void controller.saveAndExit()}>{controller.saving ? 'Saving…' : 'Save & exit'}</button>{mode === 'practice' && <button type="button" className="btn line" disabled={controller.saving || attempt?.status === 'completed'} onClick={() => void startNewSession()}>New session</button>}<button type="button" className="btn text" disabled={controller.saving || attempt?.status === 'completed'} onClick={() => void discardSession()}>Discard session</button></div></div>
      <ExamSessionHistory sessions={sessionRows.filter(row => row.mode === mode && row.sourceId === sourceId)} currentId={attempt?.id} />
      <div className="exam-workspace-tools"><div className="exam-part-tabs" role="group" aria-label="Test parts">{sections.map(section => <button aria-pressed={section.id === activeSection?.id} className={section.id === activeSection?.id ? 'active' : ''} key={section.id} onClick={() => setActiveSectionId(section.id)}>{skill === 'reading' ? 'Passage' : 'Part'} {section.part}</button>)}</div>{unanswered.length > 0 && <button className="btn text" onClick={goToUnanswered}>Next unanswered</button>}{mode === 'practice' && <div className="btn-row">{skill === 'listening' && activeSection && <Link className="btn line" to={`/listening/intensive/${activeSection.id}`}>Open part intensive</Link>}<button className="btn line" onClick={controller.pause} disabled={controller.saving || attempt?.status === 'completed'}>{attempt?.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}{attempt?.status === 'paused' ? 'Resume' : 'Pause'}</button><button className="btn line" aria-pressed={attempt?.hintsEnabled} onClick={() => update({ hintsEnabled: !attempt?.hintsEnabled })}><Compass size={15} />Method notes</button></div>}</div>
      {mode === 'practice' && skill === 'listening' && audioAsset && <div className="exam-practice-recording"><span className="exam-eyebrow">Part {activeSection?.part} · recording</span><SourceAudio key={`${attempt?.id}:${audioAsset.id}`} asset={audioAsset} mock={false} started={!!attempt} paused={attempt?.status === 'paused'} startPosition={attempt?.audioPosition || 0} onPosition={value => { if (Math.abs(value - (attempt?.audioPosition || 0)) >= 3) update({ audioPosition: value }); }} /></div>}
      {mode === 'practice' && attempt?.hintsEnabled && <MethodGuide skill={skill} types={activeSection?.questionTypes} onClose={() => update({ hintsEnabled: false })} />}
      {attempt?.status === 'paused' && <p className="exam-notice" role="status">Practice paused. Resume when you are ready.</p>}
      {mode === 'mock' && skill === 'listening' && attempt && <ExamMockAudio key={attempt.id} assets={mockAssets} elapsedSeconds={controller.elapsed} startPosition={attempt.audioPosition || 0} completed={attempt.status === 'completed'} onPosition={value => { if (Math.abs(value - (attempt.audioPosition || 0)) >= 3) update({ audioPosition: value }); }} />}
      <div className="exam-layout-controls" role="group" aria-label="Question layout"><button className="icon-button" type="button" aria-label="Integrated view" title="Integrated view" aria-pressed={layout === 'integrated'} onClick={() => chooseLayout('integrated')}><Rows3 size={18} /></button><button className="icon-button" type="button" aria-label="Split view" title="Split view" aria-pressed={layout === 'split'} onClick={() => chooseLayout('split')}><Columns2 size={18} /></button></div>
      {layoutError && <p className="exam-source-foot">{layoutError}</p>}
      <div className="exam-mobile-tabs" role="group" aria-label="Practice panels">{[...(skill === 'reading' ? ['source'] : []), 'questions', ...(layout === 'split' ? ['answers'] : [])].map(tab => <button key={tab} aria-pressed={mobileTab === tab} aria-controls={`exam-panel-${tab}`} onClick={() => setMobileTab(tab)}>{tab === 'source' ? 'Passage' : tab === 'answers' ? 'Answers' : layout === 'integrated' ? 'Questions & answers' : 'Questions'}</button>)}</div>
      <SourceAnnotations key={`${skill}:${activeSection?.id}`} sourceId={activeSection?.id || ''} skill={skill} mock={mode === 'mock'} disabled={disabled} questions={currentQuestions} focusedQuestion={focusedQuestion} onQuestionChange={setFocusedQuestion} onVocabulary={captureVocabulary} onRevealBlock={blockId => setMobileTab(blockId.startsWith('passage:') ? 'source' : 'questions')} onEvidence={(id, quote) => { if (attempt) update({ evidence: { ...attempt.evidence, [id]: quote } }); }}>
        <div className={`exam-split exam-layout-${layout}${skill === 'listening' && layout === 'integrated' ? ' exam-single-panel' : ''}${skill === 'reading' && layout === 'split' ? ' exam-three-panels' : ''}`}>
          {skill === 'reading' && <div id="exam-panel-source" ref={sourcePanel} onScroll={event => setSourceScroll(event.currentTarget.scrollTop)} className={`exam-source-panel ${mobileTab === 'source' ? 'mobile-active' : ''}`}><span className="exam-eyebrow">Passage {activeSection?.part}</span><h3>{activeSection?.title}</h3>{passages.map(passage => <ReadingPassage key={passage.id} passage={passage} />)}</div>}
          <div id="exam-panel-questions" className={`exam-question-panel ${mobileTab === 'questions' ? 'mobile-active' : ''}`}>
            {layout === 'integrated' ? <>{questionNavigation}{renderIntegratedQuestions()}</> : <><h3 className="exam-panel-title">Questions</h3>{currentQuestions.map(renderQuestionMaterial)}</>}
            {catalog.assets.filter(asset => asset.kind === 'image' && asset.sectionId === activeSection?.id && !embeddedAssetIds.has(asset.id) && !questions.some(question => question.assetId === asset.id)).map(asset => <ExamImage key={asset.id} asset={asset} label="Source illustration" />)}
          </div>
          {layout === 'split' && <div id="exam-panel-answers" className={`exam-question-panel exam-answer-panel ${mobileTab === 'answers' ? 'mobile-active' : ''}`}><h3 className="exam-panel-title">Answers</h3>{questionNavigation}{currentQuestions.map((question, index) => renderAnswer(question, index))}</div>}
        </div>
      </SourceAnnotations>
      <footer className="exam-submit"><span className="exam-submit-progress" role="status">{answered} / {answerSlots} answered</span><p>Submit this session to check answers and locate source evidence.</p><button className="btn primary" disabled={controller.saving} onClick={requestSubmit}><Send size={15} />{controller.saving ? 'Saving…' : attempt?.status === 'completed' ? 'Retry submission' : 'Submit answers'}</button></footer>
    </>}
    {sessionDialog}
    <ModalFrame open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit with unanswered questions?" header="Check before submitting" description={`${answerSlots - answered} answer${answerSlots - answered === 1 ? '' : 's'} still missing. Missing answers receive no marks; your current selections are kept.`} footer={<><button className="btn line" onClick={goToUnanswered}>Return to unanswered</button><button className="btn primary" disabled={controller.saving} onClick={() => { setConfirmSubmit(false); void controller.submit(); }}>Submit anyway</button></>}><p>Unanswered: {unanswered.map(question => `${questionNumberLabel(question)}${questionSlotCount(question) > 1 ? ` (${questionSlotCount(question) - questionAnsweredSlots(question, attempt?.responses[question.id])} more selection${questionSlotCount(question) - questionAnsweredSlots(question, attempt?.responses[question.id]) === 1 ? '' : 's'} needed)` : ''}`).join(', ')}</p></ModalFrame>
    <ModalFrame open={Boolean(mapPreview && mapPreview.sectionId === activeSection?.id)} onClose={() => { setMapPreview(null); requestAnimationFrame(() => mapTrigger.current?.focus({ preventScroll: true })); }} title="Map reference" header={mapPreview ? `Question ${mapPreview.number}` : undefined} description="Check the source map, then close it to continue your answer." size="lg"><ExamStimulus html={mapPreview?.stimulusHtml || ''} assets={catalog.assets} blockPrefix="map-preview" /></ModalFrame>
  </section>;
}
