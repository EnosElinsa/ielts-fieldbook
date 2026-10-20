import { useVocabularySearchParams, vocabularyResultUrl } from './vocabularyNavigation';
import { boundVocabularyAssessment } from '../../domain/vocabulary/plannedAssessment';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useFieldbook } from "../../context/FieldbookContext";
import { accountId } from "../../storage/remote";
import { readVocabularyDraft } from "../../storage/vocabularyDrafts";
import { useVocabularyLocalDrafts } from './useVocabularyLocalDrafts';
import { getVocabularyReviewQueue, type ReviewCard, type ReviewQueueFilter, type VocabularyEntry, type VocabularyMode, type VocabularyResult, type VocabularyState } from "../../domain/vocabulary";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { resolveVocabularyLearningContext } from '../../domain/vocabulary/context';
import { isVocabularyPracticeReference } from '../../domain/vocabulary/readiness';
import { normalizeVocabularyPreferences, type VocabularyPracticeMode, type VocabularyPreferences } from "../../domain/vocabulary/preferences";
import { buildVocabularySessionCommit, createVocabularySession, evaluateVocabularySessionAnswer, updateVocabularySessionAnswer, type VocabularyPracticeSession, type VocabularySessionSelection } from "../../domain/vocabulary/session";
import { getLearnedVocabularyIds, vocabularyGroupProgress } from "../../domain/vocabulary/progress";
import { availableUnitPracticeModes, buildUnitPracticeQueue } from "../../domain/vocabulary/selection";
import { buildLearningBatch, type LearningBatch } from '../../domain/vocabulary/learningBatch';
import { resolveVocabularyRetry } from "../../domain/vocabulary/retry";
import { createVocabularyPlayback } from "./playback";
import { playbackMessage } from "./Pronunciation";
import { useVocabularyReturn, vocabularyForwardState } from './VocabularyRouteLink';
import { practiceKeyboard } from "./practiceKeyboard";
import { presentVocabularySession } from '../../domain/vocabulary/sessionPresentation';
import { MODES, senseFor } from "./practicePresentation";
import { loadReleasedVocabularyTeaching } from '../../storage/vocabularyCatalog';
import { type PracticeNavigationRequest } from '../../lib/practiceNavigation';
import type { VocabularySubmissionOutcome } from '../../domain/vocabulary/submissionOutcome';
import { orderReviewCards, oneQuestionPerWord } from '../../domain/vocabulary/reviewOrder';
import { vocabularyReviewTeaching } from '../../domain/vocabulary/reviewTeaching';

type Session = VocabularyPracticeSession;
type Prepared = ReturnType<typeof buildVocabularySessionCommit>;
type SessionLog = Prepared["sessionRecord"];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useVocabularyPracticeController() {
  const fb = useFieldbook();
  const [params, setParams] = useVocabularySearchParams();
  const requestedPlan = (fb.state.plans as {id:string;status:string;skipReason?:string}[] | undefined)?.find(plan => plan.id === params.get('planId'));
  const noLongerDue = requestedPlan?.status === 'skipped' && requestedPlan?.skipReason === 'no-longer-due';
  const planId = params.get('planId');
  // Answer edits do not change the account task. Keep its frozen identities stable
  // so typing cannot invalidate the (potentially large) review queue.
  const boundVocabularyPlan = useMemo(() => boundVocabularyAssessment(fb.state, planId), [fb.state.plans, planId]);
  const plannedReview = boundVocabularyPlan?.target.mode !== 'learning-batch' ? boundVocabularyPlan?.target.cards : undefined;
  const plannedEntryIds = plannedReview ? JSON.stringify([...new Set(plannedReview.map(ref => ref.entryId))]) : '';
  const boundAssessmentMode = boundVocabularyPlan?.target?.assessmentMode as VocabularyPracticeMode | undefined;
  const location = useLocation();
  const { sessionId: historySessionId } = useParams();
  const navigate = useNavigate();
  const legacyStudy = !plannedReview && location.pathname === '/vocabulary/review' && Boolean(params.get('bookId') && params.get('unitId') && params.get('dueOnly') === 'false' && params.get('wrongOnly') !== 'true' && !['entryId', 'senseId', 'sourceType', 'sourceId', 'dimension', 'skill'].some(key => params.has(key)));
  const study = boundVocabularyPlan ? boundVocabularyPlan.target.mode === 'learning-batch' : location.pathname === '/vocabulary/study' || legacyStudy;
  const back = useVocabularyReturn(historySessionId ? '/vocabulary/history' : study && params.get('bookId') && params.get('unitId') ? `/vocabulary/wordbooks/${encodeURIComponent(params.get('bookId')!)}/groups/${encodeURIComponent(params.get('unitId')!)}/words` : '/vocabulary');
  const initialPreferences = normalizeVocabularyPreferences(
    fb.state.settings?.vocabulary,
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [mode, setMode] = useState<VocabularyPracticeMode>(() =>
    boundAssessmentMode || (MODES.some((item) => item.value === params.get("mode"))
      ? (params.get("mode") as VocabularyPracticeMode)
      : (study ? "dictation" : initialPreferences.mode)),
  );
  const [bookId, setBook] = useState(boundVocabularyPlan?.target.bookId || params.get("bookId") || "all");
  const [unitId, setUnit] = useState(boundVocabularyPlan?.target.unitId || params.get("unitId") || "all");
  const [sourceType, setSource] = useState(params.get("sourceType") || "all");
  const [skill, setSkill] = useState(params.get("skill") || "all");
  const [dimension, setDimension] = useState(params.get("dimension") || "all");
  const [dueOnly, setDue] = useState(params.get("dueOnly") !== "false");
  const [wrongOnly, setWrong] = useState(params.get("wrongOnly") === "true");
  const [customCardIds,setCustomCardIds]=useState<string[]|null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [resume, setResume] = useState(() => readVocabularyDraft(accountId()));
  const localDrafts=useVocabularyLocalDrafts(accountId());
  const localDraftsRef=useRef(localDrafts);localDraftsRef.current=localDrafts;
  useEffect(()=>{
    if(!localDrafts.ready||sessionRef.current)return;
    const rows=localDrafts.drafts;
    setResume((rows.find(row=>row.session.id===params.get('resumeSessionId'))||rows.find(row=>Boolean(planId)&&row.session.planId===planId)||rows[0])?.session||null);
  },[localDrafts.ready,localDrafts.drafts,planId,params.get('resumeSessionId')]);
  const [results, setResults] = useState<SessionLog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const departure = useRef<PracticeNavigationRequest | null>(null);
  useEffect(() => { if (!exitOpen) departure.current = null; }, [exitOpen]);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [retryPreparing, setRetryPreparing] = useState(false);
  const [error, setError] = useState("");
  const [modeRecovery, setModeRecovery] = useState<{ owner: string | null; bookId: string; unitId: string; message: string } | null>(null);
  const modeNotice = modeRecovery?.owner === accountId() && modeRecovery?.bookId === bookId && modeRecovery?.unitId === unitId ? modeRecovery.message : '';
  const [audioStatus, setAudioStatus] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioNeedsChoice, setAudioNeedsChoice] = useState(false);
  const [looping, setLooping] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [submissionOutcome,setSubmissionOutcome]=useState<VocabularySubmissionOutcome|null>(null);
  const [catalogStatus, setCatalogStatus] = useState<{ bookId: string; key:string; status: 'loading' | 'ready' | 'error' }>({ bookId: '',key:'', status: 'loading' });
  const [catalogRetry, setCatalogRetry] = useState(0);
  const resultFilter = ['all', 'incorrect', 'unanswered', 'pending', 'flagged'].includes(params.get('resultFilter') || '') ? params.get('resultFilter')! : 'all';
  function setResultFilter(value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('resultFilter'); else next.set('resultFilter', value);
    setParams(next, { replace: true, state: location.state });
  }
  const owner = useRef(accountId());
  const sessionRef = useRef<Session | null>(null);
  const cardsRef = useRef<ReviewCard[]>([]);
  const preferencesRef = useRef(preferences);
  const pendingCommit = useRef<Prepared | null>(null);
  const submittedFromRoute = useRef<string | null>(null);
  const savingRef = useRef(false);
  const recoveringRef = useRef(false);
  const autoRecovery = useRef<string | null>(null);
  const retryGeneration = useRef(0);
  const retryPreparingRef = useRef(false);
  const resultsRef = useRef(results);
  const routeKeyRef = useRef(location.key);
  const audioGeneration = useRef(0);
  const loopGeneration = useRef(0);
  const loopGap = useRef<{ timer: number; resolve: () => void } | null>(null);
  const playedIndex = useRef(-1);
  const startedAt = useRef(Date.now());
  const mounted = useRef(true);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<Session | null>(null);
  const cancelDraft = useCallback(() => {
    if (draftTimer.current !== null) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    pendingDraft.current = null;
  }, []);
  const flushDraft = useCallback(async () => {
    const draft = pendingDraft.current;
    cancelDraft();
    if (!draft || owner.current !== accountId()) {await localDraftsRef.current.flush();return;}
    const written = await localDraftsRef.current.save(draft);
    if (mounted.current) setStorageError(!written);
  }, [cancelDraft]);
  const answerFields = useRef<
    (HTMLInputElement | HTMLTextAreaElement | null)[]
  >([]);
  const playback = useRef<ReturnType<typeof createVocabularyPlayback> | null>(
    null,
  );
  if (!playback.current) playback.current = createVocabularyPlayback();
  preferencesRef.current = preferences;
  cardsRef.current = cards;
  resultsRef.current = results;
  routeKeyRef.current = location.key;

  useEffect(() => {
    if (legacyStudy && location.pathname !== '/vocabulary/study') navigate(`/vocabulary/study?${params}`, { replace: true, state: location.state });
  }, [legacyStudy, location.pathname]);
  useEffect(() => {
    if (sessionRef.current) return;
    setBook(boundVocabularyPlan?.target.bookId || params.get('bookId') || 'all'); setUnit(boundVocabularyPlan?.target.unitId || params.get('unitId') || 'all');
    setSource(params.get('sourceType') || 'all'); setSkill(params.get('skill') || 'all');
    setDimension(params.get('dimension') || 'all');
    setDue(params.get('dueOnly') !== 'false'); setWrong(params.get('wrongOnly') === 'true');
    if (boundAssessmentMode) setMode(boundAssessmentMode);
    else if (params.get('mode') && MODES.some(item => item.value === params.get('mode'))) setMode(params.get('mode') as VocabularyPracticeMode);
  }, [location.pathname, params.toString(), session === null, boundAssessmentMode]);
  const catalogAccount = accountId();
  const [reviewClock,setReviewClock]=useState(0);
  const ordinaryReview=!plannedReview&&!study&&!params.has('entryId')&&!params.has('planId')&&!params.has('sessionId')&&!historySessionId;
  const evidenceScoped=ordinaryReview&&(dueOnly||wrongOnly);
  const reviewTeaching=useMemo(()=>ordinaryReview?vocabularyReviewTeaching(fb.state,mode==='audio'?'dictation':mode,dueOnly,wrongOnly):null,
    [ordinaryReview,fb.state.vocabulary,fb.state.vocabularyStates,mode,dueOnly,wrongOnly,reviewClock]);
  const reviewEntryIds=reviewTeaching?JSON.stringify(reviewTeaching.entryIds):'';
  const catalogPreparationKey=JSON.stringify([catalogAccount,plannedReview?'':bookId,plannedReview?'':unitId,params.get('entryId'),catalogRetry,reviewEntryIds,plannedEntryIds]);
  useEffect(()=>{
    if(!evidenceScoped||session||results)return;
    const refresh=()=>setReviewClock(value=>value+1);
    const onVisible=()=>{if(document.visibilityState==='visible')refresh();};
    const next=reviewTeaching?.nextChangeAt;
    const timer=next===null||next===undefined?undefined:window.setTimeout(refresh,Math.max(1,Math.min(next-Date.now()+25,3600000)));
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);
    return()=>{window.clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
  },[evidenceScoped,Boolean(session),Boolean(results),reviewTeaching?.nextChangeAt,reviewClock,catalogAccount]);
  useEffect(() => {
    if(sessionRef.current)return;
    let active = true;
    const target = plannedReview ? '' : bookId === 'all' ? '' : bookId;
    setCatalogStatus({ bookId: target,key:catalogPreparationKey, status: 'loading' });
    const targetUnit = plannedReview ? undefined : unitId === 'all' ? undefined : unitId;
    const targetEntry = plannedReview ? null : params.get('entryId');
    const options = plannedEntryIds ? {entryIds: JSON.parse(plannedEntryIds), ...(catalogRetry ? {force:true} : {})} : targetUnit || targetEntry || catalogRetry ? { ...(targetUnit ? { unitId: targetUnit } : {}), ...(targetEntry ? { entryIds: [targetEntry] } : {}), ...(catalogRetry ? { force: true } : {}) } : undefined;
    Promise.all([
      options ? fb.loadVocabularyCatalog?.(target || undefined, options) : fb.loadVocabularyCatalog?.(target || undefined),
      reviewTeaching?.entryIds.length && typeof fb.ensureAccountModule==='function'
        ? fb.ensureAccountModule('vocabularyCore',{entryIds:reviewTeaching.entryIds,...(catalogRetry?{force:true}:{})})
        : reviewTeaching?.entryIds.length && typeof fb.loadVocabularyCatalog==='function'
          ? loadReleasedVocabularyTeaching({entryIds:reviewTeaching.entryIds,allowMissingEntryIds:true,force:catalogRetry>0}) : Promise.resolve(),
    ]).then(([result]) => {
      if (active && catalogAccount===accountId()) setCatalogStatus({ bookId: target,key:catalogPreparationKey, status: result===false?'error':'ready' });
    }).catch(() => { if (active && catalogAccount===accountId()) setCatalogStatus({ bookId: target,key:catalogPreparationKey, status: 'error' }); });
    return () => { active = false; };
  }, [catalogPreparationKey, fb.loadVocabularyCatalog,fb.ensureAccountModule]);

  const owned = () => mounted.current && owner.current === accountId();
  const stopAudio = useCallback(() => {
    audioGeneration.current += 1;
    loopGeneration.current += 1;
    if (loopGap.current) {
      window.clearTimeout(loopGap.current.timer);
      loopGap.current.resolve();
      loopGap.current = null;
    }
    playback.current?.stop();
    setAudioBusy(false);
    setAudioNeedsChoice(false);
    setLooping(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) {
        flushDraft();
        stopAudio();
        setAudioStatus("Audio paused");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener('pagehide', flushDraft);
    window.addEventListener('beforeunload', flushDraft);
    return () => {
      flushDraft();
      mounted.current = false;
      retryGeneration.current += 1;
      audioGeneration.current += 1;
      loopGeneration.current += 1;
      if (loopGap.current) {
        window.clearTimeout(loopGap.current.timer);
        loopGap.current.resolve();
        loopGap.current = null;
      }
      playback.current?.stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener('pagehide', flushDraft);
      window.removeEventListener('beforeunload', flushDraft);
    };
  }, [stopAudio, flushDraft]);
  useEffect(() => {
    const currentOwner = accountId();
    if (currentOwner === owner.current) return;
    cancelDraft();
    stopAudio();
    owner.current = currentOwner;
    retryGeneration.current += 1;
    retryPreparingRef.current = false;
    setRetryPreparing(false);
    sessionRef.current = null;
    pendingCommit.current = null;
    submittedFromRoute.current = null;
    savingRef.current = false;
    setSession(null);
    setCards([]);
    setResults(null);
    setSubmissionOutcome(null);
    setResume(readVocabularyDraft(currentOwner));
    setError("");
    setSaving(false);
    recoveringRef.current=false;setRecovering(false);
    setSettingsOpen(false);
    setExitOpen(false);
    setIncompleteOpen(false);
    setAudioStatus("");
    setPreferences(
      normalizeVocabularyPreferences(fb.state.settings?.vocabulary),
    );
  }, [fb.state, stopAudio]);
  useEffect(() => {
    if (!session)
      setPreferences(
        normalizeVocabularyPreferences(fb.state.settings?.vocabulary),
      );
  }, [fb.state.settings?.vocabulary, session === null]);

  const replaceSession = useCallback((next: Session | null, deferDraft = false) => {
    if (owner.current !== accountId()) return;
    sessionRef.current = next;
    setSession(next);
    cancelDraft();
    if (next) {
      if (deferDraft) {
        pendingDraft.current = next;
        draftTimer.current = setTimeout(flushDraft, 250);
      } else {
        void localDraftsRef.current.save(next).then(written=>{if(mounted.current)setStorageError(!written);});
      }
    }
  }, [cancelDraft, flushDraft]);

  const filter = useMemo(
    () =>
      ({
        ...(params.get("entryId") ? { entryId: params.get("entryId")! } : {}),
        ...(params.get("senseId") ? { senseId: params.get("senseId")! } : {}),
        ...(bookId !== "all" ? { bookId } : {}),
        ...(unitId !== "all" ? { unitId } : {}),
        ...(sourceType !== "all" ? { sourceType } : {}),
        ...(params.get('sourceId') ? { sourceId: params.get('sourceId')! } : {}),
        ...(skill !== "all" ? { skill } : {}),
        ...(dimension !== "all" && mode !== "audio" ? { dimension } : {}),
        mode: mode === "audio" ? "dictation" : mode,
        dueOnly,
        ...(dueOnly && params.get('scheduledOnly')==='true' ? {scheduledOnly:true} : {}),
      }) as ReviewQueueFilter,
    [
      params.toString(),
      bookId,
      unitId,
      sourceType,
      skill,
      dimension,
      mode,
      dueOnly,
    ],
  );
  const explicitEntry = Boolean(params.get("entryId"));
  const explicitVocabulary = useMemo(() => {
    if (!filter.entryId) return undefined;
    const raw = ((fb.state.vocabulary as VocabularyEntry[]) || []).find(entry => entry.id === filter.entryId) || (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(entry => entry.id === filter.entryId);
    const member = raw && filter.bookId && filter.unitId && VOCABULARY_CATALOG.memberships.some(item => item.entryId === raw.id && item.bookId === filter.bookId && item.unitId === filter.unitId);
    return raw && member && !raw.sources.some(source => source.bookId === filter.bookId && source.unitId === filter.unitId) ? { ...raw, sources: [...raw.sources, { type: 'wordbook' as const, id: `${filter.bookId}:${filter.unitId}:${raw.id}`, bookId: filter.bookId, unitId: filter.unitId }] } : raw;
  }, [fb.state.vocabulary, filter.entryId, filter.bookId, filter.unitId, catalogStatus, fb.vocabularyCatalogRevision]);
  // A mode or schedule can have no cards even though the selected meaning exists.
  const focusedPractice = useMemo(() => {
    if (study || !explicitVocabulary) return null;
    const scope = { entryId: explicitVocabulary.id, senseId: filter.senseId, bookId: filter.bookId, unitId: filter.unitId };
    const resolved = resolveVocabularyLearningContext(explicitVocabulary, scope);
    const sense = resolved.sense;
    const modes = sense ? getVocabularyReviewQueue({ vocabulary: [explicitVocabulary] }, { ...scope, senseId: sense.id, dueOnly: false }).map(card => card.mode) : [];
    return { entry: resolved.entry, sense, modes, reference: Boolean(sense && isVocabularyPracticeReference(explicitVocabulary.id, sense)) };
  }, [study, explicitVocabulary, filter.senseId, filter.bookId, filter.unitId, fb.vocabularyCatalogRevision]);
  const unitQueue = useMemo(() => study ? buildUnitPracticeQueue(fb.state, bookId, unitId, mode) : null, [study, fb.state, bookId, unitId, mode, catalogStatus]);
  const batchRequest = study && (params.has('batch') || boundVocabularyPlan?.target.mode === 'learning-batch');
  const learningBatch = useMemo((): { batch: LearningBatch | null; error: string } => {
    if (!batchRequest) return { batch: null, error: '' };
    try {
      return { batch: buildLearningBatch(fb.state, bookId, unitId, Number(boundVocabularyPlan?.target.batchIndex ?? params.get('batch')), Number(boundVocabularyPlan?.target.batchSize ?? params.get('batchSize') ?? 10), mode, boundVocabularyPlan?.target.mode === 'learning-batch' ? boundVocabularyPlan.target.cards : params.has('batchCards') ? JSON.parse(params.get('batchCards')!) : undefined), error: '' };
    } catch { return { batch: null, error: 'This learning batch is unavailable. Reload its group or return to learning.' }; }
  }, [batchRequest, fb.state, bookId, unitId, mode, catalogStatus, params.toString()]);
  const availableQueue = useMemo(() => {
    if (params.has('planId') && !boundVocabularyPlan) return [];
    if (plannedReview) {
      const wanted = new Set(plannedReview.map(ref => ref.entryId));
      const vocabulary = [...new Map([...(VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]), ...(fb.state.vocabulary || [])].filter(entry => wanted.has(entry.id)).map(entry => [entry.id, entry])).values()];
      const available = getVocabularyReviewQueue({...fb.state, vocabulary}, {mode:boundAssessmentMode as VocabularyMode, dueOnly:false});
      return plannedReview.map(ref => available.find(card => card.entryId === ref.entryId && card.senseId === ref.senseId)).filter((card): card is ReviewCard => Boolean(card));
    }
    if (batchRequest) return learningBatch.batch?.cards || [];
    if (unitQueue) return unitQueue.cards;
    const learned = getLearnedVocabularyIds(fb.state);
    const explicit = Boolean(filter.entryId);
    const wantedTeaching=reviewEntryIds?new Set<string>(JSON.parse(reviewEntryIds)):null;
    const queueState = explicit && explicitVocabulary ? { ...fb.state, vocabulary: [explicitVocabulary] }
      : wantedTeaching?{...fb.state,vocabulary:((fb.state.vocabulary as VocabularyEntry[])||[]).filter(entry=>wantedTeaching.has(entry.id))}:fb.state;
    let available = getVocabularyReviewQueue(queueState, filter).filter(
      (card) =>
        (explicit || !dueOnly&&!wrongOnly || Boolean(filter.sourceId) || learned.has(card.entryId)) && (!wrongOnly ||
        ((fb.state.vocabularyStates as VocabularyState[]) || []).some(
          (item) =>
            item.entryId === card.entryId &&
            item.senseId === card.senseId &&
            item.wrong?.active &&
            Boolean(item.wrong.modes?.[card.mode]?.active),
        )),
    );
    if (preferences.order === "source") {
      available=orderReviewCards(available,fb.state,filter);
    }
    if ((mode === "audio" || mode === "dictation")&&(dueOnly||wrongOnly)) available=oneQuestionPerWord(available);
    return available;
  }, [fb.state, filter, wrongOnly, mode, preferences.order, unitQueue, catalogStatus, batchRequest, learningBatch, plannedReview, explicitVocabulary, boundAssessmentMode, boundVocabularyPlan, params.toString(),reviewEntryIds,reviewClock]);
  const queue=useMemo(()=>{
    if(!study&&!plannedReview&&!dueOnly&&!wrongOnly&&customCardIds!==null)return availableQueue.filter(card=>customCardIds.includes(card.id));
    return !study&&!plannedReview&&['audio','dictation'].includes(mode)?oneQuestionPerWord(availableQueue):availableQueue;
  },[availableQueue,study,plannedReview,dueOnly,wrongOnly,customCardIds,mode]);
  useEffect(()=>setCustomCardIds(null),[bookId,unitId,mode,dueOnly,wrongOnly]);
  const books = VOCABULARY_CATALOG.books || [];
  const units = (VOCABULARY_CATALOG.units || []).filter(
    (unit) => bookId === "all" || unit.bookId === bookId,
  );
  const selectedUnit = units.find(unit => unit.id === unitId);
  const selectedBook = books.find(book => book.id === bookId);
  const chapter = units.find(unit => unit.id === selectedUnit?.parentId);
  const catalogReady = catalogStatus.key===catalogPreparationKey && catalogStatus.status === 'ready';
  const leafUnits = units.filter(unit => unit.kind !== 'chapter' && !units.some(child => child.parentId === unit.id));
  const studyReady = (!params.has('planId') || Boolean(boundVocabularyPlan)) && (!boundAssessmentMode || mode === boundAssessmentMode) && (!study ? catalogReady && (!plannedReview || plannedReview.length > 0 && plannedReview.length === queue.length) : (catalogReady && Boolean(selectedUnit && leafUnits.includes(selectedUnit)) && Boolean(unitQueue?.complete) && (!batchRequest || Boolean(learningBatch.batch && (!boundAssessmentMode || learningBatch.batch.mode === boundAssessmentMode)))));
  const groupModes = useMemo(()=>study && catalogReady && selectedUnit ? availableUnitPracticeModes(fb.state,bookId,unitId) : null,[study,catalogReady,selectedUnit,fb.state,bookId,unitId]);
  useEffect(()=>{
    if (boundAssessmentMode || batchRequest || session || results || !groupModes?.length || groupModes.some(item=>item.value===mode)) return;
    const fallback=groupModes[0];
    setModeRecovery({owner:accountId(),bookId,unitId,message:`${MODES.find(item=>item.value===mode)?.label} has no tasks in this group. Showing ${fallback.label}.`});
    setMode(fallback.value);
    const next=new URLSearchParams(params); next.set('mode',fallback.value);setParams(next,{replace:true,state:location.state});
  },[groupModes,mode,session,results]);
  useEffect(() => {
    if (boundAssessmentMode || !batchRequest || !learningBatch.batch || session || results || mode === learningBatch.batch.mode) return;
    setMode(learningBatch.batch.mode);
    const next = new URLSearchParams(params); next.set('mode', learningBatch.batch.mode); setParams(next, { replace: true, state: location.state });
  }, [batchRequest, learningBatch, mode, session, results]);
  const answered = session
    ? cards.filter((card) => session.answers[card.id]?.response.trim()).length
    : 0;
  const flagged = session
    ? cards.filter((card) => session.answers[card.id]?.flagged).length
    : 0;
  const count = session?.cardIds.length || 0;
  const locked = saving || recovering || Boolean(pendingCommit.current);
  const currentIndex = session?.index || 0;
  const pageStart = Math.floor(currentIndex / 50) * 50;
  const visibleCards = cards.slice(pageStart, pageStart + 50).map((card, offset) => ({ card, index: pageStart + offset }));
  const resultRows = results?.results.filter(row => resultFilter === 'all' ||
    (resultFilter === 'incorrect' && (row.result === 'failure' || row.result === 'partial')) ||
    (resultFilter === 'unanswered' && !row.response.trim()) ||
    (resultFilter === 'pending' && row.result === 'pending') ||
    (resultFilter === 'flagged' && row.flagged)) || [];
  const resultUnitId = results?.selection?.kind === 'unit' || results?.selection?.kind === 'learning-batch' ? results.selection.unitId : null;
  const nextBatch = useMemo(() => {
    if (results?.selection?.kind !== 'learning-batch' || results.results.some(row => !row.response.trim())) return null;
    const selected = results.selection;
    try {
      const next = buildLearningBatch(fb.state, selected.bookId, selected.unitId, selected.batchIndex + 1, selected.batchSize, results.mode);
      return `/vocabulary/wordbooks/${encodeURIComponent(selected.bookId)}/groups/${encodeURIComponent(selected.unitId)}/learn?${new URLSearchParams({ word: next.cards[0].entryId, batch: String(next.selection.batchIndex), batchSize: String(selected.batchSize) })}`;
    } catch { return null; }
  }, [fb.state, results]);
  const orderedGroups = [...(VOCABULARY_CATALOG.units || [])].filter(unit => unit.bookId === results?.filter.bookId && unit.kind !== 'chapter' && !(VOCABULARY_CATALOG.units || []).some(child => child.bookId === unit.bookId && child.parentId === unit.id)).sort((a, b) => {
    const parents = VOCABULARY_CATALOG.units;
    return (parents.find(unit => unit.id === a.parentId && unit.bookId === a.bookId)?.order || 0) - (parents.find(unit => unit.id === b.parentId && unit.bookId === b.bookId)?.order || 0) || (a.order || 0) - (b.order || 0);
  });
  const resultGroupIndex = orderedGroups.findIndex(unit => unit.id === resultUnitId);
  const currentGroup = orderedGroups[resultGroupIndex];
  const currentGroupIds = currentGroup ? VOCABULARY_CATALOG.memberships.filter(item => item.bookId === currentGroup.bookId && item.unitId === currentGroup.id).map(item => item.entryId) : [];
  const completedGroup = currentGroup && vocabularyGroupProgress(fb.state, { ...currentGroup, studyEntryIds: currentGroupIds }) === 'Studied';
  const nextGroup = resultGroupIndex >= 0 && (results?.selection?.kind !== 'learning-batch' || completedGroup) ? orderedGroups.slice(resultGroupIndex + 1).find(unit => {
    const ids = VOCABULARY_CATALOG.memberships.filter(item => item.bookId === unit.bookId && item.unitId === unit.id).map(item => item.entryId);
    return vocabularyGroupProgress(fb.state, { ...unit, studyEntryIds: ids }) !== 'Studied';
  }) : null;
  const recent = useMemo(() => ((fb.state.vocabularySessions || []) as SessionLog[])
    .slice(-5)
    .reverse().map(presentVocabularySession), [fb.state.vocabularySessions]);

  useEffect(() => {
    if (sessionRef.current || savingRef.current) return;
    const id = historySessionId || params.get('sessionId');
    if (!id) {
      // Account/plan commits can arrive before the history transition commits.
      // Keep the saved result visible on its submitting route in that interval.
      if (submittedFromRoute.current === location.key) return;
      submittedFromRoute.current = null;
      setResults(null);
      return;
    }
    submittedFromRoute.current = null;
    const record = ((fb.state.vocabularySessions || []) as SessionLog[]).find(record => record.id === id);
    if (record) {
      setResults(presentVocabularySession(record)); setCards([]); setError('');
      const sourceBook = record.selection && 'bookId' in record.selection ? record.selection.bookId : record.filter?.bookId;
      if (sourceBook && sourceBook !== 'all') {
        const unit = record.selection && 'unitId' in record.selection ? record.selection.unitId : record.filter?.unitId;
        void fb.loadVocabularyCatalog?.(sourceBook, { ...(unit && unit !== 'all' ? { unitId: unit } : {}), entryIds: record.entryIds }).catch(() => { /* historical view remains available from frozen rows */ });
      }
    }
    else if (fb.booted) {
      setResults(null);setError('');
      if (!fb.ensureVocabularySession) {setError('This saved session is unavailable for this account.');return;}
      let active=true;
      void fb.ensureVocabularySession(id).then(record=>{if(active&&!record)setError('This saved session is unavailable for this account.');},()=>{if(active)setError('This result could not be loaded. Refresh this page to retry.');});
      return ()=>{active=false;};
    }
  }, [historySessionId, params.get('sessionId'), fb.state.vocabularySessions, fb.booted,fb.ensureVocabularySession]);

  const resultReturnParams = new URLSearchParams(params);
  resultReturnParams.delete('sessionId');
  const resultReturnTo = results ? vocabularyResultUrl(results.id, params) : `${location.pathname}?${resultReturnParams}`;

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key !== 'mode') for (const name of ['batch', 'batchCards', 'batchSize', 'planId', 'resume']) next.delete(name);
    next.set(key, value);
    if (key === "bookId") next.delete("unitId");
    setParams(next, { replace: true, state: location.state });
  }
  function setReviewPreset(value: string) {
    setDue(value === 'due'); setWrong(value === 'wrong');
    const next = new URLSearchParams(params); next.set('dueOnly',String(value === 'due')); next.set('wrongOnly',String(value === 'wrong')); next.delete('unitId'); setParams(next,{replace:true, state: location.state});
  }
  function changeMode(value: string) {
    if (boundAssessmentMode && value !== boundAssessmentMode) return;
    setModeRecovery(null);
    setMode(value as VocabularyPracticeMode);
    changeFilter("mode", value);
    setAudioStatus("");
  }

  async function playCard(
    index: number,
    options: { automatic?: boolean; example?: boolean; accent?: 'uk' | 'us'; deviceOnly?: boolean } = {},
  ) {
    const card = cardsRef.current[index];
    if (!card || !owned()) return false;
    const p = preferencesRef.current;
    if (p.volume === 0) {
      setAudioStatus("Audio is muted");
      return false;
    }
    if (options.automatic && !p.autoPlay) return false;
    const generation = ++audioGeneration.current;
    playback.current?.stop();
    setAudioBusy(true);
    setAudioNeedsChoice(false);
    setAudioStatus("Playing audio");
    const outcome = await playback.current!.play(card.entry, {
      accent: options.accent || p.accent,
      sense: senseFor(card),
      pronunciation: card.pronunciation ?? 'legacy',
      deviceOnly: options.deviceOnly,
      rate: p.speechRate,
      volume: p.volume,
      repeatCount: p.repeatCount,
      repeatGapMs: p.repeatGapMs,
      ...(options.example
        ? { example: true, text: senseFor(card)?.example || card.entry.example }
        : {}),
    });
    if (!owned() || generation !== audioGeneration.current) return false;
    setAudioBusy(false);
    if (!outcome.ok) {
      setAudioNeedsChoice(outcome.reason === 'sense-recording-unavailable' || outcome.reason === 'sense-recording-failed' || Boolean(options.deviceOnly && card.pronunciation && card.pronunciation !== 'legacy'));
      setAudioStatus(
        outcome.reason === "cancelled"
          ? "Audio paused"
          : outcome.reason === "blocked" ||
              outcome.reason === "click-blocked" ||
              outcome.reason === "clickBlocked"
            ? "Select Play to enable audio"
            : playbackMessage(outcome),
      );
      return false;
    }
    setAudioStatus(playbackMessage(outcome));
    if (sessionRef.current?.mode === "audio") {
      const next = updateVocabularySessionAnswer(
        sessionRef.current,
        card.id,
        "Listened",
        { durationMs: Date.now() - startedAt.current },
      );
      replaceSession(next);
    }
    return true;
  }
  const playCardRef = useRef(playCard);
  playCardRef.current = playCard;
  useEffect(() => {
    if (
      !session ||
      session.mode !== "dictation" ||
      !preferences.autoPlay ||
      playedIndex.current === session.index
    )
      return;
    playedIndex.current = session.index;
    void playCardRef.current(session.index, { automatic: true });
  }, [session?.id, session?.index, preferences.autoPlay]);

  async function runAudioLoop(index = sessionRef.current?.index || 0) {
    if (!owned() || sessionRef.current?.mode !== "audio") return;
    stopAudio();
    const generation = ++loopGeneration.current;
    setLooping(true);
    let completed = true;
    for (let cursor = index; cursor < cardsRef.current.length; cursor += 1) {
      if (
        !owned() ||
        generation !== loopGeneration.current ||
        !sessionRef.current
      )
        return;
      replaceSession({ ...sessionRef.current, index: cursor });
      const ok = await playCardRef.current(cursor);
      if (!ok || generation !== loopGeneration.current) { completed = false; break; }
      if (
        preferencesRef.current.audioExamples &&
        senseFor(cardsRef.current[cursor])?.example
      ) {
        const exampleOk = await playCardRef.current(cursor, { example: true });
        if (!exampleOk || generation !== loopGeneration.current) { completed = false; break; }
      }
      if (cursor < cardsRef.current.length - 1)
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(
            () => {
              loopGap.current = null;
              resolve();
            },
            Math.min(5000, preferencesRef.current.audioGapMs),
          );
          loopGap.current = { timer, resolve };
        });
    }
    if (owned() && generation === loopGeneration.current) {
      setLooping(false);
      if (completed) setAudioStatus("Audio loop complete");
    }
  }

  type BeginOptions = {
    filter?: ReviewQueueFilter;
    preferences?: VocabularyPreferences;
  };
  function begin(
    selected = queue,
    chosenMode = mode,
    selection?: VocabularySessionSelection,
    options: BeginOptions = {},
  ) {
    if (!owned() || (!localDraftsRef.current.ready && !selection) || !selected.length || (!selection && !studyReady)) return;
    const planSelection = Boolean(boundVocabularyPlan && (!selection || selection.kind === 'learning-batch' && selection.bookId === boundVocabularyPlan.target.bookId && selection.unitId === boundVocabularyPlan.target.unitId && JSON.stringify(selection.cards) === JSON.stringify(boundVocabularyPlan.target.cards)));
    if (planSelection && boundVocabularyPlan) {
      if (chosenMode !== boundAssessmentMode || JSON.stringify(selected.map(card => ({ entryId: card.entryId, senseId: card.senseId }))) !== JSON.stringify(boundVocabularyPlan.target.cards)) {
        setError('The planned assessment is unavailable. Return to this task and retry.');
        return;
      }
      chosenMode = boundAssessmentMode!;
    }
    stopAudio();
    pendingCommit.current = null;
    setSubmissionOutcome(null);
    playedIndex.current = -1;
    let ordered = [...selected];
    const chosenSelection = selection || (plannedReview && boundVocabularyPlan ? {kind:'planned-review' as const,planId:boundVocabularyPlan.id,cards:plannedReview} : undefined) || learningBatch.batch?.selection || (study ? { kind: (unitQueue && unitQueue.unavailableWords > 0 ? 'specialist' : 'unit') as 'specialist' | 'unit', bookId, unitId } : { kind: 'batch' as const });
    const chosenPreferences = { ...normalizeVocabularyPreferences(options.preferences || preferences), ...((study && chosenSelection.kind === 'unit') || chosenSelection.kind === 'learning-batch' || chosenSelection.kind === 'planned-review' ? { order: 'source' as const } : {}), ...(!selection && plannedReview ? { sessionSize: plannedReview.length } : {}), mode: chosenMode };
    if (chosenSelection.kind === 'planned-review') { /* The account target defines the order. */ }
    else if (chosenPreferences.order === "source" && chosenSelection.kind !== 'unit') {
      ordered=orderReviewCards(ordered,fb.state,filter);
    } else if (chosenPreferences.order === "due")
      ordered.sort((a, b) => (a.scheduledDueAt ?? '\uffff').localeCompare(b.scheduledDueAt ?? '\uffff'));
    else if (chosenPreferences.order === 'random')
      for (let i = ordered.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    const candidates = clone(ordered);
    const next = createVocabularySession(
      candidates,
      chosenMode,
      chosenPreferences,
      (chosenSelection.kind === 'unit' || chosenSelection.kind === 'specialist' || chosenSelection.kind === 'learning-batch') ? { bookId, unitId, dueOnly: false } : chosenSelection.kind === 'planned-review' ? {mode:chosenMode as VocabularyMode,dueOnly:false} : options.filter || Object.assign({ ...filter }, { wrongOnly }),
      chosenSelection,
    );
    next.returnTo = back.to;
    next.sourceSnapshot=planSelection&&boundVocabularyPlan?{origin:boundVocabularyPlan.origin||'automatic',planId:boundVocabularyPlan.id,dateKey:boundVocabularyPlan.dateKey,title:boundVocabularyPlan.title}:{origin:'self-directed'};
    if (planSelection && boundVocabularyPlan) next.planId = boundVocabularyPlan.id;
    const frozen = next.cardIds.map((identity) =>
      (next.cardSnapshots || candidates).find((card) => card.id === identity.id)!,
    );
    startedAt.current = Date.now();
    cardsRef.current = frozen;
    setCards(frozen);
    setResults(null);
    const setupParams = new URLSearchParams(params);
    setupParams.delete('sessionId'); setupParams.delete('resultFilter');
    setParams(setupParams, { replace: true, state: location.state });
    setResume(null);
    setError("");
    setAudioStatus("");
    if (options.preferences) {
      preferencesRef.current = chosenPreferences;
      setPreferences(chosenPreferences);
    }
    replaceSession(next);
    if (chosenMode === "audio" && chosenPreferences.autoPlay) void runAudioLoop(0);
    requestAnimationFrame(() => answerFields.current[0]?.focus());
  }
  async function recover(selectedResume=resume) {
    const resume=selectedResume;
    if (!resume || !owned() || recoveringRef.current) return;
    setSubmissionOutcome(null);
    const recoveryOwner = owner.current;
    recoveringRef.current = true;
    setRecovering(true);
    setError('');
    try {
    if (resume.selection?.kind === 'unit' || resume.selection?.kind === 'specialist' || resume.selection?.kind === 'learning-batch') {
      try {
        await fb.loadVocabularyCatalog?.(resume.selection.bookId, { unitId: resume.selection.unitId, entryIds: resume.cardSnapshots?.map(card => card.entryId) });
      } catch {
        if (owned() && recoveryOwner === accountId()) setError('The saved wordbook could not be loaded. Your answers are still here. Retry resuming when the connection is available.');
        return;
      }
      if (!owned() || recoveryOwner !== accountId()) return;
    }
    if (resume.selection?.kind === 'planned-review') {
      try {
        const loaded = await fb.loadVocabularyCatalog?.(undefined, {entryIds:[...new Set(resume.selection.cards.map(ref => ref.entryId))]});
        if (loaded === false) throw new Error('Resource unavailable');
      } catch { if (owned() && recoveryOwner === accountId()) setError('The saved review could not be loaded. Your answers are still here. Retry resuming.'); return; }
      if (!owned() || recoveryOwner !== accountId()) return;
    }
    const recoveryState = fb.stateRef.current;
    const frozen = resume.cardSnapshots || resume.cardIds
      .map(
        (identity) =>
          (() => {
            const entry = ((recoveryState.vocabulary as VocabularyEntry[]) || []).find((item) => item.id === identity.entryId) || (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(item => item.id === identity.entryId);
            return entry &&
              !entry.tags.includes("archived") &&
              entry.senses.some((sense) => sense.id === identity.senseId)
              ? ({
                  ...identity,
                  mode:
                    resume.mode === "audio"
                      ? "dictation"
                      : (identity.mode as VocabularyMode),
                  entry,
                  sources: entry.sources,
                  dimension: "meaning",
                  dueAt: entry.createdAt,
                } as ReviewCard)
              : null;
          })(),
      )
      .filter((card): card is ReviewCard => Boolean(card));
    if (frozen.length !== resume.cardIds.length) {
      setError(
        "This saved session includes words that are no longer available. Discard it to start a new session.",
      );
      return;
    }
    playedIndex.current = -1;
    pendingCommit.current = null;
    startedAt.current = Date.now();
    const next = {
      ...resume,
      status: "active" as const,
      index: Math.min(resume.index, frozen.length - 1),
    };
    if (next.submittedAt)
      pendingCommit.current = buildVocabularySessionCommit(
        fb.stateRef.current,
        next,
        frozen,
      );
    cardsRef.current = clone(frozen);
    setCards(cardsRef.current);
    setResults(null);
    setPreferences(normalizeVocabularyPreferences(resume.preferences));
    setMode(resume.mode);
    setResume(null);
    setError(
      next.submittedAt
        ? "This session still needs to be saved. Retry your submission."
        : "",
    );
    if (next.returnTo) {
      const recoveryParams = new URLSearchParams(params); recoveryParams.set('returnTo', next.returnTo);
      if (next.planId) recoveryParams.set('planId', next.planId);
      setParams(recoveryParams, {replace:true, state:{...location.state, vocabularyReturn:undefined}});
    }
    replaceSession(next);
    requestAnimationFrame(() => answerFields.current[next.index]?.focus());
    } finally {
      recoveringRef.current = false;
      if (mounted.current) setRecovering(false);
    }
  }
  async function reloadSavedSession() {
    const current=sessionRef.current;
    if(!current||!owned()||savingRef.current||recoveringRef.current)return;
    cancelDraft();stopAudio();setRecovering(true);
    const rows=await localDraftsRef.current.reload();
    if(!owned())return;
    const saved=rows?.find(row=>row.session.id===current.id);
    if(!saved){setRecovering(false);setError('The saved draft could not be found. Your answers in this tab are retained.');return;}
    await recover(saved.session);
  }
  async function retryLocalDraft() {
    const current=sessionRef.current;if(!current||!owned()||savingRef.current)return;
    cancelDraft();const saved=await localDraftsRef.current.save(current);
    if(owned())setStorageError(!saved);
  }
  function updateAnswer(index: number, response: string) {
    if (locked || !sessionRef.current || !owned()) return;
    replaceSession(
      updateVocabularySessionAnswer(
        sessionRef.current,
        cards[index].id,
        response,
        { durationMs: Date.now() - startedAt.current },
      ),
      true,
    );
  }
  function finalizeAnswer(index: number) {
    flushDraft();
    const current = sessionRef.current;
    if (
      locked ||
      !current ||
      current.preferences.feedback !== "immediate" ||
      current.mode === "audio" ||
      !owned()
    )
      return;
    const card = cards[index];
    const answer = current.answers[card.id];
    if (!answer?.response.trim() || answer.revealed) return;
    const evaluation = evaluateVocabularySessionAnswer(card, answer.response, {
      result: answer.result,
      verification: answer.verification as "pending" | "self-reported",
    });
    replaceSession({
      ...current,
      answers: {
        ...current.answers,
        [card.id]: { ...answer, result: evaluation.result, revealed: true },
      },
    });
  }
  function focusCard(index: number, forcePlayback = false, focusAnswer = true) {
    if (
      !sessionRef.current ||
      locked ||
      index < 0 ||
      index >= cards.length ||
      !owned()
    )
      return;
    if (index !== sessionRef.current.index) {
      finalizeAnswer(sessionRef.current.index);
      stopAudio();
      replaceSession({ ...sessionRef.current!, index });
    }
    if (forcePlayback) {
      playedIndex.current = index;
      void playCardRef.current(index);
    }
    if (!focusAnswer) return;
    requestAnimationFrame(() => {
      const field = answerFields.current[index];
      field?.focus();
      field?.closest('.practice-answer-row')?.scrollIntoView?.({ block: 'nearest' });
    });
  }
  function advance(index: number) {
    finalizeAnswer(index);
    if (index < cards.length - 1) focusCard(index + 1);
  }
  function toggleFlag(index: number) {
    const current = sessionRef.current;
    if (!current || locked || !owned()) return;
    const card = cards[index];
    const answer = current.answers[card.id] || {
      response: "",
      answeredAt: new Date().toISOString(),
      durationMs: 0,
    };
    replaceSession({
      ...current,
      answers: {
        ...current.answers,
        [card.id]: { ...answer, flagged: !answer.flagged },
      },
    });
  }
  function reportProduction(index: number, result: VocabularyResult) {
    const current = sessionRef.current;
    if (!current || locked || !owned()) return;
    const card = cards[index];
    const answer = current.answers[card.id];
    if (!answer) return;
    replaceSession(
      updateVocabularySessionAnswer(current, card.id, answer.response, {
        result,
        verification: result === "pending" ? "pending" : "self-reported",
      }),
    );
  }
  async function submit(force = false) {
    const current = sessionRef.current;
    if (!current || savingRef.current || !owned()) return;
    if (
      !force &&
      !pendingCommit.current &&
      cards.some((card) => !current.answers[card.id]?.response.trim())
    ) {
      setIncompleteOpen(true);
      return;
    }
    setIncompleteOpen(false);
    stopAudio();
    setError("");
    setSaving(true);
    savingRef.current = true;
    const submittingOwner = owner.current;
    try {
      if (!pendingCommit.current)
        pendingCommit.current = buildVocabularySessionCommit(
          fb.stateRef.current,
          current,
          cardsRef.current,
        );
      const prepared = pendingCommit.current;
      // A tab must own the latest local revision before submitting this ID.
      // Save the exact frozen submission explicitly: a queued save can resolve
      // false on a revision conflict without rejecting its promise.
      const frozen = { ...current, submittedAt: prepared.sessionRecord.submittedAt };
      cancelDraft();
      sessionRef.current = frozen;
      setSession(frozen);
      if (!await localDraftsRef.current.save(frozen)) {
        setStorageError(true);
        setError('This session could not be saved locally. If it changed in another tab, pause here and reload its saved draft before submitting. Your responses are still here.');
        return;
      }
      if (!owned() || owner.current !== submittingOwner) return;
      let feedback = '';
      const saved = await fb.persistVocabularySession(
        prepared.state,
        current.id,
        { onError: (message: string) => { feedback = message; }, onResult:(outcome:VocabularySubmissionOutcome)=>setSubmissionOutcome(outcome) },
      );
      if (!owned() || owner.current !== submittingOwner) return;
      if (!saved) {
        setError(
          `${feedback || 'This session could not be saved.'} Your responses are still here.`,
        );
        return;
      }
      await localDraftsRef.current.remove(current.id);
      cancelDraft();
      setResume(null);
      submittedFromRoute.current = location.key;
      setResults(prepared.sessionRecord);
      const resultParams = new URLSearchParams(params);
      resultParams.set('sessionId', prepared.sessionRecord.id);
      resultParams.delete('resultFilter');
      resultParams.delete("sessionId");
      navigate(`/vocabulary/history/${encodeURIComponent(prepared.sessionRecord.id)}?${resultParams}`, { replace: true, state: location.state });
      sessionRef.current = null;
      setSession(null);
      pendingCommit.current = null;
      setStorageError(false);
    } catch {
      if (owned() && owner.current === submittingOwner)
        setError(
          "This session could not be saved. Your responses are still here.",
        );
    } finally {
      if (owned() && owner.current === submittingOwner) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }
  async function savePreferences(next: VocabularyPreferences) {
    if (!owned()) return false;
    const savingOwner = owner.current;
    const saved = await fb.saveVocabularyPreferences(next);
    if (!saved || !owned() || savingOwner !== owner.current) return false;
    setPreferences(normalizeVocabularyPreferences(next));
    stopAudio();
    playedIndex.current = -1;
    setAudioStatus(next.volume === 0 ? "Audio is muted" : "");
    return true;
  }
  useEffect(() => {
    if (!session) return;
    const requested = (event: Event) => {
      if (savingRef.current) { event.preventDefault(); return; }
      const request = (event as CustomEvent<PracticeNavigationRequest>).detail;
      if (!request || typeof request.proceed !== 'function') return;
      event.preventDefault();
      departure.current = request;
      stopAudio();
      setExitOpen(true);
    };
    const leave = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || savingRef.current) return;
      const anchor = (event.target as HTMLElement)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (anchor.hasAttribute('data-practice-navigation')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) return;
      event.preventDefault(); event.stopPropagation();
      const path = url.pathname + url.search + url.hash;
      departure.current = { path, proceed: () => navigate(path, {state: vocabularyForwardState(location)}) }; stopAudio(); setExitOpen(true);
    };
    document.addEventListener('fieldbook:before-navigate', requested);
    document.addEventListener('click', leave, true);
    return () => { document.removeEventListener('fieldbook:before-navigate', requested); document.removeEventListener('click',leave,true); };
  }, [session,stopAudio,navigate,location]);
  async function exit(keep: boolean) {
    if (!owned() || saving) return;
    stopAudio();
    const target = departure.current;
    cancelDraft();
    if (keep && sessionRef.current) {
      const paused = { ...sessionRef.current, status: "paused" as const };
      if(!await localDraftsRef.current.save(paused)){setStorageError(true);setError('Your local draft could not be saved. Keep this page open and retry.');return;}
      setResume(paused);
    } else {
      if(sessionRef.current&&!await localDraftsRef.current.remove(sessionRef.current.id)){setStorageError(true);return;}
      setResume(null);
    }
    departure.current=null;setExitOpen(false);
    pendingCommit.current = null;
    sessionRef.current = null;
    setSession(null);
    setCards([]);
    setError("");
    setAudioStatus("");
    if (target) { target.proceed(); return; }
    if (params.get('returnTo') || location.state?.vocabularyReturn) back.goBack();
  }
  function resetResults() {
    const record = results;
    setSubmissionOutcome(null);
    submittedFromRoute.current = null;
    retryGeneration.current += 1;
    retryPreparingRef.current = false;
    setRetryPreparing(false);
    stopAudio();
    setResults(null);
    setCards([]);
    setError("");
    const next = new URLSearchParams(params);
    next.delete('sessionId'); next.delete('resultFilter');
    next.delete('returnTo');
    if (record) {
      Object.entries(record.filter || {}).forEach(([key, value]) => {
        if (value !== undefined) next.set(key, String(value));
      });
      next.set('mode', record.mode);
    }
    if (record?.selection?.kind === 'learning-batch') {
      next.set('batch', String(record.selection.batchIndex)); next.set('batchSize', String(record.selection.batchSize)); next.set('batchCards', JSON.stringify(record.selection.cards));
    }
    next.delete('planId'); next.delete('resume');
    const setup = record?.selection && 'bookId' in record.selection ? '/vocabulary/study' : '/vocabulary/review';
    navigate(`${setup}${next.toString() ? `?${next}` : ''}`, { state: vocabularyForwardState(location) });
  }
  async function discardResume() {
    cancelDraft();
    if(resume&&!await localDraftsRef.current.remove(resume.id)){setStorageError(true);return;}
    setResume(null);
    setError("");
  }
  function showRecentSession(log: SessionLog) {
    setSubmissionOutcome(null);
    setResults(log);
    setCards([]);
    const next = new URLSearchParams(params);
    next.set('sessionId', log.id); next.delete('resultFilter');
    next.delete("sessionId");
    navigate(`/vocabulary/history/${encodeURIComponent(log.id)}?${next}`, {state: vocabularyForwardState(location)});
  }
  function retryCatalog() {
    setCatalogRetry(value => value + 1);
  }
  function registerAnswerField(index: number, element: HTMLInputElement | HTMLTextAreaElement | null) {
    answerFields.current[index] = element;
  }
  function pauseSession() {
    void flushDraft();
    stopAudio();
    setExitOpen(true);
  }
  function replayCard(index = currentIndex) {
    playedIndex.current = index;
    void playCard(index);
  }
  function toggleCurrentAudio() {
    if (audioBusy || looping) {
      stopAudio();
      setAudioStatus("Audio paused");
    } else replayCard();
  }
  function toggleAudioLoop() {
    if (looping) {
      stopAudio();
      setAudioStatus("Audio paused");
    } else void runAudioLoop();
  }
  function handleWorkbenchKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!session || locked || settingsOpen || exitOpen || incompleteOpen) return;
    practiceKeyboard(event, {
      index: currentIndex, count, pageStart,
      autoAdvance: session.preferences.autoAdvance,
      move: focusCard, finalize: finalizeAnswer,
      play: () => replayCard(), pause: pauseSession,
    });
  }
  async function retryMistakes() {
    if (!results || !owned() || retryPreparingRef.current || sessionRef.current) return;
    const retryOwner = owner.current;
    const routeKey = location.key;
    const generation = ++retryGeneration.current;
    const active = () => owned() && retryOwner === accountId() && generation === retryGeneration.current && routeKey === routeKeyRef.current && resultsRef.current?.id === results.id && !sessionRef.current;
    retryPreparingRef.current = true;
    setRetryPreparing(true);
    setError('');
    try {
      const sourceBook = results.selection && 'bookId' in results.selection ? results.selection.bookId : results.filter.bookId;
      const books = new Set([sourceBook, ...results.results.filter(row => row.result === 'failure' || row.result === 'partial').map(row => row.context?.bookId)].filter((book): book is string => Boolean(book && book !== 'all')));
      for (const book of books) {
        const selectedUnit = results.selection && 'unitId' in results.selection ? results.selection.unitId : results.filter.unitId;
        await fb.loadVocabularyCatalog?.(book, { ...(book === sourceBook && selectedUnit && selectedUnit !== 'all' ? { unitId: selectedUnit } : {}), entryIds: results.results.filter(row => row.result === 'failure' || row.result === 'partial').map(row => row.entryId) });
        if (!active()) return;
      }
      if (!active()) return;
      const retryFilter: ReviewQueueFilter = results.selection && 'bookId' in results.selection
        ? { ...results.filter, bookId: results.selection.bookId, unitId: results.selection.unitId, dueOnly: false }
        : { ...results.filter, dueOnly: false };
      const retry = resolveVocabularyRetry(fb.stateRef.current, results, cards);
      if (retry.unavailable.length) {
        setError(`Retry is unavailable for ${retry.unavailable.length} saved ${retry.unavailable.length === 1 ? 'question' : 'questions'}: ${retry.unavailable.map(row => row.term).join(', ')}. The original word, sense, or task could not be restored. No retry has started; the saved results are unchanged.`);
        return;
      }
      begin(retry.cards, results.mode, { kind: "retry" }, {
        filter: retryFilter,
        preferences: results.preferences,
      });
      const retrySession=sessionRef.current as Session|null;
      if(retrySession)replaceSession({...retrySession,parentSessionId:results.id});
    } catch {
      if (active()) setError('The saved wordbook could not be loaded. Your saved results are unchanged. Select Retry mistakes to try again when the connection is available.');
    } finally {
      if (mounted.current && generation === retryGeneration.current) {
        retryPreparingRef.current = false;
        setRetryPreparing(false);
      }
    }
  }

  useEffect(() => {
    if (params.get('resume') !== 'true' || !localDrafts.ready || !resume || session || results || !fb.booted) return;
    const identity = `${accountId()}:${resume.id}`;
    if (autoRecovery.current === identity) return;
    autoRecovery.current = identity;
    void recover();
  }, [params.get('resume'), resume?.id, session, results, fb.booted,localDrafts.ready]);

  return {
    state: fb.state, filter, study, explicitEntry, focusedPractice, preferences, setPreferences, mode, bookId, setBook, unitId, setUnit,
    sourceType, setSource, skill, setSkill, dimension, setDimension,
    dueOnly, setDue, wrongOnly, setWrong, session, cards, resume, results, submissionOutcome, localDrafts, availableQueue,customCardIds,setCustomCardIds,
    settingsOpen, setSettingsOpen, exitOpen, setExitOpen, incompleteOpen, setIncompleteOpen,
    boundVocabularyPlan, planRequested: params.has('planId'), origin: back, planFailure: noLongerDue ? 'no-longer-due' as const : params.has('planId') && !boundVocabularyPlan ? 'stale-target' as const : plannedReview && catalogStatus.status === 'error' ? 'resource-error' as const : plannedReview && catalogReady && queue.length !== plannedReview.length ? 'stale-target' as const : undefined,
    saving, recovering, retryPreparing, error, audioStatus, audioBusy, audioNeedsChoice, looping, storageError, catalogStatus,
    resultFilter, setResultFilter, resultReturnTo, queue, unitQueue, groupModes, modeNotice, books, units, selectedUnit,
    selectedBook, chapter, catalogReady, leafUnits, studyReady, answered, flagged,
    count, locked, currentIndex, pageStart, visibleCards, resultRows, nextGroup, nextBatch, batchRequest, learningBatch, plannedReview, recent, boundAssessmentMode,
    setReviewPreset, changeFilter, changeMode, playCard, begin, recover, reloadSavedSession, retryLocalDraft, updateAnswer, finalizeAnswer,
    focusCard, advance, toggleFlag, reportProduction, submit, savePreferences, exit,
    resetResults, discardResume, showRecentSession, retryCatalog,
    registerAnswerField, pauseSession, replayCard, toggleCurrentAudio, toggleAudioLoop,
    handleWorkbenchKeyDown, retryMistakes,
    submissionPending: Boolean(pendingCommit.current),
  };
}

export type VocabularyPracticeController = ReturnType<typeof useVocabularyPracticeController>;
