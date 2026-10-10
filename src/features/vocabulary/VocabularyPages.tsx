// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { Empty, FilterMenu } from "../../components/ui";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import {
  deriveVocabularyStatus,
  enrollWordbook,
  getActiveWrongWords,
  getVocabularyReviewQueue,
  removeVocabularyItem,
  resolveWrongWord,
  setVocabularyManualStatus,
} from "../../domain/vocabulary";
import { reviewedEntry } from "../../domain/vocabulary/content";
import { vocabularyGroupProgress } from "../../domain/vocabulary/progress";
import "../../styles/vocabulary.css";
import "../../styles/vocabulary-workbench.css";
import { DictionarySenses } from './DictionarySenses';
import { isRegionalSpellingDifference } from '../../domain/vocabulary/spelling';

const STATUS = [
  "new",
  "unfamiliar",
  "unstable",
  "active",
  "familiar",
  "mastered",
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
function units(state = {}) {
  const entries = new Map([...(VOCABULARY_CATALOG.entries || []), ...(state.vocabulary || [])].map(entry => [entry.id, entry]));
  const memberships = new Map();
  [...(VOCABULARY_CATALOG.memberships || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
    const key = `${item.bookId}:${item.unitId}`;
    memberships.set(key, [...(memberships.get(key) || []), item.entryId]);
  });
  const personal = new Map();
  (state.vocabulary || []).forEach(entry => (entry.sources || []).forEach(source => {
    const key = `${source.bookId}:${source.unitId}`;
    personal.set(key, [...(personal.get(key) || []), entry.id]);
  }));
  return (VOCABULARY_CATALOG.units || []).map(unit => {
    const entryIds = [...new Set([
      ...(memberships.get(`${unit.bookId}:${unit.id}`) || []), ...(unit.entryIds || []), ...(personal.get(`${unit.bookId}:${unit.id}`) || []),
    ])];
    const studyEntryIds = entryIds.filter(id => !(entries.get(id)?.tags || []).includes('archived'));
    return { ...unit, entryIds, studyEntryIds, archivedCount: entryIds.length - studyEntryIds.length };
  });
}
function bookHierarchy(state, bookId) {
  const rows = units(state).filter(unit => unit.bookId === bookId);
  const byParent = new Map();
  rows.forEach(unit => byParent.set(unit.parentId || '', [...(byParent.get(unit.parentId || '') || []), unit]));
  byParent.forEach(children => children.sort((a, b) => (a.order || 0) - (b.order || 0)));
  const visited = new Set();
  const ordered = [];
  const visit = unit => {
    if (visited.has(unit.id)) return;
    visited.add(unit.id); ordered.push(unit);
    (byParent.get(unit.id) || []).forEach(visit);
  };
  (byParent.get('') || []).forEach(visit);
  rows.forEach(visit);
  return ordered;
}
function groupStudied(state, unit) { return vocabularyGroupProgress(state, unit) === 'Studied'; }
function bookStudy(state, bookId) {
  const hierarchy = bookHierarchy(state, bookId);
  const groups = hierarchy.filter(unit => !hierarchy.some(child => child.parentId === unit.id) && unit.kind !== 'chapter');
  const available = groups.filter(unit => unit.studyEntryIds.length);
  const studied = available.filter(unit => groupStudied(state, unit));
  const studiedIds = new Set(studied.flatMap(unit => unit.studyEntryIds));
  return { hierarchy, groups, available, studied, studiedIds, next: available.find(unit => !groupStudied(state, unit)) };
}
function unitPath(book, unit, hierarchy) {
  const names = [unit.title]; const visited = new Set([unit.id]); let parent = unit.parentId;
  while (parent && !visited.has(parent)) {
    visited.add(parent); const row = hierarchy.find(item => item.id === parent);
    if (!row) break;
    names.unshift(row.title); parent = row.parentId;
  }
  return [book.title, ...names].join(' / ');
}
function descendants(unit, hierarchy) {
  const ids = new Set([unit.id]); let grew = true;
  while (grew) { grew = false; hierarchy.forEach(row => { if (ids.has(row.parentId) && !ids.has(row.id)) { ids.add(row.id); grew = true; } }); }
  return hierarchy.filter(row => ids.has(row.id));
}
const wordbookDescription = book => ({
  'guixue:10174': 'Build topic vocabulary for clear IELTS writing and speaking.',
  'guixue:10176': 'Recognise key terms and paraphrases in reading passages.',
  'guixue:11320': 'Practise listening vocabulary across everyday and academic topics.',
  'guixue:10177': 'Strengthen essential listening words, phrases and irregular verbs.',
  'guixue:21953': 'Prepare listening vocabulary in four tests, organised by part.',
  'guixue:10216': 'Rehearse listening words and spelling through test-based groups.',
}[book.id] || book.description || 'Develop useful English vocabulary one group at a time.');
const studyLink = unit => `/vocabulary/study?bookId=${encodeURIComponent(unit.bookId)}&unitId=${encodeURIComponent(unit.id)}&dueOnly=false`;
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
  const { pathname } = useLocation();
  const inStudy = pathname === "/vocabulary/study";
  return (
    <nav className="vocabulary-tabs" aria-label="Vocabulary views">
      {[
        ["/vocabulary", "Overview"],
        ["/vocabulary/wordbooks", "Wordbooks"],
        ["/vocabulary/review", "Review"],
        ["/vocabulary/words", "My words"],
        ["/vocabulary/history", "History"],
      ].map(([path, title]) => inStudy && path === "/vocabulary/wordbooks" ? (
        <Link key={path} to={path} aria-current="page" className="is-active">{title}</Link>
      ) : (
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

const vocabularyReturnPositions = new Map();
function VocabularyLayout({ children }) {
  return (
    <section className="view active vocabulary-view vocabulary-workbench">
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

export function VocabularyWordsPage() { return <VocabularyPage wordsOnly />; }

export function VocabularyPage({ wordsOnly = false } = {}) {
  const fb = useFieldbook();
  const location = useLocation();
  const [wordParams, setWordParams] = useSearchParams();
  const [search, setSearch] = useState(wordParams.get('search') || "");
  const [status, setStatus] = useState(wordParams.get("status") || "all");
  const [source, setSource] = useState(wordParams.get("source") || "all");
  const [skill, setSkill] = useState(wordParams.get("skill") || "all");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(0);
  const [bulk, setBulk] = useState("familiar");
  useEffect(() => { const next = new URLSearchParams(wordParams); [['search', search], ['status', status], ['source', source], ['skill', skill]].forEach(([key,value]) => value && value !== 'all' ? next.set(key,value) : next.delete(key)); if (next.toString() !== wordParams.toString()) setWordParams(next, {replace:true}); }, [search,status,source,skill]);
  useEffect(() => { const saved = vocabularyReturnPositions.get(location.pathname + location.search); if (saved) requestAnimationFrame(() => { window.scrollTo?.(0,saved.scroll); document.getElementById(saved.focus)?.focus(); }); }, []);
  const rememberReturn = entryId => vocabularyReturnPositions.set(location.pathname + location.search, {scroll:window.scrollY,focus:`vocabulary-word-${entryId}`});
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
        <h2>{wordsOnly ? "My words" : "Vocabulary workspace"}</h2>
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
      {!wordsOnly ? <div className="vocabulary-entryways">
        <article className="vocabulary-entryway">
          <BookOpen size={22} /><span className="vocabulary-eyebrow">Follow a wordbook</span>
          <h3>Wordbook study</h3><p>Work through one complete group at a time, in the book's original order.</p>
          <Link className="btn primary" to="/vocabulary/wordbooks">Study wordbooks <ArrowRight size={16} /></Link>
        </article>
        <article className="vocabulary-entryway">
          <RotateCcw size={22} /><span className="vocabulary-eyebrow">Keep words ready</span>
          <h3>Vocabulary review</h3><p>Practise due cards, recover wrong words, or build a focused review session.</p>
          <Link className="btn primary" to="/vocabulary/review">Review vocabulary <ArrowRight size={16} /></Link>
        </article>
      </div>
      : null}
      <h3 className="vocabulary-section-title">My vocabulary</h3>
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
                    id={`vocabulary-word-${entry.id}`} onClick={() => rememberReturn(entry.id)} to={`/vocabulary/entry/${entry.id}?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
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
  const { bookId: pathBookId } = useParams();
  const [selectedBook, setSelectedBook] = useState(pathBookId || params.get("bookId") || "");
  useEffect(() => { setSelectedBook(pathBookId || params.get("bookId") || ""); }, [pathBookId, params]);
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
      else setCatalogError("Wordbook could not be saved. Retry adding it.");
    } catch {
      setCatalogError("Wordbook could not be saved. Retry adding it.");
    } finally {
      setJoining("");
    }
  };
  const study = book ? bookStudy(fb.state, book.id) : null;
  const groupRow = (unit) => {
    const studied = groupStudied(fb.state, unit);
    const mastered = unit.studyEntryIds.filter(id => statusOf(fb.state, id) === "mastered").length;
    return <article className="vocabulary-study-group" key={unit.id}>
      <div><h4>{unit.title}</h4><p className="vocabulary-group-path">{unitPath(book, unit, study.hierarchy)}</p>
        {unit.entryIds.length ? <><p>{unit.entryIds.length} words · {unit.studyEntryIds.length ? `${vocabularyGroupProgress(fb.state, unit)} · ${mastered} mastered` : "Archived · Excluded from study"}</p>{unit.archivedCount && unit.studyEntryIds.length ? <p className="vocabulary-muted">{unit.archivedCount} archived {unit.archivedCount === 1 ? "word" : "words"} excluded from study</p> : null}</>
          : <p className="vocabulary-muted">{unit.totalSourceWords ? `${unit.totalSourceWords} source words | ` : ""}Content pending</p>}
      </div>
      {unit.studyEntryIds.length && enrolled(book.id) ? <Link className="btn line" to={studyLink(unit)} aria-label={`${studied ? "Restudy" : "Study"} group: ${unitPath(book, unit, study.hierarchy)}`}>{studied ? "Restudy group" : "Study group"}<ArrowRight size={15} /></Link> : null}
    </article>;
  };
  const chapter = (unit) => {
    const children = study.hierarchy.filter(row => row.parentId === unit.id);
    if (!children.length) return groupRow(unit);
    const rows = descendants(unit, study.hierarchy);
    const ids = new Set(rows.flatMap(row => row.entryIds));
    const groups = study.groups.filter(group => group.studyEntryIds.length && rows.some(row => row.id === group.id));
    const completed = groups.filter(group => groupStudied(fb.state, group)).length;
    const nextInside = groups.some(group => group.id === study.next?.id);
    const next = groups.find(group => !groupStudied(fb.state, group));
    return <details className="vocabulary-study-chapter" key={unit.id} open={nextInside || undefined}>
      <summary><span><strong>{unit.title}</strong><small>{ids.size ? `${ids.size} words · ${completed}/${groups.length} groups studied` : `${unit.totalSourceWords ? `${unit.totalSourceWords} source words | ` : ""}Content pending`}</small></span><span className="vocabulary-chapter-chevron" aria-hidden="true">⌄</span></summary>
      <div className="vocabulary-chapter-body">
        {next && enrolled(book.id) ? <Link className="btn text" to={studyLink(next)}>Continue chapter <ArrowRight size={15} /></Link> : null}
        {children.map(chapter)}
      </div>
    </details>;
  };
  return <VocabularyLayout>
    <div className="page-tools"><div><h2>Wordbook study</h2><p className="vocabulary-muted">One group at a time. Clear progress through every chapter.</p></div>
      <button type="button" className="btn line" onClick={() => fb.openModal("vocabularyImport")}><Upload size={16} />Import wordbook progress</button>
    </div>
    {catalogBusy ? <p role="status" className="vocabulary-muted">Loading catalog...</p> : null}
    {catalogError ? <div className="vocabulary-catalog-error"><p role="alert" className="vocabulary-error">{catalogError}</p><button type="button" className="btn line" disabled={catalogBusy} onClick={() => loadCatalog(selectedBook)}><RotateCcw size={15} />Retry catalog</button></div> : null}
    {book ? <>
      <Link className="btn text" to="/vocabulary/wordbooks"><ArrowLeft size={16} />All wordbooks</Link>
      <div className="vocabulary-study-heading"><div><span className="vocabulary-eyebrow">Your wordbook</span><h3>{book.title}</h3><p>{wordbookDescription(book)}</p>
        <p className="vocabulary-muted">{book.entryIds.length} words · {study.hierarchy.filter(unit => unit.kind === "chapter").length} chapters · {study.groups.length} groups</p>
        <p>{study.studied.length}/{study.available.length} available groups studied</p>
      </div><div className="vocabulary-continue">
        {enrolled(book.id) ? study.next ? <><p className="vocabulary-group-path">{unitPath(book, study.next, study.hierarchy)}</p><Link className="btn primary" to={studyLink(study.next)}>{study.studied.length === study.available.length ? "Study again" : study.studied.length ? "Continue study" : "Start first group"}<ArrowRight size={16} /></Link><small>{study.next.studyEntryIds.length} words to practise · Complete group</small></> : study.studied.length ? <><p>All groups studied.</p><Link className="btn line" to={studyLink(study.available[0])}>Study again</Link></> : <p className="vocabulary-muted">{study.groups.some(group => group.entryIds.length) ? "All available words are archived. Restore a word to study this book." : "Study will be available when group content is loaded."}</p>
          : <button type="button" className="btn primary" disabled={Boolean(joining) || catalogBusy || !study.available.length} onClick={() => join(book.id)}><Plus size={15} />Add wordbook</button>}
      </div></div>
      <p className="vocabulary-muted">Studied means a saved attempt with every nonarchived word answered. Mastery comes from review evidence.</p>
      <div className="vocabulary-study-chapters">{study.hierarchy.filter(unit => !unit.parentId || !study.hierarchy.some(parent => parent.id === unit.parentId)).map(chapter)}</div>
      {!study.hierarchy.length ? <Empty message="No chapters available yet." /> : null}

    </> : <>
      <div className="vocabulary-books">{books(fb.state).map(item => {
        const progress = bookStudy(fb.state, item.id);
        return <article className="vocabulary-book" key={item.id}><BookOpen size={22} /><h3>{item.title}</h3><p>{wordbookDescription(item)}</p>
          <div className="vocabulary-muted">{item.entryIds.length} words · {progress.hierarchy.filter(unit => unit.kind === "chapter").length} chapters · {progress.groups.length} groups</div>
          {enrolled(item.id) ? <div className="vocabulary-muted">{progress.studied.length}/{progress.available.length} groups studied</div> : null}
          <div className="actions"><Link className="btn line" to={`/vocabulary/wordbooks/${encodeURIComponent(item.id)}`}>Open chapters<ArrowRight size={15} /></Link>
            {!enrolled(item.id) ? <button type="button" className="btn primary" disabled={!item.entryIds.length || Boolean(joining) || catalogBusy} onClick={() => join(item.id)}><Plus size={15} />Add</button>
              : progress.next ? <Link className="btn primary" to={studyLink(progress.next)}>{progress.studied.length ? "Continue study" : "Start study"}<ArrowRight size={15} /></Link> : progress.studied.length ? <span className="pill green">All groups studied</span> : <span className="pill">{progress.groups.some(group => group.entryIds.length) ? "Words archived" : "Content pending"}</span>}
          </div></article>;
      })}</div>
      {!books(fb.state).length && !catalogBusy ? <Empty message="No wordbooks available yet." /> : null}
    </>}
  </VocabularyLayout>;
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
  const [params] = useSearchParams();
  const requestedReturn = params.get('returnTo');
  const returnTo = requestedReturn && /^\/vocabulary(?:\/(?:review|study|words|wrong|history|wordbooks)(?:\/[^?]*)?)?(?:\?|$)/.test(requestedReturn) && !/[\r\n\\]/.test(requestedReturn) ? requestedReturn : '/vocabulary';
  const returnLabel = returnTo === '/vocabulary' ? 'My vocabulary' : /^\/vocabulary\/(review|study)/.test(returnTo) ? 'Back to session word list' : 'Back to vocabulary';
  const { id, entryId } = useParams();
  const rawEntry =
    (fb.state.vocabulary || []).find((item) => item.id === (id || entryId)) ||
    (VOCABULARY_CATALOG.entries || []).find(
      (item) => item.id === (id || entryId),
    );
  const entry = rawEntry ? reviewedEntry(rawEntry) : null;
  const engine = useRef(null);
  if (!engine.current) engine.current = speechEngine();
  const [accent, setAccent] = useState("uk");
  useEffect(() => () => engine.current.cancel(), []);
  if (!entry)
    return (
      <VocabularyLayout>
        <Empty message="Vocabulary entry not found." />
        <Link to={returnTo} className="btn line">
          <ArrowLeft size={15} />
          {returnLabel}
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
      <Link to={returnTo} className="btn text">
        <ArrowLeft size={15} />
        {returnLabel}
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
      <div className="vocabulary-entry-practice"><Link className="btn primary" to={`/vocabulary/review?entryId=${encodeURIComponent(entry.id)}&dueOnly=false`}>Practise this word<ArrowRight size={16} /></Link>{entry.enrichmentPending ? <span className="vocabulary-muted">Definition enrichment pending</span> : null}</div>
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
            <details className="vocabulary-secondary"><summary>Learning evidence for sense {index + 1}</summary>
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
            </details>
            {sense.source || sense.license ? (
              <p className="vocabulary-muted">
                {sense.source}
                {sense.license ? ` | ${sense.license}` : ""}
                {sense.attribution ? ` | ${sense.attribution}` : ""}
              </p>
            ) : null}
          </section>
        );
      })}
      <DictionarySenses entry={entry} />
      <details className="vocabulary-secondary"><summary>Review history</summary>
      {(fb.state.vocabularyReviews || []).filter(review=>review.entryId===entry.id && review.imported).length ? <section className="vocabulary-evidence"><h4>Dictation history</h4>{(fb.state.vocabularyReviews || []).filter(review=>review.entryId===entry.id && review.imported).slice(-30).reverse().map(review=><div key={review.id}><span>{review.sourceLabel || 'Dictation'}</span><span>{review.mode === 'dictation' && review.result === 'failure' && isRegionalSpellingDifference(entry.term, review.response) ? 'UK/US spelling accepted' : label(review.result)}</span><p>{review.response || 'No answer recorded'}</p><small>{review.occurredAt ? dateLabel(review.occurredAt) : 'Date unavailable'}</small></div>)}</section> : null}
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
      </details>
    </VocabularyLayout>
  );
}

export function VocabularyWrongPage() {
  const fb = useFieldbook();
  const location = useLocation();
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
      <div className="page-tools"><h2>Wrong words</h2></div>
      <div className="vocabulary-recovery"><div><span className="vocabulary-eyebrow">Recovery practice</span><h3>{wrong.length ? `${wrong.length} words to recover` : "Your recovery queue"}</h3><p>Give these words another attempt. Repeated successful reviews rebuild confidence.</p></div>
        <Link className="btn primary" to={`/vocabulary/review?${new URLSearchParams({ wrongOnly: 'true', dueOnly: 'false', ...(source !== 'all' ? { sourceType: source } : {}), ...(bookId !== 'all' ? { bookId } : {}), ...(skill !== 'all' ? { skill } : {}), ...(dimension !== 'all' ? { dimension } : {}) }).toString()}`}><RotateCcw size={16} />Recover wrong words<ArrowRight size={15} /></Link>
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
                    to={`/vocabulary/entry/${entry.id}?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
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
        vocabularySessions: fb.state.vocabularySessions || [],
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
          ["Mastered words", entries.filter(entry => statusOf(fb.state, entry.id) === "mastered").length],
          ["Due cards", safeQueue(fb.state, { dueOnly: true }).length],
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
      <p className="vocabulary-muted">Studied tracks complete saved group attempts. Mastered tracks learning evidence; due cards show what needs review.</p>
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
            const progress = bookStudy(fb.state, book.id);
            const completed = progress.studiedIds.size;
            const mastered = (book.entryIds || []).filter(
              (id) => statusOf(fb.state, id) === "mastered",
            ).length;
            return (
              <div className="vocabulary-unit" key={book.id}>
                <Link to={`/vocabulary/wordbooks?bookId=${book.id}`}>
                  {book.title}
                </Link>
                <span>
                  Studied {completed}/{book.entryIds.length} words · {progress.studied.length}/{progress.available.length} groups
                </span>
                <span>
                  Mastered {mastered}/{book.entryIds.length} words
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

export function VocabularyHistoryPage() {
  const fb = useFieldbook();
  const sessions = [...(fb.state.vocabularySessions || [])].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return <VocabularyLayout><div className="page-tools"><h2>Vocabulary history</h2><Link className="btn line" to="/vocabulary/review">Review vocabulary</Link></div>
    {sessions.length ? <div className="vocabulary-list">{sessions.map(log => <Link className="vocabulary-study-group" key={log.id} to={`/vocabulary/history/${encodeURIComponent(log.id)}`}><span><strong>{label(log.mode)}</strong><small>{dateLabel(log.submittedAt)}</small></span><span>{log.summary?.total || log.results.length} words</span><ArrowRight size={16} /></Link>)}</div> : <Empty message="Your submitted vocabulary sessions will appear here." />}
  </VocabularyLayout>;
}
