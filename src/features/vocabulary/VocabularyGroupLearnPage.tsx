import { VocabularyLink as Link, VocabularyBackLink } from './VocabularyRouteLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../domain/vocabulary/context';
import { catalogVocabularyEntry, hasVocabularySenseEdits } from '../../domain/vocabulary/content';
import { vocabularySensePresentation } from '../../domain/vocabulary/dictionaryPresentation';
import { getVocabularyMastery } from '../../domain/vocabulary/mastery';
import { getLearnedVocabularyIds, vocabularyGroupProgress } from '../../domain/vocabulary/progress';
import { normalizeVocabularyPreferences, type VocabularyPracticeMode } from '../../domain/vocabulary/preferences';
import { buildUnitPracticeQueue } from '../../domain/vocabulary/selection';
import type { VocabularyStore } from '../../domain/vocabulary/types';
import { VocabularyNavigation } from './VocabularyPages';
import { Pronunciation } from './Pronunciation';
import { entryUrl, practiceUrl, groupPath, groupWords, rememberVocabularyPosition, useVocabularyCatalog, useVocabularyPosition } from './vocabularyNavigation';
import '../../styles/vocabulary-workbench.css';
import '../../styles/vocabulary-learning.css';

type Learning = { viewedEntryIds: string[]; currentEntryId?: string; updatedAt: string };
const BATCH_SIZE = 10;
const pendingKey = (owner: string | null, bookId: string, unitId: string) => `fieldbook:vocabulary-learning-pending:${owner}:${bookId}:${unitId}`;
function readPending(key: string): Learning | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    return value && Array.isArray(value.viewedEntryIds) && value.viewedEntryIds.every((id: unknown) => typeof id === 'string') && typeof value.updatedAt === 'string' ? value : undefined;
  } catch { return undefined; }
}
function writePending(key: string, value?: Learning) {
  try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch {}
}

/** Browsing progress is deliberately separate from review evidence and assessment completion. */
export function VocabularyGroupLearnPage() {
  const fb = useFieldbook();
  const state = fb.state as unknown as VocabularyStore & { settings?: { vocabulary?: unknown } };
  const { bookId = '', unitId = '' } = useParams();
  const owner = accountId();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { status, retry } = useVocabularyCatalog(fb.loadVocabularyCatalog, bookId);
  const book = VOCABULARY_CATALOG.books.find(row => row.id === bookId);
  const unit = VOCABULARY_CATALOG.units.find(row => row.bookId === bookId && row.id === unitId);
  const isGroup = unit && unit.kind !== 'chapter' && !VOCABULARY_CATALOG.units.some(row => row.bookId === bookId && row.parentId === unitId);
  const words = useMemo(() => groupWords(state, bookId, unitId).flatMap(row => row.entry && !row.entry.tags.includes('archived') ? [{ ...row, entry: row.entry, resolved: resolveVocabularyLearningContext(row.entry, { bookId, unitId }) }] : []), [state, bookId, unitId, status]);
  const wordIds = words.map(row => row.entry.id);
  const idsKey = wordIds.join('\n');
  const key = pendingKey(owner, bookId, unitId);
  const [currentId, setCurrentId] = useState<string>();
  const [viewed, setViewed] = useState<string[]>([]);
  const [pending, setPending] = useState<Learning>();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const initialized = useRef('');
  const previousOwner = useRef(owner);
  const accountPositionReset = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    if (status !== 'ready') return;
    const identity = `${key}:${idsKey}`;
    if (initialized.current === identity) return;
    initialized.current = identity;
    generation.current++; lock.current = false;
    const saved = state.wordbookProgress.find(row => row.bookId === bookId && row.unitId === unitId)?.learning;
    const unsaved = readPending(key);
    const learning = unsaved || saved;
    const validIds = learning?.viewedEntryIds.filter(id => wordIds.includes(id)) || [];
    const accountChanged = previousOwner.current !== owner;
    previousOwner.current = owner;
    if (accountChanged) {
      accountPositionReset.current = true;
      const next = new URLSearchParams(params); next.delete('word'); setParams(next, { replace:true, state: location.state });
    }
    const requested = accountChanged ? null : params.get('word');
    const position = requested && wordIds.includes(requested) ? requested : learning?.currentEntryId && wordIds.includes(learning.currentEntryId) ? learning.currentEntryId : wordIds[0];
    setCurrentId(position); setViewed(validIds);
    setPending(unsaved ? { ...unsaved, viewedEntryIds: validIds, currentEntryId: position } : undefined);
    setSaveStatus(unsaved ? 'failed' : 'idle');
  }, [key, idsKey, status, state, bookId, unitId, params]);
  useEffect(() => {
    const requested = params.get('word');
    if (accountPositionReset.current) { if (!requested) accountPositionReset.current = false; return; }
    if (requested && wordIds.includes(requested)) setCurrentId(requested);
  }, [params, idsKey]);

  const position = Math.max(0, words.findIndex(row => row.entry.id === currentId));
  const word = words[position];
  const batch = Math.floor(position / BATCH_SIZE);
  const batches = Math.ceil(words.length / BATCH_SIZE);
  const originParams = new URLSearchParams(params);
  originParams.set('word', word?.entry.id || '');
  const origin = `${location.pathname}?${originParams}`;
  useVocabularyPosition(origin, status === 'ready' && Boolean(word));
  const preferences = normalizeVocabularyPreferences(state.settings?.vocabulary);
  const assessedIds = getLearnedVocabularyIds({ ...state, vocabularyStates: [] });
  const progress = unit ? vocabularyGroupProgress(state, { ...unit, studyEntryIds: wordIds }, assessedIds) : 'Not started';
  const assessmentStatus = progress === 'Studied' ? 'Assessed' : progress;
  const mastered = useMemo(() => words.filter(row => getVocabularyMastery(state, row.entry.id, row.resolved.sense?.id).automatic === 'mastered').length, [state, words]);
  const assessments = useMemo(() => {
    const modes: { mode: VocabularyPracticeMode; label: string }[] = [{ mode:'dictation',label:'Dictation' },{ mode:'definition',label:'Meaning recall' },{ mode:'cloze',label:'Sentence gaps' },{ mode:'synonym',label:'Synonyms' },{ mode:'distinction',label:'Word distinctions' },{ mode:'production',label:'Use in context' }];
    return status === 'ready' ? modes.map(item => ({ ...item, queue:buildUnitPracticeQueue(state,bookId,unitId,item.mode) })).filter(item=>item.queue.eligibleWords > 0) : [];
  }, [state, bookId, unitId, status]);
  const assessmentUrl = (mode: string) => `/vocabulary/study?${new URLSearchParams({ bookId, unitId, dueOnly:'false', mode, returnTo:origin })}`;

  async function save(learning: Learning) {
    if (lock.current || owner !== accountId()) return;
    const currentGeneration = generation.current;
    lock.current = true; setSaveStatus('saving'); setPending(learning); writePending(key, learning);
    try {
      const saved = await fb.saveVocabularyLearning(bookId, unitId, learning);
      // A successful save remains useful when the user has opened word details.
      if (saved && owner === accountId() && readPending(key)?.updatedAt === learning.updatedAt) writePending(key);
      if (!mounted.current || owner !== accountId() || generation.current !== currentGeneration) return;
      setSaveStatus(saved ? 'saved' : 'failed');
      if (saved) { setPending(undefined); writePending(key); }
    } catch {
      if (mounted.current && owner === accountId() && generation.current === currentGeneration) setSaveStatus('failed');
    } finally {
      if (generation.current === currentGeneration) lock.current = false;
    }
  }
  function navigateTo(index: number, markViewed = false) {
    if (lock.current || !word || !words[index]) return;
    const nextViewed = [...new Set([...viewed, ...(markViewed ? [word.entry.id] : [])])];
    const nextId = words[index].entry.id;
    setViewed(nextViewed); setCurrentId(nextId);
    const next = new URLSearchParams(params); next.set('word', nextId); if(nextId!==word.entry.id) next.delete('sense'); setParams(next, { replace:true, state: location.state });
    requestAnimationFrame(() => { if (mounted.current && owner === accountId()) document.getElementById('learning-word')?.focus({ preventScroll:true }); });
    void save({ viewedEntryIds:nextViewed, currentEntryId:nextId, updatedAt:new Date().toISOString() });
  }

  const selectedSense = word?.resolved.curriculum?.senses.find(sense=>sense.id===params.get('sense')) || word?.resolved.sense;
  const activeResolved=word && selectedSense ? resolveVocabularyLearningContext(word.entry,{bookId,unitId,senseId:selectedSense.id}) : word?.resolved;
  const presentation = selectedSense ? vocabularySensePresentation(selectedSense) : undefined;
  const publicEntry = word ? catalogVocabularyEntry(word.entry.id) : undefined;
  const publicSense = publicEntry && selectedSense ? resolveVocabularyLearningContext(publicEntry, { bookId, unitId, senseId:selectedSense.id }).sense : undefined;
  const reliableCollocations = activeResolved?.contentReviewed || selectedSense?.source === 'Personal note' || Boolean(state.vocabulary.some(entry=>entry.id===word?.entry.id) && publicSense && selectedSense && hasVocabularySenseEdits(selectedSense,[publicSense]));
  return <section className="view active vocabulary-view vocabulary-workbench vocabulary-learning">
    <VocabularyNavigation />
    <VocabularyBackLink fallback={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}#group-${encodeURIComponent(unitId)}`}/>
    {status === 'loading' ? <p role="status">Loading group words…</p> : status === 'error' ? <div role="alert" className="vocabulary-error">Group words could not be loaded. <button className="btn line" onClick={retry}><RotateCcw size={15}/>Retry group</button></div> : !book || !isGroup ? <p role="alert">This wordbook group is unavailable.</p> : <>
      <header className="vocabulary-learning-heading">
        <p className="vocabulary-group-path">{groupPath(bookId, unitId)}</p>
        <div className="page-tools"><h2>Learn {unit.title}</h2>{!words.length ? <Link className="btn line" to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}/groups/${encodeURIComponent(unitId)}/words`}>View group words</Link> : null}</div>
        <p>Listen, learn, then test your recall.</p>
        <div className="vocabulary-group-learning-progress" aria-label="Group progress"><span>Viewed {viewed.length} / {words.length}</span><span>Assessment: {assessmentStatus}</span><span>System mastered {mastered} / {words.length}</span></div>
      </header>
      {!word ? <p>No active words are available in this group.</p> : <>
        <div className="vocabulary-learning-batches"><span>Batch {batch+1} of {batches} · Words {batch*BATCH_SIZE+1}–{Math.min((batch+1)*BATCH_SIZE,words.length)}</span><div aria-label="Learning batches">{Array.from({length:batches},(_,i)=><button key={i} className="btn line" aria-label={`Batch ${i+1}: words ${i*BATCH_SIZE+1}–${Math.min((i+1)*BATCH_SIZE,words.length)}`} aria-current={batch===i?'true':undefined} disabled={saveStatus==='saving'} onClick={()=>navigateTo(i*BATCH_SIZE)}>{i+1}</button>)}</div></div>
        <article className="vocabulary-learning-card" aria-label="Current learning word">
          <div className="page-tools"><span className="vocabulary-muted">Word {position+1} of {words.length}</span>{viewed.includes(word.entry.id)?<span className="pill"><Check size={13}/>Viewed</span>:null}</div>
          <h3 id="learning-word" tabIndex={-1}>{word.entry.term}</h3>
          <Pronunciation entry={word.entry} accent={preferences.accent}/>
          {word.resolved.curriculum && word.resolved.curriculum.senses.length>1 ? <div className="vocabulary-learning-meanings" aria-label="Meanings to learn">{word.resolved.curriculum.senses.map((sense,i)=><button className="btn line" key={sense.id} aria-pressed={selectedSense?.id===sense.id} onClick={()=>{const next=new URLSearchParams(params);next.set('sense',sense.id);setParams(next,{replace:true, state: location.state});}}>Meaning {i+1} · {sense.pos}</button>)}</div> : null}
          <div className="vocabulary-learning-definition"><small>{selectedSense?.pos || 'Meaning'}</small><p>{presentation?.definition || 'Definition not available yet'}</p></div>
          <details className="vocabulary-learning-provenance"><summary>{activeResolved?.curriculum ? !activeResolved.curriculumCurrent?'Your selected meaning':activeResolved.curriculum.basis==='theme'?'Theme learning meaning':activeResolved.curriculum.basis==='source'?'Meaning in this listening passage':activeResolved.curriculum.basis==='multiple'?'Multiple meanings to learn':'Common meaning to learn':activeResolved?.reviewed?'Meaning in this group':'General dictionary meaning'}</summary><p>{activeResolved?.curriculum ? activeResolved.curriculumCurrent?activeResolved.curriculum.explanation:'You are viewing your own edited meaning, separate from the group learning recommendation.' : activeResolved?.reviewed?'This meaning is confirmed for the current group.':'This card uses a general dictionary meaning.'}</p></details>
          {presentation?.example ? <div className="vocabulary-learning-example"><h4>Example</h4><p>{presentation.example}</p></div> : <p className="vocabulary-muted">No example is available for this meaning.</p>}
          {reliableCollocations && selectedSense?.collocations?.length ? <div className="vocabulary-learning-collocations"><h4>Common combinations</h4><ul>{selectedSense.collocations.map(item=><li key={item}>{item}</li>)}</ul></div> : null}
          <Link className="btn text" to={entryUrl(word.entry.id,{bookId,unitId,senseId:selectedSense?.id},origin)} onClick={()=>rememberVocabularyPosition(origin,'learning-word')}>Word details<ArrowRight size={14}/></Link>
          {word.resolved.curriculum?.basis==='multiple' ? <div className="vocabulary-learning-selected-practice"><Link className="btn primary" to={practiceUrl(word.entry.id,selectedSense?.id,{bookId,unitId},origin,'definition')}>Practise this meaning<ArrowRight size={14}/></Link><p className="vocabulary-muted">This checks the selected meaning and keeps its own review progress. The whole-group assessment uses the first learning meaning for each word.</p></div> : null}
        </article>
        <div className="vocabulary-learning-controls"><button className="btn line" disabled={position===0 || saveStatus==='saving'} onClick={()=>navigateTo(position-1)}><ArrowLeft size={15}/>Previous word</button><button className="btn primary" disabled={saveStatus==='saving'} onClick={()=>navigateTo(Math.min(position+1,words.length-1),true)}><Check size={15}/>{position===words.length-1?'Mark viewed':'Mark viewed & next'}</button><button className="btn line" disabled={position===words.length-1 || saveStatus==='saving'} onClick={()=>navigateTo(position+1)}>Next word<ArrowRight size={15}/></button></div>
        {saveStatus==='failed'?<div role="alert" className="vocabulary-learning-save-error">Progress could not be saved. Your position is kept on this device. <button className="btn line" onClick={()=>pending && void save(pending)}>Retry save</button></div>:<p role="status" className="vocabulary-learning-save-status">{saveStatus==='saving'?'Saving progress…':saveStatus==='saved'?'Progress saved':'Mark each word viewed when you have finished learning it.'}</p>}
        <section className="vocabulary-learning-assessments" aria-labelledby="learning-assessment-heading"><h3 id="learning-assessment-heading">Test your recall</h3><p>{viewed.length===words.length?'You have viewed all words. Choose an assessment to practise recall.':'You can start an assessment at any time, or finish learning the group first.'}</p><div className="actions">{assessments.map(item=><Link className={`btn ${item.mode==='dictation'?'primary':'line'}`} key={item.mode} to={assessmentUrl(item.mode)}>{item.label} · {item.queue.eligibleWords} {item.queue.eligibleWords===1?'word':'words'}</Link>)}</div>{!assessments.length?<p>No assessments are available for the current words. Open word details to check available meanings.</p>:<p className="vocabulary-muted">Viewing words does not increase mastery. Specialist assessments may cover a smaller subset.</p>}<Link className="btn text" to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}/groups/${encodeURIComponent(unitId)}/words`}>View group words<ArrowRight size={14}/></Link></section>
      </>}
    </>}
  </section>;
}
