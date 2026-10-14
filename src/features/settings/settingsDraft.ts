import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';
import { isProtectedPlan } from '../../domain/plans';
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

export function settingsChanges(draft: SettingsDraft, baseline: SettingsDraft): Record<string, any> {
  const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !sameSetting(value, baseline[key as keyof SettingsDraft])));
  if (changes.vocabulary) changes.vocabulary = Object.fromEntries(Object.entries(draft.vocabulary).filter(([key, value]) => !sameSetting(value, baseline.vocabulary[key as keyof typeof draft.vocabulary])));
  if (changes.skills) changes.skillMix = draft.skills.length === 1 ? draft.skills[0] : 'mixed';
  return changes;
}

export function settingsPlanPreview(settings: Record<string, any>, changes: Record<string, any>, plans: any[], today = dateKey(new Date()), state?: any) {
  const next = { ...settings, ...changes, vocabulary: { ...settings.vocabulary, ...changes.vocabulary } };
  const rebuild = planningSettingsKey(next) !== planningSettingsKey(settings);
  const affected = rebuild ? plans.filter(plan => !isProtectedPlan(plan) && plan.dateKey >= today) : [];
  const now=new Date(`${today}T12:00:00`);
  const draft={...emptyState(),...state,settings:next,plans:structuredClone(plans.filter(plan=>!affected.some(row=>row.id===plan.id)))};
  const generated: any[]=rebuild?ensureUnifiedPlans(draft,undefined,now):[];
  const days=calendarDays(now);
  const totals=Object.fromEntries(['writing','speaking','reading','listening','vocabulary'].map(skill=>[skill,generated.filter(plan=>plan.skill===skill&&plan.status!=='skipped').reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0)]));
  return {rebuild,affected,generated,days,totals};
}
