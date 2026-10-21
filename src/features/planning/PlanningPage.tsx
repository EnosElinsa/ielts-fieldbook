// @ts-nocheck
import { CardSkeleton, InlineLoadingState } from '../../components/AsyncState';
import { useEffect, useState } from 'react';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, Clock3, Replace, RotateCcw, SkipForward, ArrowLeft, Check, Plus, Copy, SlidersHorizontal, ArrowUp, ArrowDown, Settings2, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';

import { dateKey, addLocalDays } from '../../domain/utils';
import { calendarDays, studyBudget, compareStudyPlans } from '../../lib/planTemplates';
import { studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from './StudySchedule';
import '../../styles/planning.css';
import { useVocabularyPosition } from '../vocabulary/vocabularyNavigation';
import { TaskEditor } from './TaskEditor';
import { accountId } from '../../storage/remote';
import { TaskCollection } from './TaskCollection';

export function PlanningPage(){return <AccountDataBoundary modules={['planning','vocabularyCore']} vocabularyEntryIds={[]}><PlanningCalendar/></AccountDataBoundary>;}

function PlanningCalendar(){
  const fb=useFieldbook();const schedule=useStudySchedule();const today=dateKey(new Date());const [anchor,setAnchor]=useState(today);const days=calendarDays(new Date(`${anchor}T12:00:00`));const [editor,setEditor]=useState(null);
  const dateRange=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).formatRange(new Date(`${days[0]}T12:00:00`),new Date(`${days[6]}T12:00:00`));
  const location=useLocation();useVocabularyPosition(location.pathname+location.search+location.hash,!schedule.saving);
  const overdue=fb.state.plans.filter(plan=>(plan.dateKey<today||plan.onHold)&&!plan.archivedAt&&['pending','in_progress'].includes(plan.status)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  const history=fb.state.plans.filter(plan=>['completed','skipped'].includes(plan.status)).sort((a,b)=>-compareStudyPlans(a,b));
  const requestedView=new URLSearchParams(location.search).get('view');
  const [tab,setTab]=useState(()=>['waiting','history'].includes(requestedView)?requestedView:'schedule');
  useEffect(()=>{if(['waiting','history'].includes(requestedView))setTab(requestedView);},[requestedView]);
  const [targetError,setTargetError]=useState('');const targetId=location.hash.startsWith('#task-')?location.hash.slice(6):'';
  const linkedTask=fb.state.plans.find(plan=>plan.id===targetId);
  useEffect(()=>{if(!targetId||linkedTask)return;let active=true;fb.ensurePlanningRows([targetId]).then(state=>{if(active&&!state.plans.some(plan=>plan.id===targetId))setTargetError('This task is unavailable. Check its link or refresh planning.');}).catch(cause=>{if(active)setTargetError(cause.message);});return()=>{active=false;};},[targetId,Boolean(linkedTask),fb.ensurePlanningRows]);
  useEffect(()=>{const target=linkedTask;if(!target)return;setTargetError('');if(['completed','skipped'].includes(target.status))setTab('history');else if(target.dateKey<today||target.onHold)setTab('waiting');else{setTab('schedule');setAnchor(target.dateKey);}},[location.hash,Boolean(linkedTask)]);
  const focus=fb.state.plans.filter(plan=>plan.dateKey===today&&!plan.onHold&&!plan.archivedAt&&['pending','in_progress'].includes(plan.status)).sort((a,b)=>(a.status==='in_progress'?-1:0)-(b.status==='in_progress'?-1:0)||compareStudyPlans(a,b))[0];
  return <section className="view active study-planning"><header className="study-page-head"><div><p className="kicker">Next seven days</p><h2>Planning</h2><p>{fb.state.settings.dailyMinutes || 30} min per study day</p></div><div className="btn-row"><Link className="btn line" to="/settings/schedule"><Settings2 size={16}/>Plan settings</Link><Link className="btn line" to="/today"><ArrowLeft size={16}/>Today</Link></div></header>
    {schedule.error&&<div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    {targetError&&<p role="alert">{targetError}</p>}
    <nav className="study-tabs" aria-label="Planning views">{[['schedule','Schedule'],['waiting',`Waiting · ${overdue.length}`],['history','History']].map(([value,label])=><button type="button" className="btn line" aria-pressed={tab===value} key={value} onClick={()=>setTab(value)}>{label}</button>)}</nav>
    {tab==='waiting'&&<TaskCollection tasks={overdue} kind="waiting" renderTask={plan=><PlanTask plan={plan}/>}/>}
    {tab==='history'&&<TaskCollection tasks={history} kind="history" renderTask={plan=><PlanTask plan={plan}/>}/>}
    {schedule.saving&&<InlineLoadingState message="Updating your schedule…" />}
    {tab==='schedule'&&<>
    {focus&&<aside className="study-focus"><div><p className="kicker">Today's focus</p><strong>{focus.title}</strong><p>{focus.status==='in_progress'?'Continue your saved task':'Next in your schedule'} · {focus.estimatedMinutes} min estimated</p></div><TaskStartButton plan={focus}/></aside>}
    <nav className="study-date-navigation" aria-label="Schedule dates">
      <p className="study-date-range" aria-live="polite" aria-atomic="true">{dateRange}</p>
      <div className="study-date-controls">
        <button type="button" className="btn line study-date-today" onClick={()=>setAnchor(today)}>Today</button>
        <button type="button" className="btn line study-week-arrow" aria-label="Previous week" title="Previous week" onClick={()=>setAnchor(dateKey(addLocalDays(new Date(`${anchor}T12:00:00`),-7)))}><ChevronLeft size={18}/></button>
        <button type="button" className="btn line study-week-arrow" aria-label="Next week" title="Next week" onClick={()=>setAnchor(dateKey(addLocalDays(new Date(`${anchor}T12:00:00`),7)))}><ChevronRight size={18}/></button>
      </div>
    </nav>
    <div className="study-calendar" aria-busy={schedule.saving}>{days.map(day=>{
      const tasks=fb.state.plans.filter(plan=>plan.dateKey===day&&!plan.onHold&&!plan.archivedAt).sort(compareStudyPlans);
      const used=tasks.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
      const dayBudget=studyBudget(fb.state.settings,day),budget=dayBudget.daily;
      const newWords=tasks.filter(plan=>plan.status!=='skipped'&&plan.target?.mode==='learning-batch').reduce((sum,plan)=>sum+(plan.target.cards?.length||plan.target.entryIds?.length||plan.quantity||plan.target.batchSize||0),0);
      const completed=tasks.filter(plan=>plan.status==='completed').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
      return <section className={`study-day${day===today?' is-today':''}`} key={day}><header><h3>{day===today?'Today':new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long'})}<span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></h3><small className={used>budget?'study-over-budget':''}>Allocated {used} / {budget} min{used>budget?` · +${used-budget} extra`:budget?` · ${Math.max(0,budget-used)} left`: ' · Rest day'}</small><span className="study-day-estimates">Pending estimate {used-completed} min · Completed estimate {completed} min</span><span className="study-day-estimates">New words {newWords} / {budget ? dayBudget.planning.newWordsPerDay : 0}{budget && newWords < dayBudget.planning.newWordsPerDay ? ` · ${dayBudget.planning.newWordsPerDay-newWords} fewer than target (budget or source availability)` : ""}</span><button type="button" className="btn line study-add-task" disabled={schedule.saving} onClick={()=>setEditor({mode:'add',dateKey:day})}><Plus size={15}/>Add task</button></header>{tasks.length?<div className="study-task-list">{tasks.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div>:schedule.saving&&budget?<CardSkeleton/>:<p className="study-rest-day">{budget?'No tasks yet. Add a task or adjust your plan settings.':'Rest day'}</p>}</section>;
    })}</div></>}
    {editor&&<TaskEditor key={`${accountId()}:${editor.mode}:${editor.dateKey}`} {...editor} onClose={()=>setEditor(null)}/>}
  </section>;
}

function PlanTask({plan}){
  const fb=useFieldbook();const [dialog,setDialog]=useState(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const completed=plan.status==='completed';
  async function change(action){setSaving(true);setError('');let feedback='';try{if(await fb.changePlan(plan.id,action,{onError:message=>{feedback=message;}}))setDialog(null);else setError(feedback||'Your task could not be saved. Retry the change.');}catch(cause){setError(cause instanceof Error?cause.message:'Your task could not be saved.');}finally{setSaving(false);}}
  return <article id={`task-${plan.id}`} tabIndex={-1} className={`study-task ${plan.status}`}>
    <div className="study-task-meta"><span className={`study-skill study-skill-${plan.skill||'writing'}`}>{plan.skill || 'Practice'}</span><span><Clock3 size={14}/>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{plan.dateKey<dateKey(new Date())&&<span>Due {plan.dateKey}</span>}</div>
    <h4>{plan.title}</h4>
    {plan.originalDateKey&&<p className="study-task-rescheduled">Originally {plan.originalDateKey} · Rescheduled to {plan.dateKey}</p>}
    {plan.skipReason&&<p className="study-task-reason">{({"merged-review":"System: merged into current review planning","bulk-skip":"Skipped in backlog","user-skipped":"Skipped by you","no-longer-due":"Currently no review needed"})[plan.skipReason]}</p>}
    {plan.onHold&&<p className="study-task-reason">On hold · excluded from automatic scheduling</p>}
    {plan.waitingReason&&<p className="study-task-reason">{plan.waitingReason}</p>}
    {plan.reviewReason&&<p className="study-task-reason">Review reason: {({error:'Confirmed mistake',recovery:'Mistake recovery',due:'Scheduled review is due',missing:'Build a missing skill',spaced:'Spaced consolidation'})[plan.reviewReason]||plan.reviewReason}</p>}
    <p className="study-task-material">{studyTargetSummary(plan)}</p>
    {plan.completion?.description&&<p className="study-completion-condition"><strong>Complete when</strong><span>{plan.completion.description}</span></p>}
    <footer><span className="study-task-status">{completed&&<Check size={14}/>} {({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}{plan.origin==='manual'?' · User arranged':' · System arranged'}</span><div className="study-task-tools">{plan.status==='skipped'?<button type="button" className="btn line" disabled={saving} onClick={()=>{setError('');setDialog('restore');}}><RotateCcw size={16}/>Restore task</button>:<>
      {!plan.onHold&&<TaskStartButton plan={plan}/>}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button type="button" className="btn line study-task-menu" aria-label={`Task actions: ${plan.title}`} disabled={saving}><MoreHorizontal size={18}/></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content study-task-actions" align="end" sideOffset={6} collisionPadding={12}>
          <DropdownMenu.Label className="dropdown-label">Task actions</DropdownMenu.Label>
          {[
            ['replace','Replace task',Replace,completed||plan.status==='in_progress'],
            ['reschedule','Reschedule task',CalendarClock,completed],
            ['resize','Edit duration',SlidersHorizontal,completed||plan.status==='in_progress'],
            ['duplicate','Duplicate task',Copy,false],
          ].map(([mode,label,Icon,disabled])=><DropdownMenu.Item key={mode} className="dropdown-item" disabled={disabled} onSelect={()=>{setError('');setDialog(mode);}}><Icon size={16}/>{label}</DropdownMenu.Item>)}
          <DropdownMenu.Separator className="dropdown-separator"/>
          <DropdownMenu.Item className="dropdown-item" disabled={completed} onSelect={()=>void change({type:plan.onHold?'resume':'hold'})}>{plan.onHold?'Return to waiting':'Hold task'}</DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item" onSelect={()=>void change({type:'reorder',direction:'up'})}><ArrowUp size={16}/>Move task up</DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item" onSelect={()=>void change({type:'reorder',direction:'down'})}><ArrowDown size={16}/>Move task down</DropdownMenu.Item>
          <DropdownMenu.Separator className="dropdown-separator"/>
          <DropdownMenu.Item className="dropdown-item study-task-skip" disabled={completed} onSelect={()=>void change({type:'skip'})}><SkipForward size={16}/>Skip task</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>}</div></footer>
    {error&&!dialog&&<p className="study-alert" role="alert">{error}</p>}
    {dialog&&<TaskEditor key={`${accountId()}:${plan.id}:${dialog}`} mode={dialog} plan={plan} dateKey={plan.dateKey} onClose={()=>setDialog(null)}/>}

  </article>;
}
