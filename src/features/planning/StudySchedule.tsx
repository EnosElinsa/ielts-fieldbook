// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { Play, RotateCcw, ArrowRight } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { planningSettingsKey } from '../../lib/planTemplates';
import { dateKey } from '../../domain';

export function useStudySchedule() {
  const fb=useFieldbook();const [saving,setSaving]=useState(true);const [error,setError]=useState('');
  const settingsKey=planningSettingsKey(fb.state.settings);const today=dateKey(new Date());
  const refresh=useCallback(async()=>{
    setSaving(true);setError('');
    let feedback='';
    try{if(!await fb.ensureUnifiedPlans({onError:message=>{feedback=message;}}))setError(feedback||'Your plan could not be saved. Retry to keep these tasks.');}
    catch(cause){setError(cause instanceof Error?cause.message:'Your plan could not load. Retry shortly.');}
    finally{setSaving(false);}
  },[fb.ensureUnifiedPlans]);
  useEffect(()=>{void refresh();},[refresh,settingsKey,today]);
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
