import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import type { ExamAttempt, ExamSkill, IntensiveSession } from '../../domain/exam/types';
import { dueIntensive, examStats } from '../../domain/exam';
import { dayLabel } from '../../lib/format';
import { useExamCatalog } from './useExamCatalog';
import { useAccountRequirements } from '../../components/AccountDataBoundary';

export function ExamTodayPage({ skill }: { skill: ExamSkill }) {
  const fb = useFieldbook();
  const dependencies = useAccountRequirements({modules: ['productive', 'vocabulary']});
  const [plans, setPlans] = useState<Record<string, any>[]>([]);
  useEffect(() => { setPlans(fb.ensurePlansForSkill()); }, [fb.state, skill, dependencies.ready]);
  const { catalog, loading, error, reload } = useExamCatalog(skill);
  const attempts = ((fb.state.examAttempts || []) as ExamAttempt[]).filter(attempt => attempt.skill === skill);
  const recent = attempts.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const active = recent.find(attempt => attempt.status !== 'completed');
  const latestWrong = recent.find(attempt => attempt.status === 'completed' && Object.values(attempt.results || {}).some(correct => !correct));
  const due = skill === 'listening' ? dueIntensive((fb.state.intensiveSessions || []) as IntensiveSession[]) : [];
  const ready = catalog.sections.find(section => section.skill === skill && section.status === 'ready');
  const fullPaper = catalog.papers.find(paper => { const parts = catalog.sections.filter(section => section.paperId === paper.id && section.skill === skill); return parts.length === (skill === 'reading' ? 3 : 4) && parts.every(section => section.status === 'ready'); });
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() || 7) - 1));
  const stats = examStats(attempts.filter(attempt => Date.parse(attempt.completedAt || attempt.startedAt) >= weekStart.getTime()));
  const retryQuery = active?.retryOfAttemptId ? `&retry=${encodeURIComponent(active.retryOfAttemptId)}` : '';
  const recommendation = active ? { title: active.mode === 'mock' ? 'Resume your mock' : 'Resume your part', detail: 'Your answers and timer are saved. Continue the same attempt.', href: active.mode === 'mock' ? `/${skill}/mock/${active.sourceId}?attempt=${active.id}${retryQuery}` : `/${skill}/${active.sectionIds[0]}?attempt=${active.id}${retryQuery}` }
    : due.length ? { title: 'Review due sentence', detail: 'Listen from memory, check the transcript, then shadow and replay blind.', href: `/listening/intensive/${due[0].sectionId}?sentence=${encodeURIComponent(due[0].sentenceId)}` }
    : latestWrong ? { title: 'Review your last mistakes', detail: 'Return to the source evidence, explain the error, then retry with blank answers.', href: `/${skill}/review/${latestWrong.id}` }
    : { title: 'Practise a part', detail: skill === 'reading' ? 'Find the text that supports your answer and check for paraphrases.' : 'Predict the answer form and follow the recording. Review the answer sentence after submitting.', href: ready ? `/${skill}/${ready.id}` : `/${skill}` };
  const nextPlan = plans.find(plan => plan.status === 'in_progress') || plans.find(plan => plan.status === 'pending');
  const label = skill === 'reading' ? 'Reading' : 'Listening';
  return <section className="view active">
    {dependencies.error && <p role="alert">Study plans could not be loaded. <button className="btn text" onClick={dependencies.retry}>Retry</button></p>}
    <div className="lead-grid"><div className="lead"><p className="kicker">{dayLabel(new Date())} · {label}</p><h2>Your {skill} session</h2><p>{recommendation.detail}</p>
      <ol className="session-steps">{(skill === 'reading' ? [
        ['Find the evidence', 'Locate the relevant paragraph and match the question wording to its paraphrase.'],
        ['Submit your answers', 'Note the text that supports your answer and check the word limit.'],
        ['Review and retry', 'Check the correct answer, note why you missed it, and try again.'],
      ] : [
        ['Predict and follow', 'Read the task, predict the answer form and listen for corrections and contrast.'],
        ['Check the answer sentence', 'After submission, connect the question wording to the source sentence.'],
        ['Practise a difficult sentence', 'Listen blind, transcribe, compare, shadow and replay without the transcript.'],
      ]).map(([title, detail], index) => <li className="session-step" key={title}><span className="session-index">{index + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
      <div className="lead-actions"><Link className="btn primary" to={recommendation.href}>{recommendation.title} <ArrowRight size={16} /></Link>{fullPaper && <Link className="btn line" to={`/${skill}/mock/${fullPaper.id}`}>{label} mock</Link>}{skill === 'listening' && ready && !due.length && <Link className="btn line" to={`/listening/intensive/${ready.id}`}>Intensive listening</Link>}</div>
      {loading && <p className="rule-note" role="status">Loading available parts…</p>}{error && <p role="alert" className="rule-note">Available parts could not be loaded. <button className="btn text" onClick={reload}>Retry</button></p>}
    </div><aside className="quiet"><h3>This week</h3><div className="band-list"><div className="band-row"><span>Completed attempts</span><strong>{stats.completed}</strong></div><div className="band-row"><span>Marks earned</span><strong>{stats.correct} / {stats.total}</strong></div><div className="band-row"><span>In progress</span><strong>{attempts.filter(attempt => attempt.status !== 'completed').length}</strong></div>{skill === 'listening' && <div className="band-row"><span>Sentence reviews due</span><strong>{due.length}</strong></div>}</div><p className="rule-note">{fb.state.settings.dailyMinutes} minutes a day · {(fb.state.settings.days || []).length} study days a week</p><Link className="btn line" to={`/progress?category=${skill}`}>View accuracy →</Link><button className="btn text" type="button" onClick={() => fb.openModal('settings')}>Study settings</button></aside></div>
    <div className="section-head"><div><h3>Today’s main task</h3><p>{nextPlan?.description || 'Choose a practice section and review your answers.'}</p></div>{nextPlan && <button className="btn primary" onClick={() => fb.startPlan(nextPlan.id)}>{nextPlan.status === 'in_progress' ? 'Continue plan' : 'Start plan'}</button>}</div>
    <div className="plan-list">{plans.map(plan => <div className="work-row" key={plan.id}><div className="work-name">{plan.title}<small>{plan.dateKey}</small></div>{plan.status === 'completed' ? <span className="pill green">Done</span> : <button className="btn line" onClick={() => fb.startPlan(plan.id)}>{plan.status === 'in_progress' ? 'Continue' : 'Start'}</button>}</div>)}</div>
    {due.length > 0 && <section className="progress-section"><h3>Due sentence reviews</h3>{due.slice(0, 5).map(session => <div className="work-row" key={session.id}><div className="work-name">Recall before revealing<small>{session.sectionId} · last dictation: {session.dictationResult}</small></div><Link className="btn line" to={`/listening/intensive/${session.sectionId}?sentence=${encodeURIComponent(session.sentenceId)}`}>Recall sentence</Link></div>)}</section>}
    <div className="section-head"><h3>Recent {skill} work</h3><Link className="btn text" to={`/${skill}`}>Open bank →</Link></div>{recent.length ? <div className="plan-list">{recent.slice(0, 5).map(attempt => { const query = attempt.retryOfAttemptId ? `&retry=${encodeURIComponent(attempt.retryOfAttemptId)}` : ''; const href = attempt.status === 'completed' ? `/${skill}/review/${attempt.id}` : attempt.mode === 'mock' ? `/${skill}/mock/${attempt.sourceId}?attempt=${attempt.id}${query}` : `/${skill}/${attempt.sectionIds[0]}?attempt=${attempt.id}${query}`; return <div className="work-row" key={attempt.id}><div className="work-name">{attempt.mode === 'mock' ? 'Full mock' : 'Part practice'}<small>{new Date(attempt.updatedAt).toLocaleDateString('en-GB')} · {attempt.status === 'completed' ? `${attempt.score || 0}/${attempt.total || 0} marks` : 'In progress'}</small></div><Link className="btn line" to={href}>{attempt.status === 'completed' ? 'Review' : 'Resume'}</Link></div>; })}</div> : <p className="empty">Your saved attempts will appear here after you start a part.</p>}
  </section>;
}
