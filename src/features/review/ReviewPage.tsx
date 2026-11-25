// @ts-nocheck
import { useWorkspacePageState } from '../../lib/workspacePageState';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, Download, FileInput, ArrowRight, RotateCcw, MoreHorizontal, FileText, Check } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import { isBandScore } from '../../domain';
import { completePlan, errorReviewSatisfied, pendingErrorReviewIds } from '../../domain/plans';
import { attemptLabel, displayName, formatDate, plural, sessionSkill } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';
import { exportAttemptRequest } from './assessmentRequest';

const byNewest = (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
const bandLabel = (assessment) => (assessment && isBandScore(assessment.overall) ? `Band ${Number(assessment.overall).toFixed(1)}` : 'Feedback');

function MoreMenu({ label, children }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><button type="button" className="btn line review-more" aria-label={label}><MoreHorizontal size={18} aria-hidden="true" /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content review-actions-menu" align="end" sideOffset={6} collisionPadding={12}>{children}</DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function ReviewPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedSkill = params.get('skill');
  const reviewSkill = ['writing', 'speaking', 'reading', 'listening'].includes(requestedSkill) ? requestedSkill : fb.activeSkill;
  const [filter, setFilter] = useWorkspacePageState(`review:${reviewSkill}:filter`, 'all', value => ['all', 'pending', 'assessed', 'rewrite'].includes(value));
  const [search, setSearch] = useWorkspacePageState(`review:${reviewSkill}:search`, '');
  const [openingId, setOpeningId] = useState(null);
  const [reviewNotice, setReviewNotice] = useState('');
  if (reviewSkill === 'reading' || reviewSkill === 'listening') return <Navigate to={`/${reviewSkill}/review`} replace />;
  const speaking = reviewSkill === 'speaking';
  const query = search.trim().toLowerCase();
  const allSessions = fb.state.sessions.filter((s) => sessionSkill(s) === reviewSkill);
  const assessmentFor = (session) => (session.assessmentId && fb.state.assessments.find((item) => item.id === session.assessmentId))
    || fb.state.assessments.filter((item) => item.sessionId === session.id).sort(byNewest)[0]
    || (session.assessmentId ? { id: session.assessmentId } : null);
  const sessions = allSessions.filter((session) => (filter === 'all' || (filter === 'pending' && !assessmentFor(session)) || (filter === 'assessed' && assessmentFor(session)) || (filter === 'rewrite' && session.parentSessionId)) && `${session.name} ${displayName(session.name)} ${session.focus || ''}`.toLowerCase().includes(query)).sort(byNewest);
  const assessments = fb.state.assessments.filter((assessment) => {
    if (assessment && assessment.skill === 'speaking') return speaking;
    const sess = assessment?.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
    if (sess) return sessionSkill(sess) === reviewSkill;
    return !speaking;
  });
  const shownIds = new Set(allSessions.map((session) => assessmentFor(session)?.id).filter(Boolean));
  const others = (filter === 'all' || filter === 'assessed')
    ? assessments.filter((assessment) => !shownIds.has(assessment.id)).map((assessment) => ({ assessment, session: assessment.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null }))
      .filter(({ assessment, session }) => `${session ? `${session.name} ${displayName(session.name)}` : ''} ${assessment.task || ''} ${assessment.nextExercise || ''}`.toLowerCase().includes(query))
      .sort((a, b) => byNewest(a.assessment, b.assessment))
    : [];
  const awaiting = allSessions.filter((session) => !assessmentFor(session)).length;

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

  /** Complete every bound mistake task whose exact mistakes are now reviewed or fixed. */
  const finishReviewTasks = (draft) => {
    const finished = (draft.plans || []).filter((plan) => plan.kind === 'review' && plan.status === 'in_progress' && plan.target?.type === 'error-review' && errorReviewSatisfied(draft, plan));
    finished.forEach((plan) => completePlan(draft, plan.id, { planId: plan.id }));
    return finished.map((plan) => plan.id);
  };
  const CONFLICT = /changed on another device|baseline conflict|refresh.*preview/i;
  /**
   * Apply a review change, save it, and undo exactly what was applied if the save fails.
   * A schedule conflict is refreshed and applied once more to the latest schedule.
   */
  const commitReview = async (mutate) => {
    const owner = accountId();
    setReviewNotice('');
    for (let round = 0; round < 2; round += 1) {
      const prior = fb.stateRef.current;
      const draft = structuredClone(prior);
      const outcome = mutate(draft);
      if (!outcome) return null;
      let feedback = '';
      const saved = await fb.persistNow(draft, { collections: outcome.completed.length ? ['errors', 'plans', 'profile'] : outcome.collections, onError: (message) => { feedback = message; } });
      if (accountId() !== owner) return false;
      if (saved) return outcome;
      const live = fb.stateRef.current;
      const restored = {
        ...live,
        errors: (live.errors || []).map((row) => outcome.errorIds.includes(row.id) ? (prior.errors || []).find((item) => item.id === row.id) || row : row),
        plans: (live.plans || []).map((row) => outcome.completed.includes(row.id) ? (prior.plans || []).find((item) => item.id === row.id) || row : row),
        activePlanId: outcome.completed.length && live.activePlanId === null ? prior.activePlanId : live.activePlanId,
      };
      fb.stateRef.current = restored; fb.setState(restored);
      if (round === 0 && CONFLICT.test(feedback)) {
        try { await fb.refreshPlanningState(); if (accountId() !== owner) return false; continue; } catch { /* Report the original failure. */ }
      }
      setReviewNotice(`${feedback || 'Could not save this review.'} Your task is still open; try again.`);
      return false;
    }
    return false;
  };

  const reviewOnce = async (error) => {
    const saved = await commitReview((draft) => {
      const item = draft.errors.find((e) => e.id === error.id);
      if (!item) return null;
      fb.reviewError(draft, item.id);
      return { errorIds: [item.id], collections: ['errors'], completed: finishReviewTasks(draft) };
    });
    if (!saved) return;
    if (saved.completed.length) fb.toast('Review task complete.');
    const session = error.sourceSessionId && fb.stateRef.current.sessions.find((entry) => entry.id === error.sourceSessionId);
    if (!session) {
      fb.toast('No matching attempt. The review was still saved.');
      return;
    }
    if (session.assessmentId) navigate(`/review/${session.assessmentId}`);
    else openHistory(session, false);
    fb.toast('Review saved.');
  };

  const toggleResolved = async (error) => {
    const saved = await commitReview((draft) => {
      fb.resolveError(draft, error.id, !error.resolved);
      return { errorIds: [error.id], collections: ['errors'], completed: finishReviewTasks(draft) };
    });
    if (saved && saved.completed.length) fb.toast('Review task complete.');
  };

  const markReviewDone = async () => {
    let missing = '';
    const saved = await commitReview((draft) => {
      const completed = fb.completeReview(draft);
      if (!completed) {
        const open = (draft.plans || []).find((plan) => plan.kind === 'review' && plan.status === 'in_progress' && plan.target?.type === 'error-review');
        const waiting = open ? pendingErrorReviewIds(draft, open).length : 0;
        missing = open ? `Review or mark corrected ${plural(waiting || open.target.errorIds.length, 'targeted mistake')} before finishing this task.` : 'There is no review task in progress.';
        return null;
      }
      return { errorIds: [], collections: ['plans', 'profile'], completed: [completed.id] };
    });
    if (saved) fb.toast('Review done.');
    else if (missing) setReviewNotice(missing);
  };

  const feedbackRow = (key, assessment, title, meta, pill, actions) => (
    <li className="review-row" key={key}>
      <div className="review-row-main">
        <div className="review-row-title"><h3>{title}</h3>{pill}</div>
        <small>{meta}</small>
      </div>
      {assessment ? <Link className="review-band" to={`/review/${assessment.id}`} aria-label={`${bandLabel(assessment)}: open the score report for ${title}`}>{bandLabel(assessment)}</Link> : <span className="review-awaiting">Awaiting feedback</span>}
      <div className="review-row-actions">{actions}</div>
    </li>
  );

  return (
    <section className="view active review-page">
      <div className="page-tools"><p>{plural(allSessions.length, 'attempt')} · {awaiting} awaiting feedback</p><button type="button" className="btn primary" onClick={() => fb.openFeedbackImport()}><FileInput size={16} /> Import feedback</button></div>
      <div className="toolbar"><input className="search" aria-label="Search attempts" placeholder="Search your attempts" value={search} onChange={(event) => setSearch(event.target.value)} /><FilterMenu label="Attempt status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All attempts' }, { value: 'pending', label: 'Awaiting feedback' }, { value: 'assessed', label: 'With feedback' }, { value: 'rewrite', label: 'Rewrites & retakes' }]} /></div>
      <h2 className="block-title">Attempts</h2>
      {sessions.length ? (
        <ul className="review-list review-attempts">
          {sessions.map((session) => {
            const name = displayName(session.name);
            const assessment = assessmentFor(session);
            const meta = <>{formatDate(session.date)} · {plural(session.words, 'word')}{session.focus ? ` · Focus: ${session.focus}` : ''}{session.next ? ` · Next: ${session.next}` : ''}</>;
            const pill = <span className={`pill${session.attemptKind === 'rewrite' ? ' blue' : ''}`}>{attemptLabel(session)}</span>;
            return feedbackRow(session.id, assessment, name, meta, pill, <>
              {assessment
                ? <Link className="btn primary" to={`/review/${assessment.id}`}>Open feedback <ArrowRight size={15} aria-hidden="true" /></Link>
                : <button className="btn primary" type="button" onClick={() => exportRequest(session, true)}><Copy size={15} aria-hidden="true" /> Copy feedback request</button>}
              <MoreMenu label={`More actions for ${name}`}>
                <DropdownMenu.Item className="dropdown-item" onSelect={() => openHistory(session, false)}><FileText size={16} aria-hidden="true" />{speaking ? 'Transcript' : 'Essay'}</DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" disabled={Boolean(openingId)} onSelect={() => void openHistory(session, true)}><RotateCcw size={16} aria-hidden="true" />{openingId === session.id ? 'Opening...' : 'Continue'}</DropdownMenu.Item>
                {!assessment ? <>
                  <DropdownMenu.Separator className="dropdown-separator" />
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => void exportRequest(session)}><Download size={16} aria-hidden="true" />Download request</DropdownMenu.Item>
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => fb.openFeedbackImport()}><FileInput size={16} aria-hidden="true" />Add feedback</DropdownMenu.Item>
                </> : null}
              </MoreMenu>
            </>);
          })}
        </ul>
      ) : (
        <Empty
          message={allSessions.length ? 'No attempts match your filters.' : speaking ? 'No speaking attempts yet.' : 'No essays yet.'}
          label={allSessions.length ? 'Clear filters' : speaking ? 'Practise' : 'Write one'}
          onAction={() => { if (allSessions.length) { setSearch(''); setFilter('all'); } else navigate(speaking ? '/speak' : '/write'); }}
        />
      )}
      {others.length ? <>
        <h2 className="block-title review-unlinked-title">{others.some(({ session }) => session) ? 'Other feedback' : 'Feedback without a saved attempt'}</h2>
        <ul className="review-list review-unlinked">
          {others.map(({ assessment, session }) => feedbackRow(
            assessment.id,
            assessment,
            session ? displayName(session.name) : assessment.task || (speaking ? 'Speaking feedback' : 'Writing feedback'),
            <>{formatDate(assessment.date)} · {session ? 'Earlier feedback on this attempt' : `No saved ${speaking ? 'transcript' : 'essay'}`}</>,
            null,
            <Link className="btn primary" to={`/review/${assessment.id}`}>Open feedback <ArrowRight size={15} aria-hidden="true" /></Link>,
          ))}
        </ul>
      </> : null}
      <div className="section-head">
        <div>
          <h2>Mistakes</h2>
          <p>Corrections from your feedback. Practise each one until it sticks.</p>
        </div>
        <button
          type="button"
          className="btn text"
          onClick={() => void markReviewDone()}
        >
          Mark review done
        </button>
      </div>
      {reviewNotice ? <p className="save-failure" role="alert">{reviewNotice}</p> : null}
      {errors.length ? (
        <ul className="review-list review-mistakes">
          {errors
            .slice()
            .sort(byNewest)
            .map((error) => {
              const source = error.sourceSessionId ? fb.state.sessions.find((session) => session.id === error.sourceSessionId) : null;
              const showNext = error.next && !String(error.text || '').includes(error.next);
              return (
                <li className="review-row review-mistake" key={error.id}>
                  <div className="review-row-main">
                    <p><span className="error-code">{error.code}</span> · {error.text}</p>
                    {showNext ? <p className="review-mistake-next">Next: {error.next}</p> : null}
                    <small>
                      <span className={`pill ${error.resolved ? 'green' : 'red'}`}>{error.resolved ? 'Fixed' : `Reviewed ${error.reviewCount || 0}`}</span>
                      {formatDate(error.date || new Date())}{source ? ` · ${displayName(source.name)}` : ''}
                    </small>
                  </div>
                  <div className="review-row-actions">
                    {source ? <button className="btn primary" type="button" onClick={() => fb.startTargetedPractice(source, error.id)}>Practise this <ArrowRight size={15} aria-hidden="true" /></button> : null}
                    <MoreMenu label={`More actions for ${error.code}`}>
                      <DropdownMenu.Item className="dropdown-item" onSelect={() => void reviewOnce(error)}><RotateCcw size={16} aria-hidden="true" />Review once</DropdownMenu.Item>
                      <DropdownMenu.Item className="dropdown-item" onSelect={() => toggleResolved(error)}><Check size={16} aria-hidden="true" />{error.resolved ? 'Reopen' : 'Mark corrected myself'}</DropdownMenu.Item>
                    </MoreMenu>
                  </div>
                </li>
              );
            })}
        </ul>
      ) : (
        <Empty message="No mistakes saved yet. After you import a score, the corrections show up here." />
      )}
    </section>
  );
}
