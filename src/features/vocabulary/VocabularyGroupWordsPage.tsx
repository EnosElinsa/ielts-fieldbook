import { useVocabularySearchParams } from './vocabularyNavigation';
import { normalizeVocabularyScope } from '../../domain/vocabulary/identities';
import { PageLoadingState, StateMessage } from '../../components/AsyncState';
import { VocabularyLink as Link, VocabularyBackLink } from './VocabularyRouteLink';
import {
  useLocation,
  useParams,
  } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { resolveVocabularyLearningContext } from "../../domain/vocabulary/context";
import { getLearnedVocabularyIds } from "../../domain/vocabulary/progress";
import { getVocabularyMastery } from "../../domain/vocabulary/mastery";
import type { VocabularyStore } from "../../domain/vocabulary/types";
import { normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
import { VocabularyNavigation } from "./VocabularyPages";
import { Pronunciation } from "./Pronunciation";
import {
  entryUrl,
  groupPath,
  groupWords,
  rememberVocabularyPosition,
  useVocabularyCatalog,
  useVocabularyPosition,
} from "./vocabularyNavigation";
import "../../styles/vocabulary-workbench.css";
export function VocabularyGroupWordsPage() {
  const fb = useFieldbook();
  const state = fb.state as unknown as VocabularyStore & {
    settings?: {
      vocabulary?: unknown;
    };
  };
  const { bookId = "", unitId = "" } = normalizeVocabularyScope(useParams());
  const location = useLocation();
  const [params, setParams] = useVocabularySearchParams();
  const { status, retry } = useVocabularyCatalog(
    fb.loadVocabularyCatalog,
    bookId,
    unitId,
  );
  const origin = location.pathname + location.search;
  useVocabularyPosition(origin, status === "ready");
  const book = VOCABULARY_CATALOG.books.find((row) => row.id === bookId);
  const unit = VOCABULARY_CATALOG.units.find(
    (row) => row.bookId === bookId && row.id === unitId,
  );
  const isGroup =
    unit &&
    unit.kind !== "chapter" &&
    !VOCABULARY_CATALOG.units.some(
      (row) => row.bookId === bookId && row.parentId === unitId,
    );
  const rows = groupWords(state, bookId, unitId);
  const words = rows.flatMap((row) =>
    row.entry
      ? [
          {
            ...row,
            entry: row.entry,
            resolved: resolveVocabularyLearningContext(row.entry, {
              bookId,
              unitId,
            }),
          },
        ]
      : [],
  );
  const search = params.get("search") || "";
  const filtered = words.filter((row) =>
    `${row.entry.term} ${row.resolved.sense?.definition || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const maxPage = Math.max(0, Math.ceil(filtered.length / 50) - 1);
  const page = Math.min(
    maxPage,
    Math.max(0, Math.floor(Number(params.get("page")) || 0)),
  );
  const shown = filtered.slice(page * 50, page * 50 + 50);
  const learned = getLearnedVocabularyIds({ ...state, vocabularyStates: [] });
  const preferences = normalizeVocabularyPreferences(
    state.settings?.vocabulary,
  );
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key === "search") next.delete("page");
    setParams(next, { replace: true, state: location.state });
  };
  return (
    <section className="view active vocabulary-view vocabulary-workbench">
      <VocabularyNavigation />
      <VocabularyBackLink fallback={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}#group-${encodeURIComponent(unitId)}`}/>
      {status === "loading" ? (
        <PageLoadingState variant="cards" message="Loading group words…" onRetry={retry} retryLabel="Retry group" />
      ) : status === "error" ? (
        <StateMessage kind="error" message="Group words could not be loaded." onRetry={retry} retryLabel="Retry group" />
      ) : !book || !isGroup ? (
        <StateMessage kind="error" message="This wordbook group is unavailable." />
      ) : (
        <>
          <div className="page-tools vocabulary-group-words-heading">
            <div>
              <p className="vocabulary-group-path">
                {groupPath(bookId, unitId)}
              </p>
              <h2>{unit.title} words</h2>
              <p className="vocabulary-muted">
                {words.length} unique words · Original source order
              </p>
            </div>
            {words.some((row) => !row.entry.tags.includes("archived")) ? <div className="actions">
              <Link className="btn primary" to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}/groups/${encodeURIComponent(unitId)}/learn`}>Learn words <ArrowRight size={16} /></Link>
              <Link className="btn line" to={`/vocabulary/study?bookId=${encodeURIComponent(bookId)}&unitId=${encodeURIComponent(unitId)}&dueOnly=false`}>Start assessment <ArrowRight size={16} /></Link>
            </div> : null}
          </div>
          {rows.length > words.length ? (
            <p role="status">
              {rows.length - words.length} word entries are not available yet.
            </p>
          ) : null}
          <div className="toolbar">
            <input
              className="search"
              aria-label="Search group words"
              placeholder="Search words or meanings"
              value={search}
              onChange={(event) => setParam("search", event.target.value)}
            />
            <span className="vocabulary-muted">
              {filtered.length} matching words
            </span>
          </div>
          <div
            className="vocabulary-group-word-table"
            role="table"
            aria-label="Group words"
          >
            <div className="vocabulary-group-word-head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Word</span>
              <span role="columnheader">Meaning in this group</span>
              <span role="columnheader">Learning status</span>
              <span role="columnheader">Details</span>
            </div>
            {shown.map((row) => {
              const focus = `group-word-${row.entry.id}`;
              const archived = row.entry.tags.includes("archived");
              const mastery = getVocabularyMastery(state, row.entry.id, row.resolved.sense?.id);
              const familiarity = mastery.effective;
              const url = entryUrl(
                row.entry.id,
                { bookId, unitId, senseId: row.resolved.sense?.id },
                origin,
              );
              return (
                <div
                  className="vocabulary-group-word-row"
                  role="row"
                  key={row.entry.id}
                >
                  <span role="cell" className="vocabulary-word-index">
                    {row.index}
                  </span>
                  <div role="cell">
                    <Link
                      id={focus}
                      className="vocabulary-term"
                      to={url}
                      onClick={() => rememberVocabularyPosition(origin, focus)}
                    >
                      {row.entry.term}
                    </Link>
                    <Pronunciation
                      compact
                      entry={row.entry}
                      accent={preferences.accent}
                    />
                  </div>
                  <div role="cell">
                    <small className="vocabulary-muted">
                      {row.resolved.sense?.pos}
                    </small>
                    <p>
                      {row.resolved.sense?.definition ||
                        "Definition not available yet"}
                    </p>
                  </div>
                  <div role="cell" className="vocabulary-group-word-status">
                    <span className="pill">
                      {archived
                        ? "Archived"
                        : learned.has(row.entry.id)
                          ? "Assessed"
                          : "Not started"}
                    </span>
                    <small>Mastery: {familiarity}{mastery.manual ? " · Manual" : ""}</small>
                  </div>
                  <div role="cell">
                    <Link
                      to={url}
                      onClick={() => rememberVocabularyPosition(origin, focus)}
                    >
                      Details
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          {!shown.length ? <StateMessage message="No words match your search." /> : null}
          <div className="vocabulary-pagination">
            <button
              className="btn line"
              disabled={page === 0}
              onClick={() => setParam("page", String(page - 1))}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>
              {filtered.length
                ? `${page * 50 + 1}–${Math.min((page + 1) * 50, filtered.length)} of ${filtered.length}`
                : "0 words"}{" "}
              · 50 per page
            </span>
            <button
              className="btn line"
              disabled={page === maxPage}
              onClick={() => setParam("page", String(page + 1))}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
