import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLocation } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { previewBacklogChange } from '../../lib/planTemplates';
import { dateKey } from '../../domain/utils';
import type { StudyPlan } from '../../domain/plans';
import type { ReactNode } from 'react';

const PAGE_SIZE=20;
export function TaskCollection({tasks,kind,renderTask}:{tasks:StudyPlan[];kind:'waiting'|'history';renderTask:(plan:StudyPlan)=>ReactNode}){
  const fb=useFieldbook(),location=useLocation();
  const [filters,setFilters]=useState({status:'all',skill:'all',origin:'all',reason:'all',from:'',to:''});
  const [includeStarted,setIncludeStarted]=useState(false),[selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0),[preview,setPreview]=useState<ReturnType<typeof previewBacklogChange>|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [scheduleDate,setScheduleDate]=useState(dateKey(new Date()));
  const filtered=useMemo(()=>tasks.filter(plan=>(filters.status==='all'?!plan.archivedAt:filters.status==='archived'?Boolean(plan.archivedAt):filters.status==='system'?!plan.archivedAt&&['merged-review','no-longer-due'].includes(plan.skipReason||''):filters.status==='held'?!plan.archivedAt&&Boolean(plan.onHold):plan.status===filters.status&&!plan.archivedAt&&(filters.status!=='skipped'||!['merged-review','no-longer-due'].includes(plan.skipReason||'')))&&(filters.skill==='all'||plan.skill===filters.skill)&&(filters.origin==='all'||(plan.origin||'automatic')===filters.origin)&&(filters.reason==='all'||plan.skipReason===filters.reason)&&(!filters.from||plan.dateKey>=filters.from)&&(!filters.to||plan.dateKey<=filters.to)),[tasks,filters]);
  const targetId=location.hash.startsWith('#task-')?location.hash.slice(6):'';
  const targetIndex=filtered.findIndex(plan=>plan.id===targetId);
  useEffect(()=>{if(targetIndex>=0)setPage(Math.floor(targetIndex/PAGE_SIZE));},[targetId,targetIndex]);
  const archivedTarget=Boolean(targetId&&tasks.some(plan=>plan.id===targetId&&plan.archivedAt));
  useEffect(()=>{if(archivedTarget)setFilters(value=>({...value,status:'archived'}));},[targetId,archivedTarget]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),current=Math.min(page,pages-1),visible=filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  const eligible=(plan:StudyPlan)=>kind==='history'||includeStarted||!(plan.status==='in_progress'||plan.startedAt);
  const selection=selected.filter(id=>filtered.some(plan=>plan.id===id&&eligible(plan)));
  function filter(key:string,value:string){setFilters(current=>({...current,[key]:value}));setPage(0);setSelected([]);}
  function prepare(type:string,ids=selection,extra={}){setError('');try{setPreview(previewBacklogChange(fb.state,{type,ids,includeStarted,...extra}));}catch(cause){setError(cause instanceof Error?cause.message:'The selected change is unavailable.');}}
  async function save(){if(!preview)return;setSaving(true);setError('');let message='';try{if(await fb.saveBacklogPreview(preview,{onError:(value:string)=>{message=value;}})){setPreview(null);setSelected([]);}else setError(message||'Changes could not be saved. Your selection is retained for retry.');}catch(cause){setError(cause instanceof Error?cause.message:'Changes could not be saved.');}finally{setSaving(false);}}
  return <section className="study-collection" aria-label={kind==='waiting'?'Waiting list':'Task history'}>
    <header><h3>{kind==='waiting'?'Waiting list':'History'}</h3><p>{kind==='waiting'?'Unfinished tasks stay here until they fit or you choose a date. Held tasks stay out of automatic scheduling.':'Completed attempts, your skips and system decisions. Archiving hides history and preserves its identity.'}</p></header>
    <div className="study-collection-filters">
      <label>Status<select value={filters.status} onChange={event=>filter('status',event.target.value)}><option value="all">All visible</option>{kind==='history'?<><option value="completed">Completed</option><option value="skipped">Skipped by you</option><option value="system">System handled</option><option value="archived">Archived</option></>:<><option value="pending">Not started</option><option value="in_progress">In progress</option><option value="held">On hold</option></>}</select></label>
      <label>Module<select value={filters.skill} onChange={event=>filter('skill',event.target.value)}><option value="all">All modules</option>{['vocabulary','listening','reading','writing','speaking'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Source<select value={filters.origin} onChange={event=>filter('origin',event.target.value)}><option value="all">All sources</option><option value="automatic">System arranged</option><option value="manual">User arranged</option></select></label>
      {kind==='history'&&<label>Reason<select value={filters.reason} onChange={event=>filter('reason',event.target.value)}><option value="all">All reasons</option>{['user-skipped','bulk-skip','merged-review','no-longer-due'].map(value=><option key={value}>{value}</option>)}</select></label>}
      <label>From<input type="date" value={filters.from} onChange={event=>filter('from',event.target.value)}/></label><label>To<input type="date" value={filters.to} onChange={event=>filter('to',event.target.value)}/></label>
    </div>
    {kind==='waiting'&&<label className="check-field"><input type="checkbox" checked={includeStarted} onChange={event=>{setIncludeStarted(event.target.checked);setSelected([]);}}/>Include started tasks in selection</label>}
    <fieldset disabled={saving} className="study-collection-actions"><legend>{selection.length} selected · {filtered.length} matching tasks</legend>
      <div className="btn-row"><button type="button" className="btn line" onClick={()=>setSelected([...new Set([...selection,...visible.filter(eligible).map(plan=>plan.id)])])}>Select this page</button><button type="button" className="btn line" onClick={()=>setSelected(filtered.filter(eligible).map(plan=>plan.id))}>Select all filtered results</button><button type="button" className="btn line" onClick={()=>setSelected([])}>Clear selection</button></div>
      <div className="btn-row">{kind==='waiting'?<>
        <button type="button" className="btn primary" disabled={!selection.length} onClick={()=>prepare('replan')}>Preview automatic replan</button>
        <button type="button" className="btn line" disabled={!selection.length} onClick={()=>prepare('reschedule',selection,{dateKey:dateKey(new Date())})}>Preview arrange today</button>
        <label>Arrange date<input type="date" value={scheduleDate} onChange={event=>setScheduleDate(event.target.value)}/></label>
        <button type="button" className="btn line" disabled={!selection.length||!scheduleDate} onClick={()=>prepare('reschedule',selection,{dateKey:scheduleDate})}>Preview arrange</button>
        <button type="button" className="btn line" disabled={!selection.length} onClick={()=>prepare('hold')}>Preview hold</button>
        <button type="button" className="btn line" disabled={!selection.some(id=>tasks.find(plan=>plan.id===id)?.onHold)} onClick={()=>prepare('resume')}>Preview return to waiting</button>
        <button type="button" className="btn line" disabled={!selection.length} onClick={()=>prepare('skip')}>Preview skip</button>
      </>:<>
        <button type="button" className="btn line" disabled={!selection.length} onClick={()=>prepare(filters.status==='archived'?'unarchive':'archive')}>{filters.status==='archived'?'Preview unarchive':'Preview archive'}</button>
        <button type="button" className="btn line" disabled={!filtered.some(plan=>plan.status==='skipped'&&!plan.archivedAt)} onClick={()=>prepare('archive',filtered.filter(plan=>plan.status==='skipped'&&!plan.archivedAt).map(plan=>plan.id))}>Archive skipped results</button>
      </>}</div>
    </fieldset>
    {error&&!preview&&<p role="alert">{error}</p>}
    <div className="study-task-list">{visible.map(plan=><div key={plan.id} className="study-selectable-task"><label className="check-field"><input type="checkbox" aria-label={`Select ${plan.title}`} checked={selection.includes(plan.id)} disabled={saving||!eligible(plan)} onChange={event=>setSelected(event.target.checked?[...selection,plan.id]:selection.filter(id=>id!==plan.id))}/>Select task</label>{renderTask(plan)}</div>)}</div>
    {!filtered.length&&<p>No tasks match these filters.</p>}
    <nav className="study-pagination" aria-label={`${kind} pages`}><button type="button" className="btn line" disabled={!current} onClick={()=>setPage(current-1)}>Previous page</button><span>Page {current+1} of {pages} · {filtered.length} tasks · {PAGE_SIZE} per page</span><button type="button" className="btn line" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next page</button></nav>
    <Dialog.Root open={Boolean(preview)} onOpenChange={open=>{if(!open&&!saving)setPreview(null);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content study-backlog-preview"><Dialog.Title>Review task changes</Dialog.Title><Dialog.Description>{preview?.changes.filter(change=>change.selected).length} selected tasks · {preview?.changes.filter(change=>!change.selected).length} related schedule changes. Tasks that cannot fit remain waiting. Unarchiving restores visibility; choose a date separately to run a skipped task again.</Dialog.Description><ul>{preview?.changes.map(change=><li key={String(change.id)}><strong>{change.title}</strong><small>{change.selected?'Selected task':'Related schedule change'}</small>{change.previousTitle&&change.previousTitle!==change.title&&<p>Previously: {change.previousTitle}</p>}<span>{change.changeType==='added'?`Added to schedule · ${change.to} · ${change.toMinutes} min`:change.changeType==='removed'?`Removed from schedule · ${change.from} · ${change.fromMinutes} min`:`${change.from} → ${change.archived?'Archived':change.onHold?'On hold':change.status==='skipped'?'Skipped':change.to}`}</span>{change.changeType==='updated'&&change.fromMinutes!==change.toMinutes&&<p>{change.fromMinutes} → {change.toMinutes} min</p>}{change.requirementsChanged&&<p>Task requirements updated.</p>}{change.reason&&<p>{change.reason}</p>}</li>)}</ul>{error&&<p role="alert">{error}</p>}<div className="btn-row"><button type="button" className="btn line" disabled={saving} onClick={()=>setPreview(null)}>Back to selection</button><button type="button" className="btn primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save task changes'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
