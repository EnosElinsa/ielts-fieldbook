// @ts-nocheck
import { PanelLoadingState } from '../../components/AsyncState';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, Clock3 } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { dateKey } from '../../domain';
import { nextUnifiedPlan, selectedStudySkills, compareStudyPlans, studyBudget, planSkill, planMinutesLabel, upcomingReviewTime } from '../../lib/planTemplates';
import { studyPlanTitle, studyTargetSummary } from '../../lib/planTargets';
import { examSessionUrl, unfinishedExamSession } from '../../domain/exam/sessions';
import { withExamReturn } from '../../lib/examNavigation';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { TaskStartButton, useStudySchedule } from '../planning/StudySchedule';
import { ScheduleChanges } from '../planning/ScheduleChanges';
import { needsStudySetup, StudySetup } from './StudySetup';
import { accountId } from '../../storage/remote';
import '../../styles/planning.css';
import { rememberVocabularyPosition, useVocabularyPosition } from '../vocabulary/vocabularyNavigation';
import { planningEvidenceView } from '../../domain/planningEvidence';
import { LearningTaskDetails } from '../planning/LearningTaskDetails';
import { formatDateKey, plural } from '../../lib/format';
import { useExamCatalog } from '../exam/useExamCatalog';

export function TodayPage() {
  return <AccountDataBoundary modules={['planning','vocabularyCore']} vocabularyEntryIds={[]} variant="today" title="Today" area="study plan"><UnifiedToday /></AccountDataBoundary>;
}

const taskStatuses = { pending: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };
const examAttemptAnchor = attemptId => `exam-attempt-${attemptId}`;
const examAttemptHash = attemptId => `#${encodeURIComponent(examAttemptAnchor(attemptId))}`;

function canOpenTodayTask(plan) {
  return plan.status === 'pending' || plan.status === 'in_progress' ||
    (plan.status === 'completed' && Boolean(plan.linkedSessionId) &&
      (plan.kind === 'vocabulary' || ['reading', 'listening'].includes(planSkill(plan))));
}

function UnifiedToday() {
  const fb=useFieldbook();const schedule=useStudySchedule();const now=schedule.now || new Date();const today=dateKey(now);
  const location=useLocation();useVocabularyPosition(location.pathname+location.search+location.hash,!schedule.saving);
  const plans=(fb.state.plans || []).filter(plan=>!plan.onHold&&!plan.archivedAt);const todays=plans.filter(plan=>plan.dateKey===today).sort(compareStudyPlans);
  const active=plans.find(plan=>plan.id===fb.state.activePlanId&&plan.status==='in_progress'&&plan.dateKey<=today);
  const next=active || nextUnifiedPlan(todays,now);
  const laterToday=todays.some(plan=>upcomingReviewTime(plan,now));
  const examAttempts = planningEvidenceView(fb.state).examAttempts || [];
  const returnedAttempt = examAttempts.find(attempt => attempt.status !== 'discarded' && location.hash === examAttemptHash(attempt.id));
  const currentAttempt = returnedAttempt || examAttempts.filter(attempt =>
    unfinishedExamSession(attempt) && (!attempt.planId || !plans.some(plan => plan.id === attempt.planId && ['pending','in_progress'].includes(plan.status)))
  ).sort((a,b) => String(b.updatedAt || b.startedAt).localeCompare(String(a.updatedAt || a.startedAt)))[0];
  const returnedAttemptId = returnedAttempt?.id;
  const restoredExamEntry = useRef('');
  useEffect(() => {
    if (schedule.saving || !returnedAttemptId || restoredExamEntry.current === location.key) return;
    // A direct URL or a saved session can return without an owned browser entry.
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(examAttemptAnchor(returnedAttemptId));
      if (!card) return;
      restoredExamEntry.current = location.key;
      if (!card.contains(document.activeElement)) {
        card.scrollIntoView?.({block:'nearest'});
        card.focus({preventScroll:true});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, returnedAttemptId, schedule.saving]);
  const done=todays.filter(plan=>plan.status==='completed');
  const overdue=plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status));
  const previous=overdue.filter(plan=>plan.id!==next?.id).sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id));
  const returnTarget=plans.find(plan=>location.hash===`#task-${plan.id}`&&plan.dateKey<today&&plan.id!==next?.id);
  const visiblePrevious=[...(returnTarget?[returnTarget]:[]),...previous.filter(plan=>plan.id!==returnTarget?.id)].slice(0,3);
  const skills=[...selectedStudySkills(fb.state.settings),'vocabulary'];
  const budget=studyBudget(fb.state.settings,today).daily;const planned=todays.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
  const upcoming=plans.filter(plan=>plan.dateKey>today&&plan.status==='pending').sort((a,b)=>a.dateKey.localeCompare(b.dateKey))[0];
  const setup=needsStudySetup(fb.state);const counted=todays.filter(plan=>plan.status!=='skipped');
  const doneMinutes=done.reduce((total,plan)=>total+Number(plan.estimatedMinutes||0),0);
  const summarySkills=skills.filter(skill=>counted.some(plan=>planSkill(plan)===skill));
  return <section className="view active study-today">
    <header className="study-page-head"><div><p className="kicker">{now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p><h2>Today</h2></div><Link className="btn line" to="/planning"><CalendarDays size={16}/>Planning</Link></header>
    {setup && <StudySetup key={accountId()} />}
    {schedule.error && <div className="study-alert" role="alert"><span>{schedule.error}</span><button type="button" className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    <ScheduleChanges changes={schedule.changes} />
    <div className={`study-today-main${setup?' is-setup':''}`}>
      <section id={next ? `task-${next.id}` : undefined} tabIndex={-1} className="study-next" aria-busy={schedule.saving} data-plan-id={next?.id}>
        <p className="kicker">{next?.dateKey<today?'Overdue · In progress':next?.status==='in_progress'?'In progress':next?'Next task':"Today's plan"}</p>
        {!next&&schedule.saving?<PanelLoadingState variant="document" message="Preparing your plan…"/>:<h3>{(next ? studyPlanTitle(next) : '') || (schedule.error?'Plan unavailable':laterToday?'Reviews available later today':budget===0?'Rest day':done.length?'Today is complete':'No tasks planned yet')}</h3>}
        {next&&<p>{studyTargetSummary(next)}</p>}
        {next ? <><div className="study-task-meta"><span className={`study-skill study-skill-${planSkill(next)}`}>{planSkill(next)}</span><span><Clock3 size={15}/>{planMinutesLabel(next)}</span>{next.dateKey<today&&<span>Due {formatDateKey(next.dateKey)}</span>}</div><LearningTaskDetails plan={next} batchSize={fb.state.settings.vocabulary?.learningBatchSize||10}/><p>{next.description}</p><p className="study-completion-condition">{next.completion?.description}</p><TaskStartButton key={next.id} plan={next} now={now}/></> : <>{budget===0&&<p>Rest day. You can still add a task in Planning.</p>}{upcoming&&<p>Next study day: {new Date(`${upcoming.dateKey}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</p>}<Link className="btn line" to="/planning">Open plan <ArrowRight size={16}/></Link></>}
      </section>
      {!setup&&<section className="study-summary">
        <div className="study-summary-heading">
          <h3>Completed today</h3>
          <p className="study-summary-total"><strong>{done.length}/{counted.length}</strong> <span>{counted.length===1?'task':'tasks'} done</span></p>
        </div>
        <progress className="study-summary-progress" aria-label="Tasks completed today" value={done.length} max={Math.max(1,counted.length)}/>
        <p className="study-summary-minutes">Estimated work completed: {doneMinutes} of {planned} min · {budget} min budget{planned>budget&&<span className="study-over-budget"> · {planned-budget} min over budget</span>}</p>
        {summarySkills.length>0&&<details className="study-summary-skills">
          <summary>By skill</summary>
          <ul>{summarySkills.map(skill=>{
            const skillDone = done.filter(plan=>planSkill(plan)===skill).length;
            return <li key={skill}><span className={`study-skill study-skill-${skill}`}>{skill}</span><span>{skillDone>0&&<Check size={15} aria-hidden="true"/>}{skillDone} done</span></li>;
          })}</ul>
        </details>}
        {overdue.length>0&&<Link className="study-overdue-link" to="/planning?view=waiting">{overdue.length} overdue {overdue.length===1?'task':'tasks'} <ArrowRight size={15}/></Link>}
      </section>}
    </div>
    {todays.length>0&&<section className="study-today-list">
      <h3>Today's tasks</h3>
      {todays.map(plan=>{
        const current = plan.id === next?.id;
        const title = studyPlanTitle(plan);
        return <div id={current ? undefined : `task-${plan.id}`} tabIndex={-1} className={`study-work-row${current?' is-current':''}`} key={plan.id} data-plan-id={plan.id}>
          <span className={`study-status-dot ${plan.status}`} aria-hidden="true"/>
          <div className="study-work-name">
            <strong>{title}</strong>
            <small><span>{planMinutesLabel(plan)}</span><span>{current&&plan.status==='pending' ? 'Up next' : taskStatuses[plan.status] || plan.status}</span></small>
          </div>
          {!current&&canOpenTodayTask(plan)&&<TaskStartButton plan={plan} emphasis={false} taskLabel={title} now={now}/>}
        </div>;
      })}
    </section>}
    {(visiblePrevious.length>0||currentAttempt)&&<section className="study-previous" aria-labelledby="study-previous-heading">
      <header className="study-previous-head">
        <h3 id="study-previous-heading">{currentAttempt?.status==='completed'&&visiblePrevious.length===0?'Previous tasks':'Continue previous tasks'}</h3>
        {previous.length>3&&<Link className="btn line study-backlog-link" to="/planning?view=waiting">View all {previous.length} waiting tasks <ArrowRight size={16} aria-hidden="true"/></Link>}
      </header>
      <div className="study-task-list">{visiblePrevious.map(plan=><article id={`task-${plan.id}`} tabIndex={-1} className={`study-task ${plan.status}`} key={plan.id} data-plan-id={plan.id}><div className="study-task-meta"><span className={`study-skill study-skill-${planSkill(plan)}`}>{planSkill(plan)}</span><span>Due {formatDateKey(plan.dateKey)}</span><span><Clock3 size={14}/>{planMinutesLabel(plan)}</span></div><h4>{studyPlanTitle(plan)}</h4><p>{studyTargetSummary(plan)}</p><LearningTaskDetails plan={plan} batchSize={fb.state.settings.vocabulary?.learningBatchSize||10}/><p>{plan.description}</p><small className="study-completion-condition">{plan.completion?.description}</small><footer><span className="study-task-status">{taskStatuses[plan.status] || plan.status}</span>{canOpenTodayTask(plan)&&<TaskStartButton plan={plan} emphasis={false} now={now}/>}</footer></article>)}
        {currentAttempt&&<ResumeExamCard attempt={currentAttempt} primary={!next&&visiblePrevious.length===0}/>}
      </div>
    </section>}
  </section>;
}

function ResumeExamCard({attempt,primary}) {
  const location = useLocation();
  const navigate = useNavigate();
  const {catalog}=useExamCatalog(attempt.skill);
  const completed = attempt.status === 'completed';
  const mock=attempt.mode==='mock';
  const section=mock?null:catalog.sections.find(row=>row.id===attempt.sectionIds?.[0]);
  const paper=catalog.papers.find(row=>row.id===(mock?attempt.sourceId:section?.paperId));
  const material=paper&&(mock||section)?`Cambridge ${paper.book} · Test ${paper.test}${mock?' mock':` · ${attempt.skill==='reading'?'Passage':'Part'} ${section.part}`}`:`${attempt.skill} ${mock?'mock':'practice'}`;
  const limit=Number(attempt.timeLimitSeconds)||0;
  const answered=Object.values(attempt.responses||{}).filter(value=>Array.isArray(value)?value.length>0:String(value??'').trim()!=='').length;
  const saved=attempt.updatedAt||attempt.startedAt;
  const showClock = !completed && mock && limit > 0;
  const meta = completed ? 'Completed' : showClock ? `${Math.max(0,Math.ceil((limit-(Number(attempt.elapsedSeconds)||0))/60))} min left` : `${saved?`Saved ${formatDateKey(dateKey(new Date(saved)))} · `:''}${plural(answered,'answer')}`;
  const anchor = examAttemptAnchor(attempt.id);
  const currentUrl = location.pathname + location.search + location.hash;
  const origin = location.pathname + location.search + examAttemptHash(attempt.id);
  const to = withExamReturn(examSessionUrl(attempt), origin);

  function openAttempt(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    const owner = accountId();
    const { idx: index, key } = window.history.state || {};
    navigateWithPracticeGuard(to, () => {
      if (accountId() !== owner || window.history.state?.idx !== index || window.history.state?.key !== key) return;
      rememberVocabularyPosition(currentUrl, anchor);
      rememberVocabularyPosition(origin, anchor);
      if (origin !== currentUrl) navigate(origin, { replace: true, state: location.state });
      navigate(to, { state: { examReturn: { owner, url: origin, sourceUrl: origin, index } } });
    });
  }

  return <article id={anchor} tabIndex={-1} className={`study-task ${completed?'completed':'in_progress'}`} data-attempt-id={attempt.id}>
    <div className="study-task-meta"><span className={`study-skill study-skill-${attempt.skill}`}>{attempt.skill}</span><span>{showClock&&<Clock3 size={14} aria-hidden="true"/>}{meta}</span></div>
    <h4>{completed?'Review':'Resume'} {material}</h4>
    <footer><Link className={`btn ${primary&&!completed?'primary':'line'}`} to={to} data-practice-navigation onClick={openAttempt}>{completed?'View result':'Resume'} <ArrowRight size={16} aria-hidden="true"/></Link></footer>
  </article>;
}
