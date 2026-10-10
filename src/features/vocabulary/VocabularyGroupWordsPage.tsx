import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { resolveVocabularyLearningContext } from "../../domain/vocabulary/context";
import { getLearnedVocabularyIds } from "../../domain/vocabulary/progress";
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
  const { bookId = "", unitId = "" } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { status, retry } = useVocabularyCatalog(
    fb.loadVocabularyCatalog,
    bookId,
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
  const learned = getLearnedVocabularyIds(state);
  const preferences = normalizeVocabularyPreferences(
    state.settings?.vocabulary,
  );
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key === "search") next.delete("page");
    setParams(next, { replace: true });
  };
  return (
    <section className="view active vocabulary-view vocabulary-workbench">
      <VocabularyNavigation />
      <Link
        className="btn text"
        to={`/vocabulary/wordbooks/${encodeURIComponent(bookId)}#group-${encodeURIComponent(unitId)}`}
      >
        <ArrowLeft size={15} />
        Back to wordbook
      </Link>
      {status === "loading" ? (
        <p role="status" className="practice-load-status">
          Loading group words…
        </p>
      ) : status === "error" ? (
        <div role="alert" className="vocabulary-error">
          Group words could not be loaded.{" "}
          <button className="btn line" onClick={retry}>
            <RotateCcw size={15} />
            Retry group
          </button>
        </div>
      ) : !book || !isGroup ? (
        <p role="alert">This wordbook group is unavailable.</p>
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
            {words.some((row) => !row.entry.tags.includes("archived")) ? (
              <Link
                className="btn primary"
                to={`/vocabulary/study?bookId=${encodeURIComponent(bookId)}&unitId=${encodeURIComponent(unitId)}&dueOnly=false`}
              >
                Study group
                <ArrowRight size={16} />
              </Link>
            ) : null}
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
              const familiarity =
                state.vocabularyStates?.find(
                  (item) =>
                    item.entryId === row.entry.id &&
                    item.senseId === row.resolved.sense?.id,
                )?.manualStatus || "new";
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
                          ? "Learned"
                          : "Not started"}
                    </span>
                    <small>Familiarity: {familiarity}</small>
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
          {!shown.length ? <p>No words match your search.</p> : null}
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
