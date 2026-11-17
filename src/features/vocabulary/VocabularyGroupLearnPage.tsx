import { useVocabularySearchParams } from './vocabularyNavigation';
import { boundVocabularyAssessment, vocabularyLearningPlan } from '../../domain/vocabulary/plannedAssessment';
import { normalizeVocabularyScope } from '../../domain/vocabulary/identities';
import { PageLoadingState, StateMessage } from '../../components/AsyncState';
import { VocabularyLearningVisual } from './VocabularyLearningVisual';
import { VocabularyLearningAssessment } from './VocabularyLearningAssessment';
import { VocabularyLearningCard } from './VocabularyLearningCard';
import { VocabularyLink as Link, VocabularyBackLink } from './VocabularyRouteLink';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams, } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, List, Square } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../domain/vocabulary/context';
import { catalogVocabularyEntry, hasVocabularySenseEdits, learningTask } from '../../domain/vocabulary/content';
import { vocabularySensePresentation } from '../../domain/vocabulary/dictionaryPresentation';
import { getVocabularyVisualPresentation } from '../../domain/vocabulary/visualPresentation';
import { VocabularyMeaningNotes } from './VocabularyMeaningNotes';
import { hasVocabularyReadinessNotes } from '../../domain/vocabulary/readiness';
import { getVocabularyMastery } from '../../domain/vocabulary/mastery';
import { getLearnedVocabularyIds, vocabularyGroupProgress } from '../../domain/vocabulary/progress';
import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';
import { availableUnitPracticeModes } from '../../domain/vocabulary/selection';
import { buildLearningBatch, learningBatchParams } from '../../domain/vocabulary/learningBatch';
import { previewLearningMeaningUpdate, updateLearningPlanMeanings } from '../../domain/vocabulary/learningMeaningUpdate';
import { readVocabularyDraft } from '../../storage/vocabularyDrafts';
import { vocabularySessionDrafts } from '../../storage/vocabularySessionDrafts';
import type { VocabularyStore } from '../../domain/vocabulary/types';
import { VocabularyNavigation } from './VocabularyPages';
import { Pronunciation } from './Pronunciation';
import { entryUrl, practiceUrl, groupPath, groupWords, rememberVocabularyPosition, useVocabularyCatalog, useVocabularyPosition } from './vocabularyNavigation';
import { acquireVocabularyLearningSync, vocabularyLearningPendingKey } from './vocabularyLearningSync';
import '../../styles/vocabulary-workbench.css';
import '../../styles/vocabulary-learning.css';
import { formatDate } from '../../lib/format';

/** Browsing progress is deliberately separate from review evidence and assessment completion. */
export function VocabularyGroupLearnPage() {
  const fb = useFieldbook();
  const state = fb.state as unknown as VocabularyStore & { settings?: { vocabulary?: unknown } };
  const { bookId = '', unitId = '' } = normalizeVocabularyScope(useParams());
  const owner = accountId();
  const location = useLocation();
  const [params, setParams] = useVocabularySearchParams();
  const latestParams = useRef(params); latestParams.current = params;
  const planId = params.get('planId');
  const requestedPlan = vocabularyLearningPlan(fb.state, planId) || boundVocabularyAssessment(fb.state, planId);
  const boundPlan = requestedPlan?.target.bookId === bookId && requestedPlan.target.unitId === unitId ? requestedPlan : undefined;
  const exactCards=boundPlan?.target.mode==='learning-batch'&&boundPlan.target.selectionPolicy==='exact'?boundPlan.target.cards:undefined;
  const preferences = normalizeVocabularyPreferences(state.settings?.vocabulary);
  const requestedSize = Number(boundPlan?.target.batchSize ?? params.get('batchSize'));
  const BATCH_SIZE = exactCards?.length || (Number.isSafeInteger(requestedSize) && requestedSize >= 1 && requestedSize <= 50 ? requestedSize : preferences.learningBatchSize);
  const { status: catalogStatus, retry: retryCatalog } = useVocabularyCatalog(fb.loadVocabularyCatalog, bookId, unitId);
  const knownPlan = (fb.state.plans as {id:string}[] | undefined)?.some(plan => plan.id === planId);
  const planReadKey = JSON.stringify([owner, planId]);
  const [planRead, setPlanRead] = useState<{key:string;status:'ready'|'error'}>();
  const [planRetry, setPlanRetry] = useState(0);
  useEffect(() => {
    if (!planId || knownPlan) return;
    let active = true;
    // Completed tasks are paged out of the initial account load. Restore the
    // requested row before showing cards, including after a refresh or new tab.
    Promise.resolve().then(() => fb.ensurePlanningRows?.([planId])).then(() => {
      if (active) setPlanRead({key:planReadKey,status:'ready'});
    }).catch(() => { if (active) setPlanRead({key:planReadKey,status:'error'}); });
    return () => { active = false; };
  }, [planId, knownPlan, planReadKey, planRetry, fb.ensurePlanningRows]);
  const planLoading = Boolean(planId && !knownPlan && planRead?.key !== planReadKey);
  const planUnavailable = Boolean(planId && !planLoading && !boundPlan);
  const status = planLoading ? 'loading' : planUnavailable ? 'error' : catalogStatus;
  const retry = () => { setPlanRead(undefined); setPlanRetry(value => value + 1); retryCatalog(); };
  const book = VOCABULARY_CATALOG.books.find(row => row.id === bookId);
  const unit = VOCABULARY_CATALOG.units.find(row => row.bookId === bookId && row.id === unitId);
  const isGroup = unit && unit.kind !== 'chapter' && !VOCABULARY_CATALOG.units.some(row => row.bookId === bookId && row.parentId === unitId);
  const selectedIds=useMemo(()=>{try{const ids=JSON.parse(params.get('selectedEntryIds')||'null');return Array.isArray(ids)&&ids.length>0&&ids.length<=50&&ids.every(id=>typeof id==='string')?ids as string[]:null;}catch{return null;}},[params.get('selectedEntryIds')]);
  const sourceWords = useMemo(() => groupWords(state, bookId, unitId).flatMap(row => row.entry && !row.entry.tags.includes('archived') ? [{ ...row, entry: row.entry, resolved: resolveVocabularyLearningContext(row.entry, { bookId, unitId }) }] : []), [state, bookId, unitId, status, fb.vocabularyCatalogRevision]);
  const words = useMemo(() => exactCards ? exactCards.flatMap(ref=>{const row=sourceWords.find(row=>row.entry.id===ref.entryId);return row?[row]:[];}) : sourceWords.filter(row=>!selectedIds||selectedIds.includes(row.entry.id)), [sourceWords, exactCards, selectedIds]);
  const wordIds = words.map(row => row.entry.id);
  const idsKey = wordIds.join('\n');
  const batchScope = JSON.stringify([owner, bookId, unitId, BATCH_SIZE, idsKey]);
  const key = vocabularyLearningPendingKey(owner, bookId, unitId);
  const [currentId, setCurrentId] = useState<string>();
  const [viewed, setViewed] = useState<string[]>([]);
  const [recallFirst, setRecallFirst] = useState(false);
  const layout = params.get('layout') === 'list' ? 'list' : 'cards';
  const [revealedKey, setRevealedKey] = useState('');
  const viewedRef = useRef<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'failed'>('idle');
  const [savedOnDevice, setSavedOnDevice] = useState(true);
  const sync = useRef<ReturnType<typeof acquireVocabularyLearningSync> | undefined>(undefined);
  const saveLearning = useRef(fb.saveVocabularyLearning);
  saveLearning.current = (bookId, unitId, learning) => fb.saveVocabularyLearning(bookId, unitId, learning, { onError: () => {} });
  const mounted = useRef(true);
  const initialized = useRef('');
  const previousOwner = useRef(owner);
  const accountPositionReset = useRef(false);
  const frozenBatches = useRef(new Map<string, {entryId:string;senseId:string}[]>());
  const [keepTaskMeanings, setKeepTaskMeanings] = useState('');
  const [meaningUpdateStatus, setMeaningUpdateStatus] = useState<{key:string;busy?:boolean;error?:string}>();
  const updatingMeanings = useRef(false);
  const meaningUpdateKey = JSON.stringify([owner, planId]);
  const currentMeaningUpdateKey = useRef(meaningUpdateKey); currentMeaningUpdateKey.current = meaningUpdateKey;
  const batchNavigation = useRef<HTMLDivElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // The ready card must have its queue and restored progress before accepting input.
  useLayoutEffect(() => {
    if (status !== 'ready') return;
    const queue = acquireVocabularyLearningSync({ owner, bookId, unitId, currentOwner:accountId, save:learning => saveLearning.current(bookId, unitId, learning) });
    sync.current = queue;
    const release = queue.subscribe(snapshot => { setSaveStatus(snapshot.status); setSavedOnDevice(snapshot.savedOnDevice); });
    const hidden = () => { if (document.visibilityState === 'hidden') queue.flush(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', queue.flush);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', queue.flush);
      if (sync.current === queue) sync.current = undefined;
      release();
    };
  }, [key, status]);
  useLayoutEffect(() => {
    if (status !== 'ready') return;
    const identity = `${key}:${idsKey}`;
    if (initialized.current === identity) return;
    initialized.current = identity;
    const saved = state.wordbookProgress.find(row => row.bookId === bookId && row.unitId === unitId)?.learning;
    const unsaved = sync.current?.snapshot().pending;
    const learning = unsaved || saved;
    const validIds = learning?.viewedEntryIds.filter(id => wordIds.includes(id)) || [];
    const accountChanged = previousOwner.current !== owner;
    previousOwner.current = owner;
    if (accountChanged) {
      accountPositionReset.current = true;
      const next = new URLSearchParams(params); next.delete('word'); setParams(next, { replace:true, state: location.state });
    }
    const requested = accountChanged ? null : params.get('word');
    const requestedBatch = exactCards ? null : params.has('batch') ? Number(params.get('batch')) : null;
    const batchStart = requestedBatch !== null && Number.isSafeInteger(requestedBatch) && requestedBatch >= 0 ? wordIds[requestedBatch * BATCH_SIZE] : undefined;
    const position = requested && wordIds.includes(requested) ? requested : batchStart || (learning?.currentEntryId && wordIds.includes(learning.currentEntryId) ? learning.currentEntryId : wordIds[0]);
    setCurrentId(position); setViewed(validIds); viewedRef.current = validIds;
  }, [key, idsKey, status, state, bookId, unitId, params]);
  useEffect(() => {
    const requested = params.get('word');
    if (accountPositionReset.current) { if (!requested) accountPositionReset.current = false; return; }
    if (requested && wordIds.includes(requested)) setCurrentId(requested);
  }, [params, idsKey]);

  const position = Math.max(0, words.findIndex(row => row.entry.id === currentId));
  const word = words[position];
  const batch = exactCards ? 0 : boundPlan?.target.batchIndex ?? Math.floor(position / BATCH_SIZE);
  const batches = Math.ceil(words.length / BATCH_SIZE);
  useLayoutEffect(() => {
    const navigation = batchNavigation.current;
    const selected = navigation?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!navigation || !selected) return;
    const bounds = navigation.getBoundingClientRect(), target = selected.getBoundingClientRect();
    if (target.right > bounds.right) navigation.scrollLeft += target.right - bounds.right + 4;
    else if (target.left < bounds.left) navigation.scrollLeft -= bounds.left - target.left + 4;
  }, [status, batch, batches, BATCH_SIZE]);
  const originParams = new URLSearchParams(params);
  originParams.set('word', word?.entry.id || '');
  const origin = `${location.pathname}?${originParams}`;
  useVocabularyPosition(origin, status === 'ready' && Boolean(word));
  const assessedIds = getLearnedVocabularyIds({ ...state, vocabularyStates: [] });
  const progress = unit ? vocabularyGroupProgress(state, { ...unit, studyEntryIds: sourceWords.map(row=>row.entry.id) }, assessedIds) : 'Not started';
  const assessedAt = useMemo(() => (state.vocabularySessions || [])
    .filter(session => session.status === 'submitted' && session.mode !== 'audio' && session.submittedAt
      && ((session.selection && 'bookId' in session.selection ? session.selection.bookId === bookId && session.selection.unitId === unitId : session.filter?.bookId === bookId && session.filter?.unitId === unitId)))
    .map(session => session.submittedAt!).filter(value => Number.isFinite(Date.parse(value))).sort().at(-1), [state.vocabularySessions, bookId, unitId]);
  const completedTask = exactCards && (fb.state.plans as {id:string;status:string}[] | undefined)?.some(plan => plan.id === planId && plan.status === 'completed');
  const assessmentStatus = completedTask ? 'Task assessment complete' : progress === 'Studied' ? assessedAt ? `Assessed ${formatDate(assessedAt, false)}` : 'Assessed' : progress === 'In progress' ? 'Assessment in progress' : 'Not assessed yet';
  // Mastered counts the effective status, so a word you marked mastered counts here as it does on the word list.
  const mastery = useMemo(() => words.map(row => getVocabularyMastery(state, row.entry.id, row.resolved.sense?.id)), [state, words]);
  const mastered = mastery.filter(row => row.effective === 'mastered').length;
  const masteredByYou = mastery.filter(row => row.effective === 'mastered' && row.manual).length;
  const assessments = useMemo(() => {
    return status === 'ready' ? availableUnitPracticeModes(state,bookId,unitId).filter(item=>item.value!=='audio') : [];
  }, [state, bookId, unitId, status]);
  const assessmentUrl = (mode: string) => `/vocabulary/study?${new URLSearchParams({ bookId, unitId, dueOnly:'false', mode, returnTo:origin })}`;
  const currentBatch = useMemo(() => {
    if (status !== 'ready' || !words.length) return null;
    try {
      const identity = `${batchScope}:${batch}`;
      let frozen: {entryId:string;senseId:string}[] = boundPlan ? boundPlan.target.cards : params.get('batchCards') && Number(params.get('batch')) === batch ? JSON.parse(params.get('batchCards')!) : frozenBatches.current.get(identity) || words.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE).map(row => ({ entryId: row.entry.id, senseId: row.resolved.sense?.id || '' }));
      // A direct meaning link must teach and assess the same sense, just like
      // choosing a meaning with the buttons. Assigned plans keep their scope.
      const requestedSense = !boundPlan && params.get('sense');
      if (requestedSense && word) {
        const displayed = resolveVocabularyLearningContext(word.entry, { bookId, unitId, senseId: requestedSense }).sense;
        if (displayed) frozen = frozen.map(ref => ref.entryId === word.entry.id ? { ...ref, senseId: displayed.id } : ref);
      }
      frozenBatches.current.set(identity, frozen);
      return buildLearningBatch(state, bookId, unitId, boundPlan?.target.batchIndex ?? batch, boundPlan?.target.batchSize ?? BATCH_SIZE, boundPlan?.target?.assessmentMode || preferences.mode, frozen);
    } catch { return null; }
  }, [state, bookId, unitId, batch, BATCH_SIZE, batchScope, preferences.mode, status, words.length, word?.entry.id, params.toString(), boundPlan]);
  const boundBatch = Boolean(boundVocabularyAssessment(fb.state, planId) && boundPlan && currentBatch && currentBatch.mode === boundPlan.target.assessmentMode && JSON.stringify(currentBatch.selection.cards) === JSON.stringify(boundPlan.target.cards));
  const meaningUpdate = useMemo(() => {
    if (!boundBatch || !currentBatch || completedTask || state.vocabularySessions?.some(session => session.planId === planId) || (fb.state.plans as any[])?.find(plan => plan.id === planId)?.target?.selectedMeanings?.length) return;
    try { return previewLearningMeaningUpdate(state, currentBatch.selection, currentBatch.mode); } catch { return; }
  }, [state, boundBatch, currentBatch, completedTask, planId]);
  const previewingMeanings = Boolean(meaningUpdate && keepTaskMeanings !== meaningUpdateKey);
  const meaningUpdateBusy = meaningUpdateStatus?.key === meaningUpdateKey && meaningUpdateStatus.busy;
  const meaningUpdateError = meaningUpdateStatus?.key === meaningUpdateKey ? meaningUpdateStatus.error : '';
  async function updateBatchMeanings() {
    if (!owner || owner !== accountId() || !planId || !meaningUpdate || updatingMeanings.current) return;
    updatingMeanings.current = true;
    setMeaningUpdateStatus({key:meaningUpdateKey,busy:true});
    const expected = structuredClone((fb.state.plans as any[])?.find(plan => plan.id === planId)?.target);
    let updated: ReturnType<typeof updateLearningPlanMeanings> | undefined;
    try {
      const drafts = await vocabularySessionDrafts.list(owner);
      const legacy = readVocabularyDraft(owner);
      if (!mounted.current || owner !== accountId() || currentMeaningUpdateKey.current !== meaningUpdateKey) return;
      if ([legacy, ...drafts.map(row => row.session)].some(session => session?.planId === planId && session.status !== 'submitted')) throw new Error('Finish or discard this task’s saved assessment before updating its meanings. You can keep the original meanings to resume it.');
      let feedback = '';
      const saved = await fb.mutatePlans((draft: typeof fb.state) => {
        if (owner !== accountId()) throw new Error('Your account changed. Reload this task.');
        updated = updateLearningPlanMeanings(draft, planId, expected, new Date().toISOString());
      }, {onError:(message:string) => { feedback = message; }});
      if (!mounted.current || owner !== accountId() || currentMeaningUpdateKey.current !== meaningUpdateKey) return;
      if (!saved || !updated) throw new Error(feedback || 'Could not update this batch. Your original task is kept; retry.');
      const next = new URLSearchParams(latestParams.current); next.set('batchCards', JSON.stringify(updated.batch.selection.cards)); next.delete('sense');
      setParams(next, {replace:true,state:location.state});
      setMeaningUpdateStatus(undefined);
    } catch (cause) {
      if (mounted.current && owner === accountId() && currentMeaningUpdateKey.current === meaningUpdateKey) setMeaningUpdateStatus({key:meaningUpdateKey,error:cause instanceof Error ? cause.message : 'Could not update this batch. Retry.'});
    } finally { updatingMeanings.current = false; }
  }
  const batchAssessmentUrl = (mode = currentBatch?.mode) => {
    if (!currentBatch || !mode) return '#';
    const next = learningBatchParams(currentBatch.selection);
    next.set('mode', mode); next.set('returnTo', origin);
    if (boundBatch && mode === boundPlan!.target.assessmentMode) next.set('planId', boundPlan!.id);
    return `/vocabulary/study?${next}`;
  };
  const batchEnd = Math.min((batch + 1) * BATCH_SIZE - 1, words.length - 1);
  const batchWords = words.slice(batch * BATCH_SIZE, batchEnd + 1);
  const viewedSet = new Set(viewed);
  const batchViewed = batchWords.filter(row => viewedSet.has(row.entry.id)).length;
  const batchComplete = batchWords.length > 0 && batchViewed === batchWords.length;
  const firstUnviewedIndex = words.findIndex((row, index) => index >= batch * BATCH_SIZE && index <= batchEnd && !viewedSet.has(row.entry.id));

  function navigateTo(index: number, markViewed = false) {
    if (owner !== accountId() || !word || !words[index]) return;
    const nextViewed = [...new Set([...viewedRef.current, ...(markViewed ? [word.entry.id] : [])])];
    const nextId = words[index].entry.id;
    if (nextId === word.entry.id && nextViewed.length === viewedRef.current.length) return;
    viewedRef.current = nextViewed;
    setViewed(nextViewed); setCurrentId(nextId);
    if (nextId !== word.entry.id) setRevealedKey('');
    const next = new URLSearchParams(params); next.set('word', nextId); if(nextId!==word.entry.id) next.delete('sense');
    const nextBatch = Math.floor(index / BATCH_SIZE);
    const nextRefs = exactCards || frozenBatches.current.get(`${batchScope}:${nextBatch}`) || words.slice(nextBatch * BATCH_SIZE, (nextBatch + 1) * BATCH_SIZE).map(row => ({entryId:row.entry.id,senseId:row.resolved.sense?.id || ''}));
    next.set('batch', String(exactCards ? boundPlan!.target.batchIndex : nextBatch)); next.set('batchSize', String(exactCards ? boundPlan!.target.batchSize : BATCH_SIZE)); next.set('batchCards', JSON.stringify(nextRefs));
    if (nextBatch !== batch && !exactCards) next.delete('planId');
    setParams(next, { replace:true, state: location.state });
    requestAnimationFrame(() => { if (mounted.current && owner === accountId()) document.getElementById('learning-word')?.focus({ preventScroll:true }); });
    const savedLearning = sync.current?.snapshot().pending || state.wordbookProgress.find(row => row.bookId === bookId && row.unitId === unitId)?.learning;
    // The display may be an exact task subset. Keep the group's other viewed
    // words when saving its position; a subset visit must not erase progress.
    const allViewed = [...new Set([...(savedLearning?.viewedEntryIds || []), ...nextViewed])];
    sync.current?.update({ viewedEntryIds:allViewed, currentEntryId:nextId, updatedAt:new Date().toISOString() }, markViewed ? 800 : 2500);
  }

  const batchSenseId=(boundPlan?.target.cards || currentBatch?.selection.cards)?.find(ref=>ref.entryId===word?.entry.id)?.senseId;
  const selectedSenseId = previewingMeanings ? meaningUpdate!.batch.selection.cards.find(ref => ref.entryId === word?.entry.id)?.senseId : boundPlan ? batchSenseId : params.get('sense') || batchSenseId;
  // Older tasks can retain a dictionary meaning outside today's teaching choices.
  const activeResolved = word && selectedSenseId ? resolveVocabularyLearningContext(word.entry, { bookId, unitId, senseId: selectedSenseId }) : word?.resolved;
  const selectedSense = activeResolved?.sense;
  const learningCardKey = `${owner}:${bookId}:${unitId}:${word?.entry.id}:${selectedSense?.id}`;
  const meaningVisible = layout === 'list' || !recallFirst || revealedKey === learningCardKey;
  const listRegion = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const region=listRegion.current;
    const selected=region?.querySelector<HTMLElement>('li[aria-current="true"]');
    if(!region||!selected)return;
    const bounds=region.getBoundingClientRect(),row=selected.getBoundingClientRect();
    // Move only the word list; selecting a word must not scroll the whole page.
    if(row.top<bounds.top+12)region.scrollTop+=row.top-bounds.top-12;
    else if(row.bottom>bounds.bottom-12)region.scrollTop+=row.bottom-bounds.bottom+12;
  },[word?.entry.id,layout]);
  useLayoutEffect(() => { setRevealedKey(''); }, [learningCardKey]);
  const visualPresentation = activeResolved ? getVocabularyVisualPresentation(activeResolved) : 'none';
  const hasVisual = visualPresentation === 'inline';
  const presentation = selectedSense ? vocabularySensePresentation(selectedSense) : undefined;
  const publicEntry = word ? catalogVocabularyEntry(word.entry.id) : undefined;
  const publicSense = publicEntry && selectedSense ? resolveVocabularyLearningContext(publicEntry, { bookId, unitId, senseId:selectedSense.id }).sense : undefined;
  const reviewedNotes = Boolean(word && selectedSense && hasVocabularyReadinessNotes(word.entry.id, selectedSense));
  const groupTeachingNotes = Boolean(activeResolved?.curriculumCurrent && activeResolved.contentReviewed);
  const distinctionTask = word && selectedSense ? learningTask(word.entry, selectedSense, 'distinction') : undefined;
  const reliableCollocations = reviewedNotes || activeResolved?.contentReviewed || selectedSense?.source === 'Personal note' || Boolean(state.vocabulary.some(entry=>entry.id===word?.entry.id) && publicSense && selectedSense && hasVocabularySenseEdits(selectedSense,[publicSense]));
  const meaningSource = selectedSense?.source === 'Personal note'
    ? 'Your personal notes.'
    : activeResolved?.curriculumCurrent
      ? activeResolved.curriculum?.basis === 'theme'
        ? `Recommended for the ${activeResolved.curriculum.title.split(' · ')[0]} topic.`
        : activeResolved.curriculum?.basis === 'source'
          ? 'Selected from the listening passage context.'
          : 'Selected for general vocabulary study.'
      : activeResolved?.reviewed
        ? 'Checked against the source context.'
        : 'Dictionary meaning for general study. Group context has not been checked.';
  return <section className="view active vocabulary-view vocabulary-workbench vocabulary-learning">
    <VocabularyNavigation />
    <VocabularyBackLink fallback={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}#group-${encodeURIComponent(unitId)}`}/>
    {status === 'loading' ? <PageLoadingState message={planLoading?'Restoring your learning batch…':'Loading group words…'} onRetry={retry} retryLabel="Retry group" /> : status === 'error' ? <StateMessage kind="error" message={planUnavailable?'This learning task could not be restored. Retry to load its saved words.':'Group words could not be loaded.'} onRetry={retry} retryLabel="Retry group" /> : !book || !isGroup ? <StateMessage kind="error" message="This wordbook group is unavailable." /> : <>
      <header className="vocabulary-learning-heading">
        <p className="vocabulary-group-path">{groupPath(bookId, unitId)}</p>
        <div className="page-tools"><h2>Learn {unit.title}</h2>{!words.length ? <Link className="btn line" to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}/groups/${encodeURIComponent(unitId)}/words`}>View group words</Link> : null}</div>
        <p>Listen, learn, then test your recall.</p>
        <div className="vocabulary-group-learning-progress" aria-label="Group progress"><span>Viewed {viewed.length} / {words.length}</span><span>Mastered {mastered} / {words.length}{masteredByYou ? ` · ${masteredByYou} set by you` : ''}</span><span>{assessmentStatus}</span></div>
      </header>
      {!word ? <p>No active words are available in this group.</p> : <div className="vocabulary-learning-workspace">
        <div className="vocabulary-learning-batches"><span>Batch {batch+1} of {batches} · Words {batch*BATCH_SIZE+1}–{Math.min((batch+1)*BATCH_SIZE,words.length)}</span>{batches>1&&<div ref={batchNavigation} role="group" aria-label="Learning batches">{Array.from({length:batches},(_,i)=><button key={i} className="btn line" aria-label={`Batch ${i+1}: words ${i*BATCH_SIZE+1}–${Math.min((i+1)*BATCH_SIZE,words.length)}`} aria-current={batch===i?'true':undefined} onClick={()=>{if(batch!==i)navigateTo(i*BATCH_SIZE);}}>{i+1}</button>)}</div>}</div>
        {meaningUpdate && <aside className="vocabulary-learning-update" aria-label="Batch meaning update">
          <p id="batch-meaning-update">{previewingMeanings ? `Previewing current group meanings for this ${currentBatch!.cards.length}-word task.` : 'Using the original task meanings.'}</p>
          <div><button className="btn primary" disabled={meaningUpdateBusy} onClick={() => void updateBatchMeanings()}>{meaningUpdateBusy ? 'Updating batch…' : 'Update batch meanings'}</button><button className="btn text" disabled={meaningUpdateBusy} onClick={() => setKeepTaskMeanings(previewingMeanings ? meaningUpdateKey : '')}>{previewingMeanings ? 'Use original task meanings' : 'Preview group meanings'}</button></div>
          {meaningUpdateError && <p role="alert">{meaningUpdateError}</p>}
        </aside>}
        <div className="vocabulary-learning-view-options" role="group" aria-label="Learning layout">
          <button type="button" className="btn line" aria-pressed={layout==='cards'} onClick={()=>{const next=new URLSearchParams(params);next.delete('layout');setParams(next,{replace:true,state:location.state});}}><Square size={15} aria-hidden="true"/>Cards</button>
          <button type="button" className="btn line" aria-pressed={layout==='list'} onClick={()=>{const next=new URLSearchParams(params);next.set('layout','list');setParams(next,{replace:true,state:location.state});}}><List size={15} aria-hidden="true"/>List</button>
        </div>
        <div className="vocabulary-learning-stage">
        {layout==='list' ? <div ref={listRegion} className="vocabulary-learning-list" role="region" aria-label="Batch word list" tabIndex={0}><ol role="list">{batchWords.map((row,offset)=>{
          const senseId=(previewingMeanings?meaningUpdate!.batch.selection.cards:currentBatch?.selection.cards)?.find(ref=>ref.entryId===row.entry.id)?.senseId;
          const resolved=resolveVocabularyLearningContext(row.entry,{bookId,unitId,...(senseId?{senseId}:{})});
          const content=resolved.sense?vocabularySensePresentation(resolved.sense):undefined;
          return <li key={row.entry.id} aria-current={row.entry.id===word.entry.id?'true':undefined}>
            <button type="button" className="vocabulary-learning-list-word" onClick={()=>navigateTo(batch*BATCH_SIZE+offset)}><span>{batch*BATCH_SIZE+offset+1}</span><strong>{row.entry.term}</strong>{viewedSet.has(row.entry.id)?<Check size={15} aria-label="Viewed"/>:null}</button>
            <p>{content?.definition||'Selected meaning unavailable'}</p>
            {row.entry.id===word.entry.id?<div className="vocabulary-learning-list-actions"><Pronunciation entry={row.entry} sense={resolved.sense||null} accent={preferences.accent} compact/><button type="button" className="btn text" onClick={()=>{const next=new URLSearchParams(params);next.delete('layout');setParams(next,{replace:true,state:location.state});}}>Open card<ArrowRight size={14} aria-hidden="true"/></button></div>:null}
          </li>;
        })}</ol></div> : <VocabularyLearningCard cardKey={learningCardKey} position={position}>
          <div className="page-tools"><span className="vocabulary-muted">Word {position+1} of {words.length}</span>{viewed.includes(word.entry.id)?<span className="pill"><Check size={13}/>Viewed</span>:null}</div>
          <div className="vocabulary-learning-mode" role="group" aria-label="Learning style">
            <button className="btn line" aria-pressed={!recallFirst} onClick={() => { setRecallFirst(false); setRevealedKey(''); }}>Read first</button>
            <button className="btn line" aria-pressed={recallFirst} onClick={() => { setRecallFirst(true); setRevealedKey(''); }}>Recall first</button>
          </div>
          <h3 id="learning-word" tabIndex={-1}>{word.entry.term}</h3>
          <Pronunciation entry={word.entry} sense={selectedSense || null} accent={preferences.accent}/>
          {word.resolved.curriculum && word.resolved.curriculum.senses.length>1 ? <section className="vocabulary-learning-meaning-picker" aria-label="Meanings to learn"><p>{boundPlan?'This task uses the selected meaning. Other meanings keep their own review progress.':'Choose the meaning to study. Each meaning keeps its own review progress.'}</p><div className="vocabulary-learning-meanings">{word.resolved.curriculum.senses.map((sense,i)=><button className="btn line" key={sense.id} aria-pressed={selectedSense?.id===sense.id} disabled={Boolean(params.get('planId'))} onClick={()=>{const next=new URLSearchParams(params);next.set('sense',sense.id);if(currentBatch)next.set('batchCards',JSON.stringify(currentBatch.selection.cards.map(ref=>ref.entryId===word.entry.id?{...ref,senseId:sense.id}:ref)));setParams(next,{replace:true, state: location.state});}}><span className="vocabulary-learning-meaning-label">Meaning {i+1} · {sense.pos}{selectedSense?.id===sense.id?<Check size={14} aria-label="Selected"/>:null}</span>{meaningVisible?<span className="vocabulary-learning-meaning-preview">{vocabularySensePresentation(sense).definition}</span>:null}</button>)}</div></section> : null}
          {!meaningVisible ? <div className="vocabulary-learning-reveal"><p>Recall the meaning and think of a sentence before checking.</p><button className="btn primary" aria-controls="learning-meaning" onClick={() => { setRevealedKey(learningCardKey); requestAnimationFrame(() => document.getElementById('learning-meaning')?.focus({ preventScroll:true })); }}>Reveal meaning<ArrowRight size={15}/></button></div> : null}
          {meaningVisible ? <div id="learning-meaning" tabIndex={-1} className={`vocabulary-learning-content${hasVisual ? ' has-visual' : ''}`}><div className="vocabulary-learning-copy"><div className="vocabulary-learning-primary"><div className="vocabulary-learning-definition"><small>{selectedSense?.pos || 'Meaning'}</small>{presentation?.definition ? <p>{presentation.definition}</p> : <StateMessage kind="error" message="This selected meaning could not be loaded. Retry to restore this batch." onRetry={retry} retryLabel="Retry meaning" />}</div>

          {presentation?.example ? <div className="vocabulary-learning-example"><h4>Example</h4><p>{presentation.example}</p></div> : null}
          {hasVisual && activeResolved ? <VocabularyLearningVisual resolved={activeResolved} /> : null}
          </div><div className="vocabulary-learning-secondary">
          {reliableCollocations && selectedSense?.collocations?.length ? <div className="vocabulary-learning-collocations"><h4>Common combinations</h4><ul>{selectedSense.collocations.map(item=><li key={item}>{item}</li>)}</ul></div> : null}
          {distinctionTask ? <div className="vocabulary-learning-selected-practice"><Link className="btn line" to={practiceUrl(word.entry.id,selectedSense?.id,{bookId,unitId},origin,'distinction')}>Practise word distinctions<ArrowRight size={14}/></Link><p className="vocabulary-muted">Choose the meaning or construction that fits the context, then check the explanation.</p></div> : null}
          {visualPresentation === 'supplementary' && activeResolved ? <VocabularyLearningVisual resolved={activeResolved} /> : null}
          {word.resolved.curriculum?.basis==='multiple' ? <div className="vocabulary-learning-selected-practice"><Link className="btn line" to={practiceUrl(word.entry.id,selectedSense?.id,{bookId,unitId},origin,'definition')}>Practise this meaning<ArrowRight size={14}/></Link><p className="vocabulary-muted">This checks the selected meaning and keeps its own review progress. The whole-group assessment uses the first learning meaning for each word.</p></div> : null}
          </div><footer className="vocabulary-learning-reference">
          {selectedSense ? <VocabularyMeaningNotes entryId={word.entry.id} sense={selectedSense} showDistinctions={reviewedNotes || groupTeachingNotes} expanded={Boolean(distinctionTask && (reviewedNotes || groupTeachingNotes))} /> : null}
          <details className="vocabulary-learning-provenance" key={`${word.entry.id}:${selectedSense?.id}`}><summary>Meaning source</summary><p>{meaningSource} See Word details for references and other meanings.</p></details>
          <div className="vocabulary-learning-reference-actions">
          <Link className="btn text" to={entryUrl(word.entry.id,{bookId,unitId,senseId:selectedSense?.id},origin)} onClick={()=>rememberVocabularyPosition(origin,'learning-word')}>Word details<ArrowRight size={14}/></Link>
          </div></footer></div></div> : null}
        </VocabularyLearningCard>}
        <div className={`vocabulary-learning-controls${batchComplete ? ' is-complete' : ''}`}><button className="btn line" disabled={position===0} onClick={()=>navigateTo(position-1)}><ArrowLeft size={15}/><span>Previous word</span></button>{batchComplete ? <span className="vocabulary-learning-batch-complete"><Check size={16}/>Batch viewed</span> : <button className="btn primary" disabled={viewed.includes(word.entry.id) || !meaningVisible} onClick={()=>navigateTo(Math.min(position+1,batchEnd),true)}><Check size={15}/><span>{viewed.includes(word.entry.id)?'Viewed':position===batchEnd?'Mark viewed':'Mark viewed & next'}</span></button>}<button className="btn line" disabled={position===words.length-1} onClick={()=>navigateTo(position+1)}><span>{batchComplete && position===batchEnd && position<words.length-1 ? 'Next batch' : 'Next word'}</span><ArrowRight size={15}/></button></div>
        {saveStatus==='failed'?<div role="alert" className="vocabulary-learning-save-error">Progress could not be saved. {savedOnDevice?'Your position is kept on this device.':'Your position is kept while this page is open.'} <button className="btn line" onClick={()=>sync.current?.flush()}>Retry save</button></div>:<p role="status" className="vocabulary-learning-save-status">{saveStatus==='pending'?(savedOnDevice?'Saved on this device':'Pending sync'):saveStatus==='saving'?'Syncing progress…':saveStatus==='saved'?'Progress saved':''}</p>}
        </div>
        <section className="vocabulary-learning-assessments" aria-labelledby="learning-assessment-heading">
          <h3 id="learning-assessment-heading">Test your recall</h3>
          <div className="vocabulary-learning-checkpoint">
            <p>{batchComplete ? `${batchWords.length===1?'1 word':`All ${batchWords.length} words`} viewed. Ready to test your recall?` : `${batchViewed} of ${batchWords.length} words viewed in this batch`}</p>
            <progress className="vocabulary-learning-progress-native" aria-label="Words viewed in this batch" value={batchViewed} max={batchWords.length}/>
            <div className="vocabulary-learning-progress-track" aria-hidden="true"><span style={{transform:`scaleX(${batchWords.length ? batchViewed/batchWords.length : 0})`}}/></div>
            {firstUnviewedIndex >= 0 && firstUnviewedIndex !== position ? <button className="btn text" onClick={() => navigateTo(firstUnviewedIndex)}>Continue learning this batch<ArrowRight size={14}/></button> : null}
          </div>
          <VocabularyLearningAssessment key={`${key}:${batch}:${BATCH_SIZE}`} batch={currentBatch} assessments={assessments} groupWords={sourceWords.length} bound={boundBatch} blocked={previewingMeanings || !selectedSense} blockedDescriptionId={previewingMeanings ? 'batch-meaning-update' : undefined} batchUrl={batchAssessmentUrl} groupUrl={assessmentUrl}/>
          <Link className="btn text" to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}/groups/${encodeURIComponent(unitId)}/words`}>View group words<ArrowRight size={14}/></Link>
        </section>
      </div>}
    </>}
  </section>;
}
