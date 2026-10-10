import { Link } from "react-router-dom";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { FilterMenu } from "../../components/ui";
import type { VocabularySessionRecord } from "../../domain/vocabulary/session";
import { dateLabel, modeLabel, resultName } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";

export function VocabularyPracticeResults({ controller, results }: {
  controller: VocabularyPracticeController;
  results: VocabularySessionRecord;
}) {
  const { resultFilter, setResultFilter, resultRows, nextGroup, resetResults, resultSource, retryMistakes } = controller;
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
            {resultRows.map((row, index) => (
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
