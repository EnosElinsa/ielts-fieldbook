// @ts-nocheck
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, Clock3 } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { dateKey } from '../../domain';
import { nextUnifiedPlan, selectedStudySkills } from '../../lib/planTemplates';
import { studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from '../planning/StudySchedule';
import '../../styles/planning.css';

export function TodayPage() {
  return <AccountDataBoundary modules={['productive','vocabulary','receptive']}><UnifiedToday /></AccountDataBoundary>;
}

function UnifiedToday() {
  const fb=useFieldbook();const schedule=useStudySchedule();const today=dateKey(new Date());
  const plans=fb.state.plans || [];const next=nextUnifiedPlan(plans);
  const paused=(fb.state.examAttempts||[]).filter(attempt=>['active','paused'].includes(attempt.status)).sort((a,b)=>String(b.updatedAt||b.startedAt).localeCompare(String(a.updatedAt||a.startedAt)))[0];
  const resume=paused&&next?.status!=='in_progress'?paused:null;
  const resumeParams=new URLSearchParams(resume?{attempt:resume.id}:{});
  if(resume?.retryOfAttemptId)resumeParams.set('retry',resume.retryOfAttemptId);
  if(resume?.planId)resumeParams.set('planId',resume.planId);
  const resumePath=resume?`/${resume.skill}/${resume.mode==='mock'?'mock/':''}${encodeURIComponent(resume.mode==='mock'?resume.sourceId:resume.sectionIds[0])}?${resumeParams}`:null;
  const todays=plans.filter(plan=>plan.dateKey===today);
  const done=todays.filter(plan=>plan.status==='completed');
  const overdue=plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status));
  const skills=[...selectedStudySkills(fb.state.settings),'vocabulary'];
  const upcoming=plans.filter(plan=>plan.dateKey>today&&plan.status==='pending').sort((a,b)=>a.dateKey.localeCompare(b.dateKey))[0];
  return <section className="view active study-today">
    <header className="study-page-head"><div><p className="kicker">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p><h2>Today</h2></div><Link className="btn line" to="/planning"><CalendarDays size={16}/>Planning</Link></header>
    {schedule.error && <div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    <div className="study-today-main">
      <section className="study-next" aria-busy={schedule.saving}>
        <p className="kicker">{resume||next?.status==='in_progress'?'In progress':next?.dateKey<today?'Overdue':'Next task'}</p>
        <h3>{resume?`Continue ${resume.skill} ${resume.mode==='mock'?'mock':'practice'}`:next?.title || (schedule.saving?'Loading your plan':'Today is complete')}</h3>
        {next&&!resume&&<p>{studyTargetSummary(next)}</p>}
        {resume?<><div className="study-task-meta"><span className={`study-skill study-skill-${resume.skill}`}>{resume.skill}</span><span><Clock3 size={15}/>{Math.max(1,Math.ceil((Number(resume.remainingSeconds)||Number(resume.durationSeconds)||1200)/60))} min remaining</span></div><Link className="btn primary" to={resumePath}>Resume <ArrowRight size={16}/></Link></>:next ? <><div className="study-task-meta"><span className={`study-skill study-skill-${next.skill||'writing'}`}>{next.skill || 'Practice'}</span><span><Clock3 size={15}/>{next.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{next.dateKey<today&&<span>Due {next.dateKey}</span>}</div><p>{next.description}</p><p className="study-completion-condition">{next.completion?.description}</p><TaskStartButton plan={next}/></> : <>{upcoming&&<p>Next study day: {new Date(`${upcoming.dateKey}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</p>}<Link className="btn line" to="/planning">Open plan <ArrowRight size={16}/></Link></>}
      </section>
      <section className="study-summary"><h3>Completed today</h3><p className="study-summary-total"><strong>{done.length}</strong><span>of {todays.filter(plan=>plan.status!=='skipped').length} tasks</span></p><p>{done.reduce((total,plan)=>total+Number(plan.estimatedMinutes||0),0)} min completed</p><ul>{skills.map(skill=><li key={skill}><span className={`study-skill study-skill-${skill}`}>{skill}</span><span>{done.filter(plan=>plan.skill===skill).length ? <><Check size={15}/> {done.filter(plan=>plan.skill===skill).length} done</> : '0 done'}</span></li>)}</ul>{overdue.length>0&&<Link className="study-overdue-link" to="/planning">{overdue.length} overdue {overdue.length===1?'task':'tasks'} <ArrowRight size={15}/></Link>}</section>
    </div>
    {todays.length>0&&<section className="study-today-list"><h3>Today's tasks</h3>{todays.map(plan=><div className="study-work-row" key={plan.id}><span className={`study-status-dot ${plan.status}`}/><div><strong>{plan.title}</strong><small>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</small></div><span>{({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}</span></div>)}</section>}
  </section>;
}
