// @ts-nocheck
import { CardSkeleton, InlineLoadingState } from '../../components/AsyncState';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, Clock3, Replace, RotateCcw, SkipForward, ArrowLeft, Check, Plus, Copy, SlidersHorizontal, ArrowUp, ArrowDown, Settings2, MoreHorizontal } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { AccountDataBoundary } from '../../components/AccountDataBoundary';
import { IconButton } from '../../components/IconButton';
import { dateKey } from '../../domain';
import { calendarDays, studyBudget, compareStudyPlans, previewBacklogChange } from '../../lib/planTemplates';
import { studyTargetSummary } from '../../lib/planTargets';
import { TaskStartButton, useStudySchedule } from './StudySchedule';
import '../../styles/planning.css';
import { useVocabularyPosition } from '../vocabulary/vocabularyNavigation';
import { TaskEditor } from './TaskEditor';
import { accountId } from '../../storage/remote';

export function PlanningPage(){return <AccountDataBoundary modules={['productive','vocabulary','receptive']}><PlanningCalendar/></AccountDataBoundary>;}

function PlanningCalendar(){
  const fb=useFieldbook();const schedule=useStudySchedule();const days=calendarDays();const today=days[0];const [editor,setEditor]=useState(null);
  const location=useLocation();useVocabularyPosition(location.pathname+location.search+location.hash,!schedule.saving);
  const overdue=fb.state.plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  const skipped=fb.state.plans.filter(plan=>plan.dateKey<today&&plan.status==='skipped').sort(compareStudyPlans);
  const historicalTarget=fb.state.plans.find(plan=>location.hash===`#task-${plan.id}`&&plan.dateKey<today&&plan.status==='completed');
  return <section className="view active study-planning"><header className="study-page-head"><div><p className="kicker">Next seven days</p><h2>Planning</h2><p>{fb.state.settings.dailyMinutes || 30} min per study day</p></div><div className="btn-row"><Link className="btn line" to="/settings/schedule"><Settings2 size={16}/>Plan settings</Link><Link className="btn line" to="/today"><ArrowLeft size={16}/>Today</Link></div></header>
    {schedule.error&&<div className="study-alert" role="alert"><span>{schedule.error}</span><button className="btn line" disabled={schedule.saving} onClick={()=>void schedule.refresh()}>Retry plan</button></div>}
    {overdue.length>0&&<Backlog tasks={overdue}/>}
    {skipped.length>0&&<SkippedHistory tasks={skipped}/>}
    {historicalTarget&&<PlanTask plan={historicalTarget}/>}
    {schedule.saving&&<InlineLoadingState message="Updating your schedule…" />}
    <div className="study-calendar" aria-busy={schedule.saving}>{days.map(day=>{
      const tasks=fb.state.plans.filter(plan=>plan.dateKey===day).sort(compareStudyPlans);
      const used=tasks.filter(plan=>plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);
      const budget=studyBudget(fb.state.settings,day).daily;
      return <section className={`study-day${day===today?' is-today':''}`} key={day}><header><h3>{day===today?'Today':new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{weekday:'long'})}<span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></h3><small className={used>budget?'study-over-budget':''}>{used} / {budget} min{used>budget?` · +${used-budget} extra`:budget?` · ${Math.max(0,budget-used)} left`: ' · Rest day'}</small><button type="button" className="btn line study-add-task" disabled={schedule.saving} onClick={()=>setEditor({mode:'add',dateKey:day})}><Plus size={15}/>Add task</button></header>{tasks.length?<div className="study-task-list">{tasks.map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div>:schedule.saving&&budget?<CardSkeleton/>:<p className="study-rest-day">{budget?'No tasks yet. Add a task or adjust your plan settings.':'Rest day'}</p>}</section>;
    })}</div>
    {editor&&<TaskEditor key={`${accountId()}:${editor.mode}:${editor.dateKey}`} {...editor} onClose={()=>setEditor(null)}/>}
  </section>;
}

function PlanTask({plan}){
  const fb=useFieldbook();const [dialog,setDialog]=useState(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const completed=plan.status==='completed';
  async function change(action){setSaving(true);setError('');let feedback='';try{if(await fb.changePlan(plan.id,action,{onError:message=>{feedback=message;}}))setDialog(null);else setError(feedback||'Your task could not be saved. Retry the change.');}catch(cause){setError(cause instanceof Error?cause.message:'Your task could not be saved.');}finally{setSaving(false);}}
  return <article id={`task-${plan.id}`} tabIndex={-1} className={`study-task ${plan.status}`}>
    <div className="study-task-meta"><span className={`study-skill study-skill-${plan.skill||'writing'}`}>{plan.skill || 'Practice'}</span><span><Clock3 size={14}/>{plan.estimatedMinutes || fb.state.settings.dailyMinutes} min</span>{plan.dateKey<dateKey(new Date())&&<span>Due {plan.dateKey}</span>}</div>
    <h4>{plan.title}</h4>{plan.originalDateKey&&<small>Originally {plan.originalDateKey}</small>}{plan.skipReason&&<small>{({"merged-review":"Merged into current review planning","bulk-skip":"Skipped in backlog","user-skipped":"Skipped by you","no-longer-due":"No review remaining"})[plan.skipReason]}</small>}<p>{studyTargetSummary(plan)}</p><p>{plan.description}</p><small className="study-completion-condition">{plan.completion?.description}</small>
    <footer><span className="study-task-status">{completed&&<Check size={14}/>} {({pending:'Not started',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[plan.status] || plan.status}{plan.origin==='manual'?' · Edited':''}</span><div className="study-task-tools">{plan.status==='skipped'?<button type="button" className="btn line" disabled={saving} onClick={()=>{setError('');setDialog('restore');}}><RotateCcw size={16}/>Restore task</button>:<>
      <TaskStartButton plan={plan}/>
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

function Backlog({tasks}) {
  const fb=useFieldbook(),location=useLocation();
  const [includeStarted,setIncludeStarted]=useState(false),[selected,setSelected]=useState(()=>tasks.filter(plan=>plan.status==='pending'&&!plan.startedAt).map(plan=>plan.id));
  const [page,setPage]=useState(0),[preview,setPreview]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const targetId=location.hash.startsWith('#task-')?location.hash.slice(6):null;
  const targetIndex=tasks.findIndex(plan=>plan.id===targetId);
  const [open,setOpen]=useState(targetIndex>=0);
  useEffect(()=>{if(targetIndex>=0){setOpen(true);setPage(Math.floor(targetIndex/10));}},[targetId,targetIndex]);
  const visible=tasks.slice(Math.min(page,Math.floor((tasks.length-1)/10))*10,Math.min(page,Math.floor((tasks.length-1)/10))*10+10);
  function prepare(type){setError('');try{setPreview(previewBacklogChange(fb.state,{type,ids:selected,includeStarted}));}catch(cause){setError(cause.message);}}
  async function save(){setSaving(true);setError('');let feedback='';try{if(await fb.saveBacklogPreview(preview,{onError:message=>{feedback=message;}}))setPreview(null);else setError(feedback||'Your backlog changes could not be saved. Retry to keep this selection.');}catch(cause){setError(cause.message);}finally{setSaving(false);}}
  return <details id="planning-backlog" className="study-overdue study-backlog" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Waiting list · {tasks.length} {tasks.length===1?'task':'tasks'} · {tasks[0].dateKey} to {tasks.at(-1).dateKey}</summary>
    <p>Tasks that do not fit the next seven days stay here. Replanning keeps each task and its saved work together.</p>
    <label><input type="checkbox" checked={includeStarted} disabled={saving} onChange={event=>{setIncludeStarted(event.target.checked);if(!event.target.checked)setSelected(selected.filter(id=>!tasks.some(plan=>plan.id===id&&(plan.status==='in_progress'||plan.startedAt))));}}/> Include started tasks</label>
    <div className="btn-row"><button className="btn line" onClick={()=>setSelected(tasks.filter(plan=>includeStarted||plan.status==='pending'&&!plan.startedAt).map(plan=>plan.id))}>Select eligible tasks</button><button className="btn line" onClick={()=>setSelected([])}>Clear selection</button><button className="btn primary" disabled={!selected.length||saving} onClick={()=>prepare('replan')}>Preview replan</button><button className="btn line" disabled={!selected.length||saving} onClick={()=>prepare('skip')}>Preview skip</button></div>
    {error&&!preview&&<p role="alert">{error}</p>}
    <div className="study-task-list">{visible.map(plan=><div key={plan.id}><label><input type="checkbox" aria-label={`Select ${plan.title}`} checked={selected.includes(plan.id)} disabled={saving||!includeStarted&&(plan.status==='in_progress'||Boolean(plan.startedAt))} onChange={event=>setSelected(event.target.checked?[...selected,plan.id]:selected.filter(id=>id!==plan.id))}/> Select task</label><PlanTask plan={plan}/></div>)}</div>
    {tasks.length>10&&<div className="btn-row"><button className="btn line" disabled={page===0} onClick={()=>setPage(Math.max(0,page-1))}>Previous waiting tasks</button><span>{Math.min(page+1,Math.ceil(tasks.length/10))} / {Math.ceil(tasks.length/10)}</span><button className="btn line" disabled={(page+1)*10>=tasks.length} onClick={()=>setPage(page+1)}>More waiting tasks</button></div>}
    <Dialog.Root open={Boolean(preview)} onOpenChange={value=>{if(!value&&!saving){setPreview(null);setError('');}}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content study-backlog-preview"><Dialog.Title>Review backlog changes</Dialog.Title><Dialog.Description>Save all selected changes together. Tasks without capacity remain waiting; drafts and practice history are retained.</Dialog.Description>
      {preview?.action.type==='replan'&&<details><summary>Resulting seven-day schedule</summary>{calendarDays(new Date(preview.createdAt)).map(day=><div key={day}><strong>{day} · {preview.plans.filter(plan=>plan.dateKey===day&&plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0)} / {studyBudget(fb.state.settings,day).daily} min</strong><ul>{preview.plans.filter(plan=>plan.dateKey===day).map(plan=><li key={plan.id}>{plan.title} · {plan.estimatedMinutes} min · {plan.status}</li>)}</ul></div>)}</details>}
      <ul>{preview?.changes.map(change=><li key={change.id}>{change.title}: {change.from} → {change.status==='skipped'?'Skipped':change.waiting?'Waiting':change.to}</li>)}</ul>
      {error&&<p role="alert">{error}</p>}<div className="btn-row"><button className="btn line" disabled={saving} onClick={()=>{setPreview(null);setError('');}}>Back to selection</button><button className="btn primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save backlog changes'}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </details>;
}

function SkippedHistory({tasks}) {
  const location=useLocation(),targetIndex=tasks.findIndex(plan=>location.hash===`#task-${plan.id}`);
  const [page,setPage]=useState(()=>targetIndex>=0?Math.floor(targetIndex/10):0);
  const visiblePage=Math.min(page,Math.max(0,Math.ceil(tasks.length/10)-1));
  return <details className="study-overdue study-backlog" open={targetIndex>=0?true:undefined}><summary>Skipped history · {tasks.length} {tasks.length===1?'task':'tasks'}</summary><div className="study-task-list">{tasks.slice(visiblePage*10,visiblePage*10+10).map(plan=><PlanTask key={plan.id} plan={plan}/>)}</div>{tasks.length>10&&<div className="btn-row"><button className="btn line" disabled={!visiblePage} onClick={()=>setPage(visiblePage-1)}>Previous skipped tasks</button><button className="btn line" disabled={(visiblePage+1)*10>=tasks.length} onClick={()=>setPage(visiblePage+1)}>More skipped tasks</button></div>}</details>;
}
