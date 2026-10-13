// @ts-nocheck
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock3, Replace, RotateCcw, SkipForward, ArrowLeft, Check } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { IconButton } from '../../components/IconButton';
import { ModalFrame } from '../../components/ModalFrame';
import { dateKey } from '../../domain';
import { calendarDays } from '../../lib/planTemplates';
import { studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from './StudySchedule';
import '../../styles/planning.css';

export function PlanningPage(){return <AccountDataBoundary modules={['productive','vocabulary','receptive']}><PlanningCalendar/></AccountDataBoundary>;}

function PlanningCalendar(){
  const fb=useFieldbook();const schedule=useStudySchedule();const days=calendarDays();const today=days[0];
  const overdue=fb.state.plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  return <section className="view active study-planning"><header className="study-page-head"><div><p className="kicker">Next seven days</p><h2>Planning</h2><p>{fb.state.settings.dailyMinutes || 30} min per study day</p></div><Link className="btn line" to="/today"><ArrowLeft size={16}/>Today</Link></header>
    {schedule.error&&<div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    {overdue.length>0&&<section className="study-overdue"><h3>Overdue <span>{overdue.length}</span></h3><div className="study-task-list">{overdue.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div></section>}
    <div className="study-calendar" aria-busy={schedule.saving}>{days.map(day=>{
      const tasks=fb.state.plans.filter(plan=>plan.dateKey===day).sort((a,b)=>a.id.localeCompare(b.id));
      const used=tasks.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
      return <section className={`study-day${day===today?' is-today':''}`} key={day}><header><h3>{day===today?'Today':new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long'})}<span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></h3><small>{used} min</small></header>{tasks.length?<div className="study-task-list">{tasks.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div>:<p className="study-rest-day">{schedule.saving?'Loading...':'Rest day'}</p>}</section>;
    })}</div>
  </section>;
}

function PlanTask({plan}){
  const fb=useFieldbook();const [dialog,setDialog]=useState(null);const [date,setDate]=useState(plan.dateKey);const [skill,setSkill]=useState(plan.skill==='vocabulary'?'writing':plan.skill || 'writing');const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const completed=plan.status==='completed';
  async function change(action){setSaving(true);setError('');try{if(await fb.changePlan(plan.id,action))setDialog(null);else setError('Your task could not be saved. Retry the change.');}catch(cause){setError(cause instanceof Error?cause.message:'Your task could not be saved.');}finally{setSaving(false);}}
  return <article className={`study-task ${plan.status}`}>
    <div className="study-task-meta"><span className={`study-skill study-skill-${plan.skill||'writing'}`}>{plan.skill || 'Practice'}</span><span><Clock3 size={14}/>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{plan.dateKey<dateKey(new Date())&&<span>Due {plan.dateKey}</span>}</div>
    <h4>{plan.title}</h4><p>{studyTargetSummary(plan)}</p><p>{plan.description}</p><small className="study-completion-condition">{plan.completion?.description}</small>
    <footer><span className="study-task-status">{completed&&<Check size={14}/>} {({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}{plan.origin==='manual'?' · Edited':''}</span><div className="study-task-tools">{plan.status==='skipped'?<IconButton label="Restore task" disabled={saving} onClick={()=>void change({type:'restore'})}><RotateCcw size={16}/></IconButton>:<><IconButton label="Replace task" disabled={saving||completed||plan.status==='in_progress'} onClick={()=>{setError('');setDialog('replace');}}><Replace size={16}/></IconButton><IconButton label="Reschedule task" disabled={saving||completed} onClick={()=>{setDate(plan.dateKey);setError('');setDialog('reschedule');}}><CalendarClock size={16}/></IconButton><IconButton label="Skip task" disabled={saving||completed} onClick={()=>void change({type:'skip'})}><SkipForward size={16}/></IconButton><TaskStartButton plan={plan}/></>}</div></footer>
    {error&&!dialog&&<p className="study-alert" role="alert">{error}</p>}
    <ModalFrame open={Boolean(dialog)} onClose={()=>setDialog(null)} title={dialog==='replace'?'Replace task':'Reschedule task'} header={plan.title} size="sm" busy={saving} footer={<button className="btn primary" disabled={saving} onClick={()=>void change(dialog==='replace'?{type:'replace',skill:skill==='writing-mock'?'writing':skill==='speaking-mock'?'speaking':skill,...(skill.endsWith('-mock')?{kind:skill}:{})}:{type:'reschedule',dateKey:date})}>{saving?'Saving...':'Save change'}</button>}>
      {dialog==='replace'?<label className="study-edit-field">Skill<select value={skill} onChange={event=>setSkill(event.target.value)}>{['writing','speaking','reading','listening'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}<option value="writing-mock">Writing mock - 60 min</option><option value="speaking-mock">Speaking mock - 15 min</option></select></label>:<label className="study-edit-field">Study date<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>}{error&&<p className="study-alert" role="alert">{error}</p>}
    </ModalFrame>
  </article>;
}
