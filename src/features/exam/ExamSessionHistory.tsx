import { Link, useSearchParams } from 'react-router-dom';
import type { ExamAttempt } from '../../domain/exam/types';
import { examSessionUrl, unfinishedExamSession } from '../../domain/exam/sessions';
import { formatCount, formatDateTime, plural } from '../../lib/format';
import { withExamReturn } from '../../lib/examNavigation';

export function ExamSessionHistory({ sessions, currentId }: { sessions: ExamAttempt[]; currentId?: string }) {
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo');
  if (!sessions.length) return null;
  return <details className="exam-session-history">
    <summary>{formatCount(sessions.filter(row => row.status === 'completed').length)} completed · {plural(sessions.filter(unfinishedExamSession).length, 'unfinished session')}{sessions.some(row => row.status === 'discarded') ? ` · ${formatCount(sessions.filter(row => row.status === 'discarded').length)} discarded` : ''}</summary>
    <p>Answers, time and review notes belong to each session. Source annotations are shared with this material.</p>
    <ul>{sessions.map(attempt => <li key={attempt.id}><span>
      <strong>{formatDateTime(attempt.startedAt || attempt.updatedAt)}{attempt.id === currentId ? ' · Current session' : ''}</strong>
      <small>{attempt.status === 'completed' ? `${attempt.score ?? '—'} / ${attempt.total ?? '—'} marks` : attempt.status === 'discarded' ? 'Discarded · no score' : attempt.status === 'paused' ? 'Paused' : 'In progress'}{attempt.retryOfAttemptId ? ' · Wrong-answer retry' : ''}{attempt.planId ? ' · Planned session' : ''}</small>
      {attempt.retryOfAttemptId && <Link to={withExamReturn(`/${attempt.skill}/review/${encodeURIComponent(attempt.retryOfAttemptId)}`, returnTo)}>Original session</Link>}
    </span>{attempt.status !== 'discarded' && attempt.id !== currentId && <Link className="btn text" aria-label={`${attempt.status === 'completed' ? 'Review' : 'Resume'} session ${attempt.id}`} to={withExamReturn(examSessionUrl(attempt), returnTo)}>{attempt.status === 'completed' ? 'Review' : 'Resume'}</Link>}</li>)}</ul>
  </details>;
}
