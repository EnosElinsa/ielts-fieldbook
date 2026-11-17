import { isReplannableLearningPlan, type StudyPlan } from '../../domain/plans';

export function LearningTaskDetails({plan,batchSize}:{plan:StudyPlan;batchSize:number}) {
  const target=plan.target;
  if(target?.type!=='vocabulary'||target.mode!=='learning-batch')return null;
  const count=target.cards?.length||target.entryIds?.length;
  if(!count||count===batchSize)return null;
  const allocation=target.allocation;
  const reasons=allocation && count<allocation.batchSize ? [
    allocation.sourceRemaining===count ? `Only ${count} eligible new ${count===1?'word remained':'words remained'} in this source group when this task was created. Each batch stays within one group; words already learned or reserved in another task are excluded.` : null,
    allocation.dailyRemaining===count ? `${count} ${count===1?'word remained':'words remained'} in the daily new-word goal when this task was created.` : null,
    allocation.minutesRemaining===count ? `The remaining vocabulary time allowed ${count} ${count===1?'word':'words'} when this task was created (about one minute per word).` : null,
  ].filter(Boolean) : [];
  return <details className="study-word-selection">
    <summary>Why {count} {count===1?'word':'words'}?</summary>
    {reasons.length
      ? reasons.map(reason=><p key={reason}>{reason}</p>)
      : <p>This task has a saved selection of {count} {count===1?'word':'words'}. Your current limit is up to {batchSize} {batchSize===1?'word':'words'} per new batch. Changing limits keeps saved word selections intact.</p>}
    {!allocation && isReplannableLearningPlan(plan) ? <p>The original size limit was not recorded for this older task.</p> : null}
  </details>;
}
