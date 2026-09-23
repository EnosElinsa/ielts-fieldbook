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
  addLexiconItem,
  addStory,
  buildAssessmentRequest,
  buildSpeakingAssessmentRequest,
  completeLexiconPlan,
  completePlanIfMatched,
  completeReview,
  completeStoriesPlan,
  createAttempt,
  dateKey,
  draftText,
  dueLexicon,
  importAssessmentText,
  mergeBackup,
  normalizeDraft,
  parseAssessmentFile,
  persistShape,
  removeLexiconItem,
  removeStory,
  resolveAssessmentEssay,
  resolveError,
  reviewError,
  reviewLexiconItem,
  selectSpeakingTopic,
  selectWritingQuestion,
  startPlan as domainStartPlan,
  syncAssessmentErrors,
  updateLexiconItem,
  updateStory,
  validateBackup,
  wordCount,
} from '../domain';
import { downloadFile, loadState, saveState, writeBankCache } from '../storage';
import { ensurePlans, inferredDeskMode } from '../lib/planTemplates';
import { sessionSkill } from '../lib/format';

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
  | 'lexicon'
  | 'story'
  | 'backup'
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
  const [mockExam, setMockExam] = useState<string | null>(null);
  const [lexiconDueOnly, setLexiconDueOnly] = useState(false);
  const [lexiconDueAtVisit, setLexiconDueAtVisit] = useState(0);
  const [revealedLexicon, setRevealedLexicon] = useState<Record<string, boolean>>({});
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [pendingBackup, setPendingBackup] = useState(null);
  const [viewedSession, setViewedSession] = useState(null);
  const [editingLexiconId, setEditingLexiconId] = useState(null);
  const [lexiconSeed, setLexiconSeed] = useState(null);
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [storyPresetTopicIds, setStoryPresetTopicIds] = useState([]);
  const [checklistToastNeeded, setChecklistToastNeeded] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [booted, setBooted] = useState(false);
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
      setState((prev) => {
        const next = structuredClone(prev);
        if (mutate) mutate(next);
        saveState(next, options?.silent ? undefined : toast);
        stateRef.current = next;
        return next;
      });
    },
    [toast],
  );

  const persistNow = useCallback(
    (draft?: any) => {
      const next = draft || stateRef.current;
      next.schemaVersion = STATE_VERSION;
      saveState(next, toast);
      setState({ ...next });
      stateRef.current = next;
      return true;
    },
    [toast],
  );

  const scheduleDraftPersist = useCallback(() => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      persistNow();
    }, 350);
  }, [persistNow]);

  const flushDraftPersist = useCallback(() => {
    if (!draftTimer.current) return false;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    persistNow();
    return true;
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
  const closeModal = useCallback(() => setModal(null), []);

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
      stateRef.current.drafts[id] = Object.assign({}, current, extra || {}, {
        text: text == null ? current.text : String(text),
      });
      setState((prev) => ({
        ...prev,
        drafts: {
          ...prev.drafts,
          [id]: stateRef.current.drafts[id],
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
      const draft = structuredClone(stateRef.current);
      try {
        const response = await fetch(`/questions.json?v=${STATE_VERSION}`);
        if (!response.ok) throw new Error('questions');
        const questions = await response.json();
        if (Array.isArray(questions) && questions.length) {
          draft.questions = questions.map((q) => Object.assign({}, q, { id: String(q.id) }));
        }
      } catch {
        if (!draft.questions.length) draft.questions = FALLBACK_QUESTIONS;
        if (!cancelled) toast('The writing bank did not load. Showing a spare question.');
      }
      try {
        const response = await fetch(`/speaking-questions.json?v=${STATE_VERSION}`);
        if (!response.ok) throw new Error('speaking');
        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : (payload && payload.topics) || [];
        let samplesById = {};
        try {
          const sampleResponse = await fetch(`/speaking-samples.json?v=${STATE_VERSION}`);
          if (sampleResponse.ok) {
            const samples = await sampleResponse.json();
            samplesById = samples && samples.byId ? samples.byId : samples || {};
          }
        } catch {
          /* optional */
        }
        if (list.length) {
          draft.speakingTopics = list.map((topic) =>
            Object.assign({}, topic, samplesById[topic.id] || {}, { id: String(topic.id) }),
          );
        }
      } catch {
        if (!draft.speakingTopics.length && !cancelled) {
          toast('The speaking bank did not load. Refresh and try again.');
        }
      }
      writeBankCache(draft);
      repairAssessments(draft);
      ensurePlans(draft, draft.settings.activeSkill === 'speaking' ? 'speaking' : 'writing', null);
      if (!cancelled) {
        setSelectedQuestionId(String((draft.questions[0] || FALLBACK_QUESTIONS[0]).id));
        if (draft.speakingTopics[0]) setSelectedTopicId(String(draft.speakingTopics[0].id));
        persistNow(draft);
        setBooted(true);
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
  }, []);

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
      if (plan.status === 'completed') {
        navigate('/review');
        return;
      }
      domainStartPlan(draft, planId);
      persistNow(draft);
      setActiveDeskMode(inferredDeskMode(plan));
      if (plan.deskMode === 'timed' || inferredDeskMode(plan) === 'timed') {
        toast('Use the exam time. Start the timer.');
      }
      if (plan.kind === 'review') {
        navigate('/review');
        return;
      }
      if (plan.kind === 'lexicon') {
        setLexiconDueOnly(true);
        setLexiconDueAtVisit(dueLexicon(draft).length);
        navigate('/phrases');
        return;
      }
      if (plan.kind === 'stories') {
        draft.settings.activeSkill = 'speaking';
        persistNow(draft);
        navigate('/stories');
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
        return;
      }
      draft.settings.activeSkill = 'writing';
      persistNow(draft);
      const picked = plan.questionId
        ? draft.questions.find((q) => String(q.id) === String(plan.questionId))
        : selectWritingQuestion(draft, plan.kind, draft.questions);
      chooseQuestion((picked || draft.questions[0] || FALLBACK_QUESTIONS[0]).id);
    },
    [chooseQuestion, navigate, persistNow, startSpeakingPractice, toast],
  );

  const saveAttempt = useCallback(
    (exportForReview: boolean, saveFields: { focus: string; next: string; errors: string }) => {
      if (!pendingAttempt) return;
      const draft = stateRef.current;
      const speaking = pendingAttempt.skill === 'speaking';
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
        },
        { id: () => pendingAttempt.id, now: () => new Date().toISOString() },
      );
      saveFields.errors
        .split(/[;；]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => {
          const match = value.match(/^([A-Z]+(?:-[A-Z]+)?)[：:]?\s*(.*)$/);
          draft.errors.push({
            id: crypto.randomUUID(),
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
        draft.drafts[selectedQuestion.id] = Object.assign({}, current, { text: '', parentSessionId: null });
      }
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
      persistNow(draft);
      if (mockExam === 'task1') {
        setMockExam('task2');
        setActiveDeskMode('timed');
        const next =
          selectWritingQuestion(draft, '2', draft.questions) ||
          draft.questions.find((item) => item.type === '2') ||
          draft.questions[0];
        chooseQuestion(next.id);
        toast('Task 1 is saved. Task 2 is next, 40 minutes.');
        return;
      }
      if (mockExam === 'task2') setMockExam(null);
      navigate('/review');
      toast(
        checklistToastNeeded
          ? exportForReview
            ? 'Saved and exported. The checklist is still open. Check it next time.'
            : 'Saved. The checklist is still open. Check it next time.'
          : exportForReview
            ? speaking
              ? 'Saved, and the score request was exported.'
              : 'Essay saved, and the score request was exported.'
            : speaking
              ? 'Saved.'
              : 'Essay saved.',
      );
      setChecklistToastNeeded(false);
    },
    [
      checklistToastNeeded,
      chooseQuestion,
      closeModal,
      mockExam,
      navigate,
      pendingAttempt,
      persistNow,
      selectedQuestion,
      toast,
    ],
  );

  const value = useMemo(
    () => ({
      state,
      setState,
      stateRef,
      booted,
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
      mockExam,
      setMockExam,
      modal,
      openModal,
      closeModal,
      pendingAttempt,
      setPendingAttempt,
      pendingBackup,
      setPendingBackup,
      viewedSession,
      setViewedSession,
      editingLexiconId,
      setEditingLexiconId,
      lexiconSeed,
      setLexiconSeed,
      editingStoryId,
      setEditingStoryId,
      storyPresetTopicIds,
      setStoryPresetTopicIds,
      lexiconDueOnly,
      setLexiconDueOnly,
      lexiconDueAtVisit,
      setLexiconDueAtVisit,
      revealedLexicon,
      setRevealedLexicon,
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
      addLexiconItem,
      updateLexiconItem,
      removeLexiconItem,
      reviewLexiconItem,
      dueLexicon,
      addStory,
      updateStory,
      removeStory,
      completeStoriesPlan,
      completeLexiconPlan,
      completeReview,
      reviewError,
      resolveError,
      importAssessmentText,
      validateBackup,
      mergeBackup,
      selectWritingQuestion,
      selectSpeakingTopic,
      buildAssessmentRequest,
      buildSpeakingAssessmentRequest,
      sessionSkill,
    }),
    [
      activeDeskMode,
      activeSkill,
      backupMenuOpen,
      booted,
      checklistToastNeeded,
      chooseQuestion,
      closeModal,
      currentDeskMode,
      deskPart,
      editingLexiconId,
      editingStoryId,
      flushDraftPersist,
      lexiconDueAtVisit,
      lexiconDueOnly,
      lexiconSeed,
      mockExam,
      modal,
      navigate,
      openModal,
      pendingAttempt,
      pendingBackup,
      persist,
      persistNow,
      questionIndex,
      revealedLexicon,
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
