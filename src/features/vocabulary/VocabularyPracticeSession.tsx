import { ArrowLeft, ArrowRight, Check, Flag, Pause, Play, Volume2 } from "lucide-react";
import { IconButton } from "../../components/IconButton";
import { evaluateVocabularySessionAnswer, type VocabularyPracticeSession } from "../../domain/vocabulary/session";
import type { ReviewCard, VocabularyResult } from "../../domain/vocabulary";
import { conceal, modeLabel, resultName, senseFor } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";

export function VocabularyPracticeSession({ controller, session }: {
  controller: VocabularyPracticeController;
  session: VocabularyPracticeSession;
}) {
  const { preferences, mode, cards, saving, audioStatus, audioBusy, looping, answered, flagged, count, locked, currentIndex, pageStart, visibleCards, playCard, updateAnswer, finalizeAnswer, focusCard, advance, toggleFlag, reportProduction, submit, registerAnswerField, pauseSession, replayCard, toggleCurrentAudio, toggleAudioLoop, handleWorkbenchKeyDown } = controller;
  function prompt(card: ReviewCard, compact = false) {
    const sense = senseFor(card);
    const currentMode = session?.mode || mode;
    if (card.task) return <p className="practice-prompt-text">{card.task.prompt}</p>;
    if (currentMode === "dictation")
      return (
        <span className="practice-dictation-label">
          {compact ? "Listen and type" : "Listen and write the word"}
        </span>
      );
    if (currentMode === "definition")
      return (
        <p className="practice-prompt-text">
          {conceal(sense?.definition || card.entry.meaning, card.entry.term)}
        </p>
      );
    if (currentMode === "cloze")
      return (
        <p className="practice-prompt-text">
          {conceal(sense?.example || card.entry.example, card.entry.term)}
        </p>
      );
    if (currentMode === "distinction")
      return (
        <p className="practice-prompt-text">
          {sense?.distinctionTask?.prompt ||
            `Find a synonym: ${sense?.definition || card.entry.meaning}`}
        </p>
      );
    return (
      <div className="practice-production-prompt">
        <h3>{card.entry.term}</h3>
        <p>{sense?.definition || card.entry.meaning}</p>
      </div>
    );
  }
  function feedback(card: ReviewCard) {
    const answer = session?.answers[card.id];
    if (session?.preferences.feedback !== "immediate" || !answer?.revealed)
      return null;
    const evaluation = evaluateVocabularySessionAnswer(card, answer.response, {
      result: answer.result,
      verification: answer.verification as "pending" | "self-reported",
    });
    return (
      <div className={`practice-feedback is-${evaluation.result}`}>
        <span>{resultName(evaluation.result)}</span>
        {card.task?.explanation ? <p>{card.task.explanation}</p> : null}
        {session.mode !== "production" ? (
          <strong>{evaluation.expectedAnswer}</strong>
        ) : null}
        {session.mode === "distinction" &&
        senseFor(card)?.distinctionTask?.explanation ? (
          <p>{senseFor(card)?.distinctionTask?.explanation}</p>
        ) : null}
      </div>
    );
  }
  function answerControl(card: ReviewCard, index: number) {
    const current = session!.answers[card.id];
    const readOnly =
      locked || Boolean(current?.revealed && session!.mode !== "production");
    const common = {
      id: `practice-answer-${index + 1}`,
      "aria-label": `Answer ${index + 1}`,
      value: current?.response || "",
      disabled: locked,
      readOnly,
      autoComplete: "off",
      autoCorrect: "off",
      spellCheck: false,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => updateAnswer(index, event.target.value),
      onFocus: () => focusCard(index),
      onBlur: () => finalizeAnswer(index),
    };
    if (
      session!.mode === "distinction" &&
      (card.task?.options || senseFor(card)?.distinctionTask?.options)?.length
    )
      return (
        <fieldset className="practice-options" disabled={readOnly}>
          <legend className="sr-only">Answer {index + 1}</legend>
          {(card.task?.options || senseFor(card)!.distinctionTask!.options).map(
            (option, optionIndex) => (
              <label key={optionIndex}>
                <input
                  type="radio"
                  name={`practice-choice-${index + 1}`}
                  checked={current?.response === option}
                  onFocus={() => focusCard(index)}
                  onChange={() => {
                    updateAnswer(index, option);
                    if (session!.preferences.feedback === "immediate")
                      finalizeAnswer(index);
                  }}
                />
                <span>{option}</span>
              </label>
            ),
          )}
        </fieldset>
      );
    return session!.mode === "production" ? (
      <textarea
        {...common}
        rows={3}
        placeholder="Write a sentence"
        ref={(element) => {
          registerAnswerField(index, element);
        }}
      />
    ) : (
      <input
        {...common}
        type="text"
        placeholder="Your answer"
        ref={(element) => {
          registerAnswerField(index, element);
        }}
      />
    );
  }
  function productionRating(card: ReviewCard, index: number) {
    if (
      session?.mode !== "production" ||
      !session.answers[card.id]?.response.trim()
    )
      return null;
    return (
      <label className="practice-self-report">
        Self review
        <select
          aria-label={`Self review ${index + 1}`}
          value={session.answers[card.id]?.result || "pending"}
          disabled={locked}
          onFocus={() => focusCard(index)}
          onChange={(event) =>
            reportProduction(index, event.target.value as VocabularyResult)
          }
        >
          <option value="pending">Awaiting feedback</option>
          <option value="success">Looks correct</option>
          <option value="partial">Needs improvement</option>
          <option value="failure">Incorrect</option>
        </select>
      </label>
    );
  }

  return (
    <div className="practice-workspace" tabIndex={-1} aria-label="Practice workbench"
      onKeyDownCapture={handleWorkbenchKeyDown}>
      <div className="practice-session-toolbar">
        <div>
          <strong>{modeLabel(session.mode)}</strong>
          <span>
            {answered} / {count}{" "}
            {session.mode === "audio" ? "listened" : "answered"}
            {flagged ? ` · ${flagged} flagged` : ""}
          </span>
        </div>
        <div className="practice-audio-controls">
          <button className="btn line" disabled={locked} onClick={pauseSession}><Pause size={15} />Pause session</button>
          <span className="practice-accent">
            {preferences.accent.toUpperCase()} · {preferences.speechRate}×
          </span>
          <IconButton
            label={
              audioBusy || looping ? "Pause audio" : "Replay current word"
            }
            disabled={locked}
            onClick={toggleCurrentAudio}
          >
            {audioBusy || looping ? (
              <Pause size={17} />
            ) : (
              <Volume2 size={18} />
            )}
          </IconButton>
          {session.mode === "audio" ? (
            <button
              className="btn line"
              type="button"
              disabled={locked}
              onClick={toggleAudioLoop}
            >
              {looping ? <Pause size={15} /> : <Play size={15} />}
              {looping ? "Pause loop" : "Play loop"}
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            disabled={locked}
            onClick={() => void submit()}
          >
            <Check size={15} />
            {saving ? "Saving…" : "Submit session"}
          </button>
        </div>
      </div>
      <div className="practice-progress-track">
        <div
          style={{ width: `${count ? (answered / count) * 100 : 0}%` }}
        />
      </div>
      <div
        className="practice-audio-status"
        role="status"
        aria-live="polite"
      >
        {audioStatus}
      </div>
      <nav className="practice-number-nav" aria-label="Session words">
        {visibleCards.map(({card, index}) => (
          <button
            type="button"
            key={card.id}
            aria-label={`Word ${index + 1}${session.answers[card.id]?.response.trim() ? ", answered" : ""}${session.answers[card.id]?.flagged ? ", flagged" : ""}`}
            aria-current={index === currentIndex ? "step" : undefined}
            className={`${session.answers[card.id]?.response.trim() ? "is-answered" : ""}${session.answers[card.id]?.flagged ? " is-flagged" : ""}`}
            disabled={locked}
            onClick={() => focusCard(index)}
          >
            {index + 1}
            {session.answers[card.id]?.flagged ? <Flag size={8} /> : null}
          </button>
        ))}
      </nav>
      <div className="practice-navigation-tools">
        {count > 50 ? <div className="practice-pagination" aria-label="Session pages">
          <button className="btn line" disabled={locked || pageStart === 0} onClick={() => focusCard(Math.max(0, pageStart - 50))}>Previous page</button>
          <span>{pageStart + 1}–{Math.min(pageStart + 50, count)} of {count}</span>
          <button className="btn line" disabled={locked || pageStart + 50 >= count} onClick={() => focusCard(pageStart + 50)}>Next page</button>
        </div> : null}
        <div className="actions">
          <button className="btn text" disabled={locked || !cards.some(card => !session.answers[card.id]?.response.trim())} onClick={() => {
            const index = cards.findIndex((card, index) => index > currentIndex && !session.answers[card.id]?.response.trim());
            focusCard(index >= 0 ? index : cards.findIndex(card => !session.answers[card.id]?.response.trim()));
          }}>Next unanswered</button>
          <button className="btn text" disabled={locked || !flagged} onClick={() => {
            const index = cards.findIndex((card, index) => index > currentIndex && session.answers[card.id]?.flagged);
            focusCard(index >= 0 ? index : cards.findIndex(card => session.answers[card.id]?.flagged));
          }}>Next flagged</button>
          <details className="practice-shortcuts"><summary>Keyboard shortcuts</summary>
            <dl><dt>↑ / ↓</dt><dd>Previous / next word in a single-line answer</dd><dt>Enter</dt><dd>Confirm answer; advance when enabled</dd><dt>Ctrl / ⌘ + Enter</dt><dd>Replay current word while typing</dd><dt>Space / R</dt><dd>Replay from workbench navigation</dd><dt>1–9</dt><dd>Jump to the first nine words on this page from navigation</dd><dt>Esc</dt><dd>Pause and choose whether to keep progress</dd></dl>
            <p>Text areas retain normal arrow keys and newlines. Shortcuts pause while a menu or dialog is open.</p>
          </details>
        </div>
      </div>
      {session.mode === "audio" ? (
        <div className="practice-focus practice-audio-focus">
          <span className="practice-focus-counter">
            {currentIndex + 1} / {count}
          </span>
          <IconButton
            label="Listen to word"
            className="practice-listen-button"
            disabled={locked}
            onClick={() => void playCard(currentIndex)}
          >
            <Volume2 size={34} />
          </IconButton>
          <h3>{cards[currentIndex]?.entry.term}</h3>
          <p>
            {senseFor(cards[currentIndex])?.definition ||
              cards[currentIndex]?.entry.meaning}
          </p>
          <p className="practice-audio-example">
            {senseFor(cards[currentIndex])?.example}
          </p>
          <span className="practice-listened-state">
            {session.answers[cards[currentIndex].id]?.response ? (
              <>
                <Check size={14} />
                Listened
              </>
            ) : (
              "Ready to listen"
            )}
          </span>
        </div>
      ) : session.preferences.layout === "list" ? (
        <div className="practice-answer-list">
          {visibleCards.map(({card, index}) => (
            <div
              key={card.id}
              className={`practice-answer-row${index === currentIndex ? " is-current" : ""}${session.answers[card.id]?.flagged ? " is-flagged" : ""}`}
            >
              <span className="practice-row-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <IconButton
                label={`Play word ${index + 1}`}
                disabled={locked}
                onClick={() => focusCard(index, true)}
              >
                <Volume2 size={18} />
              </IconButton>
              <div className="practice-row-main">
                {session.mode !== "dictation" ? prompt(card, true) : null}
                {answerControl(card, index)}
                {feedback(card)}
                {productionRating(card, index)}
              </div>
              <IconButton
                label={`Flag word ${index + 1}`}
                aria-pressed={Boolean(session.answers[card.id]?.flagged)}
                disabled={locked}
                onClick={() => toggleFlag(index)}
              >
                <Flag size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      ) : (
        <div className="practice-focus">
          <div className="practice-focus-meta">
            <span className="practice-focus-counter">
              {currentIndex + 1} / {count}
            </span>
            <IconButton
              label={`Flag word ${currentIndex + 1}`}
              aria-pressed={Boolean(
                session.answers[cards[currentIndex].id]?.flagged,
              )}
              disabled={locked}
              onClick={() => toggleFlag(currentIndex)}
            >
              <Flag size={17} />
            </IconButton>
          </div>
          {session.mode === "dictation" ? (
            <IconButton
              label="Listen to word"
              className="practice-listen-button"
              disabled={locked}
              onClick={() => replayCard(currentIndex)}
            >
              <Volume2 size={34} />
            </IconButton>
          ) : null}
          {prompt(cards[currentIndex])}
          {answerControl(cards[currentIndex], currentIndex)}
          {feedback(cards[currentIndex])}
          {productionRating(cards[currentIndex], currentIndex)}
        </div>
      )}
      <div className="practice-footer">
        <button
          className="btn line"
          type="button"
          disabled={currentIndex === 0 || locked}
          onClick={() => focusCard(currentIndex - 1)}
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <span>
          {currentIndex + 1} / {count}
        </span>
        <button
          className="btn line"
          type="button"
          disabled={currentIndex >= cards.length - 1 || locked}
          onClick={() => advance(currentIndex)}
        >
          Next
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
