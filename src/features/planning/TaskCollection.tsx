import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLocation } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { previewBacklogChange } from '../../lib/planTemplates';
import { dateKey } from '../../domain/utils';
import type { StudyPlan } from '../../domain/plans';
import type { ReactNode } from 'react';
import { useVocabularyPosition } from '../vocabulary/vocabularyNavigation';

const PAGE_SIZE=20;
export function TaskCollection({tasks,kind,renderTask}:{tasks:StudyPlan[];kind:'waiting'|'history';renderTask:(plan:StudyPlan)=>ReactNode}){
  const fb=useFieldbook(),location=useLocation();
  const [filters,setFilters]=useState({status:'all',skill:'all',origin:'all',reason:'all',from:'',to:''});
  const [includeStarted,setIncludeStarted]=useState(false),[selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0),[preview,setPreview]=useState<ReturnType<typeof previewBacklogChange>|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [scheduleDate,setScheduleDate]=useState(dateKey(new Date()));
  const server=kind==='history'&&Boolean(fb.loadPlanningHistoryPage);
  const [remote,setRemote]=useState({plans:[] as StudyPlan[],total:0,offset:0}),[loading,setLoading]=useState(false),[reload,setReload]=useState(0),[preparing,setPreparing]=useState(false);
  const located=useRef('');
  const filtered=useMemo(()=>tasks.filter(plan=>(filters.status==='all'?!plan.archivedAt:filters.status==='archived'?Boolean(plan.archivedAt):filters.status==='system'?!plan.archivedAt&&['merged-review','no-longer-due'].includes(plan.skipReason||''):filters.status==='held'?!plan.archivedAt&&Boolean(plan.onHold):plan.status===filters.status&&!plan.archivedAt&&(filters.status!=='skipped'||!['merged-review','no-longer-due'].includes(plan.skipReason||'')))&&(filters.skill==='all'||plan.skill===filters.skill)&&(filters.origin==='all'||(plan.origin||'automatic')===filters.origin)&&(filters.reason==='all'||plan.skipReason===filters.reason)&&(!filters.from||plan.dateKey>=filters.from)&&(!filters.to||plan.dateKey<=filters.to)),[tasks,filters]);
  const targetId=location.hash.startsWith('#task-')?location.hash.slice(6):'';
  const targetIndex=filtered.findIndex(plan=>plan.id===targetId);
  useEffect(()=>{if(!server&&targetIndex>=0)setPage(Math.floor(targetIndex/PAGE_SIZE));},[server,targetId,targetIndex]);
  const archivedTarget=Boolean(targetId&&tasks.some(plan=>plan.id===targetId&&plan.archivedAt));
  useEffect(()=>{if(archivedTarget)setFilters(value=>({...value,status:'archived'}));},[targetId,archivedTarget]);
  useEffect(()=>{located.current='';},[targetId,archivedTarget]);
  const readHistory=fb.loadPlanningHistoryPage;
  useEffect(()=>{
    if(!server)return;let active=true;setLoading(true);setError('');
    readHistory({...filters,offset:page*PAGE_SIZE,limit:PAGE_SIZE,...(targetId&&located.current!==targetId?{targetId}:{})}).then(result=>{
      if(!active)return;
      if(result.plans.some((plan:StudyPlan)=>plan.id===targetId))located.current=targetId;
      setRemote(result);const actual=Math.floor(result.offset/PAGE_SIZE);if(actual!==page)setPage(actual);
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'History could not load. Retry.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[server,readHistory,filters,page,reload,targetId,archivedTarget,fb.saveStatus]);
  const total=server?remote.total:filtered.length;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),current=server?Math.floor(remote.offset/PAGE_SIZE):Math.min(page,pages-1),visible=server?remote.plans.map(plan=>tasks.find(row=>row.id===plan.id)||plan):filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  useVocabularyPosition(location.pathname+location.search+location.hash,!loading&&(!targetId||visible.some(plan=>plan.id===targetId)));
  const eligible=(plan:StudyPlan)=>kind==='history'||includeStarted||!(plan.status==='in_progress'||plan.startedAt);
  const selection=server?selected:selected.filter(id=>filtered.some(plan=>plan.id===id&&eligible(plan)));
  function filter(key:string,value:string){setFilters(current=>({...current,[key]:value}));setPage(0);setSelected([]);}
  async function prepare(type:string,ids=selection,extra={}){setError('');setPreparing(true);try{const state=server?await fb.ensurePlanningRows(ids):fb.state;if(ids.some(id=>!state.plans.some((plan:StudyPlan)=>plan.id===id)))throw new Error('Some tasks are unavailable. Refresh planning before changing them.');setPreview(previewBacklogChange(state,{type,ids,includeStarted,...extra}));}catch(cause){setError(cause instanceof Error?cause.message:'The selected change is unavailable.');}finally{setPreparing(false);}}
  async function selectAll(){setError('');if(!server){setSelected(filtered.filter(eligible).map(plan=>plan.id));return;}setPreparing(true);try{const result=await readHistory({...filters,allIds:true});setSelected(result.ids||[]);}catch(cause){setError(cause instanceof Error?cause.message:'Selection could not load.');}finally{setPreparing(false);}}
  async function archiveSkipped(){if(!server){void prepare('archive',filtered.filter(plan=>plan.status==='skipped'&&!plan.archivedAt).map(plan=>plan.id));return;}setPreparing(true);setError('');try{const result=await readHistory({...filters,allIds:true,skippedOnly:true});if(!result.ids?.length)throw new Error('No skipped tasks match these filters.');await prepare('archive',result.ids);}catch(cause){setError(cause instanceof Error?cause.message:'Skipped tasks could not load.');}finally{setPreparing(false);}}
  async function save(){if(!preview)return;setSaving(true);setError('');let message='';try{if(await fb.saveBacklogPreview(preview,{onError:(value:string)=>{message=value;}})){setPreview(null);setSelected([]);setReload(value=>value+1);}else setError(message||'Changes could not be saved. Your selection is retained for retry.');}catch(cause){setError(cause instanceof Error?cause.message:'Changes could not be saved.');}finally{setSaving(false);}}
  return <section className="study-collection" aria-label={kind==='waiting'?'Waiting list':'Task history'}>
    <header><h3>{kind==='waiting'?'Waiting list':'History'}</h3><p>{kind==='waiting'?'Unfinished tasks stay here until they fit or you choose a date. Held tasks stay out of automatic scheduling.':'Completed attempts, your skips and system decisions. Archiving hides history and preserves its identity.'}</p></header>
    <fieldset className="study-collection-filters" disabled={saving||preparing}><legend className="sr-only">Filter tasks</legend>
      <label>Status<select value={filters.status} onChange={event=>filter('status',event.target.value)}><option value="all">All visible</option>{kind==='history'?<><option value="completed">Completed</option><option value="skipped">Skipped by you</option><option value="system">System handled</option><option value="archived">Archived</option></>:<><option value="pending">Not started</option><option value="in_progress">In progress</option><option value="held">On hold</option></>}</select></label>
      <label>Module<select value={filters.skill} onChange={event=>filter('skill',event.target.value)}><option value="all">All modules</option>{['vocabulary','listening','reading','writing','speaking'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Source<select value={filters.origin} onChange={event=>filter('origin',event.target.value)}><option value="all">All sources</option><option value="automatic">System arranged</option><option value="manual">User arranged</option></select></label>
      {kind==='history'&&<label>Reason<select value={filters.reason} onChange={event=>filter('reason',event.target.value)}><option value="all">All reasons</option>{['user-skipped','bulk-skip','merged-review','no-longer-due'].map(value=><option key={value}>{value}</option>)}</select></label>}
      <label>From<input type="date" value={filters.from} onChange={event=>filter('from',event.target.value)}/></label><label>To<input type="date" value={filters.to} onChange={event=>filter('to',event.target.value)}/></label>
    </fieldset>
    {kind==='waiting'&&<label className="check-field"><input type="checkbox" disabled={saving||preparing} checked={includeStarted} onChange={event=>{setIncludeStarted(event.target.checked);setSelected([]);}}/>Include started tasks in selection</label>}
    <fieldset disabled={saving||loading||preparing} className="study-collection-actions"><legend>{selection.length} selected · {total} matching tasks</legend>
      <div className="btn-row"><button type="button" className="btn line" onClick={()=>setSelected([...new Set([...selection,...visible.filter(eligible).map(plan=>plan.id)])])}>Select this page</button><button type="button" className="btn line" onClick={()=>void selectAll()}>Select all filtered results</button><button type="button" className="btn line" onClick={()=>setSelected([])}>Clear selection</button></div>
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
        <button type="button" className="btn line" disabled={server?!total||['completed','archived'].includes(filters.status):!filtered.some(plan=>plan.status==='skipped'&&!plan.archivedAt)} onClick={()=>void archiveSkipped()}>Archive skipped results</button>
      </>}</div>
    </fieldset>
    {error&&!preview&&<div role="alert"><p>{error}</p>{server&&<button type="button" className="btn line" onClick={()=>void fb.refreshPlanningState().then(()=>setReload(value=>value+1)).catch(cause=>setError(cause.message))}>Refresh history</button>}</div>}
    {(loading||preparing)&&<p role="status">{preparing?'Preparing selected tasks…':'Loading history…'}</p>}
    {!loading&&<div className="study-task-list">{visible.map(plan=><div key={plan.id} className="study-selectable-task"><label className="check-field"><input type="checkbox" aria-label={`Select ${plan.title}`} checked={selection.includes(plan.id)} disabled={saving||preparing||!eligible(plan)} onChange={event=>setSelected(event.target.checked?[...selection,plan.id]:selection.filter(id=>id!==plan.id))}/>Select task</label>{renderTask(plan)}</div>)}</div>}
    {!loading&&!error&&!total&&<p>No tasks match these filters.</p>}
    <nav className="study-pagination" aria-label={`${kind} pages`}><button type="button" className="btn line" disabled={!current||loading||preparing} onClick={()=>setPage(current-1)}>Previous page</button><span>Page {current+1} of {pages} · {total} tasks · {PAGE_SIZE} per page</span><button type="button" className="btn line" disabled={current+1>=pages||loading||preparing} onClick={()=>setPage(current+1)}>Next page</button></nav>
    <Dialog.Root open={Boolean(preview)} onOpenChange={open=>{if(!open&&!saving)setPreview(null);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content study-backlog-preview"><Dialog.Title>Review task changes</Dialog.Title><Dialog.Description>{preview?.changes.filter(change=>change.selected).length} selected tasks · {preview?.changes.filter(change=>!change.selected).length} related schedule changes. Tasks that cannot fit remain waiting. Unarchiving restores visibility; choose a date separately to run a skipped task again.</Dialog.Description><ul>{preview?.changes.map(change=><li key={String(change.id)}><strong>{change.title}</strong><small>{change.selected?'Selected task':'Related schedule change'}</small>{change.previousTitle&&change.previousTitle!==change.title&&<p>Previously: {change.previousTitle}</p>}<span>{change.changeType==='added'?`Added to schedule · ${change.to} · ${change.toMinutes} min`:change.changeType==='removed'?`Removed from schedule · ${change.from} · ${change.fromMinutes} min`:`${change.from} → ${change.archived?'Archived':change.onHold?'On hold':change.status==='skipped'?'Skipped':change.to}`}</span>{change.changeType==='updated'&&change.fromMinutes!==change.toMinutes&&<p>{change.fromMinutes} → {change.toMinutes} min</p>}{change.requirementsChanged&&<p>Task requirements updated.</p>}{change.reason&&<p>{change.reason}</p>}</li>)}</ul>{error&&<p role="alert">{error}</p>}<div className="btn-row"><button type="button" className="btn line" disabled={saving} onClick={()=>setPreview(null)}>Back to selection</button><button type="button" className="btn primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save task changes'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
