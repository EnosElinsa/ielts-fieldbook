// @ts-nocheck
import { useNavigate } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, displayName, formatDate, sessionSkill } from '../../lib/format';
import { Empty } from '../../components/ui';

export function ReviewPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const speaking = fb.activeSkill === 'speaking';
  const sessions = fb.state.sessions.filter((s) => sessionSkill(s) === fb.activeSkill);
  const assessments = fb.state.assessments.filter((assessment) => {
    if (assessment && assessment.skill === 'speaking') return speaking;
    const sess = assessment?.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
    if (sess) return sessionSkill(sess) === fb.activeSkill;
    return !speaking;
  });
  const errors = fb.state.errors.filter((error) => {
    if (!error?.sourceSessionId) return true;
    const sess = fb.state.sessions.find((item) => item.id === error.sourceSessionId);
    if (!sess) return true;
    return sessionSkill(sess) === fb.activeSkill;
  });

  const openHistory = (session, reuse) => {
    if (sessionSkill(session) === 'speaking') {
      fb.setSkill('speaking', false);
      if (reuse) {
        const topic = fb.state.speakingTopics.find((t) => String(t.id) === String(session.questionId));
        if (topic) {
          fb.setSelectedTopicId(String(topic.id));
          fb.setDeskPart(String(session.part || '2'));
          fb.setSpeakingDraft(topic.id, {
            transcript: session.essay,
            notes: session.notes || fb.speakingDraft(topic.id).notes,
            parentSessionId: session.id,
          });
          fb.persistNow();
          navigate('/speak');
          fb.toast('Copied into a new draft.');
          return;
        }
      }
      fb.setViewedSession(session);
      fb.openModal('history');
      return;
    }
    if (reuse) {
      const q = fb.state.questions.find((question) => String(question.id) === String(session.questionId));
      if (q) fb.setSelectedQuestionId(String(q.id));
      fb.setWritingDraft(q?.id || session.questionId, session.essay, { parentSessionId: session.id });
      fb.persistNow();
      navigate('/write');
      fb.toast('Copied into a new draft.');
      return;
    }
    fb.setViewedSession(session);
    fb.openModal('history');
  };

  return (
    <section className="view active">
      <div className="review-grid">
        <div>
          <h3 className="block-title">Attempts</h3>
          {sessions.length ? (
            <div className="panel">
              {sessions
                .slice()
                .reverse()
                .map((session) => (
                  <div className="assessment" key={session.id}>
                    <strong>{displayName(session.name)}</strong>
                    <span className={`pill${session.attemptKind === 'rewrite' ? ' blue' : ''} ml-8`}>
                      {attemptLabel(session)}
                    </span>
                    <small>
                      {formatDate(session.date)} · {session.words} words ·{' '}
                      {session.assessmentId ? 'Marked' : 'Not marked'}
                    </small>
                    {session.focus ? <p>Focus: {session.focus}</p> : null}
                    {session.next ? <p>Next: {session.next}</p> : null}
                    <div className="history-actions">
                      <button className="btn line" type="button" onClick={() => openHistory(session, false)}>
                        {speaking ? 'Transcript' : 'Essay'}
                      </button>
                      <button className="btn line" type="button" onClick={() => openHistory(session, true)}>
                        Continue
                      </button>
                      {session.assessmentId ? (
                        <button
                          className="btn line"
                          type="button"
                          onClick={() => navigate(`/review/${session.assessmentId}`)}
                        >
                          Score
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              message={speaking ? 'No speaking attempts yet.' : 'No essays yet.'}
              label={speaking ? 'Practise' : 'Write one'}
              onAction={() => navigate(speaking ? '/speak' : '/write')}
            />
          )}
        </div>
        <div>
          <h3 className="block-title">Scores</h3>
          {assessments.length ? (
            <div className="panel">
              {assessments
                .slice()
                .reverse()
                .map((assessment) => (
                  <div className="assessment" key={assessment.id}>
                    <strong>Score</strong>
                    {assessment.overall ? (
                      <span className="pill blue ml-8">Overall {assessment.overall}</span>
                    ) : null}
                    <small>
                      {formatDate(assessment.date)} · {assessment.sessionId ? 'Linked' : 'No script'}
                    </small>
                    <p>{assessment.nextExercise || 'Score saved'}</p>
                    <button className="btn line" type="button" onClick={() => navigate(`/review/${assessment.id}`)}>
                      Open
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <Empty message="No scores yet. Use Import score in the header." />
          )}
        </div>
      </div>
      <div className="section-head">
        <div>
          <h3>Mistakes</h3>
          <p>
            {speaking
              ? 'Tags such as FC-HES, FC-DEV, LR-COL, and GRA-TENSE.'
              : 'Tags such as TA-DATA, TA-OVERVIEW, CC-ORG, LR-COL, and GRA-PREP.'}
          </p>
        </div>
        <button
          type="button"
          className="btn text"
          onClick={() => {
            const draft = structuredClone(fb.stateRef.current);
            if (fb.completeReview(draft)) fb.persistNow(draft);
            fb.toast('Review done.');
          }}
        >
          Mark review done
        </button>
      </div>
      {errors.length ? (
        <div className="panel">
          {errors
            .slice()
            .reverse()
            .map((error) => (
              <div className="error-item" key={error.id}>
                <span className="error-code">{error.code}</span>
                <span className={`pill ${error.resolved ? 'green' : 'red'} ml-8`}>
                  {error.resolved ? 'Fixed' : `Reviewed ${error.reviewCount || 0}`}
                </span>
                <p>{error.text}</p>
                <small>
                  {formatDate(error.date || new Date())}
                  {error.next ? ` · Next: ${error.next}` : ''}
                </small>
                <div className="history-actions">
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => {
                      const draft = structuredClone(fb.stateRef.current);
                      const item = draft.errors.find((e) => e.id === error.id);
                      if (!item) return;
                      const session =
                        item.sourceSessionId && draft.sessions.find((entry) => entry.id === item.sourceSessionId);
                      fb.reviewError(draft, item.id);
                      fb.persistNow(draft);
                      if (!session) {
                        fb.toast('No matching attempt. The review was still saved.');
                        return;
                      }
                      if (session.assessmentId) navigate(`/review/${session.assessmentId}`);
                      else openHistory(session, false);
                      fb.toast('Review saved.');
                    }}
                  >
                    Review once
                  </button>
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => {
                      const draft = structuredClone(fb.stateRef.current);
                      fb.resolveError(draft, error.id, !error.resolved);
                      fb.persistNow(draft);
                    }}
                  >
                    {error.resolved ? 'Reopen' : 'Mark fixed'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Empty message="No mistakes saved yet. After you import a score, the corrections show up here." />
      )}
    </section>
  );
}
