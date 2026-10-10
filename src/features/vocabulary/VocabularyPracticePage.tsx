import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Headphones,
  List,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { FilterMenu } from "../../components/ui";
import { IconButton } from "../../components/IconButton";
import { ModalFrame } from "../../components/ModalFrame";
import { accountId } from "../../storage/remote";
import {
  clearVocabularyDraft,
  readVocabularyDraft,
  writeVocabularyDraft,
} from "../../storage/vocabularyDrafts";
import {
  getVocabularyReviewQueue,
  type ReviewCard,
  type ReviewQueueFilter,
  type VocabularyEntry,
  type VocabularyMode,
  type VocabularyResult,
  type VocabularyState,
} from "../../domain/vocabulary";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import {
  normalizeVocabularyPreferences,
  type VocabularyPracticeMode,
  type VocabularyPreferences,
} from "../../domain/vocabulary/preferences";
import {
  buildVocabularySessionCommit,
  createVocabularySession,
  evaluateVocabularySessionAnswer,
  updateVocabularySessionAnswer,
  type VocabularyPracticeSession,
} from "../../domain/vocabulary/session";
import { createVocabularyPlayback } from "./playback";
import { VocabularyNavigation } from "./VocabularyPages";
import { VocabularyPreferencesDialog } from "./VocabularyPreferences";
import "../../styles/vocabulary-practice.css";

const MODES: { value: VocabularyPracticeMode; label: string }[] = [
  { value: "dictation", label: "Dictation" },
  { value: "definition", label: "Definition recall" },
  { value: "cloze", label: "Cloze" },
  { value: "distinction", label: "Synonym / distinction" },
  { value: "audio", label: "Audio loop" },
  { value: "production", label: "Sentence production" },
];
type Session = VocabularyPracticeSession;
type Prepared = ReturnType<typeof buildVocabularySessionCommit>;
type SessionLog = Prepared["sessionRecord"];
const titleCase = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
const modeLabel = (mode: string) =>
  MODES.find((item) => item.value === mode)?.label || titleCase(mode);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function conceal(text: string, term: string) {
  return text.replace(new RegExp(escapeRegex(term), "gi"), "_____");
}
function senseFor(card: ReviewCard) {
  return (
    card.entry.senses.find((sense) => sense.id === card.senseId) ||
    card.entry.senses[0]
  );
}
function resultName(result: string) {
  return result === "success"
    ? "Correct"
    : result === "pending"
      ? "Pending"
      : result === "partial"
        ? "Partial"
        : "Incorrect";
}
function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VocabularyPracticePage() {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const initialPreferences = normalizeVocabularyPreferences(
    fb.state.settings?.vocabulary,
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [mode, setMode] = useState<VocabularyPracticeMode>(() =>
    MODES.some((item) => item.value === params.get("mode"))
      ? (params.get("mode") as VocabularyPracticeMode)
      : initialPreferences.mode,
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
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [looping, setLooping] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const owner = useRef(accountId());
  const sessionRef = useRef<Session | null>(null);
  const cardsRef = useRef<ReviewCard[]>([]);
  const preferencesRef = useRef(preferences);
  const pendingCommit = useRef<Prepared | null>(null);
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
        ...(unitId !== "all" ? { unitId } : {}),
        ...(sourceType !== "all" ? { sourceType } : {}),
        ...(skill !== "all" ? { skill } : {}),
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
  const queue = useMemo(() => {
    let available = getVocabularyReviewQueue(fb.state, filter).filter(
      (card) =>
        !wrongOnly ||
        ((fb.state.vocabularyStates as VocabularyState[]) || []).some(
          (item) =>
            item.entryId === card.entryId &&
            item.senseId === card.senseId &&
            item.wrong?.active &&
            (item.wrong.modes?.[card.mode]?.active ?? true),
        ),
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
    return available.slice(0, 100);
  }, [fb.state, filter, wrongOnly, mode, preferences.order]);
  const books = VOCABULARY_CATALOG.books || [];
  const units = (VOCABULARY_CATALOG.units || []).filter(
    (unit) => bookId === "all" || unit.bookId === bookId,
  );
  const answered = session
    ? cards.filter((card) => session.answers[card.id]?.response.trim()).length
    : 0;
  const flagged = session
    ? cards.filter((card) => session.answers[card.id]?.flagged).length
    : 0;
  const count = session?.cardIds.length || 0;
  const locked = saving || Boolean(pendingCommit.current);
  const currentIndex = session?.index || 0;
  const recent = (fb.state.vocabularySessions || [])
    .slice(-5)
    .reverse() as SessionLog[];

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === "bookId") next.delete("unitId");
    setParams(next, { replace: true });
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
            : "Audio unavailable. Select Play to try again.",
      );
      return false;
    }
    setAudioStatus(
      outcome.source === "speech" ? "Browser voice" : "Recorded pronunciation",
    );
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

  function begin(selected = queue, chosenMode = mode) {
    if (!owned() || !selected.length) return;
    stopAudio();
    pendingCommit.current = null;
    playedIndex.current = -1;
    const ordered = [...selected];
    if (preferences.order === "source") {
      const order = new Map(
        (fb.state.vocabulary || []).map(
          (entry: VocabularyEntry, index: number) => [entry.id, index],
        ),
      );
      ordered.sort(
        (a, b) => (order.get(a.entryId) ?? 0) - (order.get(b.entryId) ?? 0),
      );
    } else if (preferences.order === "due")
      ordered.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    else
      for (let i = ordered.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    const candidates = clone(ordered.slice(0, 100));
    const next = createVocabularySession(
      candidates,
      chosenMode,
      { ...preferences, mode: chosenMode },
      Object.assign({ ...filter }, { wrongOnly }),
    );
    const frozen = next.cardIds.map((identity) =>
      candidates.find((card) => card.id === identity.id)!,
    );
    startedAt.current = Date.now();
    cardsRef.current = frozen;
    setCards(frozen);
    setResults(null);
    setResume(null);
    setError("");
    setAudioStatus("");
    replaceSession(next);
    if (chosenMode === "audio" && preferences.autoPlay) void runAudioLoop(0);
    requestAnimationFrame(() => answerFields.current[0]?.focus());
  }
  function recover() {
    if (!resume || !owned()) return;
    const all = getVocabularyReviewQueue(fb.state, {
      mode:
        resume.mode === "audio" ? "dictation" : (resume.mode as VocabularyMode),
      dueOnly: false,
    });
    const frozen = resume.cardIds
      .map(
        (identity) =>
          all.find((card) => card.id === identity.id) ||
          (() => {
            const entry = (
              (fb.state.vocabulary as VocabularyEntry[]) || []
            ).find((item) => item.id === identity.entryId);
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
    requestAnimationFrame(() => answerFields.current[index]?.focus());
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
    if (!current || saving || !owned()) return;
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
      if (owned() && owner.current === submittingOwner) setSaving(false);
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
  function exit(keep: boolean) {
    if (!owned() || saving) return;
    stopAudio();
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
  }
  function resetResults() {
    stopAudio();
    setResults(null);
    setCards([]);
    setError("");
  }
  function resultSource(entryId: string) {
    const entry = (fb.state.vocabulary as VocabularyEntry[]).find(
      (item) => item.id === entryId,
    );
    const source =
      entry?.sources.find((item) => item.bookId === results?.filter.bookId) ||
      entry?.sources[0];
    if (source?.bookId)
      return String(
        books.find((book) => book.id === source.bookId)?.title || "Wordbook",
      );
    return source ? titleCase(source.type) : "Vocabulary";
  }

  function prompt(card: ReviewCard, compact = false) {
    const sense = senseFor(card);
    const currentMode = session?.mode || mode;
    if (currentMode === "dictation")
      return (
        <span className="practice-dictation-label">
          {compact ? "Listen and type" : "Listen and write the word"}
        </span>
      );
    if (currentMode === "definition")
      return (
        <p className="practice-prompt-text">
          {conceal(sense?.definition || card.entry.meaning, card.entry.term)}
        </p>
      );
    if (currentMode === "cloze")
      return (
        <p className="practice-prompt-text">
          {conceal(sense?.example || card.entry.example, card.entry.term)}
        </p>
      );
    if (currentMode === "distinction")
      return (
        <p className="practice-prompt-text">
          {sense?.distinctionTask?.prompt ||
            `Find a synonym: ${sense?.definition || card.entry.meaning}`}
        </p>
      );
    return (
      <div className="practice-production-prompt">
        <h3>{card.entry.term}</h3>
        <p>{sense?.definition || card.entry.meaning}</p>
      </div>
    );
  }
  function feedback(card: ReviewCard) {
    const answer = session?.answers[card.id];
    if (session?.preferences.feedback !== "immediate" || !answer?.revealed)
      return null;
    const evaluation = evaluateVocabularySessionAnswer(card, answer.response, {
      result: answer.result,
      verification: answer.verification as "pending" | "self-reported",
    });
    return (
      <div className={`practice-feedback is-${evaluation.result}`}>
        <span>{resultName(evaluation.result)}</span>
        {session.mode !== "production" ? (
          <strong>{evaluation.expectedAnswer}</strong>
        ) : null}
        {session.mode === "distinction" &&
        senseFor(card)?.distinctionTask?.explanation ? (
          <p>{senseFor(card)?.distinctionTask?.explanation}</p>
        ) : null}
      </div>
    );
  }
  function answerControl(card: ReviewCard, index: number) {
    const current = session!.answers[card.id];
    const readOnly =
      locked || Boolean(current?.revealed && session!.mode !== "production");
    const common = {
      id: `practice-answer-${index + 1}`,
      "aria-label": `Answer ${index + 1}`,
      value: current?.response || "",
      disabled: locked,
      readOnly,
      autoComplete: "off",
      autoCorrect: "off",
      spellCheck: false,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => updateAnswer(index, event.target.value),
      onFocus: () => focusCard(index),
      onBlur: () => finalizeAnswer(index),
      onKeyDown: (
        event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          session!.preferences.autoAdvance &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          advance(index);
        }
      },
    };
    if (
      session!.mode === "distinction" &&
      senseFor(card)?.distinctionTask?.options?.length
    )
      return (
        <fieldset className="practice-options" disabled={readOnly}>
          <legend className="sr-only">Answer {index + 1}</legend>
          {senseFor(card)!.distinctionTask!.options.map(
            (option, optionIndex) => (
              <label key={optionIndex}>
                <input
                  type="radio"
                  name={`practice-choice-${index + 1}`}
                  checked={current?.response === option}
                  onChange={() => {
                    updateAnswer(index, option);
                    if (session!.preferences.feedback === "immediate")
                      finalizeAnswer(index);
                  }}
                />
                <span>{option}</span>
              </label>
            ),
          )}
        </fieldset>
      );
    return session!.mode === "production" ? (
      <textarea
        {...common}
        rows={3}
        placeholder="Write a sentence"
        ref={(element) => {
          answerFields.current[index] = element;
        }}
      />
    ) : (
      <input
        {...common}
        type="text"
        placeholder="Your answer"
        ref={(element) => {
          answerFields.current[index] = element;
        }}
      />
    );
  }
  function productionRating(card: ReviewCard, index: number) {
    if (
      session?.mode !== "production" ||
      !session.answers[card.id]?.response.trim()
    )
      return null;
    return (
      <label className="practice-self-report">
        Self review
        <select
          aria-label={`Self review ${index + 1}`}
          value={session.answers[card.id]?.result || "pending"}
          disabled={locked}
          onChange={(event) =>
            reportProduction(index, event.target.value as VocabularyResult)
          }
        >
          <option value="pending">Awaiting feedback</option>
          <option value="success">Looks correct</option>
          <option value="partial">Needs improvement</option>
          <option value="failure">Incorrect</option>
        </select>
      </label>
    );
  }

  return (
    <section className="view active vocabulary-view vocabulary-practice-view">
      <VocabularyNavigation />
      <header className="practice-heading">
        <div>
          <span className="eyebrow">Vocabulary</span>
          <h2>{results ? "Session complete" : "Practice"}</h2>
        </div>
        <div className="actions">
          <IconButton
            label="Practice settings"
            disabled={saving}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
          </IconButton>
          {session ? (
            <button
              className="btn line"
              type="button"
              disabled={saving}
              onClick={() => {
                stopAudio();
                setExitOpen(true);
              }}
            >
              <X size={16} />
              Exit session
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <div className="practice-error" role="alert">
          <span>{error}</span>
          {pendingCommit.current ? (
            <button
              className="btn line"
              type="button"
              onClick={() => void submit(true)}
              disabled={saving}
            >
              {saving ? "Saving…" : "Retry submission"}
            </button>
          ) : null}
        </div>
      ) : null}
      {storageError && session ? (
        <p className="practice-error" role="status">
          Progress is open in this tab. Browser recovery is unavailable.
        </p>
      ) : null}
      {!session && !results ? (
        <>
          <div className="practice-setup-controls">
            <FilterMenu
              label="Review mode"
              value={mode}
              options={MODES}
              onChange={changeMode}
            />
            <FilterMenu
              label="Wordbook"
              value={bookId}
              options={[
                { value: "all", label: "All wordbooks" },
                ...books.map((book) => ({
                  value: book.id,
                  label: String(book.title),
                })),
              ]}
              onChange={(value) => {
                setBook(value);
                setUnit("all");
                changeFilter("bookId", value);
              }}
            />
            <FilterMenu
              label="Chapter"
              value={unitId}
              options={[
                { value: "all", label: "All chapters" },
                ...units.map((unit) => ({
                  value: unit.id,
                  label: String(unit.title),
                })),
              ]}
              onChange={(value) => {
                setUnit(value);
                changeFilter("unitId", value);
              }}
            />
            <FilterMenu
              label="Review skill"
              value={skill}
              options={[
                "all",
                "writing",
                "speaking",
                "listening",
                "reading",
              ].map((value) => ({
                value,
                label: value === "all" ? "All skills" : titleCase(value),
              }))}
              onChange={(value) => {
                setSkill(value);
                changeFilter("skill", value);
              }}
            />
            <FilterMenu
              label="Review source"
              value={sourceType}
              options={[
                "all",
                "personal",
                "wordbook",
                "assessment",
                "writing",
                "speaking",
                "listening",
                "reading",
              ].map((value) => ({
                value,
                label: value === "all" ? "All sources" : titleCase(value),
              }))}
              onChange={(value) => {
                setSource(value);
                changeFilter("sourceType", value);
              }}
            />
            <FilterMenu
              label="Dimension"
              value={dimension}
              options={["all", "meaning", "listening", "spelling", "usage"].map(
                (value) => ({
                  value,
                  label: value === "all" ? "All dimensions" : titleCase(value),
                }),
              )}
              onChange={(value) => {
                setDimension(value);
                changeFilter("dimension", value);
              }}
            />
          </div>
          <div className="practice-setup-options">
            <div className="practice-filter-checks">
              <label className="practice-switch">
                <input
                  type="checkbox"
                  checked={dueOnly}
                  onChange={(event) => {
                    setDue(event.target.checked);
                    changeFilter("dueOnly", String(event.target.checked));
                  }}
                />
                Due only
              </label>
              <label className="practice-switch">
                <input
                  type="checkbox"
                  checked={wrongOnly}
                  onChange={(event) => {
                    setWrong(event.target.checked);
                    changeFilter("wrongOnly", String(event.target.checked));
                  }}
                />
                Wrong words only
              </label>
            </div>
            <div className="practice-configuration">
              <FilterMenu
                label="Session size"
                value={String(preferences.sessionSize)}
                options={[5, 10, 20, 50, 100].map((count) => ({
                  value: String(count),
                  label: `${count} words`,
                }))}
                onChange={(value) =>
                  setPreferences((current) =>
                    normalizeVocabularyPreferences({
                      ...current,
                      sessionSize: Number(value),
                    }),
                  )
                }
              />
              <FilterMenu
                label="Order"
                value={preferences.order}
                options={[
                  { value: "source", label: "Source order" },
                  { value: "due", label: "Due date" },
                  { value: "random", label: "Shuffle" },
                ]}
                onChange={(value) =>
                  setPreferences((current) =>
                    normalizeVocabularyPreferences({
                      ...current,
                      order: value,
                    }),
                  )
                }
              />
              <FilterMenu
                label="Feedback"
                value={preferences.feedback}
                options={[
                  { value: "end", label: "After submission" },
                  { value: "immediate", label: "During practice" },
                ]}
                onChange={(value) =>
                  setPreferences((current) =>
                    normalizeVocabularyPreferences({
                      ...current,
                      feedback: value,
                    }),
                  )
                }
              />
              <div
                className="practice-layout-toggle"
                role="group"
                aria-label="Practice layout"
              >
                <IconButton
                  label="List layout"
                  aria-pressed={preferences.layout === "list"}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      layout: "list",
                    }))
                  }
                >
                  <List size={18} />
                </IconButton>
                <IconButton
                  label="Focus layout"
                  aria-pressed={preferences.layout === "cards"}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      layout: "cards",
                    }))
                  }
                >
                  <Square size={17} />
                </IconButton>
              </div>
            </div>
          </div>
          {resume ? (
            <div className="practice-resume">
              <div>
                <strong>Continue your session</strong>
                <span>
                  {modeLabel(resume.mode)} ·{" "}
                  {
                    Object.values(resume.answers).filter((answer) =>
                      answer.response.trim(),
                    ).length
                  }{" "}
                  of {resume.cardIds.length} answered
                </span>
              </div>
              <div className="actions">
                <button className="btn primary" type="button" onClick={recover}>
                  <Play size={15} />
                  Resume session
                </button>
                <button
                  className="btn line"
                  type="button"
                  onClick={() => {
                    clearVocabularyDraft(owner.current);
                    setResume(null);
                    setError("");
                  }}
                >
                  Discard session
                </button>
              </div>
            </div>
          ) : null}
          <div className="practice-launch">
            <div className="practice-launch-content">
              <span className="practice-mode-icon">
                {mode === "dictation" || mode === "audio" ? (
                  <Headphones size={26} />
                ) : (
                  <Square size={26} />
                )}
              </span>
              <h3>{modeLabel(mode)}</h3>
              <p>
                {queue.length
                  ? `${Math.min(preferences.sessionSize, queue.length)} words · ${preferences.layout === "list" ? "List" : "Focus"} · ${preferences.feedback === "end" ? "Results after submission" : "Feedback during practice"}`
                  : "No words match these filters."}
              </p>
              <button
                className="btn primary practice-start"
                type="button"
                disabled={!queue.length || Boolean(resume)}
                onClick={() => begin()}
              >
                <Play size={17} />
                Start session
              </button>
              {!queue.length ? (
                <Link
                  className="practice-empty-link"
                  to="/vocabulary/wordbooks"
                >
                  Explore wordbooks
                  <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>
          </div>
          {recent.length ? (
            <section className="practice-recent">
              <h3>Recent sessions</h3>
              <div>
                {recent.map((log) => (
                  <button
                    type="button"
                    className="practice-history-row"
                    key={log.id}
                    onClick={() => {
                      setResults(log);
                      setCards([]);
                    }}
                  >
                    <span>
                      <strong>{modeLabel(log.mode)}</strong>
                      <small>
                        {dateLabel(log.submittedAt || log.startedAt)}
                      </small>
                    </span>
                    <span>{log.summary.total} words</span>
                    <span>
                      {log.mode === "audio"
                        ? "Listening activity"
                        : `${log.summary.correct} correct · ${log.summary.incorrect} incorrect`}
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {session ? (
        <div className="practice-workspace">
          <div className="practice-session-toolbar">
            <div>
              <strong>{modeLabel(session.mode)}</strong>
              <span>
                {answered} / {count}{" "}
                {session.mode === "audio" ? "listened" : "answered"}
                {flagged ? ` · ${flagged} flagged` : ""}
              </span>
            </div>
            <div className="practice-audio-controls">
              <span className="practice-accent">
                {preferences.accent.toUpperCase()} · {preferences.speechRate}×
              </span>
              <IconButton
                label={
                  audioBusy || looping ? "Pause audio" : "Replay current word"
                }
                disabled={locked}
                onClick={() => {
                  if (audioBusy || looping) {
                    stopAudio();
                    setAudioStatus("Audio paused");
                  } else {
                    playedIndex.current = currentIndex;
                    void playCard(currentIndex);
                  }
                }}
              >
                {audioBusy || looping ? (
                  <Pause size={17} />
                ) : (
                  <Volume2 size={18} />
                )}
              </IconButton>
              {session.mode === "audio" ? (
                <button
                  className="btn line"
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    looping
                      ? (stopAudio(), setAudioStatus("Audio paused"))
                      : void runAudioLoop()
                  }
                >
                  {looping ? <Pause size={15} /> : <Play size={15} />}
                  {looping ? "Pause loop" : "Play loop"}
                </button>
              ) : null}
              <button
                className="btn primary"
                type="button"
                disabled={locked}
                onClick={() => void submit()}
              >
                <Check size={15} />
                {saving ? "Saving…" : "Submit session"}
              </button>
            </div>
          </div>
          <div className="practice-progress-track">
            <div
              style={{ width: `${count ? (answered / count) * 100 : 0}%` }}
            />
          </div>
          <div
            className="practice-audio-status"
            role="status"
            aria-live="polite"
          >
            {audioStatus}
          </div>
          <nav className="practice-number-nav" aria-label="Session words">
            {cards.map((card, index) => (
              <button
                type="button"
                key={card.id}
                aria-label={`Word ${index + 1}${session.answers[card.id]?.response.trim() ? ", answered" : ""}${session.answers[card.id]?.flagged ? ", flagged" : ""}`}
                aria-current={index === currentIndex ? "step" : undefined}
                className={`${session.answers[card.id]?.response.trim() ? "is-answered" : ""}${session.answers[card.id]?.flagged ? " is-flagged" : ""}`}
                disabled={locked}
                onClick={() => focusCard(index)}
              >
                {index + 1}
                {session.answers[card.id]?.flagged ? <Flag size={8} /> : null}
              </button>
            ))}
          </nav>
          {session.mode === "audio" ? (
            <div className="practice-focus practice-audio-focus">
              <span className="practice-focus-counter">
                {currentIndex + 1} / {count}
              </span>
              <IconButton
                label="Listen to word"
                className="practice-listen-button"
                disabled={locked}
                onClick={() => void playCard(currentIndex)}
              >
                <Volume2 size={34} />
              </IconButton>
              <h3>{cards[currentIndex]?.entry.term}</h3>
              <p>
                {senseFor(cards[currentIndex])?.definition ||
                  cards[currentIndex]?.entry.meaning}
              </p>
              <p className="practice-audio-example">
                {senseFor(cards[currentIndex])?.example}
              </p>
              <span className="practice-listened-state">
                {session.answers[cards[currentIndex].id]?.response ? (
                  <>
                    <Check size={14} />
                    Listened
                  </>
                ) : (
                  "Ready to listen"
                )}
              </span>
            </div>
          ) : session.preferences.layout === "list" ? (
            <div className="practice-answer-list">
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  className={`practice-answer-row${index === currentIndex ? " is-current" : ""}${session.answers[card.id]?.flagged ? " is-flagged" : ""}`}
                >
                  <span className="practice-row-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <IconButton
                    label={`Play word ${index + 1}`}
                    disabled={locked}
                    onClick={() => focusCard(index, true)}
                  >
                    <Volume2 size={18} />
                  </IconButton>
                  <div className="practice-row-main">
                    {session.mode !== "dictation" ? prompt(card, true) : null}
                    {answerControl(card, index)}
                    {feedback(card)}
                    {productionRating(card, index)}
                  </div>
                  <IconButton
                    label={`Flag word ${index + 1}`}
                    aria-pressed={Boolean(session.answers[card.id]?.flagged)}
                    disabled={locked}
                    onClick={() => toggleFlag(index)}
                  >
                    <Flag size={16} />
                  </IconButton>
                </div>
              ))}
            </div>
          ) : (
            <div className="practice-focus">
              <div className="practice-focus-meta">
                <span className="practice-focus-counter">
                  {currentIndex + 1} / {count}
                </span>
                <IconButton
                  label={`Flag word ${currentIndex + 1}`}
                  aria-pressed={Boolean(
                    session.answers[cards[currentIndex].id]?.flagged,
                  )}
                  disabled={locked}
                  onClick={() => toggleFlag(currentIndex)}
                >
                  <Flag size={17} />
                </IconButton>
              </div>
              {session.mode === "dictation" ? (
                <IconButton
                  label="Listen to word"
                  className="practice-listen-button"
                  disabled={locked}
                  onClick={() => {
                    playedIndex.current = currentIndex;
                    void playCard(currentIndex);
                  }}
                >
                  <Volume2 size={34} />
                </IconButton>
              ) : null}
              {prompt(cards[currentIndex])}
              {answerControl(cards[currentIndex], currentIndex)}
              {feedback(cards[currentIndex])}
              {productionRating(cards[currentIndex], currentIndex)}
            </div>
          )}
          <div className="practice-footer">
            <button
              className="btn line"
              type="button"
              disabled={currentIndex === 0 || locked}
              onClick={() => focusCard(currentIndex - 1)}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <span>
              {currentIndex + 1} / {count}
            </span>
            <button
              className="btn line"
              type="button"
              disabled={currentIndex >= cards.length - 1 || locked}
              onClick={() => advance(currentIndex)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      ) : null}
      {results ? (
        <section className="practice-results">
          <div className="practice-result-title">
            <div>
              <span>
                {modeLabel(results.mode)} ·{" "}
                {dateLabel(results.submittedAt || results.startedAt)}
              </span>
              <h3>
                {results.mode === "audio"
                  ? "Listening activity saved"
                  : `${results.summary.correct} of ${results.summary.total} correct`}
              </h3>
            </div>
            <Check size={26} />
          </div>
          <dl className="practice-result-summary">
            <div>
              <dt>Total</dt>
              <dd>{results.summary.total}</dd>
            </div>
            {results.mode === "audio" ? (
              <div>
                <dt>Listened</dt>
                <dd>{results.summary.listened || 0}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Correct</dt>
                  <dd>{results.summary.correct}</dd>
                </div>
                <div>
                  <dt>Incorrect</dt>
                  <dd>{results.summary.incorrect}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{results.summary.pending}</dd>
                </div>
              </>
            )}
          </dl>
          <div className="practice-result-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Your response</th>
                  <th>Answer</th>
                  <th>Result</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((row, index) => (
                  <tr key={`${row.cardId}:${index}`}>
                    <th scope="row">
                      <Link
                        to={`/vocabulary/entry/${encodeURIComponent(row.entryId)}`}
                      >
                        {row.term}
                      </Link>
                      <small>{row.definition}</small>
                    </th>
                    <td>
                      {row.response || (
                        <span className="practice-unanswered">Unanswered</span>
                      )}
                    </td>
                    <td>{row.expectedAnswer || "—"}</td>
                    <td>
                      <span
                        className={`practice-result-badge is-${row.result}`}
                      >
                        {results.mode === "audio"
                          ? row.response
                            ? "Listened"
                            : "Unplayed"
                          : resultName(row.result)}
                      </span>
                    </td>
                    <td>
                      <span className="practice-result-source">
                        {resultSource(row.entryId)}
                      </span>
                      <Link
                        to={`/vocabulary/entry/${encodeURIComponent(row.entryId)}`}
                      >
                        Details
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions practice-results-actions">
            {results.mode !== "audio" &&
            results.results.some(
              (row) => row.result === "failure" || row.result === "partial",
            ) ? (
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  const failedIds = new Set(
                    results.results
                      .filter(
                        (row) =>
                          row.result === "failure" || row.result === "partial",
                      )
                      .map((row) => row.cardId),
                  );
                  const retryCards = cards.length
                    ? cards.filter((card) => failedIds.has(card.id))
                    : getVocabularyReviewQueue(fb.state, {
                        mode: results.mode as VocabularyMode,
                        dueOnly: false,
                      }).filter((card) => failedIds.has(card.id));
                  begin(retryCards, results.mode);
                }}
              >
                <RotateCcw size={15} />
                Retry mistakes
              </button>
            ) : null}
            <button className="btn line" type="button" onClick={resetResults}>
              New session
            </button>
            <Link className="btn line" to="/vocabulary">
              Exit
            </Link>
          </div>
        </section>
      ) : null}
      <VocabularyPreferencesDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onSave={savePreferences}
        busy={saving}
        configurationLocked={Boolean(session)}
      />
      <ModalFrame
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Exit practice session"
      >
        <div className="practice-confirm-dialog">
          <h2>Exit this session?</h2>
          <p>
            {answered} of {count} answered
          </p>
          <div className="practice-confirm-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => exit(true)}
            >
              Keep progress
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => exit(false)}
            >
              Discard session
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => setExitOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalFrame>
      <ModalFrame
        open={incompleteOpen}
        onClose={() => setIncompleteOpen(false)}
        title="Submit incomplete session"
      >
        <div className="practice-confirm-dialog">
          <h2>Submit this session?</h2>
          <p>
            {count - answered} unanswered{" "}
            {count - answered === 1 ? "word" : "words"}
          </p>
          <div className="practice-confirm-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => void submit(true)}
            >
              Submit anyway
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => setIncompleteOpen(false)}
            >
              Continue practice
            </button>
          </div>
        </div>
      </ModalFrame>
    </section>
  );
}
