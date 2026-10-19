// @ts-nocheck
import { requestTimeout } from '../lib/requestTimeout';
import { timeOperation } from '../lib/performanceTelemetry';
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
import { useNavigate, useLocation } from 'react-router-dom';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
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
import { downloadFile, hydrateState, loadState, saveState, saveVocabularyImport, saveVocabularySession, loadVocabularyCatalog as readVocabularyCatalog, ensureAccountModule as readAccountModule, ensureCompleteAccount as readCompleteAccount, getCollectionStatuses, ensureQuestionBank as readQuestionBank, ensureSpeakingSample as readSpeakingSample } from '../storage';
import { ACCOUNT_MODULES } from '../storage/accountModules';
import { subscribeQuestionBank } from '../storage';
import { loadReleasedVocabulary, loadReleasedVocabularyTeaching, VocabularyScopeUnavailableError } from '../storage/vocabularyCatalog';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { genericWordbook } from '../domain/vocabulary/wordbookNames';
import { resolveRegionalSpellingWrongWords } from '../domain/vocabulary/regionalWrongWords';
import { vocabularyLists, setVocabularyManualStatus, normalizeAnswer } from '../domain/vocabulary';
import type { VocabularyEntry, VocabularySkill, VocabularySource } from '../domain/vocabulary';
import { vocabularySourceKey } from '../domain/vocabulary/sources';
import { normalizeVocabularyPreferences } from '../domain/vocabulary/preferences';
import { clearVocabularyDraft, readVocabularyDraft } from '../storage/vocabularyDrafts';
import { ensurePlans, ensureUnifiedPlans, inferredDeskMode, planMatchesSkill, planningSettingsKey, mutateStudyPlan, applyBacklogPreview } from '../lib/planTemplates';
import { bindSpeakingPlan } from '../domain/plans';
import { speakingPrompts, speakingResponseDraft, updateSpeakingResponse } from '../domain/speaking';
import { useConfirmationDialog } from '../components/useConfirmationDialog';
import { loadExamCatalog, loadExamSections } from '../storage/examCatalog';
import { getVocabularyReviewQueue } from '../domain/vocabulary';
import { getVocabularyPlanningCandidates } from '../domain/vocabulary/planning';
import { isVocabularySessionSelection } from '../domain/vocabulary/selection';
import { vocabularyForwardState } from '../features/vocabulary/VocabularyRouteLink';
import { safeVocabularyReturn, rememberVocabularyPosition } from '../features/vocabulary/vocabularyNavigation';
import { buildLearningBatch } from '../domain/vocabulary/learningBatch';
import { completeReceptivePlanIfMatched, receptivePlanPath } from '../lib/receptivePlans';
import { bindStudyPlanTargets } from '../lib/planTargets';
import { normalizeVocabularyIdentities } from '../domain/vocabulary/identities';
import { sessionSkill } from '../lib/format';
import { attemptSections } from '../domain/desk';
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
  const accountLocation = useLocation();
  const latestAccountLocation = useRef(accountLocation);
  latestAccountLocation.current = accountLocation;
  const accountRoute = accountLocation.pathname;
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
  const [deskPartOverride, setDeskPart] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeDeskMode, setActiveDeskMode] = useState<string | null>(null);
  const [vocabularyDueOnly, setVocabularyDueOnly] = useState(false);
  const [vocabularyDueAtVisit, setVocabularyDueAtVisit] = useState(0);
  const [revealedVocabulary, setRevealedVocabulary] = useState<Record<string, boolean>>({});
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [pendingBackup, setPendingBackup] = useState(null);
  const [viewedSession, setViewedSession] = useState(null);
  const [editingVocabularyId, setEditingVocabularyId] = useState(null);
  const [vocabularySeed, setVocabularySeed] = useState<(Partial<VocabularyEntry> & { skill?: VocabularySkill; sourceId?: string; sourceType?: VocabularySource['type']; context?: string; sessionId?: string; source?: string }) | null>(null);
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [storyPresetTopicIds, setStoryPresetTopicIds] = useState([]);
  const [checklistToastNeeded, setChecklistToastNeeded] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveFailureMessage, setSaveFailureMessage] = useState('');
  const [studySettingsError, setStudySettingsError] = useState('');
  const studySettingsErrorRef = useRef('');
  const [saveStatus, setSaveStatus] = useState('saved');
  const [draftStatuses, setDraftStatuses] = useState({});
  const draftStatusesRef = useRef({});
  const { confirm: confirmReplacement, dialog: confirmationDialog } = useConfirmationDialog(`${accountId()}:${accountRoute}`);
  const [loadError, setLoadError] = useState('');
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [recoveryDrafts, setRecoveryDrafts] = useState(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [vocabularyCatalogRevision, setVocabularyCatalogRevision] = useState(0);
  const [moduleStatus, setModuleStatus] = useState({productive:'unloaded', vocabulary:'unloaded', receptive:'unloaded'});
  const [bankStatus, setBankStatus] = useState({writing:'unloaded', speaking:'unloaded'});
  const [bankErrors, setBankErrors] = useState({writing:'', speaking:''});
  const moduleReads = useRef(new Map());
  const vocabularyTeachingReads = useRef(new Map());
  const vocabularyTeachingIds = useRef(new Set());
  const hydratedCollections = useRef(new Set());
  const bankReads = useRef(new Map());
  const loadEpoch = useRef(0);
  const vocabularyCatalogReads = useRef(new Map());
  const committedVocabularyImports = useRef([]);
  const committedVocabularyFields = useRef([]);
  const committedVocabularyPreferences = useRef([]);
  const committedStudySettings = useRef([]);
  const committedPlanChanges = useRef([]);
  const saveQueue = useRef(Promise.resolve());
  const pendingAutomaticSave = useRef(null);
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
      completeReceptivePlanIfMatched(next, lastSaved.current);
      stateRef.current = next;
      setState(next);
      return queueSave(next, options?.silent);
    },
    [toast],
  );

  function readySaveCollections() {
    const statuses = getCollectionStatuses();
    return statuses ? Object.keys(statuses).filter(key => statuses[key] === 'ready' && hydratedCollections.current.has(key)) : undefined;
  }

  function acknowledgeSaved(next, collections) {
    if (!collections) { lastSaved.current = structuredClone(next); return; }
    const previous = { ...(lastSaved.current || loadState()) };
    collections.forEach(key => {
      if (key === 'profile') {
        ['settings', 'activePlanId', 'reviewedAt'].forEach(field => { previous[field] = structuredClone(next[field]); });
      } else if (key !== 'lexicon') previous[key] = structuredClone(next[key]);
    });
    lastSaved.current = previous;
  }

  function draftScopeValue(snapshot, id, promptKey) {
    return promptKey ? speakingResponseDraft(snapshot?.drafts?.[id], promptKey) : normalizeDraft(snapshot?.drafts?.[id]);
  }

  function changedDraftScopes(snapshot, baseline = lastSaved.current, owner = accountId(), includeTracked = true) {
    const ids = new Set([...Object.keys(baseline?.drafts || {}), ...Object.keys(snapshot?.drafts || {})]);
    return [...ids].flatMap(id => {
      const before = normalizeDraft(baseline?.drafts?.[id]);
      const current = normalizeDraft(snapshot?.drafts?.[id]);
      return [undefined, ...new Set([...Object.keys(before.responses || {}), ...Object.keys(current.responses || {})])].flatMap(promptKey => {
        const stamp = JSON.stringify(draftScopeValue(snapshot, id, promptKey));
        const key = JSON.stringify([owner, id, promptKey || '']);
        const tracked = draftStatusesRef.current[key];
        const changed = stamp !== JSON.stringify(draftScopeValue(baseline, id, promptKey));
        // A later edit can repeat the last acknowledged text and still await its own save.
        const outstanding = includeTracked && tracked?.stamp === stamp && tracked.status !== 'saved';
        return changed || outstanding ? [{ id, promptKey, key, stamp, generation: tracked?.generation || 0 }] : [];
      });
    });
  }

  function markDraftScopes(scopes, status, queued = false) {
    const updated = { ...draftStatusesRef.current };
    scopes.forEach(scope => {
      const current = JSON.stringify(draftScopeValue(stateRef.current, scope.id, scope.promptKey));
      if (current !== scope.stamp || (updated[scope.key]?.generation || 0) !== scope.generation) return;
      if (status === 'pending' && updated[scope.key]?.status === 'saving') return;
      updated[scope.key] = { status, stamp: scope.stamp, generation: scope.generation, queued: status === 'pending' && queued };
    });
    draftStatusesRef.current = updated;
    setDraftStatuses(updated);
  }

  function markDraftEdited(id, before, after) {
    const scopes = changedDraftScopes({ drafts: { [id]: after } }, { drafts: { [id]: before } }, accountId(), false);
    const updated = { ...draftStatusesRef.current };
    scopes.forEach(scope => { updated[scope.key] = { status: 'unsaved', stamp: scope.stamp, generation: scope.generation + 1 }; });
    draftStatusesRef.current = updated;
    setDraftStatuses(updated);
  }

  function saveFeedback(options?: { onError?: (message: string) => void }) {
    const owner = accountId(); const epoch = loadEpoch.current;
    if (!options?.onError) setSaveFailureMessage('');
    return (message: string) => {
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return;
      if (options?.onError) options.onError(message);
      else setSaveFailureMessage(message);
    };
  }

  function queueSave(next, silent = false, completion = false, options?: { collections?: string[]; onError?: (message: string) => void }) {
    if (completingAttempt.current && !completion) return Promise.resolve(false);
    let generation = ++saveGeneration.current;
    const owner = accountId();
    const epoch = loadEpoch.current;
    let frozen = structuredClone(next);
    let collections = readySaveCollections();
    if (options?.collections) collections = options.collections.filter(key => !collections || collections.includes(key));
    let scopes = changedDraftScopes(frozen);
    if (collections && !collections.includes('drafts')) scopes = [];
    if (completion) {
      const combined = new Map([...scopes, ...changedDraftScopes(stateRef.current)].map(scope => [scope.key, scope]));
      scopes = [...combined.values()].map(scope => ({ ...scope, stamp: JSON.stringify(draftScopeValue(stateRef.current, scope.id, scope.promptKey)) }));
    }
    markDraftScopes(scopes, 'pending', true);
    writeDraftRecovery(owner, completion ? stateRef.current.drafts : frozen.drafts);
    setSaveStatus('saving');
    if (!silent) pendingAutomaticSave.current = null;
    if (silent && pendingAutomaticSave.current?.epoch === epoch) {
      pendingAutomaticSave.current.snapshot = frozen;
      pendingAutomaticSave.current.generation = generation;
      pendingAutomaticSave.current.collections = collections;
      pendingAutomaticSave.current.scopes = scopes;
      return pendingAutomaticSave.current.operation;
    }
    const automatic = silent ? { snapshot:frozen, generation, collections, scopes, epoch, operation:null } : null;
    if (automatic) pendingAutomaticSave.current = automatic;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (automatic) {
        frozen = automatic.snapshot; generation = automatic.generation;
        collections = automatic.collections;
        scopes = automatic.scopes;
        if (pendingAutomaticSave.current === automatic) pendingAutomaticSave.current = null;
      }
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      applyCommittedVocabulary(frozen, owner);
      if (!completion) {
        const outstanding = new Set(changedDraftScopes(frozen).map(scope => scope.key));
        scopes = scopes.filter(scope => outstanding.has(scope.key));
      }
      markDraftScopes(scopes, 'saving');
      let saved = false;
      const finishSave = timeOperation('save');
      try { saved = await saveState(frozen, saveFeedback(options), {collections}); } catch { saved = false; }
      finally { finishSave(!saved); }
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      if (saved) acknowledgeSaved(frozen, collections);
      markDraftScopes(scopes, saved ? 'saved' : 'failed');
      if (alive.current && accountId() === owner && generation === saveGeneration.current) {
        setSaveFailed(!saved && !options?.onError);
        setSaveStatus(saved ? 'saved' : 'failed');
        if (saved && !completion && (!collections || collections.includes('drafts'))) discardDraftRecovery(owner);
      }
      return saved;
    });
    saveQueue.current = operation;
    if (automatic) automatic.operation = operation;
    return operation;
  }

  const persistNow = useCallback(
    (draft?: any, options?: { collections?: string[]; onError?: (message: string) => void }) => {
      const next = draft || stateRef.current;
      next.schemaVersion = STATE_VERSION;
      completeReceptivePlanIfMatched(next, lastSaved.current);
      stateRef.current = next;
      setState({ ...next });
      return queueSave(next, false, false, options);
    },
    [toast],
  );

  const mergeAccountData = useCallback((data, before) => {
    const next = { ...stateRef.current };
    const baseline = { ...(lastSaved.current || loadState()) };
    Object.entries(data).forEach(([key, rows]) => {
      if (!Array.isArray(rows)) return;
      const prior = new Map((before[key] || []).map(row => [row.id, JSON.stringify(row)]));
      const current = new Map((next[key] || []).map(row => [row.id, row]));
      const loaded = new Map(rows.map(row => [row.id, row]));
      current.forEach((row, id) => { if (!prior.has(id) || prior.get(id) !== JSON.stringify(row)) loaded.set(id, row); });
      prior.forEach((_value, id) => { if (!current.has(id)) loaded.delete(id); });
      next[key] = [...loaded.values()];
      baseline[key] = structuredClone(rows);
      hydratedCollections.current.add(key);
    });
    lastSaved.current = baseline;
    stateRef.current = next; setState(next);
    return next;
  }, []);

  const ensureVocabularyTeaching = useCallback((entries, options = {}) => {
    const ids = [...new Set(options.entryIds || entries.map(entry => entry.id))]
      .filter(id => !vocabularyTeachingIds.current.has(id)).sort();
    if (!ids.length) return Promise.resolve();
    const key = JSON.stringify(ids);
    if (vocabularyTeachingReads.current.has(key)) return vocabularyTeachingReads.current.get(key);
    const owner = accountId(), epoch = loadEpoch.current;
    const request = loadReleasedVocabularyTeaching({entryIds:ids,allowMissingEntryIds:true}).then(teaching => {
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
      for (const key of ['books','units','memberships']) {
        const identity = row => key === 'units' ? `${row.bookId}:${row.id}` : row.id;
        const rows = new Map(normalizeVocabularyIdentities(VOCABULARY_CATALOG[key]).map(row => [identity(row), row]));
        normalizeVocabularyIdentities(teaching[key]).forEach(row => rows.set(identity(row), key === 'books' ? genericWordbook(row) : row));
        VOCABULARY_CATALOG[key] = [...rows.values()];
      }
      ids.forEach(id => vocabularyTeachingIds.current.add(id));
      setVocabularyCatalogRevision(revision => revision + 1);
    }).finally(() => {
      if (vocabularyTeachingReads.current.get(key) === request) vocabularyTeachingReads.current.delete(key);
    });
    vocabularyTeachingReads.current.set(key, request);
    return request;
  }, []);

  const ensureAccountModule = useCallback((module, options = {}) => {
    const owner = accountId();
    const epoch = loadEpoch.current;
    if (moduleReads.current.has(module)) {
      const loaded = moduleReads.current.get(module);
      if (module !== 'vocabulary') return loaded;
      // Account rows are merged once. A later page can widen teaching readiness
      // without replaying that older snapshot over a learner's current edits.
      return loaded.then(async () => {
        if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
        await ensureVocabularyTeaching(stateRef.current.vocabulary || [], options);
        if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
        return stateRef.current;
      });
    }
    const before = structuredClone(stateRef.current);
    const finishTiming = timeOperation(module);
    setModuleStatus(status => ({...status, [module]:'loading'}));
    const request = readAccountModule(module).then(async ({data}) => {
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
      if (module === 'vocabulary') await ensureVocabularyTeaching(data.vocabulary || [], options);
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
      const next = mergeAccountData(data, before);
      if (module === 'productive') repairAssessments(next);
      if (module === 'vocabulary') {
        const corrected = resolveRegionalSpellingWrongWords(next);
        if (corrected.length) void persistNow(next);
      }
      setModuleStatus(status => ({...status, [module]:'ready'}));
      finishTiming();
      return next;
    }).catch(error => {
      finishTiming(true);
      if (moduleReads.current.get(module) === request) moduleReads.current.delete(module);
      if (alive.current && owner === accountId() && epoch === loadEpoch.current) setModuleStatus(status => ({...status, [module]:'error'}));
      throw error;
    });
    moduleReads.current.set(module, request);
    return request;
  }, [mergeAccountData, persistNow, ensureVocabularyTeaching]);

  const ensureCompleteAccount = useCallback(async () => {
    await Promise.all(Object.keys(ACCOUNT_MODULES).map(module => ensureAccountModule(module)));
    await readCompleteAccount();
    return structuredClone(stateRef.current);
  }, [ensureAccountModule]);

  const ensureQuestionBank = useCallback((skill, force = false) => {
    if (!force && bankReads.current.has(skill)) return bankReads.current.get(skill);
    const owner = accountId();
    const epoch = loadEpoch.current;
    setBankStatus(status => ({...status, [skill]:status[skill] === 'ready' ? 'ready' : 'loading'}));
    const request = readQuestionBank(skill, {force}).then(rows => {
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
      const key = skill === 'writing' ? 'questions' : 'speakingTopics';
      const retained = rows.map(row => {
        const previous = skill === 'speaking' && stateRef.current.speakingTopics.find(topic => topic.id === row.id);
        const samples = Object.fromEntries(['samples','sampleAnswer','sampleNotes','part3Samples'].filter(field => previous?.[field] !== undefined).map(field => [field, previous[field]]));
        return {...row, ...samples};
      });
      const next = {...stateRef.current, [key]: retained};
      stateRef.current = next; setState(next);
      if (skill === 'writing' && rows.length) setSelectedQuestionId(id => rows.some(row=>String(row.id)===String(id)) ? id : String(rows[0].id));
      if (skill === 'speaking' && rows.length) setSelectedTopicId(id => rows.some(row=>String(row.id)===String(id)) ? id : String(rows[0].id));
      setBankStatus(status => ({...status, [skill]:'ready'}));
      if (bankReads.current.get(skill) === request) bankReads.current.delete(skill);
      return rows;
    }).catch(error => {
      if (bankReads.current.get(skill) === request) {
        bankReads.current.delete(skill);
        if (alive.current && owner === accountId() && epoch === loadEpoch.current) setBankStatus(status => ({...status, [skill]:status[skill] === 'ready' ? 'ready' : 'error'}));
      }
      throw error;
    });
    bankReads.current.set(skill, request); return request;
  }, []);

  const ensureSpeakingSample = useCallback(async topicId => {
    const owner = accountId();
    const epoch = loadEpoch.current;
    const sample = await readSpeakingSample(topicId);
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
    if (sample) {
      const next = {...stateRef.current, speakingTopics:stateRef.current.speakingTopics.map(topic => String(topic.id) === String(topicId) ? {...topic,...sample,id:topic.id} : topic)};
      stateRef.current = next; setState(next);
    }
    return sample;
  }, []);

  useEffect(() => {
    if (!booted) return;
    const owner = accountId();
    const epoch = loadEpoch.current;
    const stops = ['writing','speaking'].map(skill => subscribeQuestionBank(skill, snapshot => {
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return;
      if (snapshot.rows !== undefined) {
        const key = skill === 'writing' ? 'questions' : 'speakingTopics';
        const rows = snapshot.rows.map(row => {
          if (skill !== 'speaking') return row;
          const previous = stateRef.current.speakingTopics.find(topic => topic.id === row.id);
          const samples = Object.fromEntries(['samples','sampleAnswer','sampleNotes','part3Samples'].filter(field => previous?.[field] !== undefined).map(field => [field, previous[field]]));
          return {...row, ...samples};
        });
        const next = {...stateRef.current, [key]: rows};
        stateRef.current = next; setState(next);
        setBankStatus(status => ({...status, [skill]: 'ready'}));
      }
      setBankErrors(errors => ({...errors, [skill]: snapshot.error ? 'Question bank could not be refreshed.' : ''}));
    }));
    return () => stops.forEach(stop => stop());
  }, [booted, loadGeneration]);

  function applyCommittedVocabulary(target, owner) {
    committedPlanChanges.current.filter(change => change.owner === owner && change.epoch===loadEpoch.current).forEach(change => {
      let applied=false;
      const before = new Map(change.before.map(plan=>[plan.id,JSON.stringify(plan)]));
      const after = new Map(change.after.map(plan=>[plan.id,plan]));
      target.plans = (target.plans || []).flatMap(plan => {
        if (!before.has(plan.id) || JSON.stringify(plan)!==before.get(plan.id)) return [plan];
        if(JSON.stringify(after.get(plan.id))!==before.get(plan.id))applied=true;
        return after.has(plan.id) ? [structuredClone(after.get(plan.id))] : [];
      });
      change.after.forEach(plan=>{ if (!before.has(plan.id) && !target.plans.some(row=>row.id===plan.id)) target.plans.push(structuredClone(plan)); });
      if (applied && target.activePlanId===change.beforeActivePlanId) target.activePlanId=change.afterActivePlanId;
      if (applied && target.settings.activeSkill===change.beforeActiveSkill) target.settings.activeSkill=change.afterActiveSkill;
    });
    committedVocabularyFields.current.filter(change => change.owner === owner).forEach(change => applyVocabularyFields(target, change));
    committedStudySettings.current.filter(change => change.owner === owner).forEach(change => {
      let staleSettings = change.beforeVocabulary !== undefined && JSON.stringify(target.settings.vocabulary) === change.beforeVocabulary;
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

  function applyVocabularyFields(target, change) {
    const rows = target[change.key] || (target[change.key] = []);
    let row = rows.find(item => item.id === change.id || change.key === 'wordbookProgress' && item.bookId === change.seed.bookId && item.unitId === change.seed.unitId);
    if (!row) { row = structuredClone(change.seed); rows.push(row); }
    Object.entries(change.after).forEach(([field, value]) => {
      if (change.key === 'vocabulary' && ['senses','sources'].includes(field)) {
        const identity = item => field === 'senses' ? item.id : vocabularySourceKey(item);
        const before = JSON.parse(change.before[field] || '[]');
        const prior = new Map(before.map(item=>[identity(item),JSON.stringify(item)]));
        const current = row[field] || (row[field] = []);
        value.forEach(item => {
          const id = identity(item); const index = current.findIndex(existing=>identity(existing)===id);
          if (index < 0) current.push(structuredClone(item));
          else if (JSON.stringify(current[index]) === prior.get(id)) current[index] = structuredClone(item);
        });
        return;
      }
      if (JSON.stringify(row[field]) === change.before[field]) row[field] = structuredClone(value);
    });
  }

  // Save targeted vocabulary fields without optimistic mutation. Queue execution
  // starts from the latest state; successful fields also survive older autosaves.
  const commitVocabularyFields = useCallback((prepare, options?: { onError?: (message: string) => void }) => {
    const owner = accountId();
    const epoch = loadEpoch.current;
    const generation = ++saveGeneration.current;
    setSaveStatus('saving');
    pendingAutomaticSave.current = null;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current || completingAttempt.current) return false;
      try { await ensureAccountModule('vocabulary'); } catch {
        if (alive.current && accountId() === owner && epoch === loadEpoch.current && generation === saveGeneration.current) {
          setSaveStatus('failed'); setSaveFailed(!options?.onError);
          saveFeedback(options)('Your vocabulary could not load. Retry saving.');
        }
        return false;
      }
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current || completingAttempt.current) return false;
      const before = structuredClone(stateRef.current);
      applyCommittedVocabulary(before, owner);
      const next = structuredClone(before);
      const targets = prepare(next);
      if (!targets) { setSaveStatus('failed'); setSaveFailed(!options?.onError); saveFeedback(options)('This vocabulary entry is unavailable. Reload it and retry.'); return false; }
      const changes = targets.flatMap(({key,id,fields}) => {
        const prior = before[key]?.find(row => row.id === id);
        const after = next[key]?.find(row => row.id === id);
        if (!after) return [];
        return [{owner,key,id,seed:structuredClone(after),before:Object.fromEntries(fields.map(field=>[field,JSON.stringify(prior?.[field])])),after:Object.fromEntries(fields.map(field=>[field,structuredClone(after[field])]))}];
      });
      let saved = false;
      const targetCollections = [...new Set(targets.map(target => target.key))];
      const ready = readySaveCollections();
      const collections = targetCollections.filter(key => !ready || ready.includes(key));
      try { saved = await saveState(next, saveFeedback(options), {collections}); } catch { saved = false; }
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      if (generation === saveGeneration.current) { setSaveFailed(!saved && !options?.onError); setSaveStatus(saved ? 'saved' : 'failed'); }
      if (saved) {
        acknowledgeSaved(next, collections);
        committedVocabularyFields.current.push(...changes);
        const current = structuredClone(stateRef.current);
        applyCommittedVocabulary(current, owner);
        stateRef.current = current; setState(current);
      }
      return saved;
    });
    saveQueue.current = operation;
    return operation;
  }, [toast, ensureAccountModule]);

  const saveVocabularyLearning = useCallback((bookId, unitId, learning, options?) => {
    const frozen = structuredClone(learning);
    return commitVocabularyFields(next => {
      let row = next.wordbookProgress.find(item => item.bookId === bookId && item.unitId === unitId);
      if (!row) { row = {id:`learning:${JSON.stringify([bookId,unitId])}`,bookId,unitId,completedEntryIds:[],status:'in_progress',updatedAt:frozen.updatedAt}; next.wordbookProgress.push(row); }
      row.learning = frozen; row.updatedAt = frozen.updatedAt;
      return [{key:'wordbookProgress',id:row.id,fields:['learning','updatedAt']}];
    }, options);
  }, [commitVocabularyFields]);

  const saveVocabularyStatus = useCallback((entryId, senseId, status, sourceEntry, options?) => commitVocabularyFields(next => {
    const stored = sourceEntry ? addVocabularyItem(next, sourceEntry).item : next.vocabulary.find(row=>row.id===entryId);
    const requestedSense = sourceEntry?.senses.find(sense=>sense.id===senseId);
    const canonicalSense = stored?.senses.find(sense=>sense.id===senseId) || (requestedSense && stored?.senses.find(sense=>normalizeAnswer(sense.definition)===normalizeAnswer(requestedSense.definition) && normalizeAnswer(sense.pos)===normalizeAnswer(requestedSense.pos)));
    if (!stored || !canonicalSense) return null;
    const learning = setVocabularyManualStatus(next, stored.id, status, canonicalSense.id);
    if (!learning) return null;
    const targets = [{key:'vocabularyStates',id:learning.id,fields:['manualStatus','statusSource','updatedAt']}];
    if (sourceEntry) targets.push({key:'vocabulary',id:stored.id,fields:['senses','sources','updatedAt']});
    return targets;
  }, options), [commitVocabularyFields]);

  const saveVocabularyEntry = useCallback((input, options?) => {
    const frozen = structuredClone(input);
    return commitVocabularyFields(next => {
      const result = addVocabularyItem(next, frozen);
      if (!result.item) return null;
      return [{key:'vocabulary',id:result.item.id,fields:['senses','sources','updatedAt']}, ...next.vocabularyStates.filter(row=>row.entryId===result.item.id).map(row=>({key:'vocabularyStates',id:row.id,fields:[]}))];
    }, options);
  }, [commitVocabularyFields]);

  const saveVocabularyStatuses = useCallback((ids, status, options?) => {
    const selected = [...ids];
    return commitVocabularyFields(next => selected.flatMap(id => {
      const entry = next.vocabulary.find(item => item.id === id);
      return (entry?.senses || []).flatMap(sense => {
        const learning = setVocabularyManualStatus(next, id, status, sense.id);
        return learning ? [{key:'vocabularyStates',id:learning.id,fields:['manualStatus','statusSource','updatedAt']}] : [];
      });
    }), options);
  }, [commitVocabularyFields]);

  function applyStudyPlans(target, change, staleSettings) {
    let stalePlans = false;
    change.removedPlans.forEach(before => {
      const index = target.plans.findIndex(plan => plan.id === before.id && JSON.stringify(plan) === JSON.stringify(before));
      if (index < 0) return;
      stalePlans = true;
      if (target.activePlanId === before.id && change.beforeActivePlanId === before.id) target.activePlanId = change.afterActivePlanId;
      const replacement = change.addedPlans.find(plan => plan.id === before.id);
      if (replacement) target.plans[index] = structuredClone(replacement);
      else target.plans.splice(index, 1);
    });
    if (staleSettings || stalePlans) change.addedPlans.forEach(plan => { if (!target.plans.some(row => row.id === plan.id)) target.plans.push(structuredClone(plan)); });
    if (change.removedPlanIds.includes(target.activePlanId) && !target.plans.some(plan => plan.id === target.activePlanId)) target.activePlanId = null;
  }

  const persistVocabularyImport = useCallback((draft, batchId, options?) => {
    const owner = accountId();
    const epoch = loadEpoch.current;
    const before = structuredClone(stateRef.current);
    const frozen = structuredClone(draft);
    setSaveStatus('saving');
    pendingAutomaticSave.current = null;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      applyCommittedVocabulary(frozen, owner);
      const saved = await saveVocabularyImport(frozen, batchId, saveFeedback(options));
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      if (alive.current && accountId() === owner) {
        setSaveFailed(!saved && !options?.onError); setSaveStatus(saved ? 'saved' : 'failed');
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

  const persistVocabularySession = useCallback((draft, sessionId, options?) => {
    const owner=accountId();const before=structuredClone(stateRef.current);const frozen=structuredClone(draft);
    const epoch = loadEpoch.current;
    const generation=++saveGeneration.current;setSaveStatus('saving');
    const keys=[...vocabularyLists,'vocabularySessions'];
    pendingAutomaticSave.current = null;
    const operation=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!alive.current || accountId()!==owner || epoch !== loadEpoch.current)return false;
      applyCommittedVocabulary(frozen,owner);
      let saved=false;try{saved=await saveVocabularySession(frozen,sessionId,saveFeedback(options));}catch{saved=false;}
      if(!alive.current || accountId()!==owner || epoch !== loadEpoch.current)return false;
      if(alive.current&&accountId()===owner){
        if(generation===saveGeneration.current){setSaveFailed(!saved && !options?.onError);setSaveStatus(saved?'saved':'failed');}
        if(saved){
          keys.forEach(key=>{const previous=new Map((before[key]||[]).map(row=>[row.id,JSON.stringify(row)]));(frozen[key]||[]).forEach(row=>{if(previous.get(row.id)!==JSON.stringify(row))committedVocabularyImports.current.push({owner,key,before:previous.get(row.id),after:structuredClone(row)});});});
          const next=structuredClone(stateRef.current);applyCommittedVocabulary(next,owner);stateRef.current=next;setState(next);if(readVocabularyDraft(owner)?.id===sessionId)clearVocabularyDraft(owner);
          const session = frozen.vocabularySessions?.find(row=>row.id===sessionId);
          void mutatePlans(draft=>completeVocabularyPlan(draft,session)).catch(()=>{});
        }
      }
      return saved;
    });saveQueue.current=operation;return operation;
  },[toast]);

  const saveVocabularyPreferences = useCallback(async(input)=>{
    studySettingsErrorRef.current = '';
    setStudySettingsError('');
    const owner=accountId();const changes=structuredClone(input);
    const epoch = loadEpoch.current;
    const generation=++saveGeneration.current;setSaveStatus('saving');
    pendingAutomaticSave.current = null;
    const operation=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!alive.current || accountId()!==owner || epoch !== loadEpoch.current)return false;
      const current=structuredClone(stateRef.current);applyCommittedVocabulary(current,owner);
      const preferences=normalizeVocabularyPreferences({...current.settings.vocabulary,...changes});current.settings.vocabulary=preferences;
      const previousPreferences=JSON.stringify(stateRef.current.settings.vocabulary);
      const collections = ['profile'];
      let saved=false;try{saved=await saveState(current,message=>{if(!alive.current || accountId()!==owner || epoch!==loadEpoch.current)return;studySettingsErrorRef.current=`${message} Your changes are still here.`;setStudySettingsError(studySettingsErrorRef.current);},{collections});}catch{saved=false;}
      if(!alive.current || accountId()!==owner || epoch !== loadEpoch.current)return false;
      if(alive.current&&accountId()===owner){if(generation===saveGeneration.current){setSaveFailed(false);setSaveStatus(saved?'saved':'failed');}if(saved){committedVocabularyPreferences.current.push({owner,before:previousPreferences,after:structuredClone(preferences)});const next=structuredClone(stateRef.current);next.settings.vocabulary=preferences;stateRef.current=next;setState(next);}}
      return saved;
    });saveQueue.current=operation;return operation;
  },[toast]);

  const saveStudySettings = useCallback(async (input) => {
    studySettingsErrorRef.current = '';
    setStudySettingsError('');
    if (completingAttempt.current) return false;
    const owner = accountId();
    const epoch = loadEpoch.current;
    try {
      await ensureAccountModule('productive');
      await ensureAccountModule('vocabulary');
      await ensureAccountModule('receptive');
      if (stateRef.current.wordbookEnrollments?.length) await loadVocabularyCatalog();
    } catch { if(alive.current && owner===accountId() && epoch===loadEpoch.current){studySettingsErrorRef.current = 'Could not load your study data. Your changes are still here. Check your connection and retry.'; setStudySettingsError(studySettingsErrorRef.current);} return false; }
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return false;
    const changes = structuredClone(input);
    const generation = ++saveGeneration.current;
    setSaveStatus('saving');
    pendingAutomaticSave.current = null;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      const current = structuredClone(stateRef.current);
      applyCommittedVocabulary(current, owner);
      const beforeVocabulary = JSON.stringify(current.settings.vocabulary);
      const studyChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'vocabulary'));
      const change = {
        owner,
        before: Object.fromEntries(Object.keys(studyChanges).map(key => [key, JSON.stringify(current.settings[key])])),
        after: studyChanges,
        beforeVocabulary: Object.prototype.hasOwnProperty.call(changes, 'vocabulary') ? beforeVocabulary : undefined,
        removedPlanIds: [],
        removedPlans: [],
        addedPlans: [],
        beforeActivePlanId: current.activePlanId,
        afterActivePlanId: current.activePlanId,
      };
      const previousPlanningKey = planningSettingsKey(current.settings);
      Object.assign(current.settings, studyChanges);
      if (Object.prototype.hasOwnProperty.call(changes, 'vocabulary')) current.settings.vocabulary = normalizeVocabularyPreferences({ ...current.settings.vocabulary, ...changes.vocabulary });
      if (planningSettingsKey(current.settings) !== previousPlanningKey) {
        const previousPlans = structuredClone(current.plans);
        ensureUnifiedPlans(current);
        try { await bindCurrentPlanTargets(current); }
        catch (error) { if(alive.current && owner===accountId() && epoch===loadEpoch.current && generation===saveGeneration.current){setSaveFailed(false);setSaveStatus('failed');studySettingsErrorRef.current=`${error instanceof Error ? error.message : 'Could not load the planned exercises.'} Your changes are still here. Retry saving.`;setStudySettingsError(studySettingsErrorRef.current);}return false; }
        // Replay only the canonical planner/binder changes, preserving concurrent plan edits.
        const previousById = new Map(previousPlans.map(plan => [plan.id, JSON.stringify(plan)]));
        const currentById = new Map(current.plans.map(plan => [plan.id, JSON.stringify(plan)]));
        change.removedPlans = previousPlans.filter(plan => currentById.get(plan.id) !== JSON.stringify(plan));
        change.removedPlanIds = change.removedPlans.map(plan => plan.id);
        change.addedPlans = current.plans.filter(plan => previousById.get(plan.id) !== JSON.stringify(plan));
        change.afterActivePlanId = current.activePlanId;
      }
      let saved = false;
      const collections = ['profile', 'plans'];
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      try { saved = await saveState(current, message => {if(!alive.current || accountId()!==owner || epoch!==loadEpoch.current)return;studySettingsErrorRef.current=`${message} Your changes are still here.`;setStudySettingsError(studySettingsErrorRef.current);}, {collections}); } catch { saved = false; }
      if (!alive.current || accountId() !== owner || epoch !== loadEpoch.current) return false;
      if (generation === saveGeneration.current) { setSaveFailed(false); setSaveStatus(saved ? 'saved' : 'failed'); }
      if (saved) {
        committedStudySettings.current.push(change);
        if (Object.prototype.hasOwnProperty.call(changes, 'vocabulary')) committedVocabularyPreferences.current.push({ owner, before: beforeVocabulary, after: structuredClone(current.settings.vocabulary) });
        const next = structuredClone(stateRef.current);
        applyCommittedVocabulary(next, owner);
        stateRef.current = next;
        setState(next);
        acknowledgeSaved(current, collections);
      }
      return saved;
    });
    saveQueue.current = operation;
    return operation;
  }, [toast, ensureAccountModule, ensureQuestionBank]);

  const loadVocabularyCatalog = useCallback((bookId, options = {}) => {
    const key = JSON.stringify([bookId || 'metadata', options.unitId, [...(options.entryIds || [])].sort()]);
    if (options.force) vocabularyCatalogReads.current.delete(key);
    if (vocabularyCatalogReads.current.has(key)) return vocabularyCatalogReads.current.get(key);
    const read = (async () => {
      const merge = (key, values) => {
        const identity = item => key === 'units' ? `${item.bookId}:${item.id}` : item.id;
        const rows = new Map(normalizeVocabularyIdentities(VOCABULARY_CATALOG[key]).map(item => [identity(item), item]));
        normalizeVocabularyIdentities(values).forEach(item => rows.set(identity(item), key === 'books' ? genericWordbook(item) : item));
        VOCABULARY_CATALOG[key] = [...rows.values()];
      };
      const owner = accountId();
      const epoch = loadEpoch.current;
      let releasedCatalogue;
      try {
        releasedCatalogue = await requestTimeout(loadReleasedVocabulary({ bookId, ...options }));
      } catch {
        if (options.unitId || options.entryIds?.length) {
          try {
            const teaching = await loadReleasedVocabularyTeaching({bookId, ...options, allowMissingEntryIds: true});
            if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
            merge('books', teaching.books); merge('units', teaching.units);
          } catch (error) {
            if (!(error instanceof VocabularyScopeUnavailableError)) throw error;
          }
        }
      }
      if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
      if(releasedCatalogue) {
        releasedCatalogue=normalizeVocabularyIdentities(releasedCatalogue);
        const completeBooks=new Set(releasedCatalogue.books.filter(book=>book.contentStatus==='complete').map(book=>book.id));
        const starterUnits=new Set(VOCABULARY_CATALOG.units.filter(unit=>completeBooks.has(unit.bookId)&&unit.kind==='starter').map(unit=>unit.id));
        VOCABULARY_CATALOG.memberships=VOCABULARY_CATALOG.memberships.filter(member=>!starterUnits.has(member.unitId));
        VOCABULARY_CATALOG.units=VOCABULARY_CATALOG.units.filter(unit=>!(completeBooks.has(unit.bookId) && unit.kind==='starter'));
        merge('books',releasedCatalogue.books);
        // Metadata already includes group membership; expose accurate counts before a book is opened.
        merge('units',releasedCatalogue.units); merge('memberships',releasedCatalogue.memberships);
        if(bookId || options.entryIds?.length) {
          const memberships=releasedCatalogue.memberships.filter(row=>row.bookId===bookId);
          const entryIds=new Set(memberships.map(row=>row.entryId));
          merge('memberships',memberships);merge('entries',releasedCatalogue.entries);merge('units',releasedCatalogue.units.filter(row=>row.bookId===bookId));
        }
      }
      if (!releasedCatalogue) {
        const scopes = options.unitId && options.entryIds?.length
          ? [{...options, entryIds: undefined}, {...options, unitId: undefined}]
          : [options];
        for (const scope of scopes) {
          let offset = 0;
          do {
            const result = await requestTimeout(readVocabularyCatalog({ bookId, ...scope, offset, limit: 500 }));
            if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) throw new Error('Account load superseded');
            merge('entries', result.entries); merge('books', result.books); merge('units', result.units); merge('memberships', result.memberships);
            offset = result.nextOffset;
          } while (offset !== null);
        }
        if (options.unitId) {
          const group = VOCABULARY_CATALOG.units.find(row => row.bookId === bookId && row.id === options.unitId);
          if (!group) throw new Error('Vocabulary group is unavailable.');
          const members = VOCABULARY_CATALOG.memberships.filter(row => row.bookId === bookId && row.unitId === options.unitId);
          const expected = group.entryIds || members.map(row => row.entryId);
          const entries = new Set([...VOCABULARY_CATALOG.entries, ...stateRef.current.vocabulary].map(row => row.id));
          if (expected.some(id => !entries.has(id) || !members.some(row => row.entryId === id)) || members.length < Number(group.entryCount || group.totalSourceWords || 0)) throw new Error('Vocabulary group content is incomplete.');
        }
      }
      setVocabularyCatalogRevision(revision => revision + 1);
      return true;
    })().catch(error => { vocabularyCatalogReads.current.delete(key); throw error; });
    vocabularyCatalogReads.current.set(key, read);
    return read;
  }, []);

  const scheduleDraftPersist = useCallback(() => {
    const scopes = changedDraftScopes(stateRef.current).filter(scope => {
      const tracked = draftStatusesRef.current[scope.key];
      return tracked?.stamp !== scope.stamp || tracked.status === 'unsaved' || tracked.status === 'failed';
    });
    if (!scopes.length) return;
    markDraftScopes(scopes, 'pending');
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      const needsSave = changedDraftScopes(stateRef.current).some(scope => {
        const tracked = draftStatusesRef.current[scope.key];
        return tracked?.status !== 'saving' && !tracked?.queued;
      });
      if (!needsSave) return;
      queueSave(stateRef.current, true, false, { collections: ['drafts'] });
    }, 1500);
  }, [persistNow]);

  const flushDraftPersist = useCallback(() => {
    if (!draftTimer.current) return null;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    return persistNow(undefined, { collections: ['drafts'] });
  }, [persistNow]);

  useEffect(() => {
    const onUnload = () => flushDraftPersist();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flushDraftPersist]);

  const activeSkill = ['writing','speaking','reading','listening'].includes(state.settings.activeSkill) ? state.settings.activeSkill : 'writing';

  const selectedQuestion =
    state.questions.find((q) => String(q.id) === String(selectedQuestionId)) ||
    state.questions[0] ||
    FALLBACK_QUESTIONS[0];

  const selectedTopic =
    (selectedTopicId && state.speakingTopics.find((t) => String(t.id) === String(selectedTopicId))) ||
    state.speakingTopics[0] ||
    null;
  const deskPart = deskPartOverride || String(selectedTopic?.part || '2');

  const currentDeskMode = useCallback(() => {
    const plan = state.plans.find((item) => item.id === state.activePlanId);
    return (plan ? inferredDeskMode(plan) : null) || activeDeskMode || 'full';
  }, [state.plans, state.activePlanId, activeDeskMode]);

  const openModal = useCallback((name: ModalName) => setModal(name), []);
  const closeModal = useCallback(() => { if (!completingAttempt.current) setModal(null); }, []);

  const setSkill = useCallback(
    (skill: string, path?: string | false) => {
      if (!['writing', 'speaking','reading','listening'].includes(skill)) return;
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
      if (JSON.stringify(current) === JSON.stringify(next)) return false;
      stateRef.current.drafts[id] = next;
      markDraftEdited(id, current, next);
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
      return true;
    },
    [],
  );

  const setSpeakingDraft = useCallback((topicId: string, patch: object) => {
    const current = normalizeDraft(stateRef.current.drafts[topicId]);
    const next = updateSpeakingResponse(current, patch);
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    stateRef.current.drafts[topicId] = next;
    markDraftEdited(topicId, current, next);
    saveGeneration.current += 1;
    writeDraftRecovery(accountId(), stateRef.current.drafts);
    setSaveStatus('saving');
    setState((prev) => ({ ...prev, drafts: { ...prev.drafts, [topicId]: next } }));
    return true;
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
    loadEpoch.current += 1;
    draftStatusesRef.current = {};
    setDraftStatuses({});
    hydratedCollections.current.clear();
    moduleReads.current.clear(); bankReads.current.clear(); vocabularyCatalogReads.current.clear();
    vocabularyTeachingReads.current.clear(); vocabularyTeachingIds.current.clear();
    setBooted(false);
    (async () => {
      let draft;
      setLoadError('');
      const finishTiming = timeOperation('workspace');
      const prefetchModules = accountRoute.startsWith('/vocabulary') ? ['vocabulary']
        : /^\/(reading|listening)/.test(accountRoute) ? ['receptive']
        : accountRoute.startsWith('/write') || accountRoute.startsWith('/speak') ? ['productive']
        : accountRoute.startsWith('/review') ? ['productive','vocabulary']
        : accountRoute === '/stories' ? ['productive']
        : accountRoute === '/progress' ? ['productive','vocabulary','receptive'] : [];
      const prefetchBanks = accountRoute.startsWith('/write') ? ['writing'] : accountRoute.startsWith('/speak') || accountRoute === '/stories' ? ['speaking'] : [];
      try { draft = await hydrateState({modules:[], prefetchModules, prefetchBanks}); } catch {
        finishTiming(true);
        if (!cancelled) setLoadError('Could not load your workspace. Check your connection and retry.');
        return;
      }
      if (cancelled) return;
      finishTiming();
      const statuses = getCollectionStatuses();
      if (statuses) Object.entries(statuses).forEach(([key, status]) => { if (status === 'ready') hydratedCollections.current.add(key); });
      Object.entries(ACCOUNT_MODULES).forEach(([module,keys]) => {
        const ready = !statuses || keys.every(key => statuses[key] === 'ready');
        if (ready) moduleReads.current.set(module, Promise.resolve(draft));
      });
      setModuleStatus(Object.fromEntries(Object.entries(ACCOUNT_MODULES).map(([module,keys]) => [module, !statuses || keys.every(key => statuses[key] === 'ready') ? 'ready' : 'unloaded'])));
      setBankStatus({writing:draft.questions.length?'ready':'unloaded',speaking:draft.speakingTopics.length?'ready':'unloaded'});
      lastSaved.current = structuredClone(draft);
      const correctedSpellings = resolveRegionalSpellingWrongWords(draft);
      const recovery = readDraftRecovery(accountId());
      const changedDrafts = recovery ? differentDrafts(recovery.drafts, draft.drafts) : {};
      if (Object.keys(changedDrafts).length) setRecoveryDrafts(changedDrafts);
      if (!statuses) {
        repairAssessments(draft);
        ensurePlans(draft, draft.settings.activeSkill || 'writing', null);
      }
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
            const text = await response.text();
            await ensureCompleteAccount();
            if (cancelled) return;
            draft = structuredClone(stateRef.current);
            const result = importAssessmentText(draft, text, filename);
            if (result.invalid) {
              toast(result.reason);
            } else {
              if (!await persistNow(draft)) { toast('Could not save imported feedback. Retry the import.'); return; }
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
      if (topic && normalizeDraft(stateRef.current.drafts[topic.id]).targetPrompt) {
        setSpeakingDraft(topic.id, { targetPrompt: undefined });
        scheduleDraftPersist();
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
          setSpeakingDraft(topic.id, { ...speakingPrompts(topic, '2')[0], notes });
          persistNow();
        }
      }
      navigate('/speak');
    },
    [navigate, persistNow, setSpeakingDraft],
  );

  const legacyStartPlan = useCallback(
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
        const skill = String(plan.kind).startsWith('reading') ? 'reading' : String(plan.kind).startsWith('listening') ? 'listening' : null;
        if (skill && plan.linkedSessionId) navigate(plan.kind === 'listening-intensive' ? receptivePlanPath(plan, skill) : `/${skill}/review/${plan.linkedSessionId}`);
        else navigate(skill ? `/review?skill=${skill}` : '/review');
        return;
      }
      if (/^(reading|listening)-/.test(String(plan.kind))) {
        const skill = String(plan.kind).startsWith('reading') ? 'reading' : 'listening';
        domainStartPlan(draft, planId);
        draft.settings.activeSkill = skill;
        persistNow(draft);
        setActiveDeskMode(inferredDeskMode(plan));
        navigate(receptivePlanPath(plan, skill));
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

  const mutatePlans = useCallback((mutate, options?: { onError?: (message: string) => void }) => {
    if (completingAttempt.current) return Promise.resolve(false);
    const owner=accountId();const epoch=loadEpoch.current;const generation=++saveGeneration.current;
    pendingAutomaticSave.current=null;setSaveStatus('saving');
    const operation=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!alive.current||accountId()!==owner||epoch!==loadEpoch.current)return false;
      const statuses=getCollectionStatuses();
      if(statuses && (statuses.plans!=='ready'||statuses.profile!=='ready'))throw new Error('Your plan is still loading. Retry shortly.');
      const current=structuredClone(stateRef.current);applyCommittedVocabulary(current,owner);
      const before=structuredClone(current.plans);const beforeActivePlanId=current.activePlanId;const beforeActiveSkill=current.settings.activeSkill;
      await mutate(current);
      if(!alive.current||accountId()!==owner||epoch!==loadEpoch.current)return false;
      const change={owner,epoch,before,after:structuredClone(current.plans),beforeActivePlanId,afterActivePlanId:current.activePlanId,beforeActiveSkill,afterActiveSkill:current.settings.activeSkill};
      if(JSON.stringify(before)===JSON.stringify(change.after)&&beforeActivePlanId===change.afterActivePlanId&&beforeActiveSkill===change.afterActiveSkill){if(generation===saveGeneration.current)setSaveStatus('saved');return true;}
      const collections=readySaveCollections()?.filter(key=>key==='profile'||key==='plans');
      let saved=false;try{saved=await saveState(current,saveFeedback(options),{collections});}catch{saved=false;}
      if(!alive.current||accountId()!==owner||epoch!==loadEpoch.current)return false;
      if(generation===saveGeneration.current){setSaveFailed(!saved && !options?.onError);setSaveStatus(saved?'saved':'failed');}
      if(saved){committedPlanChanges.current.push(change);const next=structuredClone(stateRef.current);applyCommittedVocabulary(next,owner);stateRef.current=next;setState(next);acknowledgeSaved(current,collections);}
      return saved;
    }).catch(error=>{if(alive.current&&accountId()===owner&&epoch===loadEpoch.current&&generation===saveGeneration.current){setSaveStatus('failed');setSaveFailed(!options?.onError);}throw error;});
    saveQueue.current=operation;return operation;
  },[toast]);

  const refreshUnifiedPlans = useCallback(async(options?)=>{
    await Promise.all(['productive','vocabulary','receptive'].map(module=>ensureAccountModule(module)));
    if(stateRef.current.wordbookEnrollments?.length)await loadVocabularyCatalog();
    return mutatePlans(async draft=>{
      for(const session of draft.vocabularySessions || [])completeVocabularyPlan(draft,session);
      ensureUnifiedPlans(draft);
      await bindCurrentPlanTargets(draft);
    },options);
  },[ensureAccountModule,mutatePlans,loadVocabularyCatalog,ensureQuestionBank]);

  async function bindCurrentPlanTargets(draft) {
    if(draft.wordbookEnrollments?.length)await loadVocabularyCatalog();
    await bindStudyPlanTargets(draft,{
      bank:ensureQuestionBank,catalog:loadExamCatalog,section:loadExamSections,
      vocabulary:async(bookId,unitId)=>{await loadVocabularyCatalog(bookId,{unitId});draft.vocabulary=stateRef.current.vocabulary;},
    });
  }

  const changePlan = useCallback((planId,action,options?)=>mutatePlans(async draft=>{
    mutateStudyPlan(draft,planId,action);
    if(['replace','add','duplicate','resize'].includes(action.type))await bindCurrentPlanTargets(draft);
  },options),[mutatePlans,loadVocabularyCatalog,ensureQuestionBank]);

  const saveBacklogPreview = useCallback((preview,options?)=>mutatePlans(draft=>applyBacklogPreview(draft,preview),options),[mutatePlans]);

  const startPlan = useCallback(async(planId:string, options={})=>{
    const owner=accountId();const epoch=loadEpoch.current;
    const taskSource = ['/planning','/today','/'].includes(accountLocation.pathname);
    const sourceHash = taskSource ? `#task-${planId}` : accountLocation.hash;
    const sourceUrl = safeVocabularyReturn(accountLocation.pathname + accountLocation.search + sourceHash, '/vocabulary');
    const returnState = vocabularyForwardState({...accountLocation, hash:sourceHash});
    const sourceHistoryIndex = window.history.state?.idx;
    const sourceHistoryKey = window.history.state?.key;
    const openVocabularyTask = path => {
      // A delayed start may finish after the learner leaves. Keep its saved progress,
      // but only navigate while the original router and browser entry are still owned.
      if(latestAccountLocation.current.key!==accountLocation.key
        || window.history.state?.idx!==sourceHistoryIndex
        || window.history.state?.key!==sourceHistoryKey)return;
      // Back pops this owned source entry. Replace its hash before pushing practice,
      // so successful completion can still render the exact historical task.
      if(taskSource && sourceHash!==accountLocation.hash)navigate(sourceUrl,{replace:true,state:accountLocation.state});
      navigate(path,{state:returnState});
    };
    rememberVocabularyPosition(sourceUrl, `task-${planId}`);
    rememberVocabularyPosition(accountLocation.pathname + accountLocation.search + accountLocation.hash, `task-${planId}`);
    let noLongerDue = false;
    let dynamicReviewCapacity: number | undefined;
    let plan=structuredClone(stateRef.current.plans.find(row=>row.id===planId));
    if(!plan)throw new Error('Task is unavailable. Reload your plan.');
    if(plan.status==='skipped')throw new Error('Restore this task before starting it.');
    if(plan.status==='completed'){
      if(plan.kind==='vocabulary'&&plan.linkedSessionId)openVocabularyTask(`/vocabulary/history/${encodeURIComponent(plan.linkedSessionId)}?${new URLSearchParams({returnTo:sourceUrl})}`);
      else legacyStartPlan(planId);
      return true;
    }
    if(plan.kind==='stories'){
      await ensureAccountModule('productive');await ensureQuestionBank('speaking',Boolean(options.force));
      if(!alive.current||owner!==accountId()||epoch!==loadEpoch.current)return false;
      if(!stateRef.current.stories.length){navigate('/stories');return true;}
      legacyStartPlan(planId);return true;
    }
    const skill=plan.skill || (String(plan.kind).startsWith('reading')?'reading':String(plan.kind).startsWith('listening')?'listening':String(plan.kind).startsWith('speaking')||plan.kind==='stories'?'speaking':plan.kind==='vocabulary'?'vocabulary':'writing');
    const initial=JSON.stringify(plan);
    await ensureAccountModule(skill==='vocabulary'?'vocabulary':['reading','listening'].includes(skill)?'receptive':'productive');
    let target=plan.target;
    if(skill==='writing'||skill==='speaking') {
      if(plan.kind==='review'){
        target=target||{type:'error-review',errorIds:(plan.targetErrorIds||[])};
        if(!target.errorIds?.length||target.errorIds.some(id=>!stateRef.current.errors.some(error=>error.id===id)))throw new Error('The selected review is unavailable. Replace the task or retry.');
      } else {
        const bank=await ensureQuestionBank(skill,Boolean(options.force));
        if(plan.kind==='writing-mock' && (!bank.some(question=>String(question.type)==='1')||!bank.some(question=>String(question.type)==='2')))throw new Error('Both writing mock questions must be available. Retry loading the bank.');
        if(plan.kind==='speaking-mock' && (!bank.some(topic=>String(topic.part)==='1'&&!topic.incomplete)||!bank.some(topic=>String(topic.part)==='2'&&!topic.incomplete)))throw new Error('Both speaking mock topics must be available. Retry loading the bank.');
        const stagePart=plan.kind==='speaking-mock'?(plan.stage==='p3'?'3':plan.stage==='p2'?'2':'1'):plan.kind.slice(-1);
        const kind=plan.kind==='writing-mock'?(plan.stage==='task2'?'2':'1'):plan.kind;
        const wanted=target?.questionId||plan.questionId;
        const topicPart=stagePart==='3'?'2':stagePart;
        const candidates=bank.filter(row=>skill==='writing'?String(row.type)===kind:String(row.part)===topicPart&&!row.incomplete).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        const question=wanted?bank.find(row=>String(row.id)===String(wanted)):candidates[0];
        if(!question)throw new Error('The selected question is unavailable. Retry loading its bank.');
        target={...target,type:'question',skill,questionId:String(question.id),mode:inferredDeskMode(plan),...(skill==='speaking'?{part:stagePart}:{})};
        if (skill === 'speaking') { const bound = { ...plan, target }; bindSpeakingPlan(bound, question, stagePart, plan.targetPrompt, bank); target = bound.target; if (bound.speakingGroups) plan.speakingGroups = bound.speakingGroups; }
        plan.questionId=String(question.id);
      }
    } else if(skill==='vocabulary'){
      if(target?.type!=='vocabulary')throw new Error('Replace this old vocabulary task to bind a learning batch.');
      if(target.mode==='learning-batch'){
        if(!target.unitId){
          await loadVocabularyCatalog();
          const groups=VOCABULARY_CATALOG.units.filter(unit=>unit.bookId===target.bookId&&unit.kind!=='chapter').slice().sort((a,b)=>(a.order||0)-(b.order||0)||String(a.id).localeCompare(String(b.id)));
          let localIndex=target.batchOrdinal ?? target.batchIndex ?? 0;let group;
          for(const candidate of groups){
            const total=Math.ceil(Number(candidate.entryCount||candidate.totalSourceWords||candidate.entryIds?.length||0)/(target.batchSize||10));
            if(localIndex<total){group=candidate;break;}localIndex-=total;
          }
          if(!group)throw new Error('The wordbook group is unavailable. Retry loading it.');
          target={...target,unitId:group.id,batchIndex:localIndex};
        }
        await loadVocabularyCatalog(target.bookId,{unitId:target.unitId});
        const batch=buildLearningBatch(stateRef.current,target.bookId,target.unitId,target.batchIndex||0,target.batchSize||10,target.assessmentMode,target.cards?.length?target.cards:undefined);
        if(!batch.cards.length)throw new Error('The selected word batch is unavailable. Replace the task or retry.');
        const refs=batch.cards.map(({entryId,senseId})=>({entryId,senseId}));
        if(target.cards?.length && JSON.stringify(target.cards)!==JSON.stringify(refs))throw new Error('This word batch has changed. Replace the task or retry.');
        target={...target,...batch.selection,type:'vocabulary',mode:'learning-batch',assessmentMode:batch.mode,cards:refs};
      } else {
        if (target.binding === 'dynamic' || !target.binding && !target.cards?.length) {
          const ids=stateRef.current.vocabulary.filter(entry=>!entry.tags.includes('archived')).map(entry=>entry.id);
          await loadVocabularyCatalog(undefined,{entryIds:ids,force:Boolean(options.force)});
          const capacity=Math.floor(Number(target.batchSize ?? plan.quantity ?? plan.estimatedMinutes ?? 10));
          if(!Number.isSafeInteger(capacity) || capacity<1 || capacity>10000)throw new Error('The planned review capacity must be between 1 and 10,000 cards.');
          dynamicReviewCapacity=capacity;
        } else {
          await loadVocabularyCatalog(undefined,{entryIds:[...new Set((target.cards||[]).map(ref=>ref.entryId))],force:Boolean(options.force)});
          target={...target,binding:'frozen'};
        }
        if (dynamicReviewCapacity===undefined) {
          if (!isVocabularySessionSelection({kind:'planned-review',planId,cards:target.cards})) throw new Error('The planned review target is invalid. Return to Planning and retry.');
          const vocabulary=[...new Map([...VOCABULARY_CATALOG.entries,...stateRef.current.vocabulary].map(entry=>[entry.id,entry])).values()];
          const cards=getVocabularyReviewQueue({...stateRef.current,vocabulary},{mode:target.assessmentMode,dueOnly:false});
          if(target.cards.some(ref=>!cards.some(card=>card.entryId===ref.entryId&&card.senseId===ref.senseId)))throw new Error('Some selected review words are unavailable. Retry loading them.');
        }
      }
    } else {
      const reviewId=target?.attemptId||plan.attemptId;
      if(plan.kind.endsWith('review')){
        if(!reviewId||!stateRef.current.examAttempts.some(attempt=>attempt.id===reviewId&&attempt.skill===skill))throw new Error('The selected attempt is unavailable. Retry loading your review.');
        target={type:'exam-review',skill,attemptId:reviewId};plan.attemptId=reviewId;
      } else {
        let sectionId=target?.sectionId||plan.sectionId;
        if(!sectionId){
          const catalog=await loadExamCatalog(skill,undefined,{force:Boolean(options.force)});
          const available=catalog.sections.filter(section=>section.skill===skill&&section.status==='ready').slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
          const serial=Number(String(plan.dateKey||dateKey(new Date())).replaceAll('-',''))+(plan.rotationIndex||0);
          const tried=new Set((stateRef.current.examAttempts||[]).filter(attempt=>attempt.skill===skill&&attempt.status==='completed').flatMap(attempt=>attempt.sectionIds));
          const fresh=available.filter(section=>!tried.has(section.id));const choices=fresh.length?fresh:available;
          sectionId=choices[serial%choices.length]?.id;
        }
        if(!sectionId)throw new Error('No practice section is available. Retry loading the bank.');
        const scoped=await loadExamSections([sectionId],{force:Boolean(options.force)});
        const section=scoped.sections.find(row=>row.id===sectionId&&row.skill===skill&&row.status==='ready');
        if(!section||!scoped.questions.some(question=>question.sectionId===sectionId))throw new Error('The selected section is incomplete. Retry loading it.');
        if(plan.kind==='listening-intensive'){
          const sentenceId=target?.sentenceId||plan.sentenceId;
          if(!sentenceId||!section.sentences.some(sentence=>sentence.id===sentenceId))throw new Error('The selected listening sentence is unavailable. Retry loading it.');
          target={type:'intensive',skill:'listening',sectionId,sentenceId};plan.sentenceId=sentenceId;
        } else {
          const questions=scoped.questions.filter(question=>question.sectionId===sectionId).slice().sort((a,b)=>a.number-b.number);
          const maximum=Math.floor(Number(plan.estimatedMinutes||stateRef.current.settings.dailyMinutes)/(skill==='reading'?2:1));
          if(maximum<1)throw new Error('This task needs more study time. Reschedule it with a larger daily budget.');
          const questionIds=target?.questionIds||questions.slice(0,maximum).map(question=>question.id);
          if(!questionIds.length||questionIds.length>maximum||questionIds.some(id=>!questions.some(question=>question.id===id)))throw new Error('The selected questions no longer fit this task. Replace it or retry.');
          target={type:'section',skill,sectionId,mode:'practice',questionIds};
        }
        plan.sectionId=sectionId;
      }
    }
    if(!alive.current||owner!==accountId()||epoch!==loadEpoch.current)return false;
    const saved=await mutatePlans(draft=>{
      const current=draft.plans.find(row=>row.id===planId);
      if(!current||JSON.stringify(current)!==initial)throw new Error('This task changed while loading. Retry to open the current task.');
      if(dynamicReviewCapacity!==undefined){
        const reserved=new Set(draft.plans.filter(row=>row.id!==planId && ['pending','in_progress'].includes(row.status) && row.target?.type==='vocabulary' && row.target.binding!=='dynamic' && row.target.assessmentMode===target.assessmentMode).flatMap(row=>(row.target.cards||[]).map(ref=>JSON.stringify([ref.entryId,ref.senseId]))));
        const cards=getVocabularyPlanningCandidates(draft,new Date(),target.assessmentMode).filter(({card})=>card.mode===target.assessmentMode && !reserved.has(JSON.stringify([card.entryId,card.senseId]))).slice(0,dynamicReviewCapacity).map(({card})=>({entryId:card.entryId,senseId:card.senseId}));
        target={...target,binding:'frozen',cards};
        noLongerDue=cards.length===0;
        if(!noLongerDue && !isVocabularySessionSelection({kind:'planned-review',planId,cards}))throw new Error('The planned review target is invalid. Return to Planning and retry.');
      }
      Object.assign(current,{target,questionId:plan.questionId,sectionId:plan.sectionId,sentenceId:plan.sentenceId,attemptId:plan.attemptId,...(plan.speakingGroups ? {speakingGroups:plan.speakingGroups} : {})});
      if (noLongerDue) { current.status='skipped'; current.skipReason='no-longer-due'; current.updatedAt=new Date().toISOString(); if(draft.activePlanId===planId)draft.activePlanId=null; }
      else domainStartPlan(draft,planId);
      if(skill!=='vocabulary')draft.settings.activeSkill=skill;
    },options);
    if(!saved)return false;
    if(noLongerDue)return true;
    setActiveDeskMode(inferredDeskMode(plan));
    if(skill==='vocabulary'){
      const params=new URLSearchParams({planId,returnTo:sourceUrl,mode:target.assessmentMode,dueOnly:'false',batchSize:String(target.cards.length),batchCards:JSON.stringify(target.cards)});
      if(target.mode==='learning-batch'){
        params.set('batch',String(target.batchIndex));params.set('batchSize',String(target.batchSize));
        openVocabularyTask(`/vocabulary/wordbooks/${encodeURIComponent(target.bookId)}/groups/${encodeURIComponent(target.unitId)}/learn?${params}`);
      } else openVocabularyTask(`/vocabulary/review?${params}`);
    } else if(skill==='reading'||skill==='listening'){
      const path=receptivePlanPath({...plan,target},skill);const params=new URLSearchParams({planId});if(target.questionIds)params.set('questions',JSON.stringify(target.questionIds));navigate(`${path}${path.includes('?')?'&':'?'}${params}`);
    } else if(plan.kind==='review')navigate('/review');
    else if(skill==='speaking') {startSpeakingPractice(plan.questionId,target.part,plan.storyId); const nextPrompt = target.prompts?.find(prompt => !(plan.completedPromptKeys || []).includes(prompt.promptKey)) || target.prompts?.[0]; setQuestionIndex(Math.max(0, target.prompts?.indexOf(nextPrompt) || 0)); setSpeakingDraft(plan.questionId,{...nextPrompt,practiceMode:target.mode,targetErrorIds:plan.targetErrorIds||[]});}
    else {chooseQuestion(plan.questionId);const existing=normalizeDraft(stateRef.current.drafts[plan.questionId]);setWritingDraft(plan.questionId,existing.text,{practiceMode:target.mode,targetErrorIds:plan.targetErrorIds||[]});navigate('/write');}
    return true;
  },[legacyStartPlan,ensureAccountModule,ensureQuestionBank,loadVocabularyCatalog,mutatePlans,navigate,startSpeakingPractice,chooseQuestion,setSpeakingDraft,setWritingDraft,accountLocation]);

  const saveAttempt = useCallback(
    async (exportForReview: boolean, saveFields: { focus: string; next: string; errors: string }, options?) => {
      if (!pendingAttempt || completingAttempt.current) return;
      const completionOwner = accountId();
      const completionEpoch = loadEpoch.current;
      if (pendingAttempt.owner && pendingAttempt.owner !== completionOwner) return false;
      completingAttempt.current = true;
      try { await ensureAccountModule('productive'); await ensureAccountModule('vocabulary'); } catch {
        completingAttempt.current = false; saveFeedback(options)('Could not load your study data. Your response is still here.'); return false;
      }
      if (!alive.current || completionOwner !== accountId()) { completingAttempt.current = false; return; }
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
          sections: speaking ? undefined : pendingAttempt.sections,
          focus: saveFields.focus,
          next: saveFields.next,
          parentSessionId: pendingAttempt.parentSessionId,
          planId: pendingAttempt.planId,
          skill: speaking ? 'speaking' : 'writing',
          part: speaking ? pendingAttempt.part : '',
          notes: speaking ? pendingAttempt.notes : '',
          audioId: speaking ? pendingAttempt.audioId || null : null,
          ...(speaking && pendingAttempt.promptKey ? { promptKey: pendingAttempt.promptKey, promptText: pendingAttempt.promptText, promptIndex: pendingAttempt.promptIndex } : {}),
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
      const matchedPlan = pendingAttempt.planId ? completePlanIfMatched(draft, pendingAttempt.planId, attempt) : null;
      if (!speaking && pendingAttempt.reviewErrorId) reviewError(draft, pendingAttempt.reviewErrorId);
      if (speaking) {
        if (pendingAttempt.promptKey) draft.drafts[question.id] = updateSpeakingResponse(draft.drafts[question.id], { ...pendingAttempt, transcript: '', notes: '', parentSessionId: null });
        else draft.drafts[question.id] = normalizeDraft({ ...normalizeDraft(draft.drafts[question.id]), transcript: '', notes: '', parentSessionId: null });
      }
      else {
        const current = normalizeDraft(draft.drafts[selectedQuestion.id]);
        draft.drafts[selectedQuestion.id] = Object.assign({}, current, { text: '', parentSessionId: null, sections: undefined });
      }
      let committed = draft;
      let liveBaseline = completionDrafts;
      let firstCommit = true;
      while (true) {
        const saved = await queueSave(committed, !firstCommit, true, { ...options, collections: ['drafts', 'sessions', 'errors', 'plans', 'profile', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyActivities'] });
        firstCommit = false;
        if (!alive.current || accountId() !== completionOwner || loadEpoch.current !== completionEpoch) { completingAttempt.current = false; return false; }
        if (!saved) { completingAttempt.current = false; writeDraftRecovery(completionOwner, stateRef.current.drafts); return false; }
        const liveDrafts = structuredClone(stateRef.current.drafts);
        const mergedDrafts = structuredClone(committed.drafts);
        // Rebase only edits made during this RPC. Unchanged response fields retain
        // the acknowledged completion (including the cleared submitted response).
        new Set([...Object.keys(liveBaseline), ...Object.keys(liveDrafts)]).forEach(id => {
          if (JSON.stringify(liveDrafts[id]) === JSON.stringify(liveBaseline[id])) return;
          if (!Object.prototype.hasOwnProperty.call(liveDrafts, id)) { delete mergedDrafts[id]; return; }
          const before = normalizeDraft(liveBaseline[id]); const live = normalizeDraft(liveDrafts[id]);
          const merged = normalizeDraft(mergedDrafts[id]);
          new Set([...Object.keys(before), ...Object.keys(live)]).forEach(field => {
            if (field === 'responses' || JSON.stringify(before[field]) === JSON.stringify(live[field])) return;
            if (Object.prototype.hasOwnProperty.call(live, field)) merged[field] = live[field]; else delete merged[field];
          });
          if (before.responses || live.responses) {
            const responses = { ...merged.responses };
            new Set([...Object.keys(before.responses || {}), ...Object.keys(live.responses || {})]).forEach(key => {
              if (JSON.stringify(before.responses?.[key]) === JSON.stringify(live.responses?.[key])) return;
              if (Object.prototype.hasOwnProperty.call(live.responses || {}, key)) responses[key] = live.responses[key]; else delete responses[key];
            });
            merged.responses = responses;
          }
          mergedDrafts[id] = normalizeDraft(merged);
        });
        if (JSON.stringify(mergedDrafts) === JSON.stringify(committed.drafts)) break;
        committed = { ...committed, drafts: mergedDrafts };
        liveBaseline = liveDrafts;
      }
      completingAttempt.current = false;
      stateRef.current = committed;
      setState(committed);
      discardDraftRecovery(completionOwner);
      if (speaking && pendingAttempt.audioId) void deletePendingAudio(completionOwner, question.id, pendingAttempt.part, pendingAttempt.promptKey);
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

      const activePlan = matchedPlan && pendingAttempt.planId
        ? draft.plans.find((item) => item.id === pendingAttempt.planId)
        : null;
      if (speaking && pendingAttempt.promptKey) {
        const target = normalizeDraft(committed.drafts[question.id]).targetPrompt;
        const sameGroup = activePlan?.status === 'in_progress' && String(activePlan.target?.part) === String(pendingAttempt.part) && String(activePlan.target?.questionId) === String(question.id);
        const prompts = sameGroup ? activePlan.target.prompts : target?.promptKey ? [target] : speakingPrompts(question, pendingAttempt.part);
        const completed = sameGroup ? new Set(activePlan.completedPromptKeys || []) : new Set(committed.sessions.filter(session => session.skill === 'speaking' && String(session.questionId) === String(question.id) && String(session.part) === String(pendingAttempt.part) && (session.planId || null) === (pendingAttempt.planId || null)).map(session => session.promptKey));
        const next = prompts.findIndex(prompt => !completed.has(prompt.promptKey));
        if (next >= 0 && (!activePlan || sameGroup)) { setQuestionIndex(next); setDraftRevision(value => value + 1); toast('Response saved. Next question.'); return true; }
      }
      if (activePlan && activePlan.kind === 'writing-mock' && activePlan.status === 'in_progress' && activePlan.stage === 'task2') {
        setActiveDeskMode('timed');
        const next = activePlan.target?.questionId ? draft.questions.find(question=>String(question.id)===activePlan.target.questionId) :
          selectWritingQuestion(draft, '2', draft.questions) ||
          draft.questions.find((item) => item.type === '2') ||
          draft.questions[0];
        chooseQuestion(next.id);
        toast('Task 1 is saved. Task 2 is next, 40 minutes.');
        return;
      }
      if (activePlan && activePlan.kind === 'speaking-mock' && activePlan.status === 'in_progress') {
        setActiveDeskMode('timed');
        const part = activePlan.stage === 'p1' ? '1' : activePlan.stage === 'p2' ? '2' : '3';
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
            ? 'Speaking practice saved. Feedback request exported. Import the marked file when it is ready.'
            : 'Writing practice saved. Feedback request exported. Import the marked file when it is ready.'
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
      ensureAccountModule,
      persistNow,
      selectedQuestion,
      startSpeakingPractice,
      toast,
    ],
  );

  const importFeedback = useCallback(async (text, filename) => {
    const owner = accountId();
    const epoch = loadEpoch.current;
    await ensureCompleteAccount();
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return { saved: false };
    const draft = structuredClone(stateRef.current);
    const result = importAssessmentText(draft, text, filename);
    if (result.invalid) return { ...result, saved: false };
    let error = '';
    const saved = await persistNow(draft, { collections: ['sessions', 'assessments', 'errors', 'plans', 'profile', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities'], onError: message => { error = message; } });
    return { ...result, saved, error };
  }, [persistNow, ensureCompleteAccount]);

  const toggleFavorite = useCallback((id, skill) => persist((draft) => {
    const favorites = draft.settings.favoriteQuestions || [];
    const key = `${skill}:${id}`;
    draft.settings.favoriteQuestions = favorites.includes(key) ? favorites.filter((value) => value !== key) : [...favorites, key];
  }), [persist]);

  const startingTargetedPractice = useRef(false);
  const startTargetedPractice = useCallback((session, errorId = null) => {
    if (!session || startingTargetedPractice.current) return Promise.resolve(false);
    const owner = accountId();
    const epoch = loadEpoch.current;
    const path = session.skill === 'speaking' ? '/speak' : '/write';
    const begin = async () => {
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current || startingTargetedPractice.current) return false;
    startingTargetedPractice.current = true;
    try {
    const speaking = session.skill === 'speaking';
    const id = String(session.questionId);
    try { await ensureQuestionBank(speaking ? 'speaking' : 'writing'); }
    catch { toast('Could not load the source question. Try again.'); return false; }
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return false;
    const source = (speaking ? stateRef.current.speakingTopics : stateRef.current.questions).find(item => String(item.id) === id);
    if (!source) { toast('The source question is unavailable. Your draft has been kept.'); return false; }
    const targetErrorIds = errorId ? [errorId] : stateRef.current.errors.filter((error) => error.sourceSessionId === session.id && !error.resolved).map((error) => error.id);
    const practiceMode = ['overview', 'outline', 'compare', 'body', 'timed', 'speak-blind', 'speak-notes', 'speak-full', 'speaking'].includes(session.practiceMode) ? session.practiceMode : 'full';
    const targetedPrompt = speaking && session.promptKey ? { promptKey: session.promptKey, promptText: session.promptText || '', promptIndex: session.promptIndex || 0, part: String(session.part || source.part || '2') } : null;
    const nextDraft = normalizeDraft({ text: speaking ? '' : session.essay, transcript: speaking ? session.essay : '', notes: session.notes || '', sections: speaking ? undefined : attemptSections(practiceMode, session.essay, session.sections), parentSessionId: session.id, targetErrorIds, practiceMode, ...targetedPrompt });
    const existing = speaking && targetedPrompt ? speakingResponseDraft(stateRef.current.drafts[id], targetedPrompt.promptKey) : normalizeDraft(stateRef.current.drafts[id]);
    const content = value => JSON.stringify([value.text, value.transcript, value.notes, value.sections || null]);
    const hasWork = Boolean(existing.text.trim() || existing.transcript.trim() || existing.notes.trim() || Object.values(existing.sections || {}).some(value => String(value).trim()));
    if (hasWork && content(existing) !== content(nextDraft) && !await confirmReplacement({ title: 'Replace existing draft?', description: 'Replace the existing response for this question with this attempt?', confirmLabel: 'Replace draft', destructive: true })) return false;
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return false;
    const live = speaking && targetedPrompt ? speakingResponseDraft(stateRef.current.drafts[id], targetedPrompt.promptKey) : normalizeDraft(stateRef.current.drafts[id]);
    if (content(live) !== content(existing)) { toast('The draft changed while confirmation was open. Try again.'); return false; }
    const draft = structuredClone(stateRef.current);
    draft.activePlanId = null;
    draft.drafts[id] = speaking ? normalizeDraft({ ...updateSpeakingResponse(draft.drafts[id], nextDraft), ...(targetedPrompt ? { targetPrompt: targetedPrompt } : { targetPrompt: undefined }) }) : nextDraft;
    draft.settings.activeSkill = speaking ? 'speaking' : 'writing';
    const saved = await persistNow(draft);
    if (!alive.current || owner !== accountId() || epoch !== loadEpoch.current) return false;
    if (!saved) { toast('Could not save the new draft. Your copy is still here. Retry before continuing.'); return false; }
    setActiveDeskMode(practiceMode);
    setDraftRevision(value => value + 1);
    if (speaking) { setSelectedTopicId(id); setDeskPart(String(session.part || source.part || '2')); setQuestionIndex(0); }
    else setSelectedQuestionId(id);
    closeModal();
    navigate(path);
    return true;
    } finally { startingTargetedPractice.current = false; }
    };
    let operation = Promise.resolve(false);
    navigateWithPracticeGuard(path, () => {
      operation = begin().catch(() => {
        if (alive.current && owner === accountId() && epoch === loadEpoch.current) toast('Could not open this attempt. Try again.');
        return false;
      });
    });
    return operation;
  }, [persistNow, navigate, ensureQuestionBank, toast, closeModal, confirmReplacement]);

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
      moduleStatus,
      bankStatus,
      bankErrors,
      ensureAccountModule,
      ensureCompleteAccount,
      ensureQuestionBank,
      ensureSpeakingSample,
      saveFailed,
      saveFailureMessage,
      studySettingsError,
      getStudySettingsError: () => studySettingsErrorRef.current,
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
      mutatePlans,
      saveBacklogPreview,
      changePlan,
      ensureUnifiedPlans: refreshUnifiedPlans,
      startSpeakingPractice,
      saveAttempt,
      ensurePlansForSkill: () => {
        const draft = stateRef.current;
        const statuses = getCollectionStatuses();
        if (statuses && Object.values(ACCOUNT_MODULES).flat().some(key => statuses[key] !== 'ready')) return draft.plans.filter(plan => planMatchesSkill(plan, activeSkill));
        if (['writing','speaking'].includes(activeSkill) && bankStatus[activeSkill] !== 'ready') return draft.plans.filter(plan => planMatchesSkill(plan, activeSkill));
        let changed = false;
        const plans = ensurePlans(draft, activeSkill, () => {
          changed = true;
        });
        if (changed) persistNow(draft);
        return plans;
      },
      writingDraft: (id: string) => draftText(state.drafts[id], 'writing'),
      confirmationDialog,
      draftSaveStatus: (id: string, promptKey?: string) => {
        const current = promptKey ? speakingResponseDraft(state.drafts[id], promptKey) : normalizeDraft(state.drafts[id]);
        const baseline = promptKey ? speakingResponseDraft(lastSaved.current?.drafts?.[id], promptKey) : normalizeDraft(lastSaved.current?.drafts?.[id]);
        const scoped = draftStatuses[JSON.stringify([accountId(), id, promptKey || ''])];
        if (scoped?.stamp === JSON.stringify(current) && scoped.status !== 'saved') return scoped.status;
        return JSON.stringify(current) === JSON.stringify(baseline) ? 'saved' : 'unsaved';
      },
      speakingDraft: (id: string, promptKey?: string) => speakingResponseDraft(state.drafts[id], promptKey),
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
      saveVocabularyLearning,
      saveVocabularyStatus,
      saveVocabularyEntry,
      saveVocabularyStatuses,
      saveVocabularyPreferences,
      saveStudySettings,
      loadVocabularyCatalog,
      vocabularyCatalogRevision,
      addStory,
      updateStory,
      removeStory,
      completeStoriesPlan,
      completeVocabularyPlan,
      completeReview: (draft,details) => completeReview(draft,{...details,planId:details?.planId||draft.activePlanId}),
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
      moduleStatus,
      bankStatus,
      bankErrors,
      ensureAccountModule,
      ensureCompleteAccount,
      ensureQuestionBank,
      ensureSpeakingSample,
      activeSkill,
      vocabularyCatalogRevision,
      backupMenuOpen,
      booted,
      checklistToastNeeded,
      chooseQuestion,
      saveFailed,
      saveFailureMessage,
      studySettingsError,
      saveStatus,
      draftStatuses,
      confirmationDialog,
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
      mutatePlans,
      saveBacklogPreview,
      changePlan,
      refreshUnifiedPlans,
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
  return <FieldbookContext.Provider value={value}>{children}{value.confirmationDialog}</FieldbookContext.Provider>;
}

export function useFieldbook() {
  const ctx = useContext(FieldbookContext);
  if (!ctx) throw new Error('useFieldbook requires FieldbookProvider');
  return ctx;
}
