import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';
import { planningSettingsKey, selectedStudySkills, ensureUnifiedPlans, calendarDays } from '../../lib/planTemplates';
import { normalizePlanning } from '../../domain/planningPreferences';
import { emptyState } from '../../domain/state';
import { dateKey } from '../../domain/utils';

export function settingsDraft(settings: Record<string, any>) {
  return {
    examDate: settings.examDate || '', targetBand: String(settings.targetBand || ''),
    dailyMinutes: settings.dailyMinutes ?? 30, days: [...(settings.days || [1])],
    skills: selectedStudySkills(settings) as string[],
    focus: settings.focus || 'balanced', speakingFocus: settings.speakingFocus || 'balanced',
    vocabulary: normalizeVocabularyPreferences(settings.vocabulary),
    planning: normalizePlanning(settings.planning,settings.dailyMinutes),
  };
}
export type SettingsDraft = ReturnType<typeof settingsDraft>;
export const sameSetting = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Retain only the user's changed fields when refreshing another device's settings. */
export function rebaseSettingsDraft(previous: any, edited: any, latest: any): any {
  if(sameSetting(previous,edited))return latest;
  if(previous&&edited&&latest&&![previous,edited,latest].some(Array.isArray)&&[previous,edited,latest].every(value=>typeof value==='object'))return Object.fromEntries([...new Set([...Object.keys(latest),...Object.keys(edited)])].map(key=>[key,rebaseSettingsDraft(previous[key],edited[key],latest[key])]));
  return edited;
}

export function settingsChanges(draft: SettingsDraft, baseline: SettingsDraft): Record<string, any> {
  const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !sameSetting(value, baseline[key as keyof SettingsDraft])));
  if (changes.vocabulary) changes.vocabulary = Object.fromEntries(Object.entries(draft.vocabulary).filter(([key, value]) => !sameSetting(value, baseline.vocabulary[key as keyof typeof draft.vocabulary])));
  if (changes.skills) changes.skillMix = draft.skills.length === 1 ? draft.skills[0] : 'mixed';
  return changes;
}

export function settingsPlanPreview(settings: Record<string, any>, changes: Record<string, any>, plans: any[], today = dateKey(new Date()), state?: any) {
  const next = { ...settings, ...changes, vocabulary: { ...settings.vocabulary, ...changes.vocabulary } };
  const rebuild = planningSettingsKey(next) !== planningSettingsKey(settings);
  const now=new Date(`${today}T12:00:00`);
  // The planner needs the complete previous schedule for rotation, reservations and carryover.
  // Only plans and activePlanId are mutated by generation. Learning data is a
  // read-only input; avoid copying every frozen answer/media snapshot here.
  const draft=rebuild?{...emptyState(),...state,settings:next,plans:structuredClone(plans)}:{plans};
  const generated: any[]=rebuild?ensureUnifiedPlans(draft,undefined,now):[];
  const nextPlans=new Map(draft.plans.map((plan: any)=>[plan.id,plan]));
  const affected=rebuild?plans.filter(plan=>!sameSetting(plan,nextPlans.get(plan.id))):[];
  const days=calendarDays(now);
  const scheduled=generated.filter(plan=>plan.status!=='skipped'&&!plan.onHold&&!plan.archivedAt);
  const preservedLearning=scheduled.filter(plan=>['pending','in_progress'].includes(plan.status)&&plan.target?.type==='vocabulary'&&plan.target.mode==='learning-batch'&&(plan.target.cards?.length||plan.target.entryIds?.length)&&sameSetting(plan,plans.find(previous=>previous.id===plan.id)));
  const totals=Object.fromEntries(['writing','speaking','reading','listening','vocabulary'].map(skill=>[skill,scheduled.filter(plan=>plan.skill===skill).reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0)]));
  return {rebuild,affected,generated,scheduled,preservedLearning,days,totals};
}
