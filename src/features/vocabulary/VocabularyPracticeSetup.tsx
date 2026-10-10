import { useState } from "react";
import { VocabularyGroupPicker } from "./VocabularyGroupPicker";
import { Link } from "react-router-dom";
import { ArrowRight, Headphones, List, Play, Square } from "lucide-react";
import { FilterMenu } from "../../components/ui";
import { IconButton } from "../../components/IconButton";
import { normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
import { MODES, dateLabel, modeLabel } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";

export function VocabularyPracticeSetup({ controller }: { controller: VocabularyPracticeController }) {
  const { study, explicitEntry, preferences, setPreferences, mode, bookId, setBook, unitId, setUnit, dueOnly, setDue, wrongOnly, setWrong, catalogStatus, queue, unitQueue, books, selectedUnit, selectedBook, chapter, catalogReady, studyReady, resume, recent, changeFilter, changeMode, begin, recover, discardResume, showRecentSession, retryCatalog } = controller;
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <div className="practice-context-card">
        <span className="eyebrow">{study ? 'One complete group' : explicitEntry ? 'A single word' : 'A focused review batch'}</span>
        <h3>{study ? selectedBook?.title || 'Choose a wordbook' : explicitEntry ? queue[0]?.entry.term || 'Practise this word' : 'Keep your vocabulary ready'}</h3>
        <p>{study ? [chapter?.title, selectedUnit?.title].filter(Boolean).join(' / ') || 'Choose a group below to begin.' : explicitEntry ? queue[0]?.entry.senses.find(sense => sense.id === queue[0]?.senseId)?.definition || 'This selected meaning is unavailable.' : 'Review learned words that are due, recover mistakes, or create a custom batch.'}</p>
        {mode === 'dictation' ? <p>British and American spellings are both accepted.</p> : null}
        {study && unitQueue ? <strong>{unitQueue.totalWords} words in this group · {unitQueue.eligibleWords} ready for {modeLabel(mode).toLowerCase()}</strong> : null}
        <Link to={study ? '/vocabulary/review' : '/vocabulary/wordbooks'}>{study ? 'Switch to vocabulary review' : 'Study a complete wordbook group'} <ArrowRight size={14} /></Link>
      </div>
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
        {study ? <button className="btn line" type="button" disabled={bookId === 'all'} onClick={() => setPickerOpen(true)}>{selectedUnit?.title || 'Choose a group'}</button> : explicitEntry ? null : <FilterMenu label="Review preset" value={wrongOnly ? 'wrong' : dueOnly ? 'due' : 'custom'} options={[{value:'due',label:'Due learned words'},{value:'wrong',label:'Wrong learned words'},{value:'custom',label:'Custom learned words'}]} onChange={value => { setDue(value === 'due'); setWrong(value === 'wrong'); controller.setReviewPreset(value); }} />}
        {pickerOpen ? <VocabularyGroupPicker state={controller.state} bookId={bookId} currentUnitId={unitId} onClose={() => setPickerOpen(false)} onSelect={(value: string) => { setUnit(value); changeFilter('unitId',value); }} /> : null}
      </div>
      <details className="practice-setup-details" open={!study || undefined}><summary>{study ? 'Practice options' : 'Review options'}</summary>
      <div className="practice-setup-options">
        {!study ?
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
        : null}
        <div className="practice-configuration">
          {!study ?
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
          {!study ? <FilterMenu
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
          /> : <span className="practice-switch">Wordbook source order · whole group</span>}
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
      {catalogStatus.status === 'loading' && study ? <p role="status" className="practice-load-status">Loading the complete wordbook…</p> : null}
      {catalogStatus.status === 'error' ? <div className="practice-error" role="alert">The wordbook could not be loaded. <button className="btn line" onClick={retryCatalog}>Retry catalog</button></div> : null}
      {study && catalogReady && unitQueue && selectedUnit ? <div className="practice-eligibility" role="status">
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
          <p>
            {queue.length
              ? `${study ? queue.length : Math.min(preferences.sessionSize, queue.length)} words · ${preferences.layout === "list" ? "List" : "Focus"} · ${preferences.feedback === "end" ? "Results after submission" : "Feedback during practice"}`
              : "No words match these filters."}
          </p>
          {study && controller.unitQueue && controller.unitQueue.unavailableWords > 0 ? <p role="status">Specialist practice: {controller.unitQueue.eligibleWords} of {controller.unitQueue.totalWords} words have eligible tasks. This subset does not complete the whole unit. {controller.unitQueue.unavailableWords} words need content review.</p> : null}
          <button
            className="btn primary practice-start"
            type="button"
            disabled={!queue.length || Boolean(resume) || !studyReady}
            onClick={() => begin()}
          >
            <Play size={17} />
            {study && controller.unitQueue && controller.unitQueue.unavailableWords > 0 ? 'Start specialist subset' : 'Start session'}
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
