import type { ExamAttempt, IntensiveSession, ExamSkill } from '../domain/exam/types';
import { dateKey } from '../domain/utils';
import { isProtectedPlan } from '../domain/plans';
import { dueIntensive } from '../domain/exam/store';
import { intensiveReviewEnabled } from '../domain/exam/intensive';

export function isListeningCheckPlan(plan: Record<string, any>, sessionId?: string): boolean {
  if (plan.kind !== 'listening-intensive') return false;
  return plan.target?.reviewMode === 'listening-check' || (sessionId ? plan.driver === `intensive:${sessionId}` : String(plan.driver || '').startsWith('intensive:'))
    // Earlier automatic starts discarded reviewMode but retained this exact completion contract.
    || !plan.driver && plan.origin === 'automatic' && plan.schemaVersion === 2 && plan.target?.type === 'intensive'
      && plan.completion?.type === 'review' && plan.completion.description === 'Complete the selected sentence listening review.';
}

/** Retire untouched automatic reminders only; actual work and manual choices stay in history. */
export function retireInactiveSentenceReviews(state: { plans: Record<string, any>[]; intensiveSessions?: IntensiveSession[]; activePlanId?: string | null }, now = new Date()) {
  for (const plan of state.plans || []) {
    if (isProtectedPlan(plan) || plan.origin !== 'automatic' || plan.onHold || plan.archivedAt || plan.draft || plan.restoredAt || plan.linkedSessionId) continue;
    if (!isListeningCheckPlan(plan)) continue;
    const sentence = state.intensiveSessions?.find(row => row.sectionId === (plan.target?.sectionId || plan.sectionId) && row.sentenceId === (plan.target?.sentenceId || plan.sentenceId));
    if (!sentence?.completedAt || intensiveReviewEnabled(sentence)) continue;
    plan.previousStatus = plan.status; plan.status = 'skipped'; plan.skipReason = 'no-longer-due'; plan.skippedAt = now.toISOString();
    if (state.activePlanId === plan.id) state.activePlanId = null;
  }
}

/** Explain the actual completion rule, including for plans saved before this wording. */
export function receptivePlanCompletionDescription(plan: Record<string, any>): string {
  if (plan.kind === 'listening-intensive') return isListeningCheckPlan(plan)
    ? 'Listen to the whole sentence without the transcript, rate your understanding, and save the review.'
    : 'Finish dictation, comparison, shadowing, blind replay and self-rating, then save. A perfect score is not required.';
  if (plan.kind === 'listening-review') return 'Save an error reason for every wrong answer. Retrying for a higher score is optional.';
  if (plan.kind === 'reading-review') return 'Save passage evidence and an error reason for every wrong answer. Retrying for a higher score is optional.';
  if (/^(listening|reading)-(practice|mock)$/.test(plan.kind || '')) return 'Submit and save the selected practice. Accuracy is tracked separately; mistake review is a separate task.';
  return plan.completion?.description || '';
}

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
  const due=dueIntensive(state.intensiveSessions||[])[0];
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
  if(plan.kind==='listening-intensive'&&(plan.target?.sectionId||plan.sectionId)) {
    const query=new URLSearchParams();
    const sentence=plan.target?.sentenceId||plan.sentenceId;
    if(sentence)query.set('sentence',sentence);
    if(isListeningCheckPlan(plan))query.set('review','sentence');
    return `/listening/intensive/${encodeURIComponent(plan.target?.sectionId||plan.sectionId)}${query.size?`?${query}`:''}`;
  }
  if(plan.attemptId)return `/${skill}/review/${encodeURIComponent(plan.attemptId)}`;
  if(plan.kind.endsWith('review'))return `/${skill}/review`;
  if(plan.sectionId)return `/${skill}/${encodeURIComponent(plan.sectionId)}`;
  return `/${skill}`;
}

type CompletionState = { activePlanId: string | null; plans: Record<string, any>[]; examAttempts?: ExamAttempt[]; intensiveSessions?: IntensiveSession[] };
/** Completing a task must be driven by work done after that task started. */
export function completeReceptivePlanIfMatched(state: CompletionState, previous?: CompletionState | null, recoverSaved = false) {
  let completed: Record<string, any> | null = null;
  for (const plan of state.plans) {
    if (!plan.target && plan.id !== state.activePlanId) continue;
    completed = completeBoundReceptivePlan(state, plan, previous, recoverSaved) || completed;
  }
  return completed;
}

const COMPLETION_FIELDS = ['status', 'completedAt', 'linkedSessionId', 'sectionId', 'sentenceId'] as const;
/**
 * Completing a task is applied to memory before its save finishes. Capture the
 * unfinished tasks first, so a failed save can return exactly those tasks to
 * their saved state without discarding unrelated concurrent changes.
 */
export function captureReceptiveCompletion(state: CompletionState) {
  const before = new Map<string, Record<string, any>>(state.plans.filter(plan => plan.status === 'in_progress')
    .map(plan => [plan.id, Object.fromEntries(COMPLETION_FIELDS.map(field => [field, plan[field]]))]));
  const activePlanId = state.activePlanId;
  return {
    completedIds(next: CompletionState): string[] {
      return next.plans.filter(plan => before.has(plan.id) && plan.status !== before.get(plan.id)!.status).map(plan => plan.id);
    },
    activePlanChanged(next: CompletionState) { return next.activePlanId !== activePlanId; },
    /** Restore only tasks whose completion this attempt applied. */
    rollback(target: CompletionState, ids: string[]) {
      const completed = new Set(ids);
      const plans = target.plans.map(plan => {
        const prior = before.get(plan.id);
        if (!prior || !completed.has(plan.id) || plan.status !== 'completed') return plan;
        const restored = { ...plan };
        for (const field of COMPLETION_FIELDS) { if (prior[field] === undefined) delete restored[field]; else restored[field] = prior[field]; }
        return restored;
      });
      return { ...target, plans, activePlanId: ids.length && target.activePlanId === null ? activePlanId : target.activePlanId };
    },
  };
}

function completeBoundReceptivePlan(state: CompletionState, plan: Record<string, any>, previous?: CompletionState | null, recoverSaved = false) {
  if (plan.status !== 'in_progress') return null;
  if (!plan || !plan.startedAt || !/^(reading|listening)-/.test(plan.kind)) return null;
  const skill: ExamSkill = plan.kind.startsWith('reading') ? 'reading' : 'listening';
  const afterStart = (value?: string) => Boolean(value && Date.parse(value) >= Math.max(Date.parse(plan.startedAt), Date.parse(plan.restoredAt || plan.startedAt)));
  const exactPlan = (row: Record<string,any>) => !plan.target || row.planId === plan.id;
  let linked: { id: string; completedAt?: string } | undefined;
  if (plan.kind === 'listening-intensive') {
    for (const row of state.intensiveSessions || []) {
      const sectionId = plan.target?.sectionId || plan.sectionId, sentenceId = plan.target?.sentenceId || plan.sentenceId;
      if (sectionId && row.sectionId !== sectionId || sentenceId && row.sentenceId !== sentenceId) continue;
      if (!isListeningCheckPlan(plan, row.id) && row.stage === 6 && exactPlan(row) && afterStart(row.completedAt)) { linked = row; break; }
      if (row.completedAt && isListeningCheckPlan(plan, row.id)) {
        const check = row.listeningReviews?.find(check => afterStart(check.reviewedAt) && (!plan.target || check.planId === plan.id));
        if (check) { linked = { ...row, completedAt: check.reviewedAt }; break; }
      }
    }
    if (linked) {
      const sentence = linked as IntensiveSession;
      plan.sectionId = sentence.sectionId;
      plan.sentenceId = sentence.sentenceId;
    }
  } else if (plan.kind.endsWith('-review')) {
    linked = state.examAttempts?.find(row => {
      if (row.skill !== skill || row.status !== 'completed' || ((plan.target?.attemptId || plan.attemptId) && row.id !== (plan.target?.attemptId || plan.attemptId)) || !exactPlan(row) || plan.target && !afterStart(row.updatedAt)) return false;
      const before = previous?.examAttempts?.find(prior => prior.id === row.id);
      if (!before && !(recoverSaved && plan.target?.type === 'exam-review')) return false;
      const wrong = Object.entries(row.results || {}).filter(([, correct]) => !correct).map(([id]) => id);
      const diagnosed = wrong.length > 0 && wrong.every(id => Boolean(row.errorReasons?.[id]?.trim()) && (skill !== 'reading' || Boolean(row.evidence?.[id]?.trim())));
      const changed = recoverSaved || before && JSON.stringify([row.evidence, row.errorReasons, row.keywords]) !== JSON.stringify([before.evidence, before.errorReasons, before.keywords]);
      return diagnosed && changed;
    });
  } else {
    linked = state.examAttempts?.find(row => {
      if(row.skill!==skill||row.status!=='completed'||!exactPlan(row)||!afterStart(row.completedAt)||plan.sectionId&&!row.sectionIds.includes(plan.sectionId))return false;
      if(!plan.target)return true;
      if(row.mode!==plan.target.mode||row.sectionIds.length!==1||row.sectionIds[0]!==plan.target.sectionId)return false;
      const ids: string[] | undefined=plan.target.questionIds;
      // Grading stores a result for every frozen question, including unanswered ones.
      // Its keys let cold planning verify the exact scope without loading question content.
      const actualIds = row.questionSnapshot?.map(question=>question.id) || (recoverSaved ? Object.keys(row.results || {}) : []);
      return !ids || ids.length>0 && JSON.stringify(ids.slice().sort())===JSON.stringify(actualIds.sort()) && ids.every(id=>{const value=row.responses?.[id];return Array.isArray(value)?value.length>0&&value.every(item=>String(item).trim()):Boolean(String(value||'').trim());});
    });
  }
  if (!linked) return null;
  plan.status = 'completed';
  plan.completedAt = plan.kind.endsWith('-review') ? (linked as ExamAttempt).updatedAt || new Date().toISOString() : linked.completedAt;
  plan.linkedSessionId = linked.id;
  if (state.activePlanId === plan.id) state.activePlanId = null;
  return plan;
}
