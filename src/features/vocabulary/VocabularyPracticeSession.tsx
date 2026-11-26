import { memo, useCallback, useMemo, type ChangeEvent } from "react";
import { SelectField } from '../../components/SelectField';
import { ArrowLeft, ArrowRight, Check, Flag, Pause, Play, Volume2 } from "lucide-react";
import { IconButton, TooltipProvider } from "../../components/IconButton";
import { evaluateVocabularySessionAnswer, type VocabularyPracticeSession, type VocabularySessionAnswer } from "../../domain/vocabulary/session";
import type { ReviewCard, VocabularyResult } from "../../domain/vocabulary";
import type { VocabularyPracticeMode, VocabularyPreferences } from "../../domain/vocabulary/preferences";
import { conceal, modeLabel, resultName, senseFor } from "./practicePresentation";
import type { VocabularyPracticeController } from "./useVocabularyPracticeController";
import { VocabularySourceLinks } from './VocabularySourceLinks';
import { getVocabularyPronunciation } from '../../domain/vocabulary/sensePronunciation';
import { dictionaryDisplayText, vocabularySensePresentation } from '../../domain/vocabulary/dictionaryPresentation';
import { reviewedExampleForm } from '../../domain/vocabulary/content';
import { isVocabularyReadingNote } from '../../domain/vocabulary/readiness';
import { VocabularyExampleText } from './VocabularyExampleText';

const sameText = (left: string, right: string) => {
  const normal = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').toLocaleLowerCase();
  return normal(left) === normal(right);
};
/** The frozen task explanation and the sense's Distinction explanation are often the same sentence; show it once. */
function distinctionExplanation(card: ReviewCard, mode: string) {
  if (mode !== 'distinction') return '';
  const explanation = senseFor(card)?.distinctionTask?.explanation;
  if (!explanation) return '';
  return card.task?.explanation && sameText(card.task.explanation, explanation) ? '' : explanation;
}

function renderPrompt(card: ReviewCard, currentMode: VocabularyPracticeMode, compact = false) {
  const sense = senseFor(card);
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

function renderFeedback(
  card: ReviewCard,
  answer: VocabularySessionAnswer | undefined,
  sessionMode: VocabularyPracticeMode,
  feedbackMode: VocabularyPreferences["feedback"],
  filter: VocabularyPracticeSession["filter"],
) {
  if (feedbackMode !== "immediate" || !answer?.revealed) return null;
  const evaluation = evaluateVocabularySessionAnswer(card, answer.response, {
    result: answer.result,
    verification: answer.verification as "pending" | "self-reported",
  });
  return (
    <div className={`practice-feedback is-${evaluation.result}`}>
      <span>{resultName(evaluation.result)}</span>
      {card.task?.explanation ? <p>{card.task.explanation}</p> : null}
      {sessionMode !== "production" ? (
        <strong>{evaluation.expectedAnswer}</strong>
      ) : null}
      {distinctionExplanation(card, sessionMode) ? (
        <p>{distinctionExplanation(card, sessionMode)}</p>
      ) : null}
      <VocabularySourceLinks sources={card.sources} senseId={card.senseId} filter={filter} />
    </div>
  );
}

function renderAnswerControl({
  card,
  index,
  answer,
  sessionMode,
  feedbackMode,
  locked,
  fieldRef,
  onUpdateAnswer,
  onFocusCard,
  onFinalizeAnswer,
}: {
  card: ReviewCard;
  index: number;
  answer: VocabularySessionAnswer | undefined;
  sessionMode: VocabularyPracticeMode;
  feedbackMode: VocabularyPreferences["feedback"];
  locked: boolean;
  fieldRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onUpdateAnswer: (index: number, response: string) => void;
  onFocusCard: (index: number, forcePlayback?: boolean, focusAnswer?: boolean) => void;
  onFinalizeAnswer: (index: number) => void;
}) {
  const readOnly =
    locked || Boolean(answer?.revealed && sessionMode !== "production");
  const common = {
    id: `practice-answer-${index + 1}`,
    "aria-label": `Answer ${index + 1}`,
    value: answer?.response || "",
    disabled: locked,
    readOnly,
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: false,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onUpdateAnswer(index, event.target.value),
    onFocus: () => onFocusCard(index),
    onBlur: () => onFinalizeAnswer(index),
  };
  if (
    sessionMode === "distinction" &&
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
                checked={answer?.response === option}
                onFocus={() => onFocusCard(index)}
                onChange={() => {
                  onUpdateAnswer(index, option);
                  if (feedbackMode === "immediate") onFinalizeAnswer(index);
                }}
              />
              <span>{option}</span>
            </label>
          ),
        )}
      </fieldset>
    );
  return sessionMode === "production" ? (
    <textarea
      {...common}
      rows={3}
      placeholder="Write a sentence"
      ref={fieldRef}
    />
  ) : (
    <input
      {...common}
      type="text"
      placeholder="Your answer"
      ref={fieldRef}
    />
  );
}

function renderProductionRating({
  index,
  answer,
  sessionMode,
  locked,
  onFocusCard,
  onReportProduction,
}: {
  index: number;
  answer: VocabularySessionAnswer | undefined;
  sessionMode: VocabularyPracticeMode;
  locked: boolean;
  onFocusCard: (index: number, forcePlayback?: boolean, focusAnswer?: boolean) => void;
  onReportProduction: (index: number, result: VocabularyResult) => void;
}) {
  if (sessionMode !== "production" || !answer?.response.trim()) return null;
  return (
    <label className="practice-self-report">
      Self review
      <SelectField
        aria-label={`Self review ${index + 1}`}
        value={answer?.result || "pending"}
        disabled={locked}
        onFocus={() => onFocusCard(index, false, false)}
        onChange={(event) =>
          onReportProduction(index, event.target.value as VocabularyResult)
        }
      >
        <option value="pending">Awaiting feedback</option>
        <option value="success">Looks correct</option>
        <option value="partial">Needs improvement</option>
        <option value="failure">Incorrect</option>
      </SelectField>
    </label>
  );
}

const PracticeNumberButton = memo(function PracticeNumberButton({
  index,
  answered,
  flagged,
  current,
  locked,
  onSelect,
}: {
  index: number;
  answered: boolean;
  flagged: boolean;
  current: boolean;
  locked: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Word ${index + 1}${answered ? ", answered" : ""}${flagged ? ", flagged" : ""}`}
      aria-current={current ? "step" : undefined}
      className={`${answered ? "is-answered" : ""}${flagged ? " is-flagged" : ""}`}
      disabled={locked}
      onClick={() => onSelect(index)}
    >
      {index + 1}
      {flagged ? <Flag size={8} /> : null}
    </button>
  );
});

const PLAY_ROW_ICON = <Volume2 size={18} />;
const FLAG_ROW_ICON = <Flag size={16} />;

const RowPlayButton = memo(function RowPlayButton({
  index,
  locked,
  onFocusCard,
}: {
  index: number;
  locked: boolean;
  onFocusCard: (index: number, forcePlayback?: boolean, focusAnswer?: boolean) => void;
}) {
  return (
    <IconButton
      label={`Play word ${index + 1}`}
      disabled={locked}
      onClick={() => onFocusCard(index, true)}
    >
      {PLAY_ROW_ICON}
    </IconButton>
  );
});

const RowFlagButton = memo(function RowFlagButton({
  index,
  flagged,
  locked,
  onToggleFlag,
}: {
  index: number;
  flagged: boolean;
  locked: boolean;
  onToggleFlag: (index: number) => void;
}) {
  return (
    <IconButton
      label={`Flag word ${index + 1}`}
      aria-pressed={flagged}
      disabled={locked}
      onClick={() => onToggleFlag(index)}
    >
      {FLAG_ROW_ICON}
    </IconButton>
  );
});

const PracticeAnswerRow = memo(function PracticeAnswerRow({
  card,
  index,
  sessionMode,
  feedbackMode,
  filter,
  answer,
  isCurrent,
  locked,
  onFocusCard,
  onUpdateAnswer,
  onFinalizeAnswer,
  onToggleFlag,
  onReportProduction,
  onRegisterField,
}: {
  card: ReviewCard;
  index: number;
  sessionMode: VocabularyPracticeMode;
  feedbackMode: VocabularyPreferences["feedback"];
  filter: VocabularyPracticeSession["filter"];
  answer: VocabularySessionAnswer | undefined;
  isCurrent: boolean;
  locked: boolean;
  onFocusCard: (index: number, forcePlayback?: boolean, focusAnswer?: boolean) => void;
  onUpdateAnswer: (index: number, response: string) => void;
  onFinalizeAnswer: (index: number) => void;
  onToggleFlag: (index: number) => void;
  onReportProduction: (index: number, result: VocabularyResult) => void;
  onRegisterField: (index: number, element: HTMLInputElement | HTMLTextAreaElement | null) => void;
}) {
  const fieldRef = useCallback(
    (element: HTMLInputElement | HTMLTextAreaElement | null) =>
      onRegisterField(index, element),
    [onRegisterField, index],
  );
  return (
    <div
      className={`practice-answer-row${isCurrent ? " is-current" : ""}${answer?.flagged ? " is-flagged" : ""}`}
    >
      <span className="practice-row-number">
        {String(index + 1).padStart(2, "0")}
      </span>
      <RowPlayButton index={index} locked={locked} onFocusCard={onFocusCard} />
      <div className="practice-row-main">
        {sessionMode !== "dictation" ? renderPrompt(card, sessionMode, true) : null}
        {renderAnswerControl({
          card,
          index,
          answer,
          sessionMode,
          feedbackMode,
          locked,
          fieldRef,
          onUpdateAnswer,
          onFocusCard,
          onFinalizeAnswer,
        })}
        {renderFeedback(card, answer, sessionMode, feedbackMode, filter)}
        {renderProductionRating({
          index,
          answer,
          sessionMode,
          locked,
          onFocusCard,
          onReportProduction,
        })}
      </div>
      <RowFlagButton
        index={index}
        flagged={Boolean(answer?.flagged)}
        locked={locked}
        onToggleFlag={onToggleFlag}
      />
    </div>
  );
});

export function VocabularyPracticeSession({ controller, session }: {
  controller: VocabularyPracticeController;
  session: VocabularyPracticeSession;
}) {
  const { preferences, mode, cards, saving, audioStatus, audioBusy, audioNeedsChoice, looping, answered, flagged, count, locked, currentIndex, pageStart, visibleCards, playCard, updateAnswer, finalizeAnswer, focusCard, advance, toggleFlag, reportProduction, submit, registerAnswerField, pauseSession, replayCard, toggleCurrentAudio, toggleAudioLoop, handleWorkbenchKeyDown } = controller;
  const sessionMode = session.mode || mode;
  const feedbackMode = session.preferences.feedback;
  const isAudioMode = session.mode === "audio";
  const audioCard = isAudioMode || audioNeedsChoice ? cards[currentIndex] : undefined;
  const audioSense = audioCard ? senseFor(audioCard) : undefined;
  const audioPresentation = useMemo(
    () => (isAudioMode && audioSense ? vocabularySensePresentation(audioSense) : undefined),
    [isAudioMode, audioSense],
  );
  const audioReadingNote = useMemo(
    () => Boolean(isAudioMode && audioCard && audioSense && isVocabularyReadingNote(audioCard.entryId, audioSense)),
    [isAudioMode, audioCard, audioSense],
  );
  const audioExampleForm = useMemo(
    () => (isAudioMode && audioCard && audioSense ? reviewedExampleForm(audioCard.entryId, audioCard.entry.term, audioSense) : undefined),
    [isAudioMode, audioCard, audioSense],
  );
  const matchingRecordings = useMemo(
    () => (audioNeedsChoice && audioCard ? getVocabularyPronunciation(audioCard.entry, audioSense, audioCard.pronunciation ?? 'legacy').recordings : []),
    [audioNeedsChoice, audioCard, audioSense],
  );
  const focusFieldRef = useCallback(
    (element: HTMLInputElement | HTMLTextAreaElement | null) =>
      registerAnswerField(currentIndex, element),
    [registerAnswerField, currentIndex],
  );
  const currentCard = cards[currentIndex];
  const currentAnswer = currentCard ? session.answers[currentCard.id] : undefined;

  return (
    <TooltipProvider delayDuration={350}>
    <div className="practice-workspace" role="region" tabIndex={-1} aria-label="Practice workbench"
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
          <button className="btn line" type="button" disabled={locked} onClick={pauseSession}><Pause size={15} />Pause session</button>
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
      {audioNeedsChoice ? <div className="vocabulary-audio-recovery practice-audio-choices" role="group" aria-label="Pronunciation recovery">
        {matchingRecordings.map(recording=><button key={recording.url} className="btn line" type="button" disabled={locked || audioBusy} onClick={()=>void playCard(currentIndex,{accent:recording.accent as 'uk' | 'us',recording})}>Play matching {recording.accent.toUpperCase()} recording</button>)}
        <button className="btn line" type="button" disabled={locked || audioBusy} onClick={()=>void playCard(currentIndex,{deviceOnly:true})}>Use {preferences.accent.toUpperCase()} device voice (reading unverified)</button>
      </div> : null}
      <nav className="practice-number-nav" aria-label="Session words">
        {visibleCards.map(({card, index}) => {
          const itemAnswer = session.answers[card.id];
          return (
            <PracticeNumberButton
              key={card.id}
              index={index}
              answered={Boolean(itemAnswer?.response.trim())}
              flagged={Boolean(itemAnswer?.flagged)}
              current={index === currentIndex}
              locked={locked}
              onSelect={focusCard}
            />
          );
        })}
      </nav>
      <div className="practice-navigation-tools">
        {count > 50 ? <div className="practice-pagination" aria-label="Session pages">
          <button className="btn line" disabled={locked || pageStart === 0} onClick={() => focusCard(Math.max(0, pageStart - 50))}>Previous page</button>
          <span>{pageStart + 1}–{Math.min(pageStart + 50, count)} of {count}</span>
          <button className="btn line" disabled={locked || pageStart + 50 >= count} onClick={() => focusCard(pageStart + 50)}>Next page</button>
        </div> : null}
        <div className="actions">
          <button className="btn text" disabled={locked || answered >= cards.length} onClick={() => {
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
          <h3>{audioCard?.entry.term}</h3>
          <p>
            {audioPresentation?.definition ||
              dictionaryDisplayText(audioCard?.entry.meaning)}
          </p>
          <p className="practice-audio-example">
            {audioPresentation?.example ? (
              <VocabularyExampleText
                text={audioPresentation.example}
                term={audioReadingNote ? undefined : audioCard?.entry.term}
                form={audioExampleForm}
                pos={audioSense?.pos}
              />
            ) : null}
          </p>
          <span className="practice-listened-state">
            {currentAnswer?.response ? (
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
            <PracticeAnswerRow
              key={card.id}
              card={card}
              index={index}
              sessionMode={sessionMode}
              feedbackMode={feedbackMode}
              filter={session.filter}
              answer={session.answers[card.id]}
              isCurrent={index === currentIndex}
              locked={locked}
              onFocusCard={focusCard}
              onUpdateAnswer={updateAnswer}
              onFinalizeAnswer={finalizeAnswer}
              onToggleFlag={toggleFlag}
              onReportProduction={reportProduction}
              onRegisterField={registerAnswerField}
            />
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
              aria-pressed={Boolean(currentAnswer?.flagged)}
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
          {renderPrompt(currentCard, sessionMode)}
          {renderAnswerControl({
            card: currentCard,
            index: currentIndex,
            answer: currentAnswer,
            sessionMode,
            feedbackMode,
            locked,
            fieldRef: focusFieldRef,
            onUpdateAnswer: updateAnswer,
            onFocusCard: focusCard,
            onFinalizeAnswer: finalizeAnswer,
          })}
          {renderFeedback(currentCard, currentAnswer, sessionMode, feedbackMode, session.filter)}
          {renderProductionRating({
            index: currentIndex,
            answer: currentAnswer,
            sessionMode,
            locked,
            onFocusCard: focusCard,
            onReportProduction: reportProduction,
          })}
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
    </TooltipProvider>
  );
}
