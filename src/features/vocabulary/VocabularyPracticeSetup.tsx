import { PanelLoadingState, StateMessage } from '../../components/AsyncState';
import { useState } from "react";
import { VocabularyGroupPicker } from "./VocabularyGroupPicker";
import { VocabularyLink as Link } from './VocabularyRouteLink';
import { ArrowRight, Headphones, List, Play, Square } from "lucide-react";
import { FilterMenu } from "../../components/ui";
import { IconButton } from "../../components/IconButton";
import { isSpecialistVocabularyMode, normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
import { MODES, dateLabel, modeLabel } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";

export function VocabularyPracticeSetup({ controller }: { controller: VocabularyPracticeController }) {
  const { study, explicitEntry, preferences, setPreferences, mode, bookId, setBook, unitId, setUnit, dueOnly, setDue, wrongOnly, setWrong, catalogStatus, queue, unitQueue, books, selectedUnit, selectedBook, chapter, catalogReady, studyReady, resume, recent, changeFilter, changeMode, begin, recover, discardResume, showRecentSession, retryCatalog } = controller;
  const [pickerOpen, setPickerOpen] = useState(false);
  const specialist = isSpecialistVocabularyMode(mode);
  const launchCount = study ? queue.length : Math.min(preferences.sessionSize, queue.length);
  const preparing = !catalogReady && catalogStatus.status !== 'error';
  const batchOptions = !study && !explicitEntry;
  const reviewFilters = !study && (!explicitEntry || dueOnly || wrongOnly);
  const focused = controller.focusedPractice;
  const queuedSense = queue[0]?.entry.senses.find(sense => sense.id === queue[0]?.senseId);
  const selectedMeaning = controller.filter.senseId ? focused?.sense : queuedSense || focused?.sense;
  const unsupportedMode = Boolean(catalogReady && controller.filter.senseId && focused?.sense && !focused.reference && !focused.entry.tags.includes('archived') && !focused.modes.includes(mode === 'audio' ? 'dictation' : mode));
  const fallbackMode = unsupportedMode && !controller.boundAssessmentMode && focused?.modes.includes('definition') ? 'definition' : undefined;
  return (
    <>
      <div className="practice-context-card">
        <span className="eyebrow">{controller.batchRequest ? `Learning batch ${Number(controller.learningBatch.batch?.selection.batchIndex || 0) + 1}` : study ? 'One complete group' : explicitEntry ? 'A single word' : 'A focused review batch'}</span>
        <h3>{study ? selectedBook?.title || 'Choose a wordbook' : explicitEntry ? focused?.entry.term || queue[0]?.entry.term || 'Practise this word' : 'Vocabulary review'}</h3>
        <p>{study ? [chapter?.title, selectedUnit?.title].filter(Boolean).join(' / ') || 'Choose a group below to begin.' : explicitEntry ? !catalogReady ? preparing ? 'Loading your selected meaning…' : 'Retry loading to see your selected meaning.' : selectedMeaning?.definition || 'This selected meaning is unavailable.' : 'Review due words, retry mistakes, or build a custom review.'}</p>
        {mode === 'dictation' ? <p>British and American spellings are both accepted.</p> : null}
        {mode === 'production' ? <p>Your sentences are saved for review. A self-rating does not verify correct usage.</p> : null}
        {wrongOnly ? <p>Mistake recovery needs 3 correct retries in the same mode, with at least 24 hours between the first and last.</p> : null}
        {controller.batchRequest ? <strong>{queue.length} words in this batch</strong> : study && unitQueue ? <strong>{unitQueue.totalWords} words in this group · {unitQueue.eligibleWords} ready for {modeLabel(mode).toLowerCase()}</strong> : null}
        {controller.filter.sourceId ? <p>Source Part: {controller.filter.sourceId} · {queue.length} matching {queue.length === 1 ? 'word' : 'words'}</p> : null}
        {controller.learningBatch.error ? <p role="alert">{controller.learningBatch.error}</p> : null}
        {controller.plannedReview && catalogReady && !studyReady ? <p role="alert">The planned review could not be prepared. Your task has not been completed.</p> : null}
        <Link to={study ? '/vocabulary/review' : '/vocabulary/wordbooks'}>{study ? 'Switch to vocabulary review' : 'Study a complete wordbook group'} <ArrowRight size={14} /></Link>
      </div>
      <div className="practice-setup-controls">
        {controller.boundAssessmentMode ? <span>{modeLabel(controller.boundAssessmentMode)}</span> : controller.groupModes?.length === 0 ? <span>No practice tasks are available in this group.</span> : <FilterMenu
          label={study || explicitEntry ? 'Practice mode' : 'Review mode'}
          value={mode}
          options={controller.groupModes ? controller.groupModes.filter(item => !controller.batchRequest || item.value !== 'audio' && controller.learningBatch.batch?.selection.cards.every(ref => item.queue.cards.some(card => card.entryId === ref.entryId && card.senseId === ref.senseId))).map(item=>{ const count = controller.batchRequest ? queue.length : item.queue.eligibleWords; return {value:item.value,label:`${item.label} · ${count} ${count === 1 ? 'word' : 'words'}${item.value==='audio'?' · Listening activity':''}`}; }) : MODES}
          onChange={changeMode}
        />}
        {!explicitEntry ? <FilterMenu
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
        /> : null}
        {study ? <button className="btn line" type="button" disabled={bookId === 'all'} onClick={() => setPickerOpen(true)}>{selectedUnit?.title || 'Choose a group'}</button> : explicitEntry ? null : <FilterMenu label="Review preset" value={wrongOnly ? 'wrong' : dueOnly ? 'due' : 'custom'} options={[{value:'due',label:'Due for review'},{value:'wrong',label:'Words to retry'},{value:'custom',label:'Custom selection'}]} onChange={value => { setDue(value === 'due'); setWrong(value === 'wrong'); controller.setReviewPreset(value); }} />}
        {pickerOpen ? <VocabularyGroupPicker state={controller.state} bookId={bookId} currentUnitId={unitId} onClose={() => setPickerOpen(false)} onSelect={(value: string) => { setUnit(value); changeFilter('unitId',value); }} /> : null}
      </div>
      {controller.modeNotice ? <p role="status">{controller.modeNotice}</p> : null}
      <details className="practice-setup-details" open={!study || undefined}><summary>{study || explicitEntry ? 'Practice options' : 'Review options'}</summary>
      <div className="practice-setup-options">
        {reviewFilters ?
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
            Mistakes only
          </label>
        </div>
        : null}
        <div className="practice-configuration">
          {batchOptions ?
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
          : null}
          {batchOptions ? <FilterMenu
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
          /> : study ? <span className="practice-switch">Wordbook source order · {controller.batchRequest ? 'selected batch' : 'whole group'}</span> : null}
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
      </details>
      {catalogStatus.status === 'loading' && study ? <PanelLoadingState message="Loading the complete wordbook…" onRetry={retryCatalog} retryLabel="Retry catalog" /> : null}
      {catalogStatus.status === 'error' ? <StateMessage kind="error" message="The wordbook could not be loaded." onRetry={retryCatalog} retryLabel="Retry catalog" /> : null}
      {study && !controller.batchRequest && catalogReady && unitQueue && selectedUnit ? <div className="practice-eligibility" role="status">
        {!unitQueue.complete ? <p>Group content is incomplete. Reload the catalog before starting.</p> : null}
        {unitQueue.archivedWords ? <p>{unitQueue.archivedWords} archived words excluded.</p> : null}
        {unitQueue.unavailableWords ? <p>{unitQueue.unavailableWords} words have no {modeLabel(mode).toLowerCase()} task. Choose another mode to practise them.</p> : null}
        {unitQueue.missingWords ? <p>{unitQueue.missingWords} word entries unavailable.</p> : null}
      </div> : null}
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
            <button className="btn primary" type="button" disabled={controller.recovering} onClick={() => void recover()}>
              <Play size={15} />
              {controller.recovering ? 'Loading session…' : 'Resume session'}
            </button>
            <button
              className="btn line"
              type="button"
              disabled={controller.recovering}
              onClick={discardResume}
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
          <p role={preparing ? 'status' : undefined}>
            {preparing ? 'Preparing practice…' : !catalogReady ? 'Retry loading the wordbook to prepare practice.' : queue.length
              ? `${launchCount} ${launchCount === 1 ? 'word' : 'words'} · ${preferences.layout === "list" ? "List" : "Focus"} · ${preferences.feedback === "end" ? "Results after submission" : "Feedback during practice"}`
              : unsupportedMode ? 'No exercise is available for this meaning in this mode.' : "No words match these filters."}
          </p>
          {!study && controller.filter.scheduledOnly ? <p className="vocabulary-muted">Only saved meanings with an existing review schedule are included.</p> : null}
          {fallbackMode ? <button type="button" className="btn line" onClick={() => changeMode(fallbackMode)}>Try {modeLabel(fallbackMode)}</button> : null}
          {study && catalogReady && !controller.batchRequest && controller.unitQueue && controller.unitQueue.unavailableWords > 0 ? <p role="status">{specialist ? <>{controller.unitQueue.eligibleWords} of {controller.unitQueue.totalWords} words have a {modeLabel(mode).toLowerCase()} exercise. This optional practice covers these words only. Choose Dictation to study the complete group.</> : <>Some words are unavailable for this mode. Reload the wordbook or choose Dictation to study the complete group.</>}</p> : null}
          <button
            className="btn primary practice-start"
            type="button"
            disabled={!queue.length || Boolean(resume) || !studyReady || Boolean(study && !controller.batchRequest && !specialist && unitQueue?.unavailableWords)}
            aria-busy={preparing}
            onClick={() => begin()}
          >
            <Play size={17} />
            {study && specialist && controller.unitQueue && controller.unitQueue.unavailableWords > 0 ? 'Start specialist subset' : 'Start session'}
          </button>
          {catalogReady && !queue.length ? (
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
                onClick={() => showRecentSession(log)}
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
  );
}
