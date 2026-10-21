import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLocation } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { previewBacklogChange } from '../../lib/planTemplates';
import { dateKey } from '../../domain/utils';
import type { StudyPlan } from '../../domain/plans';
import type { ReactNode } from 'react';
import { useVocabularyPosition } from '../vocabulary/vocabularyNavigation';
import { DateField } from '../../components/ui';
import { SelectField } from '../../components/SelectField';
import { CheckCircle2, ListFilter } from 'lucide-react';

const PAGE_SIZE=20;
const DEFAULT_FILTERS={status:'all',skill:'all',origin:'all',reason:'all',from:'',to:''};
export function TaskCollection({tasks,kind,renderTask}:{tasks:StudyPlan[];kind:'waiting'|'history';renderTask:(plan:StudyPlan)=>ReactNode}){
  const fb=useFieldbook(),location=useLocation();
  const fieldId=useId();
  const [filters,setFilters]=useState(DEFAULT_FILTERS);
  const [includeStarted,setIncludeStarted]=useState(false),[selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0),[preview,setPreview]=useState<ReturnType<typeof previewBacklogChange>|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [scheduleDate,setScheduleDate]=useState(dateKey(new Date()));
  const server=kind==='history'&&Boolean(fb.loadPlanningHistoryPage);
  const [remote,setRemote]=useState({plans:[] as StudyPlan[],total:0,offset:0}),[loading,setLoading]=useState(server),[reload,setReload]=useState(0),[preparing,setPreparing]=useState(false);
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
  const filtersActive=Object.entries(DEFAULT_FILTERS).some(([key,value])=>filters[key as keyof typeof filters]!==value);
  const showFilters=kind==='history'||filtersActive||total>0||loading||Boolean(error);
  const controlsDisabled=saving||preparing;
  return <section className="study-collection" aria-label={kind==='waiting'?'Waiting list':'Task history'}>
    <header><h3>{kind==='waiting'?'Waiting list':'History'}</h3><p>{kind==='waiting'?'Unfinished tasks waiting for a date or room in your schedule. Held tasks stay out of automatic planning.':'Completed tasks, your skips and system decisions. Archive results to hide them from this list.'}</p></header>
    {showFilters&&<fieldset className={`study-collection-filters is-${kind}`} disabled={controlsDisabled}><legend className="sr-only">Filter tasks</legend>
      <div className="study-filter-heading"><span><ListFilter size={16} aria-hidden="true"/>Filters</span><button type="button" className="btn text study-clear-filters" disabled={!filtersActive} onClick={()=>{setFilters(DEFAULT_FILTERS);setPage(0);setSelected([]);}}>Reset filters</button></div>
      <div className="study-filter-fields">
      <label>Status<SelectField aria-label="Status" disabled={controlsDisabled} value={filters.status} onValueChange={value=>filter('status',value)}><option value="all">All visible</option>{kind==='history'?<><option value="completed">Completed</option><option value="skipped">Skipped by you</option><option value="system">System handled</option><option value="archived">Archived</option></>:<><option value="pending">Not started</option><option value="in_progress">In progress</option><option value="held">On hold</option></>}</SelectField></label>
      <label>Module<SelectField aria-label="Module" disabled={controlsDisabled} value={filters.skill} onValueChange={value=>filter('skill',value)}><option value="all">All modules</option>{['vocabulary','listening','reading','writing','speaking'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</SelectField></label>
      <label>Source<SelectField aria-label="Source" disabled={controlsDisabled} value={filters.origin} onValueChange={value=>filter('origin',value)}><option value="all">All sources</option><option value="automatic">System arranged</option><option value="manual">User arranged</option></SelectField></label>
      {kind==='history'&&<label>Reason<SelectField aria-label="Reason" disabled={controlsDisabled} value={filters.reason} onValueChange={value=>filter('reason',value)} options={[{value:'all',label:'All reasons'},{value:'user-skipped',label:'Skipped individually'},{value:'bulk-skip',label:'Skipped in bulk'},{value:'merged-review',label:'Merged into review'},{value:'no-longer-due',label:'No longer due'}]}/></label>}
      <div className="study-date-filters">
        <div className="study-collection-date"><label htmlFor={`${fieldId}-from`}>From</label><DateField id={`${fieldId}-from`} label="From" value={filters.from} max={filters.to||undefined} onChange={value=>filter('from',value)}/></div>
        <div className="study-collection-date"><label htmlFor={`${fieldId}-to`}>To</label><DateField id={`${fieldId}-to`} label="To" value={filters.to} min={filters.from||undefined} onChange={value=>filter('to',value)}/></div>
      </div>
      </div>
    </fieldset>}
    {total>0&&<fieldset disabled={saving||loading||preparing} className="study-collection-actions"><legend className="sr-only">Batch task actions</legend>
      <div className="study-selection-toolbar">
        <p className="study-selection-summary" role="status">{selection.length} selected · {total} matching tasks</p>
        <div className="btn-row study-selection-controls"><button type="button" className="btn line" disabled={!visible.some(eligible)} onClick={()=>setSelected([...new Set([...selection,...visible.filter(eligible).map(plan=>plan.id)])])}>Select this page</button><button type="button" className="btn line" disabled={!total} onClick={()=>void selectAll()}>Select all filtered results</button><button type="button" className="btn text" disabled={!selection.length} onClick={()=>setSelected([])}>Clear selection</button></div>
      </div>
      {kind==='waiting'&&<label className="check-field study-include-started"><input type="checkbox" checked={includeStarted} onChange={event=>{setIncludeStarted(event.target.checked);setSelected([]);}}/>Include started tasks in selection</label>}
      {!selection.length&&<p className="study-selection-hint">{kind==='waiting'?'Select tasks below to arrange a date, hold them for later or skip them.':'Select tasks below to preview an archive change.'}</p>}
      {selection.length>0&&<div className={`study-bulk-controls is-${kind}`} role="group" aria-label="Selected task actions">{kind==='waiting'?<>
        <section className="study-bulk-group"><h4>Schedule</h4><div className="btn-row">
          <button type="button" className="btn primary" onClick={()=>prepare('replan')}>Preview automatic replan</button>
          <button type="button" className="btn line" onClick={()=>prepare('reschedule',selection,{dateKey:dateKey(new Date())})}>Preview arrange today</button>
        </div></section>
        <section className="study-bulk-group"><h4>Choose a date</h4><div className="study-arrange-controls">
          <div className="study-collection-date"><label className="sr-only" htmlFor={`${fieldId}-arrange`}>Arrange date</label><DateField id={`${fieldId}-arrange`} label="Arrange date" value={scheduleDate} onChange={setScheduleDate}/></div>
          <button type="button" className="btn line" disabled={!scheduleDate} onClick={()=>prepare('reschedule',selection,{dateKey:scheduleDate})}>Preview arrange</button>
        </div></section>
        <section className="study-bulk-group"><h4>Task status</h4><div className="btn-row">
          <button type="button" className="btn line" onClick={()=>prepare('hold')}>Preview hold</button>
          <button type="button" className="btn line" disabled={!selection.some(id=>tasks.find(plan=>plan.id===id)?.onHold)} onClick={()=>prepare('resume')}>Preview return to waiting</button>
          <button type="button" className="btn line" onClick={()=>prepare('skip')}>Preview skip</button>
        </div></section>
      </>:<>
        <button type="button" className="btn line" onClick={()=>prepare(filters.status==='archived'?'unarchive':'archive')}>{filters.status==='archived'?'Preview unarchive':'Preview archive'}</button>
      </>}</div>
      }
      {kind==='history'&&<div className="study-history-utility"><button type="button" className="btn line" disabled={server?['completed','archived'].includes(filters.status):!filtered.some(plan=>plan.status==='skipped'&&!plan.archivedAt)} onClick={()=>void archiveSkipped()}>Archive skipped results</button></div>}
    </fieldset>}
    {error&&!preview&&<div role="alert"><p>{error}</p>{server&&<button type="button" className="btn line" onClick={()=>void fb.refreshPlanningState().then(()=>setReload(value=>value+1)).catch(cause=>setError(cause.message))}>Refresh history</button>}</div>}
    {(loading||preparing)&&<p role="status">{preparing?'Preparing selected tasks…':'Loading history…'}</p>}
    {!loading&&<div className="study-task-list">{visible.map(plan=><div key={plan.id} className="study-selectable-task"><label className="check-field"><input type="checkbox" aria-label={`Select ${plan.title}`} checked={selection.includes(plan.id)} disabled={saving||preparing||!eligible(plan)} onChange={event=>setSelected(event.target.checked?[...selection,plan.id]:selection.filter(id=>id!==plan.id))}/>Select task</label>{renderTask(plan)}</div>)}</div>}
    {!loading&&!preparing&&!error&&!total&&<div className="study-collection-empty">{!filtersActive&&kind==='waiting'?<CheckCircle2 size={26} aria-hidden="true"/>:<ListFilter size={26} aria-hidden="true"/>}<h4>{filtersActive?'No tasks match these filters':kind==='waiting'?'All caught up':'No visible history'}</h4><p>{filtersActive?'Change a filter or use Reset filters to see more tasks.':kind==='waiting'?'There are no unfinished tasks waiting for a date. Continue with your schedule.':'Completed and skipped tasks appear here. Use Status to view archived tasks.'}</p></div>}
    {pages>1&&<nav className="study-pagination" aria-label={`${kind} pages`}><button type="button" className="btn line" disabled={!current||loading||preparing} onClick={()=>setPage(current-1)}>Previous page</button><span>Page {current+1} of {pages} · {total} tasks · {PAGE_SIZE} per page</span><button type="button" className="btn line" disabled={current+1>=pages||loading||preparing} onClick={()=>setPage(current+1)}>Next page</button></nav>}
    <Dialog.Root open={Boolean(preview)} onOpenChange={open=>{if(!open&&!saving)setPreview(null);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content study-backlog-preview"><Dialog.Title>Review task changes</Dialog.Title><Dialog.Description>{preview?.changes.filter(change=>change.selected).length} selected tasks · {preview?.changes.filter(change=>!change.selected).length} related schedule changes. Tasks that cannot fit remain waiting. Unarchiving restores visibility; choose a date separately to run a skipped task again.</Dialog.Description><ul>{preview?.changes.map(change=><li key={String(change.id)}><strong>{change.title}</strong><small>{change.selected?'Selected task':'Related schedule change'}</small>{change.previousTitle&&change.previousTitle!==change.title&&<p>Previously: {change.previousTitle}</p>}<span>{change.changeType==='added'?`Added to schedule · ${change.to} · ${change.toMinutes} min`:change.changeType==='removed'?`Removed from schedule · ${change.from} · ${change.fromMinutes} min`:`${change.from} → ${change.archived?'Archived':change.onHold?'On hold':change.status==='skipped'?'Skipped':change.to}`}</span>{change.changeType==='updated'&&change.fromMinutes!==change.toMinutes&&<p>{change.fromMinutes} → {change.toMinutes} min</p>}{change.requirementsChanged&&<p>Task requirements updated.</p>}{change.reason&&<p>{change.reason}</p>}</li>)}</ul>{error&&<p role="alert">{error}</p>}<div className="btn-row"><button type="button" className="btn line" disabled={saving} onClick={()=>setPreview(null)}>Back to selection</button><button type="button" className="btn primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save task changes'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
