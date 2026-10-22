import { buildLearningBatch } from '../domain/vocabulary/learningBatch';
import { vocabularyLearningSource } from '../domain/vocabulary/learningSource';
import type { StudyPlan } from '../domain/plans';
import type { ExamCatalog } from '../domain/exam/types';
import { displayName } from './format';
import { bindSpeakingPlan } from '../domain/plans';
import { planningEvidenceView } from '../domain/planningEvidence';

type Sources = {
  bank: (skill: 'writing' | 'speaking') => Promise<any[]>;
  catalog: (skill: 'reading' | 'listening') => Promise<ExamCatalog>;
  section: (ids: string[]) => Promise<ExamCatalog>;
  vocabulary: (bookId: string, unitId: string) => Promise<unknown>;
};

export async function bindStudyPlanTargets(state: any, sources: Sources) {
  const catalogs = new Map<string, ExamCatalog>();
  const banks = new Map<string, any[]>();
  const reserved = new Set(state.plans.map((plan: StudyPlan) => plan.target?.type === 'section' ? plan.target.sectionId : null).filter(Boolean));
  for (const plan of state.plans as StudyPlan[]) {
    if (plan.status !== 'pending' || !plan.target) continue;
    const target = plan.target;
    if (target.type === 'question' && (!target.questionId || !plan.targetLabel || target.skill === 'speaking' && !target.prompts?.length)) {
      const skill = target.skill;
      if (!banks.has(skill)) banks.set(skill, await sources.bank(skill));
      const mock = plan.kind === 'writing-mock' || plan.kind === 'speaking-mock';
      const part = mock ? '1' : target.part === '3' ? '2' : target.part;
      const kind = plan.kind === 'writing-mock' ? '1' : plan.kind;
      const candidates = banks.get(skill)!.filter(row => skill === 'writing' ? String(row.type) === kind : String(row.part) === part && !row.incomplete).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const selected = target.questionId ? banks.get(skill)!.find(row => String(row.id) === String(target.questionId)) : candidates[Number(plan.rotationIndex || 0) % candidates.length];
      if (!selected) throw new Error(`The ${skill} question bank is unavailable. Retry your plan.`);
      if (!candidates.some(row=>String(row.id)===String(selected.id))) throw new Error('The selected question does not match this practice.');
      target.questionId = String(selected.id);plan.questionId = target.questionId;
      if (mock && skill === 'speaking') target.part = '1';
      if (skill === 'speaking') bindSpeakingPlan(plan, selected, target.part || plan.kind.slice(-1), plan.targetPrompt, banks.get(skill));
      plan.targetLabel = selected.name || selected.title || selected.topic || `Question ${selected.id}`;
      plan.quantity = skill === 'speaking' ? plan.target.type === 'question' ? plan.target.prompts?.length || 1 : 1 : 1;
    } else if (target.type === 'section' && (!target.sectionId || !target.questionIds?.length)) {
      const skill = target.skill;
      if (!catalogs.has(skill)) catalogs.set(skill, await sources.catalog(skill));
      const catalog = catalogs.get(skill)!;
      const tried = new Set((planningEvidenceView(state).examAttempts || []).filter((attempt:any)=>attempt.skill===skill && attempt.status==='completed').flatMap((attempt:any)=>attempt.sectionIds));
      const candidates = catalog.sections.filter(section=>section.skill===skill && section.status==='ready').sort((a,b)=>a.id.localeCompare(b.id));
      const fresh = candidates.filter(section=>!tried.has(section.id) && !reserved.has(section.id));
      const choices = fresh.length ? fresh : candidates;
      const selected = target.sectionId ? candidates.find(row=>row.id===target.sectionId) : choices[Number(plan.rotationIndex || 0) % choices.length];
      if (!selected) throw new Error(`The ${skill} question bank is unavailable. Retry your plan.`);
      const scoped = await sources.section([selected.id]);
      const maximum = Math.floor(plan.estimatedMinutes / (skill==='reading' ? 2 : 1));
      const questions = scoped.questions.filter(question=>question.sectionId===selected.id).sort((a,b)=>a.number-b.number).slice(0,maximum);
      if (!questions.length) throw new Error('The selected section is incomplete. Retry your plan.');
      target.sectionId=selected.id;target.questionIds=questions.map(question=>question.id);plan.sectionId=selected.id;
      const paper=catalog.papers?.find(paper=>paper.id===selected.paperId);
      plan.targetLabel=`${paper?.title || selected.title} / ${skill==='reading'?'Passage':'Part'} ${selected.part}`;
      plan.quantity=questions.length;reserved.add(selected.id);
    } else if (target.type==='intensive') {
      const scoped=await sources.section([target.sectionId]);
      if(!scoped.sections.some(row=>row.skill==='listening'&&row.id===target.sectionId&&row.sentences?.some(sentence=>sentence.id===target.sentenceId)))throw new Error('The selected listening sentence is unavailable.');
    } else if (target.type==='vocabulary' && target.mode==='learning-batch' && !target.cards.length && target.bookId && target.unitId) {
      await sources.vocabulary(target.bookId,target.unitId);
      const automatic = plan.origin === 'automatic' && !plan.startedAt && !plan.originalDateKey && target.binding !== 'frozen';
      const source = vocabularyLearningSource(state,target.bookId,target.unitId);
      // A catalog may expose only a group count until its source is published.
      // Keep that future allocation prospective; exact starts still require resources.
      if (automatic && !source.complete && !source.entryIds.length) continue;
      if (automatic && target.selectionPolicy!=='exact' && source.complete && (target.batchIndex || 0) * (target.batchSize || 10) >= source.count) {
        // Provisional metadata can shrink once resources arrive. Only untouched,
        // unbound automatic slots may disappear; exact/manual work stays explicit.
        state.plans = state.plans.filter((row: StudyPlan) => row !== plan);
        continue;
      }
      const plannedIds=target.selectionPolicy==='exact'?target.entryIds:undefined;
      const exactIds=plannedIds&&automatic?plannedIds.filter(entryId=>source.entryIds.includes(entryId)&&!state.plans.some((row:StudyPlan)=>row!==plan&&['pending','in_progress'].includes(row.status)&&row.target?.type==='vocabulary'&&row.target.binding!=='dynamic'&&row.target.cards.some(ref=>ref.entryId===entryId))):plannedIds;
      if(automatic&&exactIds&&!exactIds.length){state.plans=state.plans.filter((row:StudyPlan)=>row!==plan);continue;}
      const exact=exactIds?.map(entryId=>({entryId,senseId:source.entries.find(entry=>entry.id===entryId)?.senses[0]?.id||''}));
      const batch=buildLearningBatch(state,target.bookId,target.unitId,target.batchIndex||0,target.batchSize||10,target.assessmentMode as any,exact);
      if (!batch.cards.length) throw new Error('The selected word batch is unavailable. Retry your plan.');
      if (automatic) {
        const overlaps = state.plans.some((row: StudyPlan) => row !== plan && ['pending','in_progress'].includes(row.status) && row.target?.type === 'vocabulary' && row.target.binding !== 'dynamic' && row.target.assessmentMode === batch.mode && row.target.cards.some(ref => batch.cards.some(card => card.entryId === ref.entryId && card.senseId === ref.senseId)));
        if (overlaps) { state.plans = state.plans.filter((row: StudyPlan) => row !== plan); continue; }
        if (batch.cards.length > plan.estimatedMinutes) throw new Error('The loaded learning batch needs more study time. Refresh your plan.');
        plan.estimatedMinutes = batch.cards.length;
      }
      Object.assign(target,{cards:batch.selection.cards,assessmentMode:batch.mode,...(exact?{binding:'frozen',entryIds:exactIds}:{})});
      plan.quantity=batch.cards.length;
      plan.title=studyPlanTitle(plan);
    }
  }
}

export function studyPlanTitle(plan: Pick<StudyPlan, 'title' | 'target'> & {quantity?: number}): string {
  const target=plan.target;
  if(target?.type!=='vocabulary'||target.mode!=='learning-batch')return plan.title;
  const count=target.cards?.length||target.entryIds?.length||plan.quantity;
  if(count)return `Vocabulary - Learn ${count} ${count===1?'word':'words'}`;
  return target.batchSize ? `Vocabulary - Learn up to ${target.batchSize} ${target.batchSize===1?'word':'words'}` : 'Vocabulary - Learning batch';
}

export function studyTargetSummary(plan: any): string {
  const target=plan.target;
  if (!target) return '';
  if (target.type==='question') {
    const count = plan.kind === 'speaking-mock' && plan.speakingGroups ? Object.values(plan.speakingGroups).reduce((sum: number, group: any) => sum + (group.prompts?.length || 0), 0) : target.prompts?.length || 1;
    return `${displayName(plan.targetLabel || `Question ${target.questionId || ''}`)} · ${count} ${count === 1 ? 'response' : 'responses'}`;
  }
  if (target.type==='section') return `${plan.targetLabel || target.sectionId || ''} · ${target.questionIds?.length || plan.quantity || 0} questions`;
  if (target.type==='vocabulary') {
    const count=target.cards?.length || target.entryIds?.length || plan.quantity || target.batchSize || 0;
    if(target.mode==='learning-batch'&&!target.cards?.length&&!target.entryIds?.length&&!plan.quantity)return `Batch ${(target.batchIndex||0)+1} · Up to ${count} ${count===1?'word':'words'}`;
    if(target.mode==='learning-batch')return `Batch ${(target.batchIndex||0)+1} · ${count} selected ${count===1?'word':'words'}`;
    return `${target.mode==='learning-batch'?`Batch ${(target.batchIndex||0)+1}`:'Review'} · ${count} ${count===1?'prompt':'prompts'}`;
  }
  if (target.type==='intensive') return '1 listening sentence';
  if (target.type==='exam-review') return 'Review the selected attempt';
  if (target.type==='error-review') return `${target.errorIds.length} ${target.errorIds.length===1?'mistake':'mistakes'}`;
  return '';
}
