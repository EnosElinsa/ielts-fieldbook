import type { ExamAttempt, IntensiveSession, ExamSkill } from '../domain/exam/types';
import { dateKey } from '../domain/utils';

export const receptivePlanTemplates = {
  reading: [
    {kind:'reading-practice',title:'Reading · Locate and prove',description:'Find the passage evidence and identify the paraphrase before you answer.',deskMode:'full'},
    {kind:'reading-review',title:'Reading · Review mistakes',description:'Re-read the evidence and explain why your original choice was wrong.',deskMode:'full'},
    {kind:'reading-practice',title:'Reading · Timed passage',description:'Finish one passage, then check accuracy and time spent.',deskMode:'timed'},
  ],
  listening: [
    {kind:'listening-practice',title:'Listening · Predict and follow',description:'Predict the answer form, follow the signals, and check your spelling.',deskMode:'full'},
    {kind:'listening-intensive',title:'Listening · Intensive practice',description:'Listen blind, transcribe, compare, shadow, and listen again.',deskMode:'full'},
    {kind:'listening-review',title:'Listening · Review mistakes',description:'Return to the answer sentence and identify why you missed it.',deskMode:'full'},
  ],
};
type ReceptiveState = {settings:{days:number[]};plans:Record<string,any>[];examAttempts?:ExamAttempt[];intensiveSessions?:IntensiveSession[]};
export function ensureReceptivePlans(state:ReceptiveState, skill:ExamSkill, changed?:()=>void) {
  const generated:Record<string,any>[]=[];const cursor=new Date();cursor.setHours(0,0,0,0);
  const templates=receptivePlanTemplates[skill];
  const due=(state.intensiveSessions||[]).filter(s=>s.nextReviewAt&&Date.parse(s.nextReviewAt)<=Date.now()).sort((a,b)=>String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)))[0];
  const latest=(state.examAttempts||[]).filter(a=>a.skill===skill&&a.status==='completed'&&Object.values(a.results||{}).some(v=>!v)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
  for(let day=0;day<35&&generated.length<Math.max(1,state.settings.days.length);day++,cursor.setDate(cursor.getDate()+1)) {
    if(!state.settings.days.includes(cursor.getDay()||7))continue;
    const date=dateKey(cursor);const id=`plan-${skill}-${date}`;let plan=state.plans.find(p=>p.id===id);
    if(!plan) {
      const template=templates[generated.length%templates.length];
      const first=generated.length===0;
      plan={id,dateKey:date,...template,status:'pending',linkedSessionId:null,startedAt:null,completedAt:null,skill};
      if(first&&skill==='listening'&&due)Object.assign(plan,{...templates[1],sectionId:due.sectionId,sentenceId:due.sentenceId,driver:`intensive:${due.id}`,title:'Listening · Recall a due sentence'});
      else if(first&&latest)Object.assign(plan,{kind:`${skill}-review`,title:`${skill==='reading'?'Reading':'Listening'} · Fix your last mistakes`,description:'Revisit the evidence, then try the missed questions again.',attemptId:latest.id,driver:`exam:${latest.id}`});
      state.plans.push(plan);changed?.();
    }
    generated.push(plan);
  }
  return generated;
}
export function receptivePlanPath(plan:Record<string,any>, skill:ExamSkill):string {
  if (plan.target?.type==='section' && plan.target.sectionId) return `/${skill}/${encodeURIComponent(plan.target.sectionId)}`;
  if (plan.target?.type==='exam-review') return `/${skill}/review/${encodeURIComponent(plan.target.attemptId)}`;
  if(plan.kind==='listening-intensive'&&plan.sectionId)return `/listening/intensive/${encodeURIComponent(plan.sectionId)}${plan.sentenceId?`?sentence=${encodeURIComponent(plan.sentenceId)}`:''}`;
  if(plan.attemptId)return `/${skill}/review/${encodeURIComponent(plan.attemptId)}`;
  if(plan.kind.endsWith('review'))return `/${skill}/review`;
  if(plan.sectionId)return `/${skill}/${encodeURIComponent(plan.sectionId)}`;
  return `/${skill}`;
}

type CompletionState = { activePlanId: string | null; plans: Record<string, any>[]; examAttempts?: ExamAttempt[]; intensiveSessions?: IntensiveSession[] };
/** Completing a task must be driven by work done after that task started. */
export function completeReceptivePlanIfMatched(state: CompletionState, previous?: CompletionState | null) {
  let completed: Record<string, any> | null = null;
  for (const plan of state.plans) {
    if (!plan.target && plan.id !== state.activePlanId) continue;
    completed = completeBoundReceptivePlan(state, plan, previous) || completed;
  }
  return completed;
}

function completeBoundReceptivePlan(state: CompletionState, plan: Record<string, any>, previous?: CompletionState | null) {
  if (plan.status !== 'in_progress') return null;
  if (!plan || !plan.startedAt || !/^(reading|listening)-/.test(plan.kind)) return null;
  const skill: ExamSkill = plan.kind.startsWith('reading') ? 'reading' : 'listening';
  const afterStart = (value?: string) => Boolean(value && Date.parse(value) >= Date.parse(plan.startedAt));
  const exactPlan = (row: Record<string,any>) => !plan.target || row.planId === plan.id;
  let linked: { id: string; completedAt?: string } | undefined;
  if (plan.kind === 'listening-intensive') {
    linked = state.intensiveSessions?.find(row => row.stage === 6 && exactPlan(row) && afterStart(row.completedAt) && (!plan.sectionId || row.sectionId === plan.sectionId) && (!plan.sentenceId || row.sentenceId === plan.sentenceId));
    if (linked) {
      const sentence = linked as IntensiveSession;
      plan.sectionId = sentence.sectionId;
      plan.sentenceId = sentence.sentenceId;
    }
  } else if (plan.kind.endsWith('-review')) {
    linked = state.examAttempts?.find(row => {
      if (row.skill !== skill || row.status !== 'completed' || (plan.attemptId && row.id !== plan.attemptId) || !exactPlan(row) || plan.target && !afterStart(row.updatedAt)) return false;
      const before = previous?.examAttempts?.find(prior => prior.id === row.id);
      if (!before) return false;
      const wrong = Object.entries(row.results || {}).filter(([, correct]) => !correct).map(([id]) => id);
      const diagnosed = wrong.length > 0 && wrong.every(id => Boolean(row.errorReasons?.[id]?.trim()) && (skill !== 'reading' || Boolean(row.evidence?.[id]?.trim())));
      const changed = JSON.stringify([row.evidence, row.errorReasons, row.keywords]) !== JSON.stringify([before.evidence, before.errorReasons, before.keywords]);
      return diagnosed && changed;
    });
  } else {
    linked = state.examAttempts?.find(row => {
      if(row.skill!==skill||row.status!=='completed'||!exactPlan(row)||!afterStart(row.completedAt)||plan.sectionId&&!row.sectionIds.includes(plan.sectionId))return false;
      if(!plan.target)return true;
      if(row.mode!==plan.target.mode||row.sectionIds.length!==1||row.sectionIds[0]!==plan.target.sectionId)return false;
      const ids: string[] | undefined=plan.target.questionIds;
      return !ids || ids.length>0 && JSON.stringify(ids.slice().sort())===JSON.stringify((row.questionSnapshot||[]).map(question=>question.id).sort()) && ids.every(id=>{const value=row.responses?.[id];return Array.isArray(value)?value.length>0&&value.every(item=>String(item).trim()):Boolean(String(value||'').trim());});
    });
  }
  if (!linked) return null;
  plan.status = 'completed';
  plan.completedAt = plan.kind.endsWith('-review') ? new Date().toISOString() : linked.completedAt;
  plan.linkedSessionId = linked.id;
  if (state.activePlanId === plan.id) state.activePlanId = null;
  return plan;
}
