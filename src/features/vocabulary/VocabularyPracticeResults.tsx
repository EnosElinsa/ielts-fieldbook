import { Link } from "react-router-dom";
import { useEffect, useRef } from 'react';
import { accountId } from '../../storage/remote';
import { isRegionalSpellingDifference } from '../../domain/vocabulary/spelling';
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { FilterMenu } from "../../components/ui";
import type { VocabularySessionRecord } from "../../domain/vocabulary/session";
import { dateLabel, modeLabel, resultName } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";

export function VocabularyPracticeResults({ controller, results }: {
  controller: VocabularyPracticeController;
  results: VocabularySessionRecord;
}) {
  const { resultFilter, setResultFilter, resultRows, nextGroup, resetResults, resultReturnTo, retryMistakes } = controller;
  const table = useRef<HTMLDivElement>(null);
  const positionKey = `fieldbook:session-position:${accountId()}:${results.id}:${resultFilter}`;
  useEffect(() => {
    let frame = 0;
    try {
      const position = JSON.parse(sessionStorage.getItem(positionKey) || 'null');
      if (position) frame = requestAnimationFrame(() => {
        window.scrollTo(0, position.y);
        if (table.current) table.current.scrollLeft = position.x;
        if (position.entryId) document.getElementById(`session-row-${position.entryId}`)?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
      });
    } catch { /* Browser storage may be disabled. */ }
    return () => cancelAnimationFrame(frame);
  }, [positionKey]);
  const rememberPosition = (entryId: string) => {
    try { sessionStorage.setItem(positionKey, JSON.stringify({ y: window.scrollY, x: table.current?.scrollLeft || 0, entryId })); } catch { /* Navigation works without storage. */ }
  };
  const detailLink = (entryId: string) => `/vocabulary/entry/${encodeURIComponent(entryId)}?returnTo=${encodeURIComponent(resultReturnTo)}`;
  const hasMistakes = results.mode !== "audio" && results.results.some(row => row.result === "failure" || row.result === "partial");
  return (
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
      <div className="practice-result-controls">
        <FilterMenu label="Result filter" value={resultFilter} onChange={setResultFilter} options={[
          { value: 'all', label: 'All results' }, { value: 'incorrect', label: 'Incorrect' },
          { value: 'unanswered', label: 'Unanswered' }, { value: 'pending', label: 'Awaiting feedback' }, { value: 'flagged', label: 'Flagged' },
        ]} />
        <span>{resultRows.length} of {results.results.length} results</span>
        {results.selection?.kind === 'unit' ? <p>Group practice saved. Mastery is tracked separately across reviews.</p> : null}
      </div>
      <div className="practice-result-table-wrap" ref={table}>
        <table>
          <thead>
            <tr>
              <th>Word</th>
              <th>Your response</th>
              <th>Answer</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {resultRows.map((row, index) => (
              <tr key={`${row.cardId}:${index}`} id={`session-row-${row.entryId}`}>
                <th scope="row">
                  <Link
                    to={detailLink(row.entryId)} onClick={() => rememberPosition(row.entryId)}
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
                  {results.mode === 'dictation' && row.result === 'success' && isRegionalSpellingDifference(row.expectedAnswer || row.term, row.response) ? <small>UK/US spelling accepted</small> : null}
                </td>
                <td>
                  <Link
                    to={detailLink(row.entryId)} onClick={() => rememberPosition(row.entryId)}
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
      {!resultRows.length ? <p className="practice-load-status">No results in this view.</p> : null}
      <div className="actions practice-results-actions">
        {hasMistakes ? (
          <button
            className="btn primary"
            type="button"
            onClick={retryMistakes}
          >
            <RotateCcw size={15} />
            Retry mistakes
          </button>
        ) : null}
        {nextGroup ? <Link className={`btn ${hasMistakes ? "line" : "primary"}`} to={`/vocabulary/study?bookId=${encodeURIComponent(nextGroup.bookId)}&unitId=${encodeURIComponent(nextGroup.id)}&dueOnly=false`} onClick={resetResults}>Next group <ArrowRight size={15} /></Link> : null}
        <button className="btn line" type="button" onClick={resetResults}>
          New session
        </button>
        <Link className="btn line" to="/vocabulary">
          Exit
        </Link>
      </div>
    </section>
  );
}
