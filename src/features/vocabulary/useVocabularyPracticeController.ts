import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useFieldbook } from "../../context/FieldbookContext";
import { accountId } from "../../storage/remote";
import { clearVocabularyDraft, readVocabularyDraft, writeVocabularyDraft } from "../../storage/vocabularyDrafts";
import { getVocabularyReviewQueue, type ReviewCard, type ReviewQueueFilter, type VocabularyEntry, type VocabularyMode, type VocabularyResult, type VocabularyState } from "../../domain/vocabulary";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { normalizeVocabularyPreferences, type VocabularyPracticeMode, type VocabularyPreferences } from "../../domain/vocabulary/preferences";
import { buildVocabularySessionCommit, createVocabularySession, evaluateVocabularySessionAnswer, updateVocabularySessionAnswer, type VocabularyPracticeSession, type VocabularySessionSelection } from "../../domain/vocabulary/session";
import { getLearnedVocabularyIds, vocabularyGroupProgress } from "../../domain/vocabulary/progress";
import { buildUnitPracticeQueue } from "../../domain/vocabulary/selection";
import { createVocabularyPlayback } from "./playback";
import { playbackMessage } from "./Pronunciation";
import { safeVocabularyReturn } from "./vocabularyNavigation";
import { practiceKeyboard } from "./practiceKeyboard";
import { presentVocabularySession } from '../../domain/vocabulary/sessionPresentation';
import { MODES, senseFor } from "./practicePresentation";
import { type PracticeNavigationRequest } from '../../lib/practiceNavigation';

type Session = VocabularyPracticeSession;
type Prepared = ReturnType<typeof buildVocabularySessionCommit>;
type SessionLog = Prepared["sessionRecord"];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useVocabularyPracticeController() {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { sessionId: historySessionId } = useParams();
  const navigate = useNavigate();
  const legacyStudy = location.pathname === '/vocabulary/review' && Boolean(params.get('bookId') && params.get('unitId') && params.get('dueOnly') === 'false' && params.get('wrongOnly') !== 'true' && !['entryId', 'senseId', 'sourceType', 'dimension', 'skill'].some(key => params.has(key)));
  const study = location.pathname === '/vocabulary/study' || legacyStudy;
  const initialPreferences = normalizeVocabularyPreferences(
    fb.state.settings?.vocabulary,
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [mode, setMode] = useState<VocabularyPracticeMode>(() =>
    MODES.some((item) => item.value === params.get("mode"))
      ? (params.get("mode") as VocabularyPracticeMode)
      : (study ? "dictation" : initialPreferences.mode),
  );
  const [bookId, setBook] = useState(params.get("bookId") || "all");
  const [unitId, setUnit] = useState(params.get("unitId") || "all");
  const [sourceType, setSource] = useState(params.get("sourceType") || "all");
  const [skill, setSkill] = useState(params.get("skill") || "all");
  const [dimension, setDimension] = useState(params.get("dimension") || "all");
  const [dueOnly, setDue] = useState(params.get("dueOnly") !== "false");
  const [wrongOnly, setWrong] = useState(params.get("wrongOnly") === "true");
  const [session, setSession] = useState<Session | null>(null);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [resume, setResume] = useState(() => readVocabularyDraft(accountId()));
  const [results, setResults] = useState<SessionLog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const departure = useRef<PracticeNavigationRequest | null>(null);
  useEffect(() => { if (!exitOpen) departure.current = null; }, [exitOpen]);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [looping, setLooping] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<{ bookId: string; status: 'loading' | 'ready' | 'error' }>({ bookId: '', status: 'loading' });
  const [catalogRetry, setCatalogRetry] = useState(0);
  const resultFilter = ['all', 'incorrect', 'unanswered', 'pending', 'flagged'].includes(params.get('resultFilter') || '') ? params.get('resultFilter')! : 'all';
  function setResultFilter(value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('resultFilter'); else next.set('resultFilter', value);
    setParams(next, { replace: true });
  }
  const owner = useRef(accountId());
  const sessionRef = useRef<Session | null>(null);
  const cardsRef = useRef<ReviewCard[]>([]);
  const preferencesRef = useRef(preferences);
  const pendingCommit = useRef<Prepared | null>(null);
  const savingRef = useRef(false);
  const recoveringRef = useRef(false);
  const audioGeneration = useRef(0);
  const loopGeneration = useRef(0);
  const loopGap = useRef<{ timer: number; resolve: () => void } | null>(null);
  const playedIndex = useRef(-1);
  const startedAt = useRef(Date.now());
  const mounted = useRef(true);
  const answerFields = useRef<
    (HTMLInputElement | HTMLTextAreaElement | null)[]
  >([]);
  const playback = useRef<ReturnType<typeof createVocabularyPlayback> | null>(
    null,
  );
  if (!playback.current) playback.current = createVocabularyPlayback();
  preferencesRef.current = preferences;
  cardsRef.current = cards;

  useEffect(() => {
    if (legacyStudy && location.pathname !== '/vocabulary/study') navigate(`/vocabulary/study?${params}`, { replace: true });
  }, [legacyStudy, location.pathname]);
  useEffect(() => {
    if (sessionRef.current) return;
    setBook(params.get('bookId') || 'all'); setUnit(params.get('unitId') || 'all');
    setSource(params.get('sourceType') || 'all'); setSkill(params.get('skill') || 'all');
    setDimension(params.get('dimension') || 'all');
    setDue(params.get('dueOnly') !== 'false'); setWrong(params.get('wrongOnly') === 'true');
    if (params.get('mode') && MODES.some(item => item.value === params.get('mode'))) setMode(params.get('mode') as VocabularyPracticeMode);
  }, [location.pathname, params.toString(), session === null]);
  useEffect(() => {
    let active = true;
    const target = bookId === 'all' ? '' : bookId;
    setCatalogStatus({ bookId: target, status: 'loading' });
    Promise.resolve(fb.loadVocabularyCatalog?.(target || undefined)).then(() => {
      if (active) setCatalogStatus({ bookId: target, status: 'ready' });
    }).catch(() => { if (active) setCatalogStatus({ bookId: target, status: 'error' }); });
    return () => { active = false; };
  }, [bookId, catalogRetry, fb.loadVocabularyCatalog]);

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
    setLooping(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) {
        stopAudio();
        setAudioStatus("Audio paused");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      audioGeneration.current += 1;
      loopGeneration.current += 1;
      if (loopGap.current) {
        window.clearTimeout(loopGap.current.timer);
        loopGap.current.resolve();
        loopGap.current = null;
      }
      playback.current?.stop();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [stopAudio]);
  useEffect(() => {
    const currentOwner = accountId();
    if (currentOwner === owner.current) return;
    stopAudio();
    clearVocabularyDraft(owner.current);
    owner.current = currentOwner;
    sessionRef.current = null;
    pendingCommit.current = null;
    savingRef.current = false;
    setSession(null);
    setCards([]);
    setResults(null);
    setResume(readVocabularyDraft(currentOwner));
    setError("");
    setSaving(false);
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

  const replaceSession = useCallback((next: Session | null) => {
    if (owner.current !== accountId()) return;
    sessionRef.current = next;
    setSession(next);
    if (next) {
      const written = writeVocabularyDraft(owner.current, next);
      setStorageError(!written);
    }
  }, []);

  const filter = useMemo(
    () =>
      ({
        ...(params.get("entryId") ? { entryId: params.get("entryId")! } : {}),
        ...(params.get("senseId") ? { senseId: params.get("senseId")! } : {}),
        ...(bookId !== "all" ? { bookId } : {}),
        ...((study || params.has("entryId")) && unitId !== "all" ? { unitId } : {}),
        ...(study && sourceType !== "all" ? { sourceType } : {}),
        ...(study && skill !== "all" ? { skill } : {}),
        ...(dimension !== "all" && mode !== "audio" ? { dimension } : {}),
        mode: mode === "audio" ? "dictation" : mode,
        dueOnly,
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
  const unitQueue = useMemo(() => study ? buildUnitPracticeQueue(fb.state, bookId, unitId, mode) : null, [study, fb.state, bookId, unitId, mode, catalogStatus]);
  const queue = useMemo(() => {
    if (unitQueue) return unitQueue.cards;
    const learned = getLearnedVocabularyIds(fb.state);
    const explicit = Boolean(filter.entryId);
    const raw = explicit ? ((fb.state.vocabulary as VocabularyEntry[]) || []).find(entry => entry.id === filter.entryId) || (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(entry => entry.id === filter.entryId) : undefined;
    const member = raw && filter.bookId && filter.unitId && VOCABULARY_CATALOG.memberships.some(item => item.entryId === raw.id && item.bookId === filter.bookId && item.unitId === filter.unitId);
    const virtualEntry = raw && member && !raw.sources.some(source => source.bookId === filter.bookId && source.unitId === filter.unitId) ? { ...raw, sources: [...raw.sources, { type: 'wordbook' as const, id: `${filter.bookId}:${filter.unitId}:${raw.id}`, bookId: filter.bookId, unitId: filter.unitId }] } : raw;
    const queueState = explicit && virtualEntry ? { ...fb.state, vocabulary: [virtualEntry] } : fb.state;
    let available = getVocabularyReviewQueue(queueState, filter).filter(
      (card) =>
        (explicit || learned.has(card.entryId)) && (!wrongOnly ||
        ((fb.state.vocabularyStates as VocabularyState[]) || []).some(
          (item) =>
            item.entryId === card.entryId &&
            item.senseId === card.senseId &&
            item.wrong?.active &&
            (item.wrong.modes?.[card.mode]?.active ?? true),
        )),
    );
    if (preferences.order === "source") {
      const entryOrder = new Map(
        ((fb.state.vocabulary as VocabularyEntry[]) || []).map(
          (entry, index) => [entry.id, index],
        ),
      );
      available.sort(
        (a, b) =>
          (entryOrder.get(a.entryId) ?? 0) - (entryOrder.get(b.entryId) ?? 0),
      );
    }
    if (mode === "audio" || mode === "dictation")
      available = [
        ...new Map(available.map((card) => [card.entryId, card])).values(),
      ];
    return available;
  }, [fb.state, filter, wrongOnly, mode, preferences.order, unitQueue, catalogStatus]);
  const books = VOCABULARY_CATALOG.books || [];
  const units = (VOCABULARY_CATALOG.units || []).filter(
    (unit) => bookId === "all" || unit.bookId === bookId,
  );
  const selectedUnit = units.find(unit => unit.id === unitId);
  const selectedBook = books.find(book => book.id === bookId);
  const chapter = units.find(unit => unit.id === selectedUnit?.parentId);
  const catalogReady = catalogStatus.bookId === (bookId === 'all' ? '' : bookId) && catalogStatus.status === 'ready';
  const leafUnits = units.filter(unit => unit.kind !== 'chapter' && !units.some(child => child.parentId === unit.id));
  const studyReady = !study ? catalogReady : (catalogReady && Boolean(selectedUnit && leafUnits.includes(selectedUnit)) && Boolean(unitQueue?.complete));
  const answered = session
    ? cards.filter((card) => session.answers[card.id]?.response.trim()).length
    : 0;
  const flagged = session
    ? cards.filter((card) => session.answers[card.id]?.flagged).length
    : 0;
  const count = session?.cardIds.length || 0;
  const locked = saving || Boolean(pendingCommit.current);
  const currentIndex = session?.index || 0;
  const pageStart = Math.floor(currentIndex / 50) * 50;
  const visibleCards = cards.slice(pageStart, pageStart + 50).map((card, offset) => ({ card, index: pageStart + offset }));
  const resultRows = results?.results.filter(row => resultFilter === 'all' ||
    (resultFilter === 'incorrect' && (row.result === 'failure' || row.result === 'partial')) ||
    (resultFilter === 'unanswered' && !row.response.trim()) ||
    (resultFilter === 'pending' && row.result === 'pending') ||
    (resultFilter === 'flagged' && row.flagged)) || [];
  const resultUnitId = results?.selection?.kind === 'unit' ? results.selection.unitId : null;
  const orderedGroups = [...(VOCABULARY_CATALOG.units || [])].filter(unit => unit.bookId === results?.filter.bookId && unit.kind !== 'chapter' && !(VOCABULARY_CATALOG.units || []).some(child => child.bookId === unit.bookId && child.parentId === unit.id)).sort((a, b) => {
    const parents = VOCABULARY_CATALOG.units;
    return (parents.find(unit => unit.id === a.parentId && unit.bookId === a.bookId)?.order || 0) - (parents.find(unit => unit.id === b.parentId && unit.bookId === b.bookId)?.order || 0) || (a.order || 0) - (b.order || 0);
  });
  const resultGroupIndex = orderedGroups.findIndex(unit => unit.id === resultUnitId);
  const nextGroup = resultGroupIndex >= 0 ? orderedGroups.slice(resultGroupIndex + 1).find(unit => {
    const ids = VOCABULARY_CATALOG.memberships.filter(item => item.bookId === unit.bookId && item.unitId === unit.id).map(item => item.entryId);
    return vocabularyGroupProgress(fb.state, { ...unit, studyEntryIds: ids }) !== 'Studied';
  }) : null;
  const recent = ((fb.state.vocabularySessions || []) as SessionLog[])
    .slice(-5)
    .reverse().map(presentVocabularySession);

  useEffect(() => {
    if (sessionRef.current || savingRef.current) return;
    const id = historySessionId || params.get('sessionId');
    if (!id) { setResults(null); return; }
    const record = ((fb.state.vocabularySessions || []) as SessionLog[]).find(record => record.id === id);
    if (record) {
      setResults(presentVocabularySession(record)); setCards([]); setError('');
      const sourceBook = record.selection && (record.selection.kind === 'unit' || record.selection.kind === 'specialist') ? record.selection.bookId : record.filter?.bookId;
      if (sourceBook && sourceBook !== 'all') void fb.loadVocabularyCatalog?.(sourceBook).catch(() => { /* historical view remains available from frozen rows */ });
    }
    else if (fb.booted) { setResults(null); setError('This saved session is unavailable for this account.'); }
  }, [historySessionId, params.get('sessionId'), fb.state.vocabularySessions, fb.booted]);

  const resultReturnParams = new URLSearchParams(params);
  resultReturnParams.delete('sessionId');
  const resultReturnTo = results ? `/vocabulary/history/${encodeURIComponent(results.id)}?sessionId=${encodeURIComponent(results.id)}${resultReturnParams.toString() ? `&${resultReturnParams}` : ""}` : `${location.pathname}?${resultReturnParams}`;

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === "bookId") next.delete("unitId");
    setParams(next, { replace: true });
  }
  function setReviewPreset(value: string) {
    setDue(value === 'due'); setWrong(value === 'wrong');
    const next = new URLSearchParams(params); next.set('dueOnly',String(value === 'due')); next.set('wrongOnly',String(value === 'wrong')); next.delete('unitId'); setParams(next,{replace:true});
  }
  function changeMode(value: string) {
    setMode(value as VocabularyPracticeMode);
    changeFilter("mode", value);
    setAudioStatus("");
  }

  async function playCard(
    index: number,
    options: { automatic?: boolean; example?: boolean } = {},
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
    setAudioStatus("Playing audio");
    const outcome = await playback.current!.play(card.entry, {
      accent: p.accent,
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
    for (let cursor = index; cursor < cardsRef.current.length; cursor += 1) {
      if (
        !owned() ||
        generation !== loopGeneration.current ||
        !sessionRef.current
      )
        return;
      replaceSession({ ...sessionRef.current, index: cursor });
      const ok = await playCardRef.current(cursor);
      if (!ok || generation !== loopGeneration.current) break;
      if (
        preferencesRef.current.audioExamples &&
        senseFor(cardsRef.current[cursor])?.example
      ) {
        const exampleOk = await playCardRef.current(cursor, { example: true });
        if (!exampleOk || generation !== loopGeneration.current) break;
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
      setAudioStatus("Audio loop complete");
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
    if (!owned() || !selected.length || (!selection && !studyReady)) return;
    stopAudio();
    pendingCommit.current = null;
    playedIndex.current = -1;
    const ordered = [...selected];
    const chosenSelection = selection || (study ? { kind: (unitQueue && unitQueue.unavailableWords > 0 ? 'specialist' : 'unit') as 'specialist' | 'unit', bookId, unitId } : { kind: 'batch' as const });
    const chosenPreferences = { ...(options.preferences || preferences), ...(study && chosenSelection.kind === 'unit' ? { order: 'source' as const } : {}), mode: chosenMode };
    if (chosenPreferences.order === "source" && chosenSelection.kind !== 'unit') {
      const order = new Map(
        (fb.state.vocabulary || []).map(
          (entry: VocabularyEntry, index: number) => [entry.id, index],
        ),
      );
      ordered.sort(
        (a, b) => (order.get(a.entryId) ?? 0) - (order.get(b.entryId) ?? 0),
      );
    } else if (chosenPreferences.order === "due")
      ordered.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
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
      (chosenSelection.kind === 'unit' || chosenSelection.kind === 'specialist') ? { bookId, unitId, dueOnly: false } : options.filter || Object.assign({ ...filter }, { wrongOnly }),
      chosenSelection,
    );
    const frozen = next.cardIds.map((identity) =>
      candidates.find((card) => card.id === identity.id)!,
    );
    startedAt.current = Date.now();
    cardsRef.current = frozen;
    setCards(frozen);
    setResults(null);
    const setupParams = new URLSearchParams(params);
    setupParams.delete('sessionId'); setupParams.delete('resultFilter');
    setParams(setupParams, { replace: true });
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
  async function recover() {
    if (!resume || !owned() || recoveringRef.current) return;
    const recoveryOwner = owner.current;
    recoveringRef.current = true;
    setRecovering(true);
    setError('');
    try {
    if (resume.selection?.kind === 'unit' || resume.selection?.kind === 'specialist') {
      try {
        await fb.loadVocabularyCatalog?.(resume.selection.bookId);
      } catch {
        if (owned() && recoveryOwner === accountId()) setError('The saved wordbook could not be loaded. Your answers are still here. Retry resuming when the connection is available.');
        return;
      }
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
    replaceSession(next);
    requestAnimationFrame(() => answerFields.current[next.index]?.focus());
    } finally {
      recoveringRef.current = false;
      if (mounted.current) setRecovering(false);
    }
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
    );
  }
  function finalizeAnswer(index: number) {
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
  function focusCard(index: number, forcePlayback = false) {
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
      if (!current.submittedAt)
        replaceSession({
          ...current,
          submittedAt: prepared.sessionRecord.submittedAt,
        });
      const saved = await fb.persistVocabularySession(
        prepared.state,
        current.id,
      );
      if (!owned() || owner.current !== submittingOwner) return;
      if (!saved) {
        setError(
          "This session could not be saved. Your responses are still here.",
        );
        return;
      }
      clearVocabularyDraft(owner.current);
      setResume(null);
      setResults(prepared.sessionRecord);
      const resultParams = new URLSearchParams(params);
      resultParams.set('sessionId', prepared.sessionRecord.id);
      resultParams.delete('resultFilter');
      resultParams.delete("sessionId");
      navigate(`/vocabulary/history/${encodeURIComponent(prepared.sessionRecord.id)}?${resultParams}`, { replace: true });
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
      departure.current = { path, proceed: () => navigate(path) }; stopAudio(); setExitOpen(true);
    };
    document.addEventListener('fieldbook:before-navigate', requested);
    document.addEventListener('click', leave, true);
    return () => { document.removeEventListener('fieldbook:before-navigate', requested); document.removeEventListener('click',leave,true); };
  }, [session,stopAudio,navigate]);
  function exit(keep: boolean) {
    if (!owned() || saving) return;
    stopAudio();
    const target = departure.current; departure.current = null;
    setExitOpen(false);
    if (keep && sessionRef.current) {
      const paused = { ...sessionRef.current, status: "paused" as const };
      writeVocabularyDraft(owner.current, paused);
      setResume(paused);
    } else {
      clearVocabularyDraft(owner.current);
      setResume(null);
    }
    pendingCommit.current = null;
    sessionRef.current = null;
    setSession(null);
    setCards([]);
    setError("");
    setAudioStatus("");
    if (target) { target.proceed(); return; }
    const origin = params.get("returnTo"); if (origin) navigate(safeVocabularyReturn(origin));
  }
  function resetResults() {
    stopAudio();
    setResults(null);
    setCards([]);
    setError("");
    const next = new URLSearchParams(params);
    next.delete('sessionId'); next.delete('resultFilter');
    const origin = params.get("returnTo");
    if (origin) navigate(safeVocabularyReturn(origin));
    else if (historySessionId) navigate(`/vocabulary/review?${next}`, {replace:true}); else setParams(next, { replace: true });
  }
  function discardResume() {
    clearVocabularyDraft(owner.current);
    setResume(null);
    setError("");
  }
  function showRecentSession(log: SessionLog) {
    setResults(log);
    setCards([]);
    const next = new URLSearchParams(params);
    next.set('sessionId', log.id); next.delete('resultFilter');
    next.delete("sessionId");
    navigate(`/vocabulary/history/${encodeURIComponent(log.id)}?${next}`);
  }
  function retryCatalog() {
    setCatalogRetry(value => value + 1);
  }
  function registerAnswerField(index: number, element: HTMLInputElement | HTMLTextAreaElement | null) {
    answerFields.current[index] = element;
  }
  function pauseSession() {
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
  function retryMistakes() {
    if (!results) return;
    const failedIds = new Set(results.results
      .filter(row => row.result === "failure" || row.result === "partial")
      .map(row => row.cardId));
    const retryFilter: ReviewQueueFilter = results.selection?.kind === 'unit'
      ? { ...results.filter, bookId: results.selection.bookId, unitId: results.selection.unitId, dueOnly: false }
      : { ...results.filter, dueOnly: false };
    const retryCards = cards.length
      ? cards.filter(card => failedIds.has(card.id))
      : getVocabularyReviewQueue(fb.state, { ...retryFilter, mode: results.mode === 'audio' ? 'dictation' : results.mode })
          .filter(card => failedIds.has(card.id));
    begin(retryCards, results.mode, { kind: "retry" }, {
      filter: retryFilter,
      preferences: results.preferences,
    });
  }

  return {
    state: fb.state, study, explicitEntry, preferences, setPreferences, mode, bookId, setBook, unitId, setUnit,
    sourceType, setSource, skill, setSkill, dimension, setDimension,
    dueOnly, setDue, wrongOnly, setWrong, session, cards, resume, results,
    settingsOpen, setSettingsOpen, exitOpen, setExitOpen, incompleteOpen, setIncompleteOpen,
    saving, recovering, error, audioStatus, audioBusy, looping, storageError, catalogStatus,
    resultFilter, setResultFilter, resultReturnTo, queue, unitQueue, books, units, selectedUnit,
    selectedBook, chapter, catalogReady, leafUnits, studyReady, answered, flagged,
    count, locked, currentIndex, pageStart, visibleCards, resultRows, nextGroup, recent,
    setReviewPreset, changeFilter, changeMode, playCard, begin, recover, updateAnswer, finalizeAnswer,
    focusCard, advance, toggleFlag, reportProduction, submit, savePreferences, exit,
    resetResults, discardResume, showRecentSession, retryCatalog,
    registerAnswerField, pauseSession, replayCard, toggleCurrentAudio, toggleAudioLoop,
    handleWorkbenchKeyDown, retryMistakes,
    submissionPending: Boolean(pendingCommit.current),
  };
}

export type VocabularyPracticeController = ReturnType<typeof useVocabularyPracticeController>;
