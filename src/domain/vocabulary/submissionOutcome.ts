import type { VocabularySessionRecord } from './session';
import { completeVocabularyPlan } from '../plans';

export type VocabularySubmissionOutcome={learningSaved:boolean;planId?:string;taskStatus:'unlinked'|'completed'|'already-completed'|'requirements-unmet'|'changed'|'retry';message:string};

/** Check the frozen task contract separately from saving learning evidence. */
export function vocabularyTaskSubmissionOutcome(state:{plans?:unknown[]},session:VocabularySessionRecord):VocabularySubmissionOutcome{
  const base={learningSaved:true,planId:session.planId};
  if(!session.planId)return {...base,taskStatus:'unlinked',message:'Learning saved. This self-directed session is not linked to a task.'};
  const plan=(state.plans||[]).find((row:any)=>row.id===session.planId) as any;
  if(plan?.status==='completed')return {...base,taskStatus:plan.linkedSessionId===session.id?'completed':'already-completed',message:plan.linkedSessionId===session.id?'Learning saved and the planned task is complete.':'Learning saved. This task was already completed by another session; its completion was preserved.'};
  if(!plan||plan.status!=='in_progress')return {...base,taskStatus:'changed',message:'Learning saved. The linked task was removed, skipped or changed; it was not completed by this session.'};
  const probe={plans:[structuredClone(plan)],activePlanId:plan.id};
  if(!completeVocabularyPlan(probe,session))return {...base,taskStatus:'requirements-unmet',message:'Learning saved. The task still requires its complete assigned word list, mode and graded answers. Incorrect answers count as attempts; missing or ungraded answers do not.'};
  return {...base,taskStatus:'completed',message:'Learning saved and the planned task is complete.'};
}
