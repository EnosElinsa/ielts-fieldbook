import { Settings2, X } from "lucide-react";
import { IconButton } from "../../components/IconButton";
import { ModalFrame } from "../../components/ModalFrame";
import { VocabularyNavigation } from "./VocabularyPages";
import { VocabularyPracticeSetup } from "./VocabularyPracticeSetup";
import { VocabularyPracticeSession } from "./VocabularyPracticeSession";
import { VocabularyPracticeResults } from "./VocabularyPracticeResults";
import { useVocabularyPracticeController } from "./useVocabularyPracticeController";
import "../../styles/vocabulary-practice.css";
import { VocabularyBackLink, vocabularyForwardState } from './VocabularyRouteLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { useVocabularyPosition } from './vocabularyNavigation';
import { PanelLoadingState } from '../../components/AsyncState';

export function VocabularyPracticePage() {
  const controller = useVocabularyPracticeController();
  const {
    session, results, study, exitOpen, setExitOpen,
    incompleteOpen, setIncompleteOpen, saving, error, storageError, submissionPending,
    answered, count, submit, exit, pauseSession,
  } = controller;
  const location = useLocation();
  const navigate = useNavigate();
  const resultRequested = /^\/vocabulary\/history\//.test(location.pathname) || Boolean(new URLSearchParams(location.search).get('sessionId'));
  const showSetup = !session && !results && !resultRequested;
  useVocabularyPosition(location.pathname + location.search + location.hash, controller.catalogReady && showSetup);
  return (
    <section className="view active vocabulary-view vocabulary-practice-view">
      <VocabularyNavigation />
      <header className="practice-heading">
        {showSetup ? <div className="practice-heading-context">
          <VocabularyBackLink fallback={study && controller.bookId !== 'all' && controller.unitId !== 'all' ? `/vocabulary/wordbooks/${encodeURIComponent(controller.bookId)}/groups/${encodeURIComponent(controller.unitId)}/words` : '/vocabulary'}/>
          <h2>{study ? "Wordbook study" : "Vocabulary review"}</h2>
        </div> : session ? <div><span className="eyebrow">{study ? 'Wordbook study' : 'Vocabulary review'}</span></div> : null}
        <div className="actions">
          <IconButton
            label="Practice settings"
            disabled={saving}
            onClick={() => { const to = `/settings/vocabulary?${new URLSearchParams({returnTo:location.pathname + location.search + location.hash})}`; navigateWithPracticeGuard(to, () => navigate(to, {state:vocabularyForwardState(location)})); }}
          >
            <Settings2 size={18} />
          </IconButton>
          {session ? (
            <button
              className="btn line"
              type="button"
              disabled={saving}
              onClick={pauseSession}
            >
              <X size={16} />
              Exit session
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <div className="practice-error" role="alert">
          <span>{error}</span>
          {submissionPending ? (
            <button
              className="btn line"
              type="button"
              onClick={() => void submit(true)}
              disabled={saving}
            >
              {saving ? "Saving…" : "Retry submission"}
            </button>
          ) : null}
        </div>
      ) : null}
      {storageError && session ? (
        <p className="practice-error" role="status">
          Progress is open in this tab. Browser recovery is unavailable.
        </p>
      ) : null}
      {showSetup ? <VocabularyPracticeSetup controller={controller} /> : null}
      {resultRequested && !session && !results && !error ? <PanelLoadingState message="Loading session results…" /> : null}
      {session ? <VocabularyPracticeSession controller={controller} session={session} /> : null}
      {results ? <VocabularyPracticeResults controller={controller} results={results} /> : null}
      <ModalFrame
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Exit practice session"
      >
        <div className="practice-confirm-dialog">
          <h2>Exit this session?</h2>
          <p>
            {answered} of {count} answered
          </p>
          <div className="practice-confirm-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => exit(true)}
            >
              Keep progress
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => exit(false)}
            >
              Discard session
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => setExitOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalFrame>
      <ModalFrame
        open={incompleteOpen}
        onClose={() => setIncompleteOpen(false)}
        title="Submit incomplete session"
      >
        <div className="practice-confirm-dialog">
          <h2>Submit this session?</h2>
          <p>
            {count - answered} unanswered{" "}
            {count - answered === 1 ? "word" : "words"}
          </p>
          <div className="practice-confirm-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => void submit(true)}
            >
              Submit anyway
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => setIncompleteOpen(false)}
            >
              Continue practice
            </button>
          </div>
        </div>
      </ModalFrame>
    </section>
  );
}
