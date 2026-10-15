import { Link } from 'react-router-dom';
import type { ExamAttempt } from '../../domain/exam/types';
import { examSessionUrl, unfinishedExamSession } from '../../domain/exam/sessions';

export function ExamSessionHistory({ sessions, currentId }: { sessions: ExamAttempt[]; currentId?: string }) {
  if (!sessions.length) return null;
  return <details className="exam-session-history">
    <summary>{sessions.filter(row => row.status === 'completed').length} completed · {sessions.filter(unfinishedExamSession).length} unfinished sessions{sessions.some(row => row.status === 'discarded') ? ` · ${sessions.filter(row => row.status === 'discarded').length} discarded` : ''}</summary>
    <p>Answers, time and review notes belong to each session. Source annotations are shared with this material.</p>
    <ul>{sessions.map(attempt => <li key={attempt.id}><span>
      <strong>{new Date(attempt.startedAt || attempt.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{attempt.id === currentId ? ' · Current session' : ''}</strong>
      <small>{attempt.status === 'completed' ? `${attempt.score ?? '—'} / ${attempt.total ?? '—'} marks` : attempt.status === 'discarded' ? 'Discarded · no score' : attempt.status === 'paused' ? 'Paused' : 'In progress'}{attempt.retryOfAttemptId ? ' · Wrong-answer retry' : ''}{attempt.planId ? ' · Planned session' : ''}</small>
      {attempt.retryOfAttemptId && <Link to={`/${attempt.skill}/review/${encodeURIComponent(attempt.retryOfAttemptId)}`}>Original session</Link>}
    </span>{attempt.status !== 'discarded' && attempt.id !== currentId && <Link className="btn text" aria-label={`${attempt.status === 'completed' ? 'Review' : 'Resume'} session ${attempt.id}`} to={examSessionUrl(attempt)}>{attempt.status === 'completed' ? 'Review' : 'Resume'}</Link>}</li>)}</ul>
  </details>;
}
