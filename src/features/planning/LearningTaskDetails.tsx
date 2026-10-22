import type { StudyPlan } from '../../domain/plans';

export function LearningTaskDetails({plan,batchSize}:{plan:StudyPlan;batchSize:number}) {
  const target=plan.target;
  if(target?.type!=='vocabulary'||target.mode!=='learning-batch')return null;
  const count=target.cards?.length||target.entryIds?.length;
  if(!count||count===batchSize)return null;
  return <details className="study-word-selection">
    <summary>Why {count} {count===1?'word':'words'}?</summary>
    <p>This task has a saved selection of {count} {count===1?'word':'words'}. Your current limit is up to {batchSize} {batchSize===1?'word':'words'} per new batch. Changing limits keeps saved word selections intact.</p>
    <p>New tasks also depend on the daily goal, available study time and words remaining in the source group.</p>
  </details>;
}
