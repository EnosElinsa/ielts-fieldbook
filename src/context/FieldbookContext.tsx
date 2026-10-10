// @ts-nocheck
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  STATE_VERSION,
  addVocabularyItem,
  addStory,
  buildAssessmentRequest,
  buildSpeakingAssessmentRequest,
  completeVocabularyPlan,
  completePlanIfMatched,
  completeReview,
  completeStoriesPlan,
  createAttempt,
  dateKey,
  draftText,
  dueVocabulary,
  importAssessmentText,
  mergeBackup,
  normalizeDraft,
  parseAssessmentFile,
  persistShape,
  removeVocabularyItem,
  removeStory,
  resolveAssessmentEssay,
  resolveError,
  reviewError,
  selectSpeakingTopic,
  selectWritingQuestion,
  ensureMockPlan,
  startPlan as domainStartPlan,
  syncAssessmentErrors,
  updateVocabularyItem,
  updateStory,
  validateBackup,
  wordCount,
} from '../domain';
import { downloadFile, hydrateState, loadState, saveState, saveVocabularyImport, saveVocabularySession, loadVocabularyCatalog as readVocabularyCatalog } from '../storage';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { genericWordbook } from '../domain/vocabulary/wordbookNames';
import { resolveRegionalSpellingWrongWords } from '../domain/vocabulary/regionalWrongWords';
import { vocabularyLists } from '../domain/vocabulary';
import { normalizeVocabularyPreferences } from '../domain/vocabulary/preferences';
import { clearVocabularyDraft, readVocabularyDraft } from '../storage/vocabularyDrafts';
import { ensurePlans, inferredDeskMode } from '../lib/planTemplates';
import { sessionSkill } from '../lib/format';
import { accountId } from '../storage/remote';
import { differentDrafts, discardDraftRecovery, readDraftRecovery, writeDraftRecovery } from '../storage/recovery';
import { deletePendingAudio } from '../storage/pendingAudio';

const FALLBACK_QUESTIONS = [
  {
    id: '1342',
    type: '1',
    name: 'C21T1 line graph',
    format: '折线图',
    prompt:
      'The graph below gives information about the number of jobs in four sectors of the economy in the US between 1960 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    image: 'question-assets/1342.png',
    source: 'https://www.ieltscb.com/WriteQuestion/getPartWriteInfo?paper_id=159&chapters_id=1342',
  },
];

type ModalName =
  | 'settings'
  | 'save'
  | 'history'
  | 'vocabulary'
  | 'vocabularyImport'
  | 'story'
  | 'backup'
  | 'assessment'
  | null;

type FieldbookContextValue = ReturnType<typeof useFieldbookValue>;

const FieldbookContext = createContext<FieldbookContextValue | null>(null);

function useFieldbookValue() {
  const navigate = useNavigate();
  const [state, setState] = useState(() => loadState());
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const draftTimer = useRef<number | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(() => {
    const s = loadState();
    return String((s.questions[0] || FALLBACK_QUESTIONS[0]).id);
  });
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [deskPart, setDeskPart] = useState('2');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeDeskMode, setActiveDeskMode] = useState<string | null>(null);
  const [vocabularyDueOnly, setVocabularyDueOnly] = useState(false);
  const [vocabularyDueAtVisit, setVocabularyDueAtVisit] = useState(0);
  const [revealedVocabulary, setRevealedVocabulary] = useState<Record<string, boolean>>({});
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [pendingBackup, setPendingBackup] = useState(null);
  const [viewedSession, setViewedSession] = useState(null);
  const [editingVocabularyId, setEditingVocabularyId] = useState(null);
  const [vocabularySeed, setVocabularySeed] = useState(null);
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [storyPresetTopicIds, setStoryPresetTopicIds] = useState([]);
  const [checklistToastNeeded, setChecklistToastNeeded] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [loadError, setLoadError] = useState('');
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [recoveryDrafts, setRecoveryDrafts] = useState(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [vocabularyCatalogRevision, setVocabularyCatalogRevision] = useState(0);
  const vocabularyCatalogReads = useRef(new Map());
  const committedVocabularyImports = useRef([]);
  const committedVocabularyPreferences = useRef([]);
  const committedStudySettings = useRef([]);
  const saveQueue = useRef(Promise.resolve());
  const completingAttempt = useRef(false);
  const saveGeneration = useRef(0);
  const lastSaved = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (draftTimer.current) window.clearTimeout(draftTimer.current); if (toastTimer.current) window.clearTimeout(toastTimer.current); }; }, []);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastVisible(false), 2600);
  }, []);

  const persist = useCallback(
    (mutate?: (draft: any) => void, options?: { silent?: boolean }) => {
      const next = structuredClone(stateRef.current);
      if (mutate) mutate(next);
      stateRef.current = next;
      setState(next);
      return queueSave(next, options?.silent);
    },
    [toast],
  );

  function queueSave(next, silent = false, completion = false) {
    if (completingAttempt.current && !completion) return Promise.resolve(false);
    const generation = ++saveGeneration.current;
    const owner = accountId();
    const frozen = structuredClone(next);
    writeDraftRecovery(owner, completion ? stateRef.current.drafts : frozen.drafts);
    setSaveStatus('saving');
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner) return false;
      applyCommittedVocabulary(frozen, owner);
      let saved = false;
      try { saved = await saveState(frozen, silent ? undefined : toast); } catch { saved = false; }
      if (saved) lastSaved.current = frozen;
      if (alive.current && accountId() === owner && generation === saveGeneration.current) {
        setSaveFailed(!saved);
        setSaveStatus(saved ? 'saved' : 'failed');
        if (saved && !completion) discardDraftRecovery(owner);
      }
      return saved;
    });
    saveQueue.current = operation;
    return operation;
  }

  const persistNow = useCallback(
    (draft?: any) => {
      const next = draft || stateRef.current;
      next.schemaVersion = STATE_VERSION;
      stateRef.current = next;
      setState({ ...next });
      return queueSave(next);
    },
    [toast],
  );

  function applyCommittedVocabulary(target, owner) {
    committedStudySettings.current.filter(change => change.owner === owner).forEach(change => {
      let staleSettings = false;
      Object.entries(change.after).forEach(([key, value]) => {
        if (JSON.stringify(target.settings[key]) === change.before[key]) { staleSettings = true; target.settings[key] = structuredClone(value); }
      });
      applyStudyPlans(target, change, staleSettings);
    });
    committedVocabularyPreferences.current.filter(change => change.owner === owner).forEach(change => {
      if (JSON.stringify(target.settings.vocabulary) === change.before) {
        target.settings.vocabulary = structuredClone(change.after);
      }
    });
    committedVocabularyImports.current.filter(change => change.owner === owner).forEach(change => {
      const rows = target[change.key] || (target[change.key] = []);
      const index = rows.findIndex(row => row.id === change.after.id);
      if (index < 0) rows.push(structuredClone(change.after));
      else if (JSON.stringify(rows[index]) === change.before) rows[index] = structuredClone(change.after);
    });
  }

  function applyStudyPlans(target, change, staleSettings) {
    let stalePlans = false;
    change.removedPlans.forEach(before => {
      const index = target.plans.findIndex(plan => plan.id === before.id && JSON.stringify(plan) === JSON.stringify(before));
      if (index < 0) return;
      stalePlans = true;
      const replacement = change.addedPlans.find(plan => plan.id === before.id);
      if (replacement) target.plans[index] = structuredClone(replacement);
      else target.plans.splice(index, 1);
    });
    if (staleSettings || stalePlans) change.addedPlans.forEach(plan => { if (!target.plans.some(row => row.id === plan.id)) target.plans.push(structuredClone(plan)); });
    if (change.removedPlanIds.includes(target.activePlanId) && !target.plans.some(plan => plan.id === target.activePlanId)) target.activePlanId = null;
  }

  const persistVocabularyImport = useCallback((draft, batchId) => {
    const owner = accountId();
    const before = structuredClone(stateRef.current);
    const frozen = structuredClone(draft);
    setSaveStatus('saving');
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner) return false;
      applyCommittedVocabulary(frozen, owner);
      const saved = await saveVocabularyImport(frozen, batchId, toast);
      if (alive.current && accountId() === owner) {
        setSaveFailed(!saved); setSaveStatus(saved ? 'saved' : 'failed');
        if (saved) {
          vocabularyLists.forEach(key => {
            const prior = new Map((before[key] || []).map(row => [row.id, JSON.stringify(row)]));
            frozen[key].forEach(row => {
              if (prior.get(row.id) !== JSON.stringify(row)) committedVocabularyImports.current.push({ owner, key, before: prior.get(row.id), after: structuredClone(row) });
            });
          });
          const next = structuredClone(stateRef.current);
          applyCommittedVocabulary(next, owner);
          stateRef.current = next; setState(next);
        }
      }
      return saved;
    });
    saveQueue.current = operation;
    return operation;
  }, [toast]);

  const persistVocabularySession = useCallback((draft, sessionId) => {
    const owner=accountId();const before=structuredClone(stateRef.current);const frozen=structuredClone(draft);
    const generation=++saveGeneration.current;setSaveStatus('saving');
    const keys=[...vocabularyLists,'vocabularySessions'];
    const operation=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!alive.current || accountId()!==owner)return false;
      applyCommittedVocabulary(frozen,owner);
      let saved=false;try{saved=await saveVocabularySession(frozen,sessionId,toast);}catch{saved=false;}
      if(alive.current&&accountId()===owner){
        if(generation===saveGeneration.current){setSaveFailed(!saved);setSaveStatus(saved?'saved':'failed');}
        if(saved){
          keys.forEach(key=>{const previous=new Map((before[key]||[]).map(row=>[row.id,JSON.stringify(row)]));(frozen[key]||[]).forEach(row=>{if(previous.get(row.id)!==JSON.stringify(row))committedVocabularyImports.current.push({owner,key,before:previous.get(row.id),after:structuredClone(row)});});});
          const next=structuredClone(stateRef.current);applyCommittedVocabulary(next,owner);stateRef.current=next;setState(next);if(readVocabularyDraft(owner)?.id===sessionId)clearVocabularyDraft(owner);
          const plan=next.plans.find(plan=>plan.id===next.activePlanId&&plan.kind==='vocabulary'&&plan.status==='in_progress');
          if(plan){plan.status='completed';plan.completedAt=frozen.vocabularySessions?.find(row=>row.id===sessionId)?.submittedAt||new Date().toISOString();next.activePlanId=null;void queueSave(next);}
        }
      }
      return saved;
    });saveQueue.current=operation;return operation;
  },[toast]);

  const saveVocabularyPreferences = useCallback(async(input)=>{
    const owner=accountId();const changes=structuredClone(input);
    const generation=++saveGeneration.current;setSaveStatus('saving');
    const operation=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!alive.current || accountId()!==owner)return false;
      const current=structuredClone(stateRef.current);applyCommittedVocabulary(current,owner);
      const preferences=normalizeVocabularyPreferences({...current.settings.vocabulary,...changes});current.settings.vocabulary=preferences;
      const previousPreferences=JSON.stringify(stateRef.current.settings.vocabulary);
      let saved=false;try{saved=await saveState(current,toast);}catch{saved=false;}
      if(!alive.current || accountId()!==owner)return false;
      if(alive.current&&accountId()===owner){if(generation===saveGeneration.current){setSaveFailed(!saved);setSaveStatus(saved?'saved':'failed');}if(saved){committedVocabularyPreferences.current.push({owner,before:previousPreferences,after:structuredClone(preferences)});const next=structuredClone(stateRef.current);next.settings.vocabulary=preferences;stateRef.current=next;setState(next);}}
      return saved;
    });saveQueue.current=operation;return operation;
  },[toast]);

  const saveStudySettings = useCallback(async (input) => {
    if (completingAttempt.current) return false;
    const owner = accountId();
    const changes = structuredClone(input);
    const generation = ++saveGeneration.current;
    setSaveStatus('saving');
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner) return false;
      const current = structuredClone(stateRef.current);
      applyCommittedVocabulary(current, owner);
      const beforeVocabulary = JSON.stringify(current.settings.vocabulary);
      const studyChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'vocabulary'));
      const change = {
        owner,
        before: Object.fromEntries(Object.keys(studyChanges).map(key => [key, JSON.stringify(current.settings[key])])),
        after: studyChanges,
        removedPlanIds: [],
        removedPlans: [],
        addedPlans: [],
      };
      Object.assign(current.settings, studyChanges);
      if (Object.prototype.hasOwnProperty.call(changes, 'vocabulary')) current.settings.vocabulary = normalizeVocabularyPreferences({ ...current.settings.vocabulary, ...changes.vocabulary });
      if (Object.keys(studyChanges).length) {
        change.removedPlans = structuredClone(current.plans.filter(plan => plan.status === 'pending'));
        change.removedPlanIds = change.removedPlans.map(plan => plan.id);
        current.plans = current.plans.filter(plan => plan.status !== 'pending');
        const retainedPlanIds = new Set(current.plans.map(plan => plan.id));
        if (change.removedPlanIds.includes(current.activePlanId)) current.activePlanId = null;
        ensurePlans(current, current.settings.activeSkill || 'writing');
        change.addedPlans = current.plans.filter(plan => !retainedPlanIds.has(plan.id));
      }
      let saved = false;
      try { saved = await saveState(current, toast); } catch { saved = false; }
      if (!alive.current || accountId() !== owner) return false;
      if (generation === saveGeneration.current) { setSaveFailed(!saved); setSaveStatus(saved ? 'saved' : 'failed'); }
      if (saved) {
        committedStudySettings.current.push(change);
        if (Object.prototype.hasOwnProperty.call(changes, 'vocabulary')) committedVocabularyPreferences.current.push({ owner, before: beforeVocabulary, after: structuredClone(current.settings.vocabulary) });
        const next = structuredClone(stateRef.current);
        applyCommittedVocabulary(next, owner);
        stateRef.current = next;
        setState(next);
        lastSaved.current = current;
      }
      return saved;
    });
    saveQueue.current = operation;
    return operation;
  }, [toast]);

  const loadVocabularyCatalog = useCallback((bookId) => {
    const key = bookId || 'metadata';
    if (vocabularyCatalogReads.current.has(key)) return vocabularyCatalogReads.current.get(key);
    const read = (async () => {
      const merge = (key, values) => {
        const identity = item => key === 'units' ? `${item.bookId}:${item.id}` : item.id;
        const rows = new Map(VOCABULARY_CATALOG[key].map(item => [identity(item), item]));
        values.forEach(item => rows.set(identity(item), key === 'books' ? genericWordbook(item) : item));
        VOCABULARY_CATALOG[key] = [...rows.values()];
      };
      let releasedCatalogue;
      try {
        const response=await fetch('/vocabulary-catalog.json');
        if(response.ok) {
          const data=await response.json();
          if(Array.isArray(data.entries)&&Array.isArray(data.books)&&Array.isArray(data.units)&&Array.isArray(data.memberships))releasedCatalogue=data;
        }
      } catch {}
      if(releasedCatalogue) {
        const completeBooks=new Set(releasedCatalogue.books.filter(book=>book.contentStatus==='complete').map(book=>book.id));
        VOCABULARY_CATALOG.memberships=VOCABULARY_CATALOG.memberships.filter(member=>!(completeBooks.has(member.bookId) && member.unitId?.startsWith('starter:')));
        VOCABULARY_CATALOG.units=VOCABULARY_CATALOG.units.filter(unit=>!(completeBooks.has(unit.bookId) && unit.kind==='starter'));
        merge('books',releasedCatalogue.books);
        // Metadata already includes group membership; expose accurate counts before a book is opened.
        merge('units',releasedCatalogue.units); merge('memberships',releasedCatalogue.memberships);
        if(bookId) {
          const memberships=releasedCatalogue.memberships.filter(row=>row.bookId===bookId);
          const entryIds=new Set(memberships.map(row=>row.entryId));
          merge('memberships',memberships);merge('entries',releasedCatalogue.entries.filter(row=>entryIds.has(row.id)));merge('units',releasedCatalogue.units.filter(row=>row.bookId===bookId));
        }
      }
      let offset = 0;
      do {
        const result = await readVocabularyCatalog({ bookId, offset, limit: 500 });
        merge('entries', result.entries); merge('books', result.books); merge('units', result.units); merge('memberships', result.memberships);
        offset = result.nextOffset;
      } while (offset !== null);
      setVocabularyCatalogRevision(revision => revision + 1);
      return true;
    })().catch(error => { vocabularyCatalogReads.current.delete(key); throw error; });
    vocabularyCatalogReads.current.set(key, read);
    return read;
  }, []);

  const scheduleDraftPersist = useCallback(() => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      persistNow();
    }, 350);
  }, [persistNow]);

  const flushDraftPersist = useCallback(() => {
    if (!draftTimer.current) return null;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    return persistNow();
  }, [persistNow]);

  useEffect(() => {
    const onUnload = () => flushDraftPersist();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flushDraftPersist]);

  const activeSkill = state.settings.activeSkill === 'speaking' ? 'speaking' : 'writing';

  const selectedQuestion =
    state.questions.find((q) => String(q.id) === String(selectedQuestionId)) ||
    state.questions[0] ||
    FALLBACK_QUESTIONS[0];

  const selectedTopic =
    (selectedTopicId && state.speakingTopics.find((t) => String(t.id) === String(selectedTopicId))) ||
    state.speakingTopics[0] ||
    null;

  const currentDeskMode = useCallback(() => {
    const plan = state.plans.find((item) => item.id === state.activePlanId);
    return inferredDeskMode(plan) || activeDeskMode || 'full';
  }, [state.plans, state.activePlanId, activeDeskMode]);

  const openModal = useCallback((name: ModalName) => setModal(name), []);
  const closeModal = useCallback(() => { if (!completingAttempt.current) setModal(null); }, []);

  const setSkill = useCallback(
    (skill: string, path?: string | false) => {
      if (!['writing', 'speaking'].includes(skill)) return;
      persist((draft) => {
        draft.settings.activeSkill = skill;
      });
      if (typeof path === 'string' && path) navigate(path);
    },
    [navigate, persist],
  );

  const setWritingDraft = useCallback(
    (id: string, text: string, extra?: object) => {
      const current = normalizeDraft(stateRef.current.drafts[id]);
      const patch = Object.assign({}, extra || {});
      if (Object.prototype.hasOwnProperty.call(patch, 'sections') && patch.sections != null) {
        patch.sections = normalizeDraft({ sections: patch.sections }).sections;
      }
      const next = normalizeDraft(
        Object.assign({}, current, patch, {
          text: text == null ? current.text : String(text),
        }),
      );
      stateRef.current.drafts[id] = next;
      saveGeneration.current += 1;
      writeDraftRecovery(accountId(), stateRef.current.drafts);
      setSaveStatus('saving');
      setState((prev) => ({
        ...prev,
        drafts: {
          ...prev.drafts,
          [id]: next,
        },
      }));
    },
    [],
  );

  const setSpeakingDraft = useCallback((topicId: string, patch: object) => {
    const current = normalizeDraft(stateRef.current.drafts[topicId]);
    const next = normalizeDraft(
      Object.assign({}, current, patch, {
        transcript: patch && (patch as any).transcript != null ? (patch as any).transcript : current.transcript,
        notes: patch && (patch as any).notes != null ? (patch as any).notes : current.notes,
        parentSessionId:
          patch && Object.prototype.hasOwnProperty.call(patch, 'parentSessionId')
            ? (patch as any).parentSessionId
            : current.parentSessionId,
        text: '',
      }),
    );
    stateRef.current.drafts[topicId] = next;
    saveGeneration.current += 1;
    writeDraftRecovery(accountId(), stateRef.current.drafts);
    setSaveStatus('saving');
    setState((prev) => ({ ...prev, drafts: { ...prev.drafts, [topicId]: next } }));
  }, []);

  const repairAssessments = useCallback((draft) => {
    const assessmentIds = new Set(draft.assessments.map((a) => a.id));
    draft.sessions.forEach((session) => {
      if (session.assessmentId && !assessmentIds.has(session.assessmentId)) session.assessmentId = null;
    });
    draft.assessments.forEach((assessment) => {
      const source = assessment.rawText || assessment.text || '';
      const parsed = source ? parseAssessmentFile(source, assessment.filename) : assessment;
      Object.assign(assessment, parsed, {
        id: assessment.id || crypto.randomUUID(),
        date: assessment.date || new Date().toISOString(),
        sessionId: assessment.sessionId || parsed.sessionId || null,
      });
      const linked = assessment.sessionId && draft.sessions.find((s) => s.id === assessment.sessionId);
      if (linked) {
        assessment.practiceMode = linked.practiceMode || 'unknown';
        assessment.targetErrorIds = linked.targetErrorIds || assessment.targetErrorIds || [];
        assessment.skill = linked.skill;
        assessment.part = linked.part;
        if (['overview', 'outline', 'compare', 'body'].includes(linked.practiceMode)) assessment.rewriteTooShort = false;
        linked.assessmentId = assessment.id;
        assessment.missingEssay = false;
        syncAssessmentErrors(draft, assessment, linked);
        return;
      }
      const resolution = resolveAssessmentEssay(draft, parsed);
      if (resolution.session) {
        assessment.sessionId = resolution.session.id;
        assessment.missingEssay = false;
        resolution.session.assessmentId = assessment.id;
        syncAssessmentErrors(draft, assessment, resolution.session);
      } else {
        assessment.missingEssay = true;
        syncAssessmentErrors(draft, assessment, null);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let draft;
      setLoadError('');
      try { draft = await hydrateState(); } catch {
        if (!cancelled) setLoadError('Could not load your workspace. Check your connection and retry.');
        return;
      }
      if (cancelled) return;
      lastSaved.current = structuredClone(draft);
      const correctedSpellings = resolveRegionalSpellingWrongWords(draft);
      const recovery = readDraftRecovery(accountId());
      const changedDrafts = recovery ? differentDrafts(recovery.drafts, draft.drafts) : {};
      if (Object.keys(changedDrafts).length) setRecoveryDrafts(changedDrafts);
      if (!draft.questions.length) {
        draft.questions = FALLBACK_QUESTIONS;
        toast('The writing bank did not load. Showing a spare question.');
      }
      if (!draft.speakingTopics.length) {
        toast('The speaking bank did not load. Refresh and try again.');
      }
      repairAssessments(draft);
      ensurePlans(draft, draft.settings.activeSkill === 'speaking' ? 'speaking' : 'writing', null);
      if (!cancelled) {
        setSelectedQuestionId(String((draft.questions[0] || FALLBACK_QUESTIONS[0]).id));
        if (draft.speakingTopics[0]) setSelectedTopicId(String(draft.speakingTopics[0].id));
        stateRef.current = draft;
        setState(draft);
        setBooted(true);
        if (correctedSpellings.length) void persistNow(draft);
        const params = new URLSearchParams(location.search);
        const filename = params.get('assessmentFile');
        if (filename && /^assessment-[A-Za-z0-9._-]+\.md$/.test(filename)) {
          try {
            const response = await fetch(filename, { cache: 'no-store' });
            if (!response.ok) throw new Error('assessment');
            const result = importAssessmentText(draft, await response.text(), filename);
            if (result.invalid) {
              toast(result.reason);
            } else {
              persistNow(draft);
              history.replaceState({}, '', location.pathname);
              if (result.assessment) {
                navigate(`/review/${result.assessment.id}`);
                toast(
                  result.session
                    ? result.assessment.skill === 'speaking'
                      ? 'Score imported and linked to that transcript.'
                      : 'Score imported and linked to that essay.'
                    : result.assessment.skill === 'speaking'
                      ? 'Score imported, but the transcript was not found.'
                      : 'Score imported, but the essay was not found.',
                );
              }
            }
          } catch {
            toast('Could not read the score file. Put the markdown in this folder.');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGeneration]);

  const chooseQuestion = useCallback(
    (id: string) => {
      setSelectedQuestionId(String(id));
      setActiveDeskMode((mode) => mode);
      navigate('/write');
    },
    [navigate],
  );

  const startSpeakingPractice = useCallback(
    (topicId: string | null, part: string, storyId?: string) => {
      const topics = stateRef.current.speakingTopics || [];
      let topic = topicId ? topics.find((t) => String(t.id) === String(topicId)) : null;
      if (!topic) {
        const wanted = String(part || '2');
        const pool =
          wanted === '3'
            ? topics.filter((t) => Number(t.part) === 2)
            : topics.filter((t) => String(t.part) === wanted);
        const usable = pool.filter((t) => !t.incomplete);
        const list = usable.length ? usable : pool.length ? pool : topics;
        topic = list.length ? list[Math.floor(Math.random() * list.length)] : null;
      }
      if (topic) setSelectedTopicId(String(topic.id));
      setDeskPart(String(part || (topic && topic.part) || '2'));
      setQuestionIndex(0);
      if (storyId && topic) {
        const story = (stateRef.current.stories || []).find((item) => item.id === storyId);
        if (story) {
          const ids = Array.from(new Set((story.topicIds || []).concat([topic.id])));
          updateStory(stateRef.current, story.id, { topicIds: ids });
          const notes = [
            story.title && `Title: ${story.title}`,
            story.people && `People: ${story.people}`,
            story.place && `Place: ${story.place}`,
            story.time && `Time: ${story.time}`,
            story.event && `Event: ${story.event}`,
            story.feeling && `Feeling: ${story.feeling}`,
          ]
            .filter(Boolean)
            .join('\n');
          setSpeakingDraft(topic.id, { notes });
          persistNow();
        }
      }
      navigate('/speak');
    },
    [navigate, persistNow, setSpeakingDraft],
  );

  const startPlan = useCallback(
    (planId: string) => {
      const draft = stateRef.current;
      const plan = draft.plans.find((item) => item.id === planId);
      if (!plan) return;
      const attachPlan = (questionId, skill) => {
        if (!questionId) return;
        const existing = normalizeDraft(stateRef.current.drafts[questionId]);
        const extra = { practiceMode: inferredDeskMode(plan) || 'full', targetErrorIds: [...new Set([...(existing.targetErrorIds || []), ...(plan.targetErrorIds || [])])] };
        if (skill === 'speaking') setSpeakingDraft(questionId, extra);
        else setWritingDraft(questionId, existing.text, extra);
        persistNow();
      };
      if (plan.status === 'completed') {
        navigate('/review');
        return;
      }
      domainStartPlan(draft, planId);
      persistNow(draft);
      setActiveDeskMode(inferredDeskMode(plan));
      if (plan.deskMode === 'timed' || inferredDeskMode(plan) === 'timed' || plan.kind === 'writing-mock' || plan.kind === 'speaking-mock') {
        toast('Use the exam time. Start the timer.');
      }
      if (plan.kind === 'review') {
        navigate('/review');
        return;
      }
      if (plan.kind === 'vocabulary') {
        setVocabularyDueOnly(true);
        setVocabularyDueAtVisit(dueVocabulary(draft).length);
        navigate('/vocabulary/review');
        return;
      }
      if (plan.kind === 'stories') {
        draft.settings.activeSkill = 'speaking';
        persistNow(draft);
        if (plan.storyId && plan.questionId) {
          startSpeakingPractice(plan.questionId, '2', plan.storyId);
          return;
        }
        navigate('/stories');
        return;
      }
      if (plan.kind === 'speaking-mock') {
        draft.settings.activeSkill = 'speaking';
        persistNow(draft);
        const stage = plan.stage || 'p1';
        const part = stage === 'p1' ? '1' : stage === 'p3' ? '3' : '2';
        const topic = plan.questionId
          ? (draft.speakingTopics || []).find((item) => String(item.id) === String(plan.questionId))
          : selectSpeakingTopic(draft, part === '3' ? '2' : part, draft.speakingTopics);
        if (topic && !plan.questionId) {
          plan.questionId = String(topic.id);
          persistNow(draft);
        }
        startSpeakingPractice(topic && topic.id, part);
        attachPlan(topic && topic.id, 'speaking');
        return;
      }
      if (String(plan.kind).startsWith('speaking')) {
        const part = plan.kind === 'speaking-p1' ? '1' : plan.kind === 'speaking-p3' ? '3' : '2';
        draft.settings.activeSkill = 'speaking';
        persistNow(draft);
        const topic = plan.questionId
          ? (draft.speakingTopics || []).find((item) => String(item.id) === String(plan.questionId))
          : selectSpeakingTopic(draft, part, draft.speakingTopics);
        startSpeakingPractice(topic && topic.id, part);
        attachPlan(topic && topic.id, 'speaking');
        return;
      }
      draft.settings.activeSkill = 'writing';
      persistNow(draft);
      let wantedKind = plan.kind;
      if (plan.kind === 'writing-mock') {
        setActiveDeskMode('timed');
        wantedKind = (plan.stage || 'task1') === 'task2' ? '2' : '1';
      }
      const picked = plan.questionId && plan.kind !== 'writing-mock'
        ? draft.questions.find((q) => String(q.id) === String(plan.questionId))
        : selectWritingQuestion(draft, wantedKind, draft.questions);
      chooseQuestion((picked || draft.questions[0] || FALLBACK_QUESTIONS[0]).id);
      attachPlan((picked || draft.questions[0] || FALLBACK_QUESTIONS[0]).id, 'writing');
    },
    [chooseQuestion, navigate, persistNow, startSpeakingPractice, toast],
  );

  const saveAttempt = useCallback(
    async (exportForReview: boolean, saveFields: { focus: string; next: string; errors: string }) => {
      if (!pendingAttempt || completingAttempt.current) return;
      const completionOwner = accountId();
      completingAttempt.current = true;
      if (draftTimer.current) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
      const draft = structuredClone(stateRef.current);
      const speaking = pendingAttempt.skill === 'speaking';
      const completionDrafts = structuredClone(draft.drafts);
      const question = pendingAttempt.question;
      const attempt = createAttempt(
        draft,
        {
          questionId: question.id,
          name: question.name || question.title,
          type: speaking ? String(pendingAttempt.part) : question.type,
          essay: pendingAttempt.essay,
          focus: saveFields.focus,
          next: saveFields.next,
          parentSessionId: pendingAttempt.parentSessionId,
          planId: pendingAttempt.planId,
          skill: speaking ? 'speaking' : 'writing',
          part: speaking ? pendingAttempt.part : '',
          notes: speaking ? pendingAttempt.notes : '',
          audioId: speaking ? pendingAttempt.audioId || null : null,
          practiceMode: pendingAttempt.practiceMode || currentDeskMode(),
          targetErrorIds: pendingAttempt.targetErrorIds || [],
        },
        { id: () => pendingAttempt.id, now: () => new Date().toISOString() },
      );
      saveFields.errors
        .split(/[;；]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value, index) => {
          const match = value.match(/^([A-Z]+(?:-[A-Z]+)?)[：:]?\s*(.*)$/);
          draft.errors.push({
            id: `${attempt.id}-manual-error-${index}`,
            date: attempt.date,
            code: match ? match[1] : 'REVIEW',
            text: match && match[2] ? match[2] : value,
            next: attempt.next,
            sourceSessionId: attempt.id,
            reviewCount: 0,
            lastReviewedAt: null,
            nextReviewAt: attempt.date,
            resolved: false,
          });
        });
      if (pendingAttempt.planId) completePlanIfMatched(draft, pendingAttempt.planId, attempt);
      if (!speaking && pendingAttempt.reviewErrorId) reviewError(draft, pendingAttempt.reviewErrorId);
      if (speaking) draft.drafts[question.id] = normalizeDraft({ transcript: '', notes: '' });
      else {
        const current = normalizeDraft(draft.drafts[selectedQuestion.id]);
        draft.drafts[selectedQuestion.id] = Object.assign({}, current, { text: '', parentSessionId: null, sections: undefined });
      }
      const completionGeneration = saveGeneration.current + 1;
      const saved = await queueSave(draft, false, true);
      completingAttempt.current = false;
      if (!alive.current || accountId() !== completionOwner) return false;
      if (!saved) { writeDraftRecovery(completionOwner, stateRef.current.drafts); return false; }
      const newerDraftEdits = saveGeneration.current !== completionGeneration;
      let committed = draft;
      if (newerDraftEdits) {
        committed = structuredClone(draft);
        Object.entries(stateRef.current.drafts).forEach(([id, value]) => {
          if (JSON.stringify(value) !== JSON.stringify(completionDrafts[id])) committed.drafts[id] = value;
        });
        const mergedSaved = await queueSave(committed, true, true);
        if (!alive.current || accountId() !== completionOwner) return false;
        if (!mergedSaved) { writeDraftRecovery(completionOwner, committed.drafts); return false; }
      }
      stateRef.current = committed;
      setState(committed);
      discardDraftRecovery(completionOwner);
      if (speaking && pendingAttempt.audioId) void deletePendingAudio(completionOwner, question.id, pendingAttempt.part);
      setPendingAttempt(null);
      closeModal();
      if (exportForReview) {
        if (speaking) {
          downloadFile(
            `ielts-speaking-assessment-request-${attempt.id}.md`,
            buildSpeakingAssessmentRequest(attempt, question),
            'text/markdown',
          );
        } else {
          downloadFile(
            `ielts-assessment-request-${selectedQuestion.id}-${dateKey(new Date())}.md`,
            buildAssessmentRequest(attempt, selectedQuestion),
            'text/markdown',
          );
          if (selectedQuestion.image) {
            setTimeout(() => {
              const anchor = document.createElement('a');
              anchor.href = selectedQuestion.image;
              anchor.download = selectedQuestion.image.split('/').pop() || 'question-image';
              anchor.click();
            }, 120);
          }
        }
      }

      const activePlan = pendingAttempt.planId
        ? draft.plans.find((item) => item.id === pendingAttempt.planId)
        : null;
      if (activePlan && activePlan.kind === 'writing-mock' && activePlan.status === 'in_progress' && activePlan.stage === 'task2') {
        setActiveDeskMode('timed');
        const next =
          selectWritingQuestion(draft, '2', draft.questions) ||
          draft.questions.find((item) => item.type === '2') ||
          draft.questions[0];
        chooseQuestion(next.id);
        toast('Task 1 is saved. Task 2 is next, 40 minutes.');
        return;
      }
      if (activePlan && activePlan.kind === 'speaking-mock' && activePlan.status === 'in_progress') {
        setActiveDeskMode('timed');
        const part = activePlan.stage === 'p2' ? '2' : '3';
        const topicId = activePlan.questionId || question.id;
        startSpeakingPractice(topicId, part);
        toast(
          part === '2'
            ? 'Part 1 is saved. Part 2 is next.'
            : 'Part 2 is saved. Part 3 is next.',
        );
        return;
      }

      navigate('/review');
      toast(
        exportForReview
          ? speaking
            ? 'Saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.'
            : 'Essay saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.'
          : speaking
            ? 'Saved.'
            : 'Essay saved.',
      );
      setChecklistToastNeeded(false);
    },
    [
      chooseQuestion,
      closeModal,
      navigate,
      pendingAttempt,
      persistNow,
      selectedQuestion,
      startSpeakingPractice,
      toast,
    ],
  );

  const importFeedback = useCallback(async (text, filename) => {
    const draft = structuredClone(stateRef.current);
    const result = importAssessmentText(draft, text, filename);
    if (result.invalid) return { ...result, saved: false };
    const saved = await persistNow(draft);
    return { ...result, saved };
  }, [persistNow]);

  const toggleFavorite = useCallback((id, skill) => persist((draft) => {
    const favorites = draft.settings.favoriteQuestions || [];
    const key = `${skill}:${id}`;
    draft.settings.favoriteQuestions = favorites.includes(key) ? favorites.filter((value) => value !== key) : [...favorites, key];
  }), [persist]);

  const startTargetedPractice = useCallback((session, errorId = null) => {
    const speaking = session.skill === 'speaking';
    const id = String(session.questionId);
    const draft = structuredClone(stateRef.current);
    draft.activePlanId = null;
    const targetErrorIds = errorId ? [errorId] : draft.errors.filter((error) => error.sourceSessionId === session.id && !error.resolved).map((error) => error.id);
    const practiceMode = ['overview', 'outline', 'compare', 'body'].includes(session.practiceMode) ? session.practiceMode : 'full';
    draft.drafts[id] = normalizeDraft({ text: speaking ? '' : session.essay, transcript: speaking ? session.essay : '', notes: session.notes || '', parentSessionId: session.id, targetErrorIds, practiceMode });
    draft.settings.activeSkill = speaking ? 'speaking' : 'writing';
    persistNow(draft);
    setActiveDeskMode(practiceMode);
    if (speaking) { setSelectedTopicId(id); setDeskPart(session.part || '2'); }
    else setSelectedQuestionId(id);
    navigate(speaking ? '/speak' : '/write');
  }, [persistNow, navigate]);

  const resolveDraftRecovery = useCallback((restore) => {
    if (restore && recoveryDrafts) { persist((draft) => { draft.drafts = { ...draft.drafts, ...recoveryDrafts }; }); setDraftRevision((value) => value + 1); }
    else discardDraftRecovery(accountId());
    setRecoveryDrafts(null);
  }, [recoveryDrafts, persist]);

  const value = useMemo(
    () => ({
      state,
      setState,
      stateRef,
      booted,
      saveFailed,
      saveStatus,
      loadError,
      recoveryDrafts,
      draftRevision,
      retryLoad: () => setLoadGeneration((value) => value + 1),
      resolveDraftRecovery,
      importFeedback,
      openFeedbackImport: () => openModal('assessment'),
      toggleFavorite,
      startTargetedPractice,
      toast,
      toastMessage,
      toastVisible,
      persist,
      persistNow,
      scheduleDraftPersist,
      flushDraftPersist,
      activeSkill,
      setSkill,
      selectedQuestion,
      selectedQuestionId,
      setSelectedQuestionId,
      chooseQuestion,
      selectedTopic,
      selectedTopicId,
      setSelectedTopicId,
      deskPart,
      setDeskPart,
      questionIndex,
      setQuestionIndex,
      activeDeskMode,
      setActiveDeskMode,
      currentDeskMode,
      modal,
      openModal,
      closeModal,
      pendingAttempt,
      setPendingAttempt,
      pendingBackup,
      setPendingBackup,
      viewedSession,
      setViewedSession,
      editingVocabularyId,
      setEditingVocabularyId,
      vocabularySeed,
      setVocabularySeed,
      editingStoryId,
      setEditingStoryId,
      storyPresetTopicIds,
      setStoryPresetTopicIds,
      vocabularyDueOnly,
      setVocabularyDueOnly,
      vocabularyDueAtVisit,
      setVocabularyDueAtVisit,
      revealedVocabulary,
      setRevealedVocabulary,
      checklistToastNeeded,
      setChecklistToastNeeded,
      backupMenuOpen,
      setBackupMenuOpen,
      setWritingDraft,
      setSpeakingDraft,
      startPlan,
      startSpeakingPractice,
      saveAttempt,
      ensurePlansForSkill: () => {
        const draft = stateRef.current;
        let changed = false;
        const plans = ensurePlans(draft, activeSkill, () => {
          changed = true;
        });
        if (changed) persistNow(draft);
        return plans;
      },
      writingDraft: (id: string) => draftText(state.drafts[id], 'writing'),
      speakingDraft: (id: string) => normalizeDraft(state.drafts[id]),
      wordCount,
      FALLBACK_QUESTIONS,
      navigate,
      downloadFile,
      persistShape,
      dateKey,
      // domain passthroughs used by features
      addVocabularyItem,
      updateVocabularyItem,
      removeVocabularyItem,
      dueVocabulary,
      persistVocabularyImport,
      persistVocabularySession,
      saveVocabularyPreferences,
      saveStudySettings,
      loadVocabularyCatalog,
      vocabularyCatalogRevision,
      addStory,
      updateStory,
      removeStory,
      completeStoriesPlan,
      completeVocabularyPlan,
      completeReview,
      reviewError,
      resolveError,
      importAssessmentText,
      validateBackup,
      mergeBackup,
      selectWritingQuestion,
      selectSpeakingTopic,
      ensureMockPlan,
      buildAssessmentRequest,
      buildSpeakingAssessmentRequest,
      sessionSkill,
    }),
    [
      activeDeskMode,
      activeSkill,
      vocabularyCatalogRevision,
      backupMenuOpen,
      booted,
      checklistToastNeeded,
      chooseQuestion,
      saveFailed,
      saveStatus,
      loadError,
      recoveryDrafts,
      draftRevision,
      resolveDraftRecovery,
      importFeedback,
      toggleFavorite,
      startTargetedPractice,
      closeModal,
      currentDeskMode,
      deskPart,
      editingVocabularyId,
      editingStoryId,
      flushDraftPersist,
      vocabularyDueAtVisit,
      vocabularyDueOnly,
      vocabularySeed,
      modal,
      navigate,
      openModal,
      pendingAttempt,
      pendingBackup,
      persist,
      persistNow,
      questionIndex,
      revealedVocabulary,
      saveAttempt,
      scheduleDraftPersist,
      selectedQuestion,
      selectedQuestionId,
      selectedTopic,
      selectedTopicId,
      setSkill,
      setSpeakingDraft,
      setWritingDraft,
      startPlan,
      startSpeakingPractice,
      state,
      storyPresetTopicIds,
      toast,
      toastMessage,
      toastVisible,
      viewedSession,
    ],
  );

  return value;
}

export function FieldbookProvider({ children }: { children: ReactNode }) {
  const value = useFieldbookValue();
  return <FieldbookContext.Provider value={value}>{children}</FieldbookContext.Provider>;
}

export function useFieldbook() {
  const ctx = useContext(FieldbookContext);
  if (!ctx) throw new Error('useFieldbook requires FieldbookProvider');
  return ctx;
}
