import { Link } from "react-router-dom";
import { useEffect, useRef } from 'react';
import { accountId } from '../../storage/remote';
import { isRegionalSpellingDifference } from '../../domain/vocabulary/spelling';
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { FilterMenu } from "../../components/ui";
import type { VocabularySessionRecord } from "../../domain/vocabulary/session";
import { dateLabel, modeLabel, resultName } from "./practicePresentation";
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../domain/vocabulary/context';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
import { Pronunciation } from './Pronunciation';
import { entryUrl } from './vocabularyNavigation';
import { closestAcceptedAnswer } from './answerDiff';
import { VocabularyAnswerDiff } from './VocabularyAnswerDiff';
import type { VocabularySessionResult } from '../../domain/vocabulary/session';
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
        if (table.current) { table.current.scrollLeft = position.x; table.current.scrollTop = position.tableY || 0; }
        const rowId = position.cardId || position.entryId;
        if (rowId) document.getElementById(`session-row-${rowId}`)?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
      });
    } catch { /* Browser storage may be disabled. */ }
    return () => cancelAnimationFrame(frame);
  }, [positionKey]);
  const rememberPosition = (cardId: string) => {
    try { sessionStorage.setItem(positionKey, JSON.stringify({ y: window.scrollY, x: table.current?.scrollLeft || 0, tableY: table.current?.scrollTop || 0, cardId })); } catch { /* Navigation works without storage. */ }
  };
  const currentRow = (row: VocabularySessionResult) => {
    const snapshot = results.cardSnapshots?.find(card => card.id === row.cardId);
    const raw = (controller.state.vocabulary as VocabularyEntry[])?.find(entry => entry.id === row.entryId) || (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(entry => entry.id === row.entryId) || snapshot?.entry || ({ id: row.entryId, term: row.term, category: 'word', meaning: row.definition, example: row.example, tags: [], sources: [], senses: [{ id: row.senseId, definition: row.definition, example: row.example, pos: 'word' }], createdAt: '', updatedAt: '' } as VocabularyEntry);
    const bookId = row.context?.bookId || (results.selection?.kind === 'unit' || results.selection?.kind === 'specialist' ? results.selection.bookId : results.filter.bookId);
    const unitId = row.context?.unitId || (results.selection?.kind === 'unit' || results.selection?.kind === 'specialist' ? results.selection.unitId : results.filter.unitId);
    const valid = Boolean(raw && bookId && unitId && (VOCABULARY_CATALOG.memberships.some(member => member.entryId === row.entryId && member.bookId === bookId && member.unitId === unitId) || raw.sources.some(source => source.bookId === bookId && source.unitId === unitId)));
    const context = valid ? {bookId,unitId} : {};
    const resolved = raw ? resolveVocabularyLearningContext(raw, {...context, ...(results.mode !== 'dictation' ? {senseId: row.senseId} : {})}) : null;
    const senseId = results.mode === 'dictation' ? resolved?.sense?.id || row.senseId : row.senseId;
    return {raw,resolved,detail:entryUrl(row.entryId,{...context,senseId},resultReturnTo)};
  };
  const hasMistakes = results.mode !== "audio" && results.results.some(row => row.result === "failure" || row.result === "partial");
  return (
    <section className="practice-results">
      <div className="practice-result-title">
        <div>
          <span>
            {modeLabel(results.mode)} ·{" "}
            {dateLabel(results.submittedAt || results.startedAt)}
          </span>
          <h2>
            {results.mode === "audio"
              ? "Listening activity saved"
              : `${results.summary.correct} of ${results.summary.total} correct`}
          </h2>
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
      <div className="practice-result-table-wrap" ref={table} tabIndex={0} role="region" aria-label="Session word results">
        <table>
          <thead>
            <tr>
              <th scope="col">Word</th>
              <th scope="col" className="practice-response-column">Your response</th>
              <th scope="col" className="practice-expected-column">Expected answer</th>
              <th scope="col">Result</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {resultRows.map((row, index) => {
              const current = currentRow(row); const currentDefinition = current.resolved?.sense?.definition;
              const changed = Boolean(currentDefinition && currentDefinition !== row.definition);
              const expected = closestAcceptedAnswer(row.response,row.expectedAnswer,results.cardSnapshots?.find(card => card.id === row.cardId)?.task?.acceptedAnswers);
              const diff = !['production','audio'].includes(results.mode) && row.result === 'failure' && Boolean(row.response.trim()) && !isRegionalSpellingDifference(expected,row.response) && row.response.normalize('NFKC').toLocaleLowerCase() !== expected.normalize('NFKC').toLocaleLowerCase();
              return (
              <tr key={`${row.cardId}:${index}`} id={`session-row-${row.cardId}`}>
                <th scope="row">
                  <Link
                    to={current.detail} onClick={() => rememberPosition(row.cardId)}
                  >
                    {row.term}
                  </Link>
                  <small>{results.mode === 'dictation' ? currentDefinition || row.definition : row.definition}</small>
                  {changed ? <small className="practice-current-reference">{results.mode === 'dictation' ? 'Current learning reference updated; saved grading is unchanged.' : `Current meaning: ${currentDefinition}`}</small> : null}
                  {current.raw ? <Pronunciation compact entry={{...current.raw,term:row.term}} accent={controller.preferences.accent}/> : null}
                  {row.prompt && results.mode !== 'dictation' ? <small className="practice-result-context">{row.prompt}</small> : null}
                </th>
                <td className="practice-response-column" data-label="Your response">
                  <span className="practice-cell-label" aria-hidden="true">Your response</span>
                  {row.response ? <>{diff?<VocabularyAnswerDiff response={row.response} expected={expected} side="actual"/>:row.response}</> : (
                    <span className="practice-unanswered">Unanswered</span>
                  )}
                </td>
                <td className="practice-expected-column" data-label="Expected answer"><span className="practice-cell-label" aria-hidden="true">Expected answer</span><>{diff?<VocabularyAnswerDiff response={row.response} expected={expected} side="expected"/>:row.expectedAnswer}</>{diff && expected !== row.expectedAnswer ? <details className="practice-saved-answers"><summary>Saved accepted answers</summary><span>{row.expectedAnswer}</span></details> : null}</td>
                <td data-label="Result">
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
                  {row.errorType ? <small className="practice-result-explanation">{row.errorType === 'unanswered' ? 'No response submitted' : row.errorType}</small> : null}
                  {row.explanation ? <small className="practice-result-explanation">{row.explanation}</small> : null}
                </td>
                <td data-label="Details">
                  <Link
                    to={current.detail} onClick={() => rememberPosition(row.cardId)}
                  >
                    Details
                    <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            );})}
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
