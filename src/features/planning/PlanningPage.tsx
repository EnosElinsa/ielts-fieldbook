// @ts-nocheck
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock3, Replace, RotateCcw, SkipForward, ArrowLeft, Check, Plus, Copy, SlidersHorizontal, ArrowUp, ArrowDown, Settings2 } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { IconButton } from '../../components/IconButton';
import { dateKey } from '../../domain';
import { calendarDays, studyBudget, compareStudyPlans } from '../../lib/planTemplates';
import { studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from './StudySchedule';
import '../../styles/planning.css';
import { TaskEditor } from './TaskEditor';
import { accountId } from '../../storage/remote';

export function PlanningPage(){return <AccountDataBoundary modules={['productive','vocabulary','receptive']}><PlanningCalendar/></AccountDataBoundary>;}

function PlanningCalendar(){
  const fb=useFieldbook();const schedule=useStudySchedule();const days=calendarDays();const today=days[0];const [editor,setEditor]=useState(null);
  const overdue=fb.state.plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  return <section className="view active study-planning"><header className="study-page-head"><div><p className="kicker">Next seven days</p><h2>Planning</h2><p>{fb.state.settings.dailyMinutes || 30} min per study day</p></div><div className="btn-row"><Link className="btn line" to="/settings/schedule"><Settings2 size={16}/>Plan settings</Link><Link className="btn line" to="/today"><ArrowLeft size={16}/>Today</Link></div></header>
    {schedule.error&&<div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    {overdue.length>0&&<section className="study-overdue"><h3>Overdue <span>{overdue.length}</span></h3><div className="study-task-list">{overdue.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div></section>}
    <div className="study-calendar" aria-busy={schedule.saving}>{days.map(day=>{
      const tasks=fb.state.plans.filter(plan=>plan.dateKey===day).sort(compareStudyPlans);
      const used=tasks.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
      const budget=studyBudget(fb.state.settings,day).daily;
      return <section className={`study-day${day===today?' is-today':''}`} key={day}><header><h3>{day===today?'Today':new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long'})}<span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></h3><small className={used>budget?'study-over-budget':''}>{used} / {budget} min{used>budget?` · +${used-budget} extra`:budget?` · ${Math.max(0,budget-used)} left`: ' · Rest day'}</small><button type="button" className="btn line study-add-task" disabled={schedule.saving} onClick={()=>setEditor({mode:'add',dateKey:day})}><Plus size={15}/>Add task</button></header>{tasks.length?<div className="study-task-list">{tasks.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div>:<p className="study-rest-day">{schedule.saving?'Loading...':budget?'No tasks yet. Add a task or adjust your plan settings.':'Rest day'}</p>}</section>;
    })}</div>
    {editor&&<TaskEditor key={`${accountId()}:${editor.mode}:${editor.dateKey}`} {...editor} onClose={()=>setEditor(null)}/>}
  </section>;
}

function PlanTask({plan}){
  const fb=useFieldbook();const [dialog,setDialog]=useState(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const completed=plan.status==='completed';
  async function change(action){setSaving(true);setError('');try{if(await fb.changePlan(plan.id,action))setDialog(null);else setError('Your task could not be saved. Retry the change.');}catch(cause){setError(cause instanceof Error?cause.message:'Your task could not be saved.');}finally{setSaving(false);}}
  return <article className={`study-task ${plan.status}`}>
    <div className="study-task-meta"><span className={`study-skill study-skill-${plan.skill||'writing'}`}>{plan.skill || 'Practice'}</span><span><Clock3 size={14}/>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{plan.dateKey<dateKey(new Date())&&<span>Due {plan.dateKey}</span>}</div>
    <h4>{plan.title}</h4><p>{studyTargetSummary(plan)}</p><p>{plan.description}</p><small className="study-completion-condition">{plan.completion?.description}</small>
    <footer><span className="study-task-status">{completed&&<Check size={14}/>} {({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}{plan.origin==='manual'?' · Edited':''}</span><div className="study-task-tools">{plan.status==='skipped'?<IconButton label="Restore task" disabled={saving} onClick={()=>setDialog('restore')}><RotateCcw size={16}/></IconButton>:<><IconButton label="Replace task" disabled={saving||completed||plan.status==='in_progress'} onClick={()=>{setError('');setDialog('replace');}}><Replace size={16}/></IconButton><IconButton label="Reschedule task" disabled={saving||completed} onClick={()=>{setError('');setDialog('reschedule');}}><CalendarClock size={16}/></IconButton><IconButton label="Edit duration" disabled={saving||completed||plan.status==='in_progress'} onClick={()=>setDialog('resize')}><SlidersHorizontal size={16}/></IconButton><IconButton label="Duplicate task" disabled={saving} onClick={()=>setDialog('duplicate')}><Copy size={16}/></IconButton><IconButton label="Move task up" disabled={saving} onClick={()=>void change({type:'reorder',direction:'up'})}><ArrowUp size={16}/></IconButton><IconButton label="Move task down" disabled={saving} onClick={()=>void change({type:'reorder',direction:'down'})}><ArrowDown size={16}/></IconButton><IconButton label="Skip task" disabled={saving||completed} onClick={()=>void change({type:'skip'})}><SkipForward size={16}/></IconButton><TaskStartButton plan={plan}/></>}</div></footer>
    {error&&!dialog&&<p className="study-alert" role="alert">{error}</p>}
    {dialog&&<TaskEditor key={`${accountId()}:${plan.id}:${dialog}`} mode={dialog} plan={plan} dateKey={plan.dateKey} onClose={()=>setDialog(null)}/>}

  </article>;
}
