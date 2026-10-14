import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CheckCheck, Clock3, Target, RotateCcw } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { dueIntensive, examStats } from '../../domain/exam';
import type { ExamAttempt, ExamSkill, IntensiveSession, QuestionType } from '../../domain/exam/types';
import { QUESTION_TYPE_NAMES, examClock } from './useExamCatalog';
import { Empty } from '../../components/ui';
import { activityBuckets, activityInRange } from '../progress/practiceActivity';

const percent = (earned: number, total: number) => total > 0 ? `${Math.round(earned / total * 100)}%` : '—';
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function ExamProgressPanel({ skill, since = 0 }: { skill: ExamSkill; since?: number }) {
  const fb = useFieldbook();
  const [mode, setMode] = useState<'all' | 'practice' | 'mock'>('practice');
  const [support, setSupport] = useState<'all' | 'unassisted' | 'supported'>('unassisted');
  const now = new Date();
  const attempts = ((fb.state.examAttempts || []) as ExamAttempt[]).filter(attempt => attempt.skill === skill && (mode === 'all' || attempt.mode === mode) && (support === 'all' || (support === 'supported') === Boolean(attempt.answerRevealed)) && activityInRange(attempt.completedAt || attempt.startedAt, since, now));
  const completed = attempts.filter(attempt => attempt.status === 'completed').sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const stats = examStats(completed);
  const intensive = ((fb.state.intensiveSessions || []) as IntensiveSession[]).filter(session => activityInRange(session.completedAt || session.updatedAt, since, now));
  const due = dueIntensive((fb.state.intensiveSessions || []) as IntensiveSession[]);
  const minutes = Math.round(completed.reduce((sum, attempt) => sum + (attempt.elapsedSeconds || 0), 0) / 60);
  const wrong = completed.filter(attempt => Object.values(attempt.results || {}).some(correct => !correct));
  const typeRows = Object.entries(stats.byType).sort((left, right) => left[1].correct / left[1].total - right[1].correct / right[1].total);
  const activity = activityBuckets(completed.map(attempt => attempt.completedAt || attempt.startedAt), since, now);
  const weeks = activity.buckets.map(bucket => ({ ...bucket, stats: examStats(completed.filter(attempt => activityInRange(attempt.completedAt || attempt.startedAt, bucket.start, new Date(bucket.end)))) }));
  const statusNames: Record<string, string> = { pending: 'Not started', in_progress: 'In progress', completed: 'Completed' };
  const plans = ((fb.state.plans || []) as { id: string; kind: string; dateKey: string; title: string; status: string }[]).filter(plan => String(plan.kind).startsWith(`${skill}-`) && activityInRange(plan.dateKey, since, now));
  return <div className="exam-progress-panel">
    <div className="section-head"><div><h2>{skill === 'reading' ? 'Reading' : 'Listening'} accuracy</h2><p>Accuracy, study time and results by question type.</p></div><div className="page-tools"><label className="exam-eyebrow" htmlFor="exam-progress-mode">View</label><select id="exam-progress-mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="practice">Practice only</option><option value="mock">Mocks only</option><option value="all">All attempts</option></select><label className="exam-eyebrow" htmlFor="exam-progress-support">Answer support</label><select id="exam-progress-support" value={support} onChange={event => setSupport(event.target.value as typeof support)}><option value="unassisted">Unassisted</option><option value="supported">Answers checked</option><option value="all">Any support</option></select><Link className="btn line" to={`/${skill}`}>Open {skill} bank →</Link></div></div>
    <div className="progress-metrics">{[
      { label: 'Completed attempts', value: stats.completed, icon: CheckCheck },
      { label: 'Marks earned', value: `${stats.correct} / ${stats.total}`, icon: Target },
      { label: 'Practice minutes', value: minutes, icon: Clock3 },
      { label: 'Retries', value: completed.filter(attempt => attempt.retryOfAttemptId).length, icon: RotateCcw },
    ].map(({ label, value, icon: Icon }) => <div className="progress-metric" key={label}><Icon size={18} /><strong>{value}</strong><span>{label}</span></div>)}</div>
    <section className="progress-score-section"><h3>Accuracy by question type</h3>{typeRows.length ? <div className="progress-score-table"><table><thead><tr><th>Question type</th><th>Marks</th><th>Accuracy</th></tr></thead><tbody>{typeRows.map(([type, row]) => <tr key={type}><td>{QUESTION_TYPE_NAMES[type as QuestionType] || type}</td><td>{row.correct} / {row.total}</td><td>{percent(row.correct, row.total)}</td></tr>)}</tbody></table></div> : <Empty message="Complete a part to see which question types need work." />}
      <p className="rule-note">Pooled multiple-choice questions contribute their individual marks. Supported practice and mocks are recorded separately below.</p>
    </section>
    <div className="evidence-grid"><section className="progress-section"><h3>{activity.period} accuracy</h3><div className="week-bars">{weeks.map(week => <div className="week-bar" key={week.start}><span>{week.label}</span><div className="track"><div className="fill" style={{ width: `${week.stats.accuracy * 100}%` }} /></div><strong>{week.stats.total ? `${week.stats.correct}/${week.stats.total}` : '—'}</strong></div>)}</div><p className="rule-note">Marks earned / available in the selected range.</p></section>
      <section className="progress-section"><h3>Error reasons</h3>{Object.keys(stats.errors).length ? <div className="band-list">{Object.entries(stats.errors).sort((left, right) => right[1] - left[1]).map(([reason, count]) => <div className="band-row" key={reason}><span>{reason}</span><strong>{count}</strong></div>)}</div> : <p className="empty">Tag your mistakes during review to see recurring causes.</p>}{wrong.length > 0 && <Link className="btn line" to={`/${skill}/review/${wrong[wrong.length - 1].id}`}>Review recent mistakes →</Link>}</section></div>
    <section className="progress-section"><h3>Attempt history</h3>{completed.length ? <div className="progress-score-table"><table><thead><tr><th>Date</th><th>Practice</th><th>Marks</th><th>Time</th><th>Review</th></tr></thead><tbody>{completed.slice().reverse().map(attempt => <tr key={attempt.id}><td>{date(attempt.completedAt || attempt.startedAt)}</td><td>{attempt.mode === 'mock' ? 'Full mock' : attempt.retryOfAttemptId ? 'Retry' : 'Part practice'}{attempt.answerRevealed ? ' · supported' : ''}</td><td>{attempt.score || 0} / {attempt.total || 0}</td><td>{examClock(attempt.elapsedSeconds || 0)}</td><td><Link to={`/${skill}/review/${attempt.id}`}>Review attempt</Link></td></tr>)}</tbody></table></div> : <Empty message="No completed attempts in this range." />}</section>
    {skill === 'listening' && <section className="progress-section"><div className="section-head"><h3>Intensive listening</h3><span className="pill blue">{due.length} due</span></div><div className="band-list"><div className="band-row"><span>Sentences completed</span><strong>{intensive.filter(session => session.completedAt).length}</strong></div><div className="band-row"><span>Correct dictations</span><strong>{intensive.filter(session => session.completedAt && session.dictationResult === 'correct').length}</strong></div><div className="band-row"><span>Replays</span><strong>{intensive.reduce((sum, session) => sum + (session.replayCount || 0), 0)}</strong></div></div>{due.slice(0, 5).map(session => <div className="work-row" key={session.id}><div className="work-name">Sentence review<small>{session.sectionId} · {session.dictationResult}</small></div><Link className="btn line" to={`/listening/intensive/${session.sectionId}?sentence=${encodeURIComponent(session.sentenceId)}`}>Recall sentence</Link></div>)}</section>}
    <section className="progress-section"><h3>Study plans</h3>{plans.length ? <div className="plan-list">{plans.slice().sort((left, right) => String(right.dateKey).localeCompare(String(left.dateKey))).map(plan => <div className="work-row" key={plan.id}><div className="work-name">{plan.title}<small>{plan.dateKey}</small></div><span className={`pill ${plan.status === 'completed' ? 'green' : ''}`}>{statusNames[plan.status] || plan.status}</span></div>)}</div> : <Empty message="No plans in this range." />}</section>
  </div>;
}
