// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, ArrowRight } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { planningSettingsKey } from '../../lib/planTemplates';
import { dateKey } from '../../domain';

export function useStudySchedule() {
  const fb=useFieldbook();const [saving,setSaving]=useState(true);const [error,setError]=useState('');
  const settingsKey=planningSettingsKey(fb.state.settings);const [today,setToday]=useState(()=>dateKey(new Date()));
  const inFlight=useRef(null),rerun=useRef(false);const [revision,setRevision]=useState(0);
  const activityKey=JSON.stringify([
    (fb.state.vocabularySessions||[]).filter(row=>row.status==='submitted').map(row=>[row.id,row.submittedAt]),
    (fb.state.sessions||[]).map(row=>[row.id,row.date]),
    (fb.state.examAttempts||[]).filter(row=>row.status==='completed').map(row=>[row.id,row.completedAt]),
    (fb.state.intensiveSessions||[]).map(row=>[row.id,row.completedAt,row.nextReviewAt]),
    (fb.state.assessments||[]).map(row=>[row.id,row.date]),
    (fb.state.errors||[]).map(row=>[row.id,row.resolved,row.nextReviewAt]),
    (fb.state.plans||[]).filter(row=>row.origin==='manual'||['completed','skipped'].includes(row.status)).map(row=>[row.id,row.status,row.dateKey,row.manuallyEditedAt]),
  ]);
  const refresh=useCallback(()=>{
    if(inFlight.current){rerun.current=true;return inFlight.current;}
    const operation=Promise.resolve().then(async()=>{
      setSaving(true);setError('');let feedback='';
      try{if(!await fb.ensureUnifiedPlans({onError:message=>{feedback=message;}}))setError(feedback||'Your plan could not be saved. Retry to keep these tasks.');}
      catch(cause){setError(cause instanceof Error?cause.message:'Your plan could not load. Retry shortly.');}
      finally{setSaving(false);inFlight.current=null;if(rerun.current){rerun.current=false;setRevision(value=>value+1);}}
    });
    inFlight.current=operation;return operation;
  },[fb.ensureUnifiedPlans]);
  useEffect(()=>{void refresh();},[refresh,settingsKey,today,activityKey,revision]);
  useEffect(()=>{
    const at=new Date(),midnight=new Date(at);midnight.setHours(24,0,0,0);
    const timer=setTimeout(()=>setToday(dateKey(new Date())),Math.max(1,midnight.getTime()-at.getTime()));
    const foreground=()=>{if(document.visibilityState==='hidden')return;const current=dateKey(new Date());if(current!==today)setToday(current);else void refresh();};
    window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground);};
  },[refresh,today]);
  return {saving,error,refresh};
}

export function TaskStartButton({plan}) {
  const fb=useFieldbook();const [starting,setStarting]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{setError('');},[plan.id]);
  async function start(){
    setStarting(true);setError('');
    let feedback='';
    try{if(!await fb.startPlan(plan.id,{force:Boolean(error),onError:message=>{feedback=message;}}))setError(feedback||'Your task could not be saved. Retry to start.');}
    catch(cause){setError(cause instanceof Error?cause.message:'The selected task could not load. Retry shortly.');}
    finally{setStarting(false);}
  }
  return <div className="study-start-action">{error&&<p className="study-alert" role="alert">{error}</p>}<button type="button" className={`btn ${plan.status==='completed'?'line':'primary'}`} disabled={starting||plan.status==='skipped'} onClick={()=>void start()}>{error?<RotateCcw size={16}/>:plan.status==='completed'?<ArrowRight size={16}/>:<Play size={16}/>} {starting?'Opening...':error?'Retry task':plan.status==='completed'?'View':plan.status==='in_progress'?'Resume':'Start'}</button></div>;
}
