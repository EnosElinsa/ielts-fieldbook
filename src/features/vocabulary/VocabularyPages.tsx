// @ts-nocheck
import { useVocabularySearchParams } from './vocabularyNavigation';
import { normalizeVocabularyScope } from '../../domain/vocabulary/identities';
import { PanelLoadingState, StateMessage } from '../../components/AsyncState';
import { VocabularyLink as Link, VocabularyBackLink } from './VocabularyRouteLink';
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { FilterMenu } from "../../components/ui";
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
import { accountId } from '../../storage/remote';
import { readVocabularyDraft } from '../../storage/vocabularyDrafts';
import { resolveVocabularyLearningContext } from '../../domain/vocabulary/context';
import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';
import { Pronunciation } from './Pronunciation';
import { vocabularyGroupProgress, getLearnedVocabularyIds } from "../../domain/vocabulary/progress";
import "../../styles/vocabulary.css";
import "../../styles/vocabulary-workbench.css";
import '../../styles/vocabulary-home.css';
import { isRegionalSpellingDifference } from '../../domain/vocabulary/spelling';
import { getVocabularyMastery } from '../../domain/vocabulary/mastery';
import { groupPath, rememberVocabularyPosition, useVocabularyPosition } from './vocabularyNavigation';

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
        ...(VOCABULARY_CATALOG.units || []).filter(unit => unit.bookId === book.id).flatMap(unit => unit.entryIds || []),
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
    const studyEntryIds = entryIds.filter(id => entries.has(id) ? !(entries.get(id)?.tags || []).includes('archived') : !(unit.archivedEntryIds || []).includes(id));
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
  'ielts-vocabulary': 'Build topic vocabulary for clear IELTS writing and speaking.',
  'ielts-reading-keywords': 'Recognise key terms and paraphrases in reading passages.',
  'ielts-listening-vocabulary': 'Practise listening vocabulary across everyday and academic topics.',
  'ielts-listening-essentials': 'Strengthen essential listening words, phrases and irregular verbs.',
  'ielts-listening-practice-21': 'Prepare listening vocabulary in four tests, organised by part.',
  'ielts-listening-practice-20': 'Rehearse listening words and spelling through test-based groups.',
}[book.id] || book.description || 'Develop useful English vocabulary one group at a time.');
const studyLink = unit => `/vocabulary/wordbooks/${encodeURIComponent(unit.bookId)}/groups/${encodeURIComponent(unit.id)}/learn`;
const assessmentLink = unit => `/vocabulary/study?bookId=${encodeURIComponent(unit.bookId)}&unitId=${encodeURIComponent(unit.id)}&dueOnly=false`;
const learning = (state, entryId) =>
  (state.vocabularyStates || []).filter((item) => item.entryId === entryId);
function statusOf(state, id) {
  return getVocabularyMastery(state, id).effective;
}
function manualOf(state, id) {
  return statusOf(state, id);
}
function editEntry(fb, entry = null) {
  fb.setEditingVocabularyId(entry?.id || null);
  fb.setVocabularySeed(entry || {});
  fb.openModal("vocabulary");
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

function VocabularyLayout({ children, ready = true }) {
  const location = useLocation();
  useVocabularyPosition(location.pathname + location.search + location.hash, ready);
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

export function VocabularyWordsPage() { return <VocabularyWordsView />; }

export function VocabularyPage({ wordsOnly = false } = {}) {
  return wordsOnly ? <VocabularyWordsView /> : <VocabularyHomePage />;
}

function VocabularyHomePage() {
  const fb = useFieldbook();
  const owner = accountId();
  const [catalogStatus, setCatalogStatus] = useState('ready');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!fb.loadVocabularyCatalog) return;
    let active = true; setCatalogStatus('loading');
    Promise.resolve(fb.loadVocabularyCatalog(undefined, { force: retry > 0 })).then(result => {
      if (active && accountId() === owner) setCatalogStatus(result === false ? 'error' : 'ready');
    }, () => { if (active && accountId() === owner) setCatalogStatus('error'); });
    return () => { active = false; };
  }, [fb.loadVocabularyCatalog, owner, retry]);
  const saved = readVocabularyDraft(owner);
  const preferences = normalizeVocabularyPreferences(fb.state.settings?.vocabulary);
  const mode = preferences.mode === 'audio' ? 'definition' : preferences.mode;
  const learned = getLearnedVocabularyIds(fb.state);
  const due = safeQueue(fb.state, { dueOnly: true, mode }).filter(card => learned.has(card.entryId));
  const enrollment = [...(fb.state.wordbookEnrollments || [])].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map(row => ({ book: VOCABULARY_CATALOG.books.find(book => book.id === row.bookId), study: bookStudy(fb.state, row.bookId) })).find(row => row.book && row.study.next);
  const nextGroup = enrollment?.study.next;
  const learning = nextGroup && fb.state.wordbookProgress.find(row => row.bookId === nextGroup.bookId && row.unitId === nextGroup.id)?.learning;
  const resumeParams = new URLSearchParams({ resume: 'true', mode: saved?.mode || mode });
  if (saved?.planId) resumeParams.set('planId', saved.planId);
  let resumeTo = `/vocabulary/review?${resumeParams}`;
  if (saved?.selection && 'bookId' in saved.selection) {
    const params = new URLSearchParams({ bookId: saved.selection.bookId, unitId: saved.selection.unitId, mode: saved.mode, dueOnly: 'false', resume: 'true' });
    if (saved.selection.kind === 'learning-batch') {
      params.set('batch', String(saved.selection.batchIndex)); params.set('batchSize', String(saved.selection.batchSize)); params.set('batchCards', JSON.stringify(saved.selection.cards));
    }
    if (saved.planId) params.set('planId', saved.planId);
    resumeTo = `/vocabulary/study?${params}`;
  }
  const href = saved ? resumeTo : due.length ? `/vocabulary/review?${new URLSearchParams({ mode, dueOnly: 'true' })}` : nextGroup ? studyLink(nextGroup) : '/vocabulary/wordbooks';
  const action = saved ? 'Continue session' : due.length ? 'Review due words' : nextGroup ? learning?.viewedEntryIds?.length ? 'Continue learning' : 'Start learning' : 'Study wordbooks';
  const title = saved ? 'Continue your session' : due.length ? 'Words due for review' : enrollment ? enrollment.book.title : 'Choose a wordbook';
  return <VocabularyLayout ready={catalogStatus !== 'loading'}>
    <div className="page-tools"><h2>Vocabulary</h2><Link className="btn line" to="/settings/vocabulary">Practice settings</Link></div>
    <section className="vocabulary-home-next" aria-label="Next vocabulary task">
      <span className="vocabulary-eyebrow">{saved ? `${saved.cardIds.length} words · Session saved` : due.length ? `${due.length} due cards` : nextGroup ? `${preferences.learningBatchSize} words per batch` : 'Wordbook study'}</span>
      <h3>{title}</h3>
      {nextGroup && !saved && !due.length ? <p>{unitPath(enrollment.book, nextGroup, enrollment.study.hierarchy)}</p> : null}
      {catalogStatus === 'loading' && !saved && !due.length ? <PanelLoadingState message="Loading your wordbooks..." /> : catalogStatus === 'error' && !saved && !due.length ? <StateMessage kind="error" message="Wordbooks could not be loaded." onRetry={() => setRetry(value => value + 1)} /> : <Link className="btn primary" to={href}>{action}<ArrowRight size={16}/></Link>}
    </section>
    <VocabularyStats values={[["Due cards", due.length], ["Words to retry", getActiveWrongWords(fb.state).length], ["Saved words", (fb.state.vocabulary || []).filter(entry => !entry.tags.includes('archived')).length]]}/>
    <nav className="vocabulary-home-links" aria-label="More vocabulary tasks"><Link to="/vocabulary/wordbooks"><BookOpen size={17}/>Wordbooks<ArrowRight size={15}/></Link><Link to="/vocabulary/review"><RotateCcw size={17}/>Review vocabulary<ArrowRight size={15}/></Link><Link to="/vocabulary/words"><Pencil size={17}/>Manage my words<ArrowRight size={15}/></Link><Link to="/vocabulary/history">Session history<ArrowRight size={15}/></Link></nav>
  </VocabularyLayout>;
}

function VocabularyWordsView({ wordsOnly = true } = {}) {
  const fb = useFieldbook();
  const location = useLocation();
  const [wordParams, setWordParams] = useVocabularySearchParams();
  const search = wordParams.get('search') || '';
  const status = wordParams.get('status') || 'all';
  const source = wordParams.get('source') || 'all';
  const skill = wordParams.get('skill') || 'all';
  const requestedPage = Number(wordParams.get('page') || 0);
  const [selected, setSelected] = useState(new Set());
  const [bulk, setBulk] = useState('familiar');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [pendingBulk, setPendingBulk] = useState(null);
  const bulkLock = useRef(false);
  const updateFilter = (key, value) => setWordParams(current => {
    const next = new URLSearchParams(current);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    next.delete('page');
    return next;
  }, { replace: true, state: location.state });
  const setSearch = value => updateFilter('search', value);
  const setStatus = value => updateFilter('status', value);
  const setSource = value => updateFilter('source', value);
  const setSkill = value => updateFilter('skill', value);
  const rememberReturn = entryId => rememberVocabularyPosition(location.pathname + location.search, `vocabulary-word-${entryId}`);
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
  const filterKey = [search,status,source,skill].join('|');
  const maxPage = Math.max(0, Math.ceil(filtered.length / 100) - 1);
  const page = Math.min(maxPage, Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0);
  const setPage = value => setWordParams(current => { const next = new URLSearchParams(current); next.set('page', String(Math.max(0, Math.min(maxPage, value)))); return next; }, {replace:true,state:location.state});
  useEffect(() => { setSelected(new Set()); }, [filterKey, page]);
  useEffect(() => { if (requestedPage !== page) setWordParams(current => { const next = new URLSearchParams(current); next.set('page', String(page)); return next; }, { replace: true, state: location.state }); }, [requestedPage, page, setWordParams]);
  const visibleEntries = filtered.slice(page * 100, page * 100 + 100);
  const applyBulk = async (retry = false) => {
    const operation = retry ? pendingBulk : { ids: [...selected], status: bulk, owner: accountId() };
    if (bulkLock.current || !operation?.ids.length || operation.owner !== accountId()) return;
    setPendingBulk(operation);
    bulkLock.current = true; setBulkSaving(true); setBulkError('');
    const owner = accountId();
    const draft = structuredClone(fb.stateRef.current);
    operation.ids.forEach((id) => {
      const entry = draft.vocabulary.find((entry) => entry.id === id);
      (entry?.senses || []).forEach((sense) =>
        setVocabularyManualStatus(draft, id, operation.status, sense.id),
      );
    });
    try {
      const saved = await (fb.saveVocabularyStatuses ? fb.saveVocabularyStatuses(operation.ids, operation.status) : fb.persistNow(draft));
      if (accountId() !== owner) return;
      if (saved) { setPendingBulk(null); setSelected(new Set()); fb.toast('Familiarity updated.'); }
      else setBulkError('Could not save familiarity. Your requested change is kept; retry saving.');
    } catch { if (accountId() === owner) setBulkError('Could not save familiarity. Your requested change is kept; retry saving.'); }
    finally { bulkLock.current = false; if (accountId() === owner) setBulkSaving(false); }
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
      <h3 className="vocabulary-section-title">My vocabulary</h3>
      <VocabularyStats
        values={[
          ["Entries", entries.length],
          ["Due cards", safeQueue(fb.state, { dueOnly: true }).length],
          ["Words to retry", getActiveWrongWords(fb.state).length],
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
          options={["all", "listening", "reading", "writing", "speaking"].map(
            (value) => ({
              value,
              label: value === "all" ? "All skills" : label(value),
            }),
          )}
        />
      </div>
      {bulkError && <div className="vocabulary-error" role="alert">{bulkError}<button className="btn line" disabled={bulkSaving} onClick={() => applyBulk(true)}>Retry familiarity save</button></div>}
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
                <button className="btn line" type="button" disabled={bulkSaving || Boolean(pendingBulk && bulkError)} onClick={() => applyBulk()}>
                  <Check size={15} />
                  {bulkSaving ? 'Saving…' : 'Apply'}
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
                    {resolveVocabularyLearningContext(entry).sense?.definition || 'Definition not available yet'}
                  </p>
                  <Pronunciation compact entry={entry} accent={normalizeVocabularyPreferences(fb.state.settings?.vocabulary).accent} />
                </div>
                <div className="vocabulary-row-meta">
                  <span
                    className={`pill ${statusOf(fb.state, entry.id) === "mastered" ? "green" : ""}`}
                  >
                    {label(manualOf(fb.state, entry.id))}
                  </span>
                  <span className="vocabulary-muted">
                    {getVocabularyMastery(fb.state, entry.id).manual ? `Manual · System: ${label(getVocabularyMastery(fb.state, entry.id).automatic)}` : 'Automatic'}
                  </span>
                  {learning(fb.state, entry.id).some(
                    (item) => item.wrong?.active,
                  ) ? (
                    <Link className="pill red" to="/vocabulary/wrong">
                      Wrong word
                    </Link>
                  ) : null}
                  {!resolveVocabularyLearningContext(entry).sense?.definition ? (
                    <span className="vocabulary-muted">Definition unavailable</span>
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
          {filtered.length > 100 ? <div className="vocabulary-selection"><button type="button" className="btn line" disabled={page === 0} onClick={() => setPage(page-1)}><ArrowLeft size={15}/>Previous</button><span>{page*100+1}-{Math.min((page+1)*100,filtered.length)} of {filtered.length}</span><button type="button" className="btn line" disabled={(page+1)*100>=filtered.length} onClick={() => setPage(page+1)}>Next<ArrowRight size={15}/></button></div> : null}
        </>
      ) : (
        <StateMessage
          message={
            entries.length
              ? "No vocabulary matches these filters."
              : "No vocabulary saved yet."
          }
        >
          <button type="button" className="btn line" onClick={() => {
            if (!entries.length) editEntry(fb);
            else {
              setWordParams(current => { const next = new URLSearchParams(current); ['search','status','source','skill','page'].forEach(key => next.delete(key)); return next; }, { replace: true, state: location.state });
            }
          }}>{entries.length ? "Clear filters" : "Add vocabulary"}</button>
        </StateMessage>
      )}
    </VocabularyLayout>
  );
}

export function VocabularyWordbooksPage() {
  const fb = useFieldbook();
  const [params] = useVocabularySearchParams();
  const { bookId: pathBookId } = normalizeVocabularyScope(useParams());
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
    return <article className="vocabulary-study-group" key={unit.id} id={`group-${unit.id}`}>
      <div><h4>{unit.title}</h4><p className="vocabulary-group-path">{unitPath(book, unit, study.hierarchy)}</p>
        {unit.entryIds.length ? <><p>{unit.entryIds.length} words · {unit.studyEntryIds.length ? `${vocabularyGroupProgress(fb.state, unit)} · ${mastered} mastered` : "Archived · Excluded from study"}</p>{unit.archivedCount && unit.studyEntryIds.length ? <p className="vocabulary-muted">{unit.archivedCount} archived {unit.archivedCount === 1 ? "word" : "words"} excluded from study</p> : null}</>
          : <p className="vocabulary-muted">{unit.totalSourceWords ? `${unit.totalSourceWords} source words | ` : ""}Content pending</p>}
      </div>
      <div className="actions"><Link className="btn line" to={`/vocabulary/wordbooks/${encodeURIComponent(book.id)}/groups/${encodeURIComponent(unit.id)}/words`}>View words</Link>{unit.studyEntryIds.length && enrolled(book.id) ? <Link className="btn primary" to={studyLink(unit)} aria-label={`Learn words: ${unitPath(book, unit, study.hierarchy)}`}>Learn words<ArrowRight size={15} /></Link> : null}{unit.studyEntryIds.length && enrolled(book.id) ? <Link className="btn line" to={assessmentLink(unit)}>Start assessment</Link> : null}</div>
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
    return <details className="vocabulary-study-chapter" id={`chapter-${encodeURIComponent(unit.id)}`} key={unit.id} open={nextInside || undefined}>
      <summary><span><strong>{unit.title}</strong><small>{ids.size ? `${ids.size} words · ${completed}/${groups.length} groups studied` : `${unit.totalSourceWords ? `${unit.totalSourceWords} source words | ` : ""}Content pending`}</small></span><span className="vocabulary-chapter-chevron" aria-hidden="true">⌄</span></summary>
      <div className="vocabulary-chapter-body">
        {next && enrolled(book.id) ? <Link className="btn text" to={studyLink(next)}>Continue chapter <ArrowRight size={15} /></Link> : null}
        {children.map(chapter)}
      </div>
    </details>;
  };
  return <VocabularyLayout ready={!catalogBusy}>
    <div className="page-tools"><div><h2>Wordbook study</h2><p className="vocabulary-muted">Your wordbooks and chapter progress.</p></div>
    </div>
    {catalogBusy ? <PanelLoadingState message="Loading catalog..." onRetry={() => loadCatalog(selectedBook)} retryLabel="Retry catalog" /> : null}
    {catalogError ? <StateMessage kind="error" message={catalogError} onRetry={() => loadCatalog(selectedBook)} retryLabel="Retry catalog" retryDisabled={catalogBusy} /> : null}
    {book ? <>
      <VocabularyBackLink fallback="/vocabulary/wordbooks"/>
      <div className="vocabulary-study-heading"><div><span className="vocabulary-eyebrow">Your wordbook</span><h3>{book.title}</h3><p>{wordbookDescription(book)}</p>
        <p className="vocabulary-muted">{book.entryIds.length} words · {study.hierarchy.filter(unit => unit.kind === "chapter").length} chapters · {study.groups.length} groups</p>
        <p>{study.studied.length}/{study.available.length} available groups studied</p>
      </div><div className="vocabulary-continue">
        {enrolled(book.id) ? study.next ? <><p className="vocabulary-group-path">{unitPath(book, study.next, study.hierarchy)}</p><Link className="btn primary" to={studyLink(study.next)}>{study.studied.length === study.available.length ? "Study again" : study.studied.length ? "Continue study" : "Start first group"}<ArrowRight size={16} /></Link><small>{study.next.studyEntryIds.length} words · Learn, then assess</small></> : study.studied.length ? <><p>All groups studied.</p><Link className="btn line" to={studyLink(study.available[0])}>Study again</Link></> : <p className="vocabulary-muted">{study.groups.some(group => group.entryIds.length) ? "All available words are archived. Restore a word to study this book." : "Study will be available when group content is loaded."}</p>
          : <button type="button" className="btn primary" disabled={Boolean(joining) || catalogBusy || !study.available.length} onClick={() => join(book.id)}><Plus size={15} />Add wordbook</button>}
      </div></div>
      <p className="vocabulary-muted">A group is studied when you submit answers for all its active words. Mastery is tracked separately.</p>
      <div className="vocabulary-study-chapters">{study.hierarchy.filter(unit => !unit.parentId || !study.hierarchy.some(parent => parent.id === unit.parentId)).map(chapter)}</div>
      {!study.hierarchy.length && !catalogBusy && !catalogError ? <StateMessage message="No chapters available yet." /> : null}

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
      {!books(fb.state).length && !catalogBusy && !catalogError ? <StateMessage message="No wordbooks available yet." /> : null}
    </>}
  </VocabularyLayout>;
}

export { VocabularyEntryPage } from './VocabularyEntryPage';

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
      <div className="page-tools"><h2>Words to retry</h2></div>
      <div className="vocabulary-recovery"><div><span className="vocabulary-eyebrow">Mistake review</span><h3>{wrong.length ? `${wrong.length} words to retry` : "Your retry queue"}</h3><p>Review words you answered incorrectly.</p></div>
        <Link className="btn primary" to={`/vocabulary/review?${new URLSearchParams({ wrongOnly: 'true', dueOnly: 'false', ...(source !== 'all' ? { sourceType: source } : {}), ...(bookId !== 'all' ? { bookId } : {}), ...(skill !== 'all' ? { skill } : {}), ...(dimension !== 'all' ? { dimension } : {}) }).toString()}`}><RotateCcw size={16} />Retry words<ArrowRight size={15} /></Link>
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
          options={["all", "listening", "reading", "writing", "speaking"].map(
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
                  <Pronunciation compact entry={entry} accent={normalizeVocabularyPreferences(fb.state.settings?.vocabulary).accent} />
                  <span className="vocabulary-muted">
                    Last failure {dateLabel(state.wrong?.lastFailureAt)} |{" "}
                    {state.wrong?.successesSinceFailure || 0} correct reviews since the last mistake
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
        <StateMessage message="No words to retry." />
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
  return (
    <VocabularyLayout>
      <div className="page-tools">
        <h2>Vocabulary progress</h2>
      </div>
      <VocabularyStats
        values={[
          ["Entries", entries.length],
          ["Mastered words", entries.filter(entry => statusOf(fb.state, entry.id) === "mastered").length],
          ["Due cards", safeQueue(fb.state, { dueOnly: true }).length],
          ["Words to retry", getActiveWrongWords(fb.state).length],
          [
            "Awaiting verification",
            evidence.filter(
              (item) =>
                item.verification === "pending" || item.result === "pending",
            ).length,
          ],
        ]}
      />
      <p className="vocabulary-muted">Study progress counts completed group tests. Mastery reflects your practice results or manual status. Due cards are ready for review.</p>
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
      <h3 className="vocabulary-section-title">Recent practice results</h3>
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
        <StateMessage message="No vocabulary practice results yet." />
      )}
    </VocabularyLayout>
  );
}

export function VocabularyHistoryPage() {
  const fb = useFieldbook();
  const sessions = [...(fb.state.vocabularySessions || [])].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return <VocabularyLayout><div className="page-tools"><h2>Vocabulary history</h2><Link className="btn line" to="/vocabulary/review">Review vocabulary</Link></div>
    {sessions.length ? <div className="vocabulary-history-list">{sessions.map(log => {
      const bookId = log.selection?.bookId || log.filter?.bookId;
      const unitId = log.selection?.unitId || log.filter?.unitId;
      const total = log.summary?.total ?? log.results.length;
      const summary = log.summary || {correct:log.results.filter(row=>row.result==='success').length,incorrect:log.results.filter(row=>['failure','partial'].includes(row.result)).length,pending:log.results.filter(row=>row.result==='pending').length};
      const validDate = log.submittedAt && Number.isFinite(Date.parse(log.submittedAt));
      return <Link className="vocabulary-history-row" key={log.id} to={`/vocabulary/history/${encodeURIComponent(log.id)}`}>
        <div className="vocabulary-history-main"><strong>{label(log.mode)}</strong><span>{bookId && unitId ? groupPath(bookId,unitId) || 'Wordbook assessment' : log.selection?.kind === 'retry' ? 'Mistake retry' : 'Vocabulary review'}</span><time dateTime={validDate ? log.submittedAt : undefined}>{validDate ? new Date(log.submittedAt).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Submission date unavailable'}</time></div>
        <div className="vocabulary-history-summary"><strong>{total} {total===1?'word':'words'}</strong><small>{log.mode === 'audio' ? 'Listening activity · No mastery assessment' : `${summary.correct || 0} correct · ${summary.incorrect || 0} incorrect`}</small>{log.mode !== 'audio' && summary.pending ? <small>{summary.pending} awaiting feedback</small> : null}</div><ArrowRight size={16} />
      </Link>;
    })}</div> : <StateMessage message="Your submitted vocabulary sessions will appear here." />}
  </VocabularyLayout>;
}
