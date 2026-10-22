// @ts-nocheck
import { PanelLoadingState } from '../../components/AsyncState';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, Clock3 } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { dateKey } from '../../domain';
import { nextUnifiedPlan, selectedStudySkills, compareStudyPlans, studyBudget } from '../../lib/planTemplates';
import { studyPlanTitle, studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from '../planning/StudySchedule';
import { needsStudySetup, StudySetup } from './StudySetup';
import { accountId } from '../../storage/remote';
import '../../styles/planning.css';
import { useVocabularyPosition } from '../vocabulary/vocabularyNavigation';
import { planningEvidenceView } from '../../domain/planningEvidence';
import { LearningTaskDetails } from '../planning/LearningTaskDetails';

export function TodayPage() {
  return <AccountDataBoundary modules={['planning','vocabularyCore']} vocabularyEntryIds={[]}><UnifiedToday /></AccountDataBoundary>;
}

function UnifiedToday() {
  const fb=useFieldbook();const schedule=useStudySchedule();const today=dateKey(new Date());
  const location=useLocation();useVocabularyPosition(location.pathname+location.search+location.hash,!schedule.saving);
  const plans=(fb.state.plans || []).filter(plan=>!plan.onHold&&!plan.archivedAt);const todays=plans.filter(plan=>plan.dateKey===today).sort(compareStudyPlans);
  const active=plans.find(plan=>plan.id===fb.state.activePlanId&&plan.status==='in_progress'&&plan.dateKey<=today);
  const next=active || nextUnifiedPlan(todays);
  const resume=(planningEvidenceView(fb.state).examAttempts||[]).filter(attempt=>['active','paused'].includes(attempt.status)&&(!attempt.planId||!plans.some(plan=>plan.id===attempt.planId&&['pending','in_progress'].includes(plan.status)))).sort((a,b)=>String(b.updatedAt||b.startedAt).localeCompare(String(a.updatedAt||a.startedAt)))[0];
  const resumeParams=new URLSearchParams(resume?{attempt:resume.id}:{});
  if(resume?.retryOfAttemptId)resumeParams.set('retry',resume.retryOfAttemptId);
  if(resume?.planId)resumeParams.set('planId',resume.planId);
  const resumePath=resume?`/${resume.skill}/${resume.mode==='mock'?'mock/':''}${encodeURIComponent(resume.mode==='mock'?resume.sourceId:resume.sectionIds[0])}?${resumeParams}`:null;
  const done=todays.filter(plan=>plan.status==='completed');
  const overdue=plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status));
  const previous=overdue.filter(plan=>plan.id!==next?.id).sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id));
  const returnTarget=plans.find(plan=>location.hash===`#task-${plan.id}`&&plan.dateKey<today&&plan.id!==next?.id);
  const visiblePrevious=[...(returnTarget?[returnTarget]:[]),...previous.filter(plan=>plan.id!==returnTarget?.id)].slice(0,3);
  const skills=[...selectedStudySkills(fb.state.settings),'vocabulary'];
  const budget=studyBudget(fb.state.settings,today).daily;const planned=todays.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
  const upcoming=plans.filter(plan=>plan.dateKey>today&&plan.status==='pending').sort((a,b)=>a.dateKey.localeCompare(b.dateKey))[0];
  return <section className="view active study-today">
    <header className="study-page-head"><div><p className="kicker">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p><h2>Today</h2></div><Link className="btn line" to="/planning"><CalendarDays size={16}/>Planning</Link></header>
    {needsStudySetup(fb.state) && <StudySetup key={accountId()} />}
    {schedule.error && <div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    <div className="study-today-main">
      <section id={next ? `task-${next.id}` : undefined} tabIndex={-1} className="study-next" aria-busy={schedule.saving} data-plan-id={next?.id}>
        <p className="kicker">{next?.dateKey<today?'Overdue · In progress':next?.status==='in_progress'?'In progress':next?'Next task':"Today's plan"}</p>
        {!next&&schedule.saving?<PanelLoadingState variant="document" message="Preparing your plan…"/>:<h3>{(next ? studyPlanTitle(next) : '') || (schedule.error?'Plan unavailable':budget===0?'Rest day':done.length?'Today is complete':'No tasks planned yet')}</h3>}
        {next&&<p>{studyTargetSummary(next)}</p>}
        {next ? <><div className="study-task-meta"><span className={`study-skill study-skill-${next.skill||'writing'}`}>{next.skill || 'Practice'}</span><span><Clock3 size={15}/>{next.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{next.dateKey<today&&<span>Due {next.dateKey}</span>}</div><LearningTaskDetails plan={next} batchSize={fb.state.settings.vocabulary?.learningBatchSize||10}/><p>{next.description}</p><p className="study-completion-condition">{next.completion?.description}</p><TaskStartButton key={next.id} plan={next}/></> : <>{budget===0&&<p>Rest day. You can still add a task in Planning.</p>}{upcoming&&<p>Next study day: {new Date(`${upcoming.dateKey}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</p>}<Link className="btn line" to="/planning">Open plan <ArrowRight size={16}/></Link></>}
      </section>
      <section className="study-summary"><h3>Completed today</h3><p className={planned>budget?'study-over-budget':''}>{planned} / {budget} min planned{planned>budget?` · ${planned-budget} extra minutes`: ''}</p><p className="study-summary-total"><strong>{done.length}</strong><span>of {todays.filter(plan=>plan.status!=='skipped').length} {todays.filter(plan=>plan.status!=='skipped').length===1?'task':'tasks'}</span></p><p>{done.reduce((total,plan)=>total+Number(plan.estimatedMinutes||0),0)} min estimated for completed tasks</p><ul>{skills.map(skill=><li key={skill}><span className={`study-skill study-skill-${skill}`}>{skill}</span><span>{done.filter(plan=>plan.skill===skill).length ? <><Check size={15}/> {done.filter(plan=>plan.skill===skill).length} done</> : '0 done'}</span></li>)}</ul>{overdue.length>0&&<Link className="study-overdue-link" to="/planning#planning-backlog">{overdue.length} overdue {overdue.length===1?'task':'tasks'} <ArrowRight size={15}/></Link>}</section>
    </div>
    {todays.length>0&&<section className="study-today-list"><h3>Today's tasks</h3>{todays.map(plan=><div id={plan.id!==next?.id ? `task-${plan.id}` : undefined} tabIndex={-1} className={`study-work-row${plan.id===next?.id?' is-current':''}`} key={plan.id} data-plan-id={plan.id}><span className={`study-status-dot ${plan.status}`}/><div><strong>{studyPlanTitle(plan)}</strong><small>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min{plan.id===next?.id?' · Shown above':''}</small></div><span>{({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}</span></div>)}</section>}
    {(visiblePrevious.length>0||resume)&&<section className="study-previous" aria-labelledby="study-previous-heading"><h3 id="study-previous-heading">Continue previous tasks</h3>{previous.length>3&&<Link to="/planning#planning-backlog">View all {previous.length} waiting tasks</Link>}<div className="study-task-list">{visiblePrevious.map(plan=><article id={`task-${plan.id}`} tabIndex={-1} className={`study-task ${plan.status}`} key={plan.id} data-plan-id={plan.id}><div className="study-task-meta"><span className={`study-skill study-skill-${plan.skill||'writing'}`}>{plan.skill || 'Practice'}</span><span>Due {plan.dateKey}</span><span><Clock3 size={14}/>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</span></div><h4>{studyPlanTitle(plan)}</h4><p>{studyTargetSummary(plan)}</p><LearningTaskDetails plan={plan} batchSize={fb.state.settings.vocabulary?.learningBatchSize||10}/><p>{plan.description}</p><small className="study-completion-condition">{plan.completion?.description}</small><footer><span className="study-task-status">{plan.status==='completed'?'Completed':plan.status==='in_progress'?'In progress':'Not started'}</span><TaskStartButton plan={plan}/></footer></article>)}{resume&&<article className="study-task in_progress" data-attempt-id={resume.id}><div className="study-task-meta"><span className={`study-skill study-skill-${resume.skill}`}>{resume.skill}</span><span><Clock3 size={14}/>{Math.max(1,Math.ceil((Number(resume.remainingSeconds)||Number(resume.durationSeconds)||1200)/60))} min remaining</span></div><h4>Continue {resume.skill} {resume.mode==='mock'?'mock':'practice'}</h4><footer><Link className="btn primary" to={resumePath}>Resume <ArrowRight size={16}/></Link></footer></article>}</div></section>}
  </section>;
}
