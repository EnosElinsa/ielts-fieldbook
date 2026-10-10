// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Eye,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { Empty, FilterMenu } from "../../components/ui";
import { accountId } from "../../storage/remote";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import {
  deriveVocabularyStatus,
  enrollWordbook,
  getActiveWrongWords,
  getVocabularyReviewQueue,
  markWordbookUnitComplete,
  normalizeAnswer,
  recordAudioActivity,
  recordVocabularyReview,
  removeVocabularyItem,
  resolveWrongWord,
  setVocabularyManualStatus,
} from "../../domain/vocabulary";
import "../../styles/vocabulary.css";
import { DictionarySenses } from './DictionarySenses';

const STATUS = [
  "new",
  "unfamiliar",
  "unstable",
  "active",
  "familiar",
  "mastered",
];
const MODES = [
  { value: "dictation", label: "Dictation" },
  { value: "definition", label: "Definition recall" },
  { value: "cloze", label: "Cloze" },
  { value: "distinction", label: "Synonym / distinction" },
  { value: "audio", label: "Audio loop" },
  { value: "production", label: "Sentence production" },
];
const DIMENSIONS = ["meaning", "listening", "spelling", "usage"];
const label = (value = "") =>
  String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
const books = (state = {}) =>
  (VOCABULARY_CATALOG.books || []).map((book) => ({
    ...book,
    entryIds: [
      ...new Set([
        ...(book.entryIds || []),
        ...(VOCABULARY_CATALOG.memberships || [])
          .filter((item) => item.bookId === book.id)
          .map((item) => item.entryId),
        ...(state.vocabulary || [])
          .filter((entry) =>
            (entry.sources || []).some((source) => source.bookId === book.id),
          )
          .map((entry) => entry.id),
      ]),
    ],
  }));
const units = (state = {}) =>
  (VOCABULARY_CATALOG.units || []).map((unit) => ({
    ...unit,
    entryIds: [
      ...new Set([
        ...(unit.entryIds || []),
        ...(VOCABULARY_CATALOG.memberships || [])
          .filter(
            (item) => item.bookId === unit.bookId && item.unitId === unit.id,
          )
          .map((item) => item.entryId),
        ...(state.vocabulary || [])
          .filter((entry) =>
            (entry.sources || []).some(
              (source) =>
                source.bookId === unit.bookId && source.unitId === unit.id,
            ),
          )
          .map((entry) => entry.id),
      ]),
    ],
  }));
function bookHierarchy(state, bookId) {
  const rows = units(state).filter((unit) => unit.bookId === bookId);
  const roots = rows
    .filter((unit) => !unit.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const ordered = roots.flatMap((root) => [
    root,
    ...rows
      .filter((unit) => unit.parentId === root.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
  ]);
  return [
    ...ordered,
    ...rows.filter((unit) => !ordered.some((item) => item.id === unit.id)),
  ];
}
const learning = (state, entryId) =>
  (state.vocabularyStates || []).filter((item) => item.entryId === entryId);
function statusOf(state, id) {
  const states = learning(state, id);
  return states.length
    ? states
        .map(deriveVocabularyStatus)
        .sort((a, b) => STATUS.indexOf(a) - STATUS.indexOf(b))[0]
    : "new";
}
function manualOf(state, id) {
  return (
    learning(state, id)
      .map((item) => item.manualStatus)
      .sort((a, b) => STATUS.indexOf(a) - STATUS.indexOf(b))[0] || "new"
  );
}
function editEntry(fb, entry = null) {
  fb.setEditingVocabularyId(entry?.id || null);
  fb.setVocabularySeed(entry || {});
  fb.openModal("vocabulary");
}
function sourceLabel(source) {
  return source.type === "wordbook"
    ? books().find((book) => book.id === source.bookId)?.title || "Wordbook"
    : label(source.type || "personal");
}
function dateLabel(value) {
  return value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "Due now";
}
function safeQueue(state, filter) {
  return getVocabularyReviewQueue(state, filter) || [];
}

export function VocabularyNavigation() {
  return (
    <nav className="vocabulary-tabs" aria-label="Vocabulary views">
      {[
        ["/vocabulary", "My vocabulary"],
        ["/vocabulary/wordbooks", "Wordbooks"],
        ["/vocabulary/review", "Review"],
        ["/vocabulary/wrong", "Wrong words"],
        ["/vocabulary/progress", "Progress"],
      ].map(([path, title]) => (
        <NavLink
          key={path}
          to={path}
          end={path === "/vocabulary"}
          className={({ isActive }) => (isActive ? "is-active" : undefined)}
        >
          {title}
        </NavLink>
      ))}
    </nav>
  );
}

function VocabularyLayout({ children }) {
  return (
    <section className="view active vocabulary-view">
      <VocabularyNavigation />
      {children}
    </section>
  );
}
function VocabularyStats({ values }) {
  return (
    <dl className="vocabulary-stats">
      {values.map(([title, value]) => (
        <div key={title}>
          <dt>{title}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Sources({ entry }) {
  return (
    <div className="vocabulary-sources">
      {(entry.sources || []).map((source, index) => (
        <span className="pill" key={`${source.type}:${source.id}:${index}`}>
          {sourceLabel(source)}
        </span>
      ))}
    </div>
  );
}
function SelectField({ label: title, value, onChange, options }) {
  return (
    <FilterMenu
      label={title}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

export function VocabularyPage() {
  const fb = useFieldbook();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [skill, setSkill] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(0);
  const [bulk, setBulk] = useState("familiar");
  const entries = (fb.state.vocabulary || []).filter(
    (entry) => !(entry.tags || []).includes("archived"),
  );
  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        const text = [
          entry.term,
          entry.meaning,
          entry.example,
          ...(entry.tags || []),
        ]
          .join(" ")
          .toLowerCase();
        return (
          text.includes(search.toLowerCase().trim()) &&
          (status === "all" || manualOf(fb.state, entry.id) === status) &&
          (source === "all" ||
            (entry.sources || []).some((item) => item.type === source)) &&
          (skill === "all" ||
            (entry.sources || []).some(
              (item) => item.skill === skill || item.type === skill,
            ))
        );
      }),
    [entries, fb.state.vocabularyStates, search, status, source, skill],
  );
  useEffect(() => { setPage(0); setSelected(new Set()); }, [search, status, source, skill]);
  const visibleEntries = filtered.slice(page * 100, page * 100 + 100);
  const applyBulk = async () => {
    const draft = structuredClone(fb.stateRef.current);
    selected.forEach((id) => {
      const entry = draft.vocabulary.find((entry) => entry.id === id);
      (entry?.senses || []).forEach((sense) =>
        setVocabularyManualStatus(draft, id, bulk, sense.id),
      );
    });
    if (await fb.persistNow(draft)) {
      setSelected(new Set());
      fb.toast("Familiarity updated.");
    }
  };
  return (
    <VocabularyLayout>
      <div className="page-tools">
        <h2>My vocabulary</h2>
        <div className="actions">
          <button
            type="button"
            className="btn line"
            onClick={() => fb.openModal("vocabularyImport")}
          >
            <Upload size={16} />
            Import
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => editEntry(fb)}
          >
            <Plus size={16} />
            Add vocabulary
          </button>
        </div>
      </div>
      <VocabularyStats
        values={[
          ["Entries", entries.length],
          ["Due cards", safeQueue(fb.state, { dueOnly: true }).length],
          ["Wrong words", getActiveWrongWords(fb.state).length],
          [
            "Mastered",
            entries.filter(
              (entry) => statusOf(fb.state, entry.id) === "mastered",
            ).length,
          ],
        ]}
      />
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search vocabulary"
          placeholder="Search vocabulary"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label="Familiarity"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Any familiarity" },
            ...STATUS.map((value) => ({ value, label: label(value) })),
          ]}
        />
        <SelectField
          label="Source"
          value={source}
          onChange={setSource}
          options={[
            "all",
            "personal",
            "wordbook",
            "writing",
            "speaking",
            "assessment",
            "listening",
            "reading",
          ].map((value) => ({
            value,
            label: value === "all" ? "All sources" : label(value),
          }))}
        />
        <SelectField
          label="Skill"
          value={skill}
          onChange={setSkill}
          options={["all", "writing", "speaking", "listening", "reading"].map(
            (value) => ({
              value,
              label: value === "all" ? "All skills" : label(value),
            }),
          )}
        />
      </div>
      {filtered.length ? (
        <>
          <div className="vocabulary-selection">
            <label>
              <input
                type="checkbox"
                checked={visibleEntries.every((entry) => selected.has(entry.id))}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? new Set(visibleEntries.map((entry) => entry.id))
                      : new Set(),
                  )
                }
              />
              Select visible
            </label>
            {selected.size ? (
              <>
                <span>{selected.size} selected</span>
                <SelectField
                  label="Set familiarity"
                  value={bulk}
                  onChange={setBulk}
                  options={STATUS.map((value) => ({
                    value,
                    label: label(value),
                  }))}
                />
                <button className="btn line" type="button" onClick={applyBulk}>
                  <Check size={15} />
                  Apply
                </button>
              </>
            ) : null}
          </div>
          <div className="vocabulary-table" role="list">
            {visibleEntries.map((entry) => (
              <article
                className="vocabulary-row"
                role="listitem"
                key={entry.id}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${entry.term}`}
                  checked={selected.has(entry.id)}
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      event.target.checked
                        ? next.add(entry.id)
                        : next.delete(entry.id);
                      return next;
                    })
                  }
                />
                <div className="vocabulary-row-main">
                  <Link
                    to={`/vocabulary/entry/${entry.id}`}
                    className="vocabulary-term"
                  >
                    {entry.term}
                  </Link>
                  <p>
                    {entry.senses?.[0]?.definition ||
                      entry.meaning ||
                      "Definition pending"}
                  </p>
                  <Sources entry={entry} />
                </div>
                <div className="vocabulary-row-meta">
                  <span
                    className={`pill ${statusOf(fb.state, entry.id) === "mastered" ? "green" : ""}`}
                  >
                    {label(manualOf(fb.state, entry.id))}
                  </span>
                  <span className="vocabulary-muted">
                    Evidence: {label(statusOf(fb.state, entry.id))}
                  </span>
                  {learning(fb.state, entry.id).some(
                    (item) => item.wrong?.active,
                  ) ? (
                    <Link className="pill red" to="/vocabulary/wrong">
                      Wrong word
                    </Link>
                  ) : null}
                  {entry.enrichmentPending ? (
                    <span className="vocabulary-muted">Enrichment pending</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit ${entry.term}`}
                  title="Edit vocabulary"
                  onClick={() => editEntry(fb, entry)}
                >
                  <Pencil size={16} />
                </button>
              </article>
            ))}
          </div>
          {filtered.length > 100 ? <div className="vocabulary-selection"><button type="button" className="btn line" disabled={page === 0} onClick={() => setPage(value=>value-1)}><ArrowLeft size={15}/>Previous</button><span>{page*100+1}-{Math.min((page+1)*100,filtered.length)} of {filtered.length}</span><button type="button" className="btn line" disabled={(page+1)*100>=filtered.length} onClick={() => setPage(value=>value+1)}>Next<ArrowRight size={15}/></button></div> : null}
        </>
      ) : (
        <Empty
          message={
            entries.length
              ? "No vocabulary matches these filters."
              : "No vocabulary saved yet."
          }
          label={entries.length ? "Clear filters" : "Add vocabulary"}
          onAction={() => {
            if (!entries.length) editEntry(fb);
            else {
              setSearch("");
              setStatus("all");
              setSource("all");
              setSkill("all");
            }
          }}
        />
      )}
    </VocabularyLayout>
  );
}

export function VocabularyWordbooksPage() {
  const fb = useFieldbook();
  const [params] = useSearchParams();
  const [selectedBook, setSelectedBook] = useState(params.get("bookId") || "");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [joining, setJoining] = useState("");
  const loadRef = useRef(fb.loadVocabularyCatalog);
  loadRef.current = fb.loadVocabularyCatalog;
  const request = useRef(0);
  const loadCatalog = async (id) => {
    if (!loadRef.current) return true;
    const generation = ++request.current;
    setCatalogBusy(true);
    setCatalogError("");
    try {
      const result = await loadRef.current(id || undefined);
      if (generation !== request.current) return false;
      if (result === false || result?.error) {
        setCatalogError(
          result?.error?.message ||
            result?.error ||
            "Catalog could not be loaded. Local starter content is available.",
        );
        return false;
      }
      return true;
    } catch (failure) {
      if (generation === request.current)
        setCatalogError(
          failure instanceof Error
            ? failure.message
            : "Catalog could not be loaded. Local starter content is available.",
        );
      return false;
    } finally {
      if (generation === request.current) setCatalogBusy(false);
    }
  };
  useEffect(() => {
    loadCatalog(selectedBook);
    return () => {
      request.current++;
    };
  }, [selectedBook]);
  const book = books(fb.state).find((item) => item.id === selectedBook);
  const enrolled = (id) =>
    (fb.state.wordbookEnrollments || []).some((item) => item.bookId === id);
  const join = async (id) => {
    if (joining) return;
    setJoining(id);
    try {
      await loadCatalog(id);
      const draft = structuredClone(fb.stateRef.current);
      enrollWordbook(draft, id);
      if (await fb.persistNow(draft)) fb.toast("Wordbook added.");
    } catch {
      setCatalogError("Wordbook could not be saved. Retry adding it.");
    } finally {
      setJoining("");
    }
  };
  const complete = async (unit) => {
    const draft = structuredClone(fb.stateRef.current);
    const result = markWordbookUnitComplete(draft, unit.bookId, unit.id);
    if (!result) {
      fb.toast(
        "Review every available entry before marking this unit studied.",
      );
      return;
    }
    if (await fb.persistNow(draft)) fb.toast("Study progress updated.");
  };
  return (
    <VocabularyLayout>
      <div className="page-tools">
        <h2>Wordbooks</h2>
        <button
          type="button"
          className="btn line"
          onClick={() => fb.openModal("vocabularyImport")}
        >
          <Upload size={16} />
          Import wordbook progress
        </button>
      </div>
      {catalogBusy ? (
        <p role="status" className="vocabulary-muted">
          Loading catalog...
        </p>
      ) : null}
      {catalogError ? (
        <div className="vocabulary-catalog-error">
          <p role="alert" className="vocabulary-error">
            {catalogError}
          </p>
          <button
            type="button"
            className="btn line"
            disabled={catalogBusy}
            onClick={() => loadCatalog(selectedBook)}
          >
            <RotateCcw size={15} />
            Retry catalog
          </button>
        </div>
      ) : null}
      {book ? (
        <>
          <button
            type="button"
            className="btn text"
            onClick={() => setSelectedBook("")}
          >
            <ArrowLeft size={16} />
            All wordbooks
          </button>
          <div className="vocabulary-book-heading">
            <h3>{book.title}</h3>
            <p>{book.description}</p>
            <span className="pill">
              {book.entryIds?.length || 0} available entries
            </span>
            {book.totalSourceWords ? (
              <span className="pill">{book.totalSourceWords} source words</span>
            ) : null}
            <span className="pill">{label(book.contentStatus)} content</span>
            <div className="actions">
              {enrolled(book.id) ? (
                <Link
                  className="btn primary"
                  to={`/vocabulary/review?bookId=${book.id}&dueOnly=false`}
                >
                  Study book
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={Boolean(joining) || catalogBusy}
                  onClick={() => join(book.id)}
                >
                  <Plus size={15} />
                  Add wordbook
                </button>
              )}
            </div>
          </div>
          <div className="vocabulary-unit-list">
            {bookHierarchy(fb.state, book.id).map((unit) => {
              const progress = (fb.state.wordbookProgress || []).find(
                (item) => item.bookId === book.id && item.unitId === unit.id,
              );
              const studied = progress?.completedEntryIds?.length || 0;
              const mastery = (unit.entryIds || []).filter(
                (id) => statusOf(fb.state, id) === "mastered",
              ).length;
              return (
                <article
                  className={`vocabulary-unit${unit.parentId ? " vocabulary-unit-child" : ""}`}
                  key={unit.id}
                >
                  <div>
                    <h4>
                      {unit.parentId
                        ? `${units(fb.state).find((parent) => parent.id === unit.parentId)?.title || "Chapter"} / ${unit.title}`
                        : unit.title}
                    </h4>
                    <p>
                      {unit.entryIds.length
                        ? `Studied ${studied}/${unit.entryIds.length} | Mastered ${mastery}/${unit.entryIds.length}`
                        : `${unit.totalSourceWords ? `${unit.totalSourceWords} source words | ` : ""}Content pending`}
                    </p>
                    {unit.entryIds.length ? (
                      <progress
                        aria-label={`${unit.title} study progress`}
                        value={studied}
                        max={unit.entryIds.length || 1}
                      />
                    ) : null}
                  </div>
                  <div className="actions">
                    {unit.entryIds.length && enrolled(book.id) ? (
                      <Link
                        className="btn line"
                        to={`/vocabulary/review?bookId=${book.id}&unitId=${unit.id}&dueOnly=false`}
                      >
                        Study unit
                        <ArrowRight size={15} />
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn line"
                      disabled={
                        !enrolled(book.id) ||
                        !unit.entryIds.length ||
                        studied < unit.entryIds.length ||
                        progress?.status === "completed"
                      }
                      onClick={() => complete(unit)}
                    >
                      <Check size={15} />
                      {progress?.status === "completed"
                        ? "Studied"
                        : "Mark studied"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="vocabulary-muted">
            Source: {book.source || book.sourceTitle || "Public catalog"}
            {book.license ? ` | ${book.license}` : ""}
          </p>
        </>
      ) : (
        <div className="vocabulary-books">
          {books(fb.state).map((item) => {
            const progress = (fb.state.wordbookProgress || []).filter(
              (row) => row.bookId === item.id,
            );
            const completed = new Set(
              progress.flatMap((row) => row.completedEntryIds || []),
            ).size;
            return (
              <article className="vocabulary-book" key={item.id}>
                <BookOpen size={22} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="vocabulary-muted">
                  {item.entryIds?.length || 0} available entries |{" "}
                  {label(item.contentStatus)} content
                </div>
                {enrolled(item.id) ? (
                  <div className="vocabulary-muted">{completed} studied</div>
                ) : null}
                <div className="actions">
                  <button
                    type="button"
                    className="btn line"
                    onClick={() => setSelectedBook(item.id)}
                  >
                    Open
                    <ArrowRight size={15} />
                  </button>
                  {!enrolled(item.id) ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={
                        !item.entryIds?.length ||
                        Boolean(joining) ||
                        catalogBusy
                      }
                      onClick={() => join(item.id)}
                    >
                      <Plus size={15} />
                      Add
                    </button>
                  ) : (
                    <span className="pill green">Added</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </VocabularyLayout>
  );
}

function speechEngine() {
  let audio = null;
  let stop = null;
  let generation = 0;
  const cancel = () => {
    generation++;
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    window.speechSynthesis?.cancel();
    if (stop) {
      stop();
      stop = null;
    }
  };
  const speak = (entry, accent = "uk", example = false) =>
    new Promise((resolve) => {
      cancel();
      const current = generation;
      let settled = false;
      const finish = (success = true) => {
        if (!settled) {
          settled = true;
          stop = null;
          resolve(success && current === generation);
        }
      };
      stop = () => {
        settled = true;
        resolve(false);
      };
      const text = example
        ? entry.senses?.[0]?.example || entry.example
        : entry.term;
      if (!text) {
        finish();
        return;
      }
      const fallback = () => {
        if (current !== generation) return;
        if (
          !window.speechSynthesis ||
          typeof SpeechSynthesisUtterance === "undefined"
        ) {
          finish(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = accent === "us" ? "en-US" : "en-GB";
        utterance.voice =
          window.speechSynthesis
            .getVoices()
            .find(
              (voice) =>
                voice.lang.toLowerCase() === utterance.lang.toLowerCase(),
            ) || null;
        utterance.onend = () => finish();
        utterance.onerror = () => finish(false);
        window.speechSynthesis.speak(utterance);
      };
      const url = !example && entry.pronunciation?.[accent];
      if (typeof url === "string" && /^https?:\/\//.test(url)) {
        audio = new Audio(url);
        audio.onended = () => finish();
        audio.onerror = fallback;
        audio.play().catch(fallback);
      } else fallback();
    });
  return { cancel, speak };
}

export function VocabularyEntryPage() {
  const fb = useFieldbook();
  const { id, entryId } = useParams();
  const entry =
    (fb.state.vocabulary || []).find((item) => item.id === (id || entryId)) ||
    (VOCABULARY_CATALOG.entries || []).find(
      (item) => item.id === (id || entryId),
    );
  const engine = useRef(null);
  if (!engine.current) engine.current = speechEngine();
  const [accent, setAccent] = useState("uk");
  useEffect(() => () => engine.current.cancel(), []);
  if (!entry)
    return (
      <VocabularyLayout>
        <Empty message="Vocabulary entry not found." />
        <Link to="/vocabulary" className="btn line">
          <ArrowLeft size={15} />
          My vocabulary
        </Link>
      </VocabularyLayout>
    );
  const changeStatus = async (status, senseId) => {
    const draft = structuredClone(fb.stateRef.current);
    setVocabularyManualStatus(draft, entry.id, status, senseId);
    if (await fb.persistNow(draft)) fb.toast("Familiarity updated.");
  };
  return (
    <VocabularyLayout>
      <Link to="/vocabulary" className="btn text">
        <ArrowLeft size={15} />
        My vocabulary
      </Link>
      <div className="page-tools">
        <div>
          <h2>{entry.term}</h2>
          {entry.pronunciation?.ipa ? <p>{entry.pronunciation.ipa}</p> : null}
        </div>
        <div className="actions">
          <SelectField
            label="Pronunciation accent"
            value={accent}
            onChange={setAccent}
            options={[
              { value: "uk", label: "UK" },
              { value: "us", label: "US" },
            ]}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Play pronunciation"
            title="Play pronunciation"
            onClick={() => engine.current.speak(entry, accent)}
          >
            <Volume2 size={18} />
          </button>
          <button
            type="button"
            className="btn line"
            onClick={() => editEntry(fb, entry)}
          >
            <Pencil size={16} />
            Edit
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Archive vocabulary"
            title="Archive vocabulary"
            onClick={async () => {
              if (!window.confirm(`Archive ${entry.term}?`)) return;
              const draft = structuredClone(fb.stateRef.current);
              removeVocabularyItem(draft, entry.id);
              if (await fb.persistNow(draft)) fb.toast("Vocabulary archived.");
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <p className="vocabulary-muted">
        {entry.pronunciation?.[accent]
          ? `${accent.toUpperCase()} audio, with browser speech fallback`
          : `${accent.toUpperCase()} browser speech`}
      </p>
      <Sources entry={entry} />
      {(entry.senses?.length
        ? entry.senses
        : [{ id: "", definition: entry.meaning, example: entry.example }]
      ).map((sense, index) => {
        const state = learning(fb.state, entry.id).find(
          (item) => item.senseId === sense.id,
        );
        return (
          <section className="vocabulary-sense" key={sense.id || index}>
            <div className="vocabulary-sense-head">
              <h3>
                Sense {index + 1}
                {sense.pos ? ` | ${sense.pos}` : ""}
              </h3>
              <SelectField
                label={`Familiarity for sense ${index + 1}`}
                value={state?.manualStatus || "new"}
                onChange={(value) => changeStatus(value, sense.id)}
                options={STATUS.map((value) => ({
                  value,
                  label: label(value),
                }))}
              />
            </div>
            <p className="vocabulary-definition">
              {sense.definition || "Definition pending"}
            </p>
            {sense.example ? <blockquote>{sense.example}</blockquote> : null}
            {[
              "collocations",
              "usage",
              "synonyms",
              "antonyms",
              "distinctions",
              "wordFamily",
              "register",
            ].map((key) =>
              sense[key]?.length ? (
                <div className="vocabulary-detail" key={key}>
                  <h4>{label(key)}</h4>
                  <p>
                    {Array.isArray(sense[key])
                      ? sense[key]
                          .map((value) =>
                            typeof value === "string"
                              ? value
                              : value.term ||
                                value.description ||
                                JSON.stringify(value),
                          )
                          .join("; ")
                      : String(sense[key])}
                  </p>
                </div>
              ) : null,
            )}
            <div className="vocabulary-dimensions">
              {DIMENSIONS.map((dimension) => (
                <div key={dimension}>
                  <strong>{label(dimension)}</strong>
                  <span>
                    {state?.dimensions?.[dimension]?.successes || 0} successes /{" "}
                    {state?.dimensions?.[dimension]?.failures || 0} failures
                  </span>
                  <small>
                    {state?.dimensions?.[dimension]?.nextReviewAt
                      ? `Review ${dateLabel(state.dimensions[dimension].nextReviewAt)}`
                      : "Not reviewed"}
                  </small>
                </div>
              ))}
            </div>
            {state?.wrong?.active ? (
              <p className="vocabulary-error">
                Active wrong word | {state.wrong.successesSinceFailure || 0}{" "}
                recovery successes
              </p>
            ) : null}
            {sense.source || sense.license ? (
              <p className="vocabulary-muted">
                {sense.source}
                {sense.license ? ` | ${sense.license}` : ""}
                {sense.attribution ? ` | ${sense.attribution}` : ""}
                {sense.sourceUrl && /^https?:\/\//.test(sense.sourceUrl) ? <> | <a href={sense.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></> : null}
              </p>
            ) : null}
          </section>
        );
      })}
      <DictionarySenses entry={entry} />
      <h3 className="vocabulary-section-title">Source context</h3>
      {(entry.sources || []).map((source, index) => (
        <div className="vocabulary-source-context" key={index}>
          <strong>{sourceLabel(source)}</strong>
          {source.context ? <p>{source.context}</p> : null}
          {source.bookId ? (
            <Link to={`/vocabulary/wordbooks?bookId=${source.bookId}`}>
              Open wordbook
            </Link>
          ) : null}
        </div>
      ))}
      <h3 className="vocabulary-section-title">Review evidence</h3>
      {(fb.state.vocabularyReviews || []).filter(review=>review.entryId===entry.id && review.imported).length ? <section className="vocabulary-evidence"><h4>Imported answer history</h4>{(fb.state.vocabularyReviews || []).filter(review=>review.entryId===entry.id && review.imported).slice(-30).reverse().map(review=><div key={review.id}><span>{review.sourceLabel || 'Source dictation'}</span><span>{label(review.result)}</span><p>{review.response || 'No answer recorded'}</p><small>{review.occurredAt ? dateLabel(review.occurredAt) : 'Source date unavailable'}</small></div>)}</section> : null}
      <div className="vocabulary-evidence">
        {(fb.state.vocabularyEvidence || [])
          .filter((item) => item.entryId === entry.id)
          .slice(-10)
          .reverse()
          .map((item) => (
            <div key={item.id}>
              <span>{label(item.mode || item.dimension || "Usage")}</span>
              <span>{label(item.verification || item.result)}</span>
              {item.response ? <p>{item.response}</p> : null}
              <small>{dateLabel(item.occurredAt)}</small>
            </div>
          ))}
      </div>
    </VocabularyLayout>
  );
}

export function VocabularyWrongPage() {
  const fb = useFieldbook();
  const [source, setSource] = useState("all");
  const [bookId, setBook] = useState("all");
  const [skill, setSkill] = useState("all");
  const [dimension, setDimension] = useState("all");
  const [reason, setReason] = useState("");
  const [resolving, setResolving] = useState(null);
  const wrong = getActiveWrongWords(fb.state, {
    ...(source !== "all" ? { sourceType: source } : {}),
    ...(bookId !== "all" ? { bookId } : {}),
    ...(skill !== "all" ? { skill } : {}),
    ...(dimension !== "all" ? { dimension } : {}),
  });
  const clear = async (item) => {
    if (!reason.trim()) return;
    const draft = structuredClone(fb.stateRef.current);
    const state = item.learningState || item;
    resolveWrongWord(
      draft,
      item.entry?.id || state.entryId,
      reason.trim(),
      state.senseId,
    );
    if (await fb.persistNow(draft)) {
      setResolving(null);
      setReason("");
      fb.toast("Wrong word resolved manually.");
    }
  };
  return (
    <VocabularyLayout>
      <div className="page-tools">
        <h2>Wrong words</h2>
        <Link
          className="btn primary"
          to="/vocabulary/review?wrongOnly=true&dueOnly=false"
        >
          <RotateCcw size={16} />
          Review
        </Link>
      </div>
      <div className="toolbar">
        <SelectField
          label="Wrong word source"
          value={source}
          onChange={setSource}
          options={[
            "all",
            "personal",
            "wordbook",
            "writing",
            "speaking",
            "listening",
            "reading",
            "assessment",
          ].map((value) => ({
            value,
            label: value === "all" ? "All sources" : label(value),
          }))}
        />
        <SelectField
          label="Wrong word book"
          value={bookId}
          onChange={setBook}
          options={[
            { value: "all", label: "All wordbooks" },
            ...books(fb.state).map((book) => ({
              value: book.id,
              label: book.title,
            })),
          ]}
        />
        <SelectField
          label="Wrong word skill"
          value={skill}
          onChange={setSkill}
          options={["all", "writing", "speaking", "listening", "reading"].map(
            (value) => ({
              value,
              label: value === "all" ? "All skills" : label(value),
            }),
          )}
        />
        <SelectField
          label="Wrong word dimension"
          value={dimension}
          onChange={setDimension}
          options={[
            { value: "all", label: "All dimensions" },
            ...DIMENSIONS.map((value) => ({ value, label: label(value) })),
          ]}
        />
      </div>
      {wrong.length ? (
        <div className="vocabulary-table">
          {wrong.map((item, index) => {
            const state = item.learningState || item;
            const entry =
              item.entry ||
              (fb.state.vocabulary || []).find(
                (entry) => entry.id === state.entryId,
              );
            if (!entry) return null;
            const key = state.id || `${entry.id}:${index}`;
            return (
              <article className="vocabulary-wrong-row" key={key}>
                <div>
                  <Link
                    className="vocabulary-term"
                    to={`/vocabulary/entry/${entry.id}`}
                  >
                    {entry.term}
                  </Link>
                  <p>
                    {entry.senses?.find((sense) => sense.id === state.senseId)
                      ?.definition || entry.meaning}
                  </p>
                  <Sources entry={entry} />
                  <span className="vocabulary-muted">
                    Last failure {dateLabel(state.wrong?.lastFailureAt)} |{" "}
                    {state.wrong?.successesSinceFailure || 0} recovery successes
                  </span>
                </div>
                {resolving === key ? (
                  <div className="vocabulary-resolve">
                    <label htmlFor={`resolve-${index}`}>
                      Resolution reason
                    </label>
                    <input
                      id={`resolve-${index}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <div className="actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!reason.trim()}
                        onClick={() => clear(item)}
                      >
                        <Check size={15} />
                        Resolve manually
                      </button>
                      <button
                        type="button"
                        className="btn line"
                        onClick={() => setResolving(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn line"
                    onClick={() => {
                      setResolving(key);
                      setReason("");
                    }}
                  >
                    Resolve manually
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty message="No active wrong words." />
      )}
    </VocabularyLayout>
  );
}

export function VocabularyProgressPage() {
  const fb = useFieldbook();
  const states = fb.state.vocabularyStates || [];
  const entries = fb.state.vocabulary || [];
  const evidence = fb.state.vocabularyEvidence || [];
  const reviews = fb.state.vocabularyReviews || [];
  const exportProgress = () => {
    const content = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        vocabulary: entries,
        vocabularyStates: states,
        vocabularyReviews: reviews,
        vocabularyEvidence: evidence,
        vocabularyActivities: fb.state.vocabularyActivities || [],
        wordbookProgress: fb.state.wordbookProgress || [],
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "vocabulary-progress.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <VocabularyLayout>
      <div className="page-tools">
        <h2>Vocabulary progress</h2>
        <button type="button" className="btn line" onClick={exportProgress}>
          <Download size={16} />
          Export progress
        </button>
      </div>
      <VocabularyStats
        values={[
          ["Entries", entries.length],
          ["Review evidence", reviews.length],
          ["Active wrong words", getActiveWrongWords(fb.state).length],
          [
            "Awaiting verification",
            evidence.filter(
              (item) =>
                item.verification === "pending" || item.result === "pending",
            ).length,
          ],
        ]}
      />
      <h3 className="vocabulary-section-title">Familiarity</h3>
      <div className="vocabulary-status-breakdown">
        {STATUS.map((status) => (
          <div key={status}>
            <span>{label(status)}</span>
            <strong>
              {
                entries.filter(
                  (entry) => statusOf(fb.state, entry.id) === status,
                ).length
              }
            </strong>
          </div>
        ))}
      </div>
      <h3 className="vocabulary-section-title">Learning dimensions</h3>
      <div className="vocabulary-progress-table">
        <div className="vocabulary-progress-head">
          <span>Dimension</span>
          <span>Successes</span>
          <span>Failures</span>
          <span>Due</span>
        </div>
        {DIMENSIONS.map((dimension) => {
          const rows = states
            .map((item) => item.dimensions?.[dimension])
            .filter(Boolean);
          return (
            <div key={dimension}>
              <strong>{label(dimension)}</strong>
              <span>
                {rows.reduce((sum, item) => sum + (item.successes || 0), 0)}
              </span>
              <span>
                {rows.reduce((sum, item) => sum + (item.failures || 0), 0)}
              </span>
              <span>
                {
                  rows.filter(
                    (item) =>
                      item.nextReviewAt &&
                      new Date(item.nextReviewAt) <= new Date(),
                  ).length
                }
              </span>
            </div>
          );
        })}
      </div>
      <h3 className="vocabulary-section-title">Wordbook progress</h3>
      <div className="vocabulary-table">
        {books(fb.state)
          .filter((book) =>
            (fb.state.wordbookEnrollments || []).some(
              (item) => item.bookId === book.id,
            ),
          )
          .map((book) => {
            const progress = (fb.state.wordbookProgress || []).filter(
              (item) => item.bookId === book.id,
            );
            const completed = new Set(
              progress.flatMap((item) => item.completedEntryIds || []),
            ).size;
            const mastered = (book.entryIds || []).filter(
              (id) => statusOf(fb.state, id) === "mastered",
            ).length;
            return (
              <div className="vocabulary-unit" key={book.id}>
                <Link to={`/vocabulary/wordbooks?bookId=${book.id}`}>
                  {book.title}
                </Link>
                <span>
                  Studied {completed}/{book.entryIds.length}
                </span>
                <span>
                  Mastered {mastered}/{book.entryIds.length}
                </span>
              </div>
            );
          })}
      </div>
      <h3 className="vocabulary-section-title">Recent evidence</h3>
      {reviews.length || evidence.length ? (
        <div className="vocabulary-evidence">
          {[...reviews, ...evidence]
            .sort((a, b) =>
              (Date.parse(b.occurredAt || b.createdAt || '') || 0)-(Date.parse(a.occurredAt || a.createdAt || '') || 0),
            )
            .slice(0, 20)
            .map((item, index) => (
              <div key={item.id || index}>
                <Link to={`/vocabulary/entry/${item.entryId}`}>
                  {entries.find((entry) => entry.id === item.entryId)?.term ||
                    "Vocabulary entry"}
                </Link>
                <span>{label(item.mode || item.dimension)}</span>
                <span>{label(item.verification || item.result)}</span>
                <small>{item.occurredAt || item.createdAt ? dateLabel(item.occurredAt || item.createdAt) : 'Source date unavailable'}</small>
              </div>
            ))}
        </div>
      ) : (
        <Empty message="No review evidence yet." />
      )}
    </VocabularyLayout>
  );
}
