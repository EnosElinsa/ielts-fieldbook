// @ts-nocheck
import { useWorkspacePageState } from '../../lib/workspacePageState';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Download, FileInput, ArrowUpRight, RotateCcw } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { isBandScore } from '../../domain';
import { attemptLabel, displayName, formatDate, sessionSkill } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';
import { exportAttemptRequest } from './assessmentRequest';

export function ReviewPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedSkill = params.get('skill');
  const reviewSkill = ['writing', 'speaking', 'reading', 'listening'].includes(requestedSkill) ? requestedSkill : fb.activeSkill;
  const [filter, setFilter] = useWorkspacePageState(`review:${reviewSkill}:filter`, 'all', value => ['all', 'pending', 'assessed', 'rewrite'].includes(value));
  const [search, setSearch] = useWorkspacePageState(`review:${reviewSkill}:search`, '');
  const [openingId, setOpeningId] = useState(null);
  if (reviewSkill === 'reading' || reviewSkill === 'listening') return <Navigate to={`/${reviewSkill}/review`} replace />;
  const speaking = reviewSkill === 'speaking';
  const allSessions = fb.state.sessions.filter((s) => sessionSkill(s) === reviewSkill);
  const sessions = allSessions.filter((session) => (filter === 'all' || (filter === 'pending' && !session.assessmentId) || (filter === 'assessed' && session.assessmentId) || (filter === 'rewrite' && session.parentSessionId)) && `${session.name} ${session.focus || ''}`.toLowerCase().includes(search.toLowerCase()));
  const assessments = fb.state.assessments.filter((assessment) => {
    if (assessment && assessment.skill === 'speaking') return speaking;
    const sess = assessment?.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
    if (sess) return sessionSkill(sess) === reviewSkill;
    return !speaking;
  });

  const exportRequest = (session, copy = false) => exportAttemptRequest(fb, session, copy);
  const errors = fb.state.errors.filter((error) => {
    if (!error?.sourceSessionId) return true;
    const sess = fb.state.sessions.find((item) => item.id === error.sourceSessionId);
    if (!sess) return true;
    return sessionSkill(sess) === reviewSkill;
  });

  const openHistory = async (session, reuse) => {
    if (reuse) {
      if (openingId) return;
      setOpeningId(session.id);
      try { await fb.startTargetedPractice(session); }
      catch { fb.toast('Could not open this attempt. Try again.'); }
      finally { setOpeningId(null); }
      return;
    }
    fb.setViewedSession(session);
    fb.openModal('history');
  };

  return (
    <section className="view active">
      <div className="page-tools"><p>{allSessions.length} attempts · {allSessions.filter((session) => !session.assessmentId).length} awaiting feedback</p><button type="button" className="btn primary" onClick={() => fb.openFeedbackImport()}><FileInput size={16} /> Import feedback</button></div>
      <div className="toolbar"><input className="search" aria-label="Search attempts" placeholder="Search your attempts" value={search} onChange={(event) => setSearch(event.target.value)} /><FilterMenu label="Attempt status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All attempts' }, { value: 'pending', label: 'Awaiting feedback' }, { value: 'assessed', label: 'With feedback' }, { value: 'rewrite', label: 'Rewrites & retakes' }]} /></div>
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
                      <button className="btn line" type="button" disabled={Boolean(openingId)} onClick={() => openHistory(session, true)}>
                        <RotateCcw size={15} /> {openingId === session.id ? 'Opening...' : 'Continue'}
                      </button>
                      {!session.assessmentId ? <>
                        <button className="btn line" type="button" onClick={() => exportRequest(session, true)}><Copy size={15} /> Copy request</button>
                        <button className="btn line" type="button" onClick={() => exportRequest(session)}><Download size={15} /> Download</button>
                        <button className="btn line" type="button" onClick={() => fb.openFeedbackImport()}><FileInput size={15} /> Add feedback</button>
                      </> : null}
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
              message={allSessions.length ? 'No attempts match your filters.' : speaking ? 'No speaking attempts yet.' : 'No essays yet.'}
              label={allSessions.length ? 'Clear filters' : speaking ? 'Practise' : 'Write one'}
              onAction={() => { if (allSessions.length) { setSearch(''); setFilter('all'); } else navigate(speaking ? '/speak' : '/write'); }}
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
                    {isBandScore(assessment.overall) ? (
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
            <Empty message="No feedback yet." label="Import feedback" onAction={() => fb.openFeedbackImport()} />
          )}
        </div>
      </div>
      <div className="section-head">
        <div>
          <h3>Mistakes</h3>
          <p>
            {speaking
              ? 'Tags such as FC-HES, FC-DEV, LR-COL, and GRA-TENSE.'
              : 'Your next opportunities to improve.'}
          </p>
        </div>
        <button
          type="button"
          className="btn text"
          onClick={async () => {
            const draft = structuredClone(fb.stateRef.current);
            if (fb.completeReview(draft) && await fb.persistNow(draft)) fb.toast('Review done.');
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
                  {error.sourceSessionId && fb.state.sessions.some((session) => session.id === error.sourceSessionId) ? <button className="btn primary" type="button" onClick={() => fb.startTargetedPractice(fb.state.sessions.find((session) => session.id === error.sourceSessionId), error.id)}>Practise this <ArrowUpRight size={15} /></button> : null}
                  <button
                    className="btn line"
                    type="button"
                    onClick={async () => {
                      const draft = structuredClone(fb.stateRef.current);
                      const item = draft.errors.find((e) => e.id === error.id);
                      if (!item) return;
                      const session =
                        item.sourceSessionId && draft.sessions.find((entry) => entry.id === item.sourceSessionId);
                      fb.reviewError(draft, item.id);
                      const saved = await fb.persistNow(draft);
                      if (!saved) return;
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
                    {error.resolved ? 'Reopen' : 'Mark corrected myself'}
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
