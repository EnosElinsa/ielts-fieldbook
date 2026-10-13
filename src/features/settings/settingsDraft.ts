import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';
import { isProtectedPlan } from '../../domain/plans';
import { planningSettingsKey, selectedStudySkills } from '../../lib/planTemplates';
import { dateKey } from '../../domain/utils';

export function settingsDraft(settings: Record<string, any>) {
  return {
    examDate: settings.examDate || '', targetBand: String(settings.targetBand || ''),
    dailyMinutes: settings.dailyMinutes ?? 30, days: [...(settings.days || [1])],
    skills: selectedStudySkills(settings) as string[],
    focus: settings.focus || 'balanced', speakingFocus: settings.speakingFocus || 'balanced',
    vocabulary: normalizeVocabularyPreferences(settings.vocabulary),
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

export function settingsPlanPreview(settings: Record<string, any>, changes: Record<string, any>, plans: any[], today = dateKey(new Date())) {
  const next = { ...settings, ...changes, vocabulary: { ...settings.vocabulary, ...changes.vocabulary } };
  const rebuild = planningSettingsKey(next) !== planningSettingsKey(settings);
  return { rebuild, affected: rebuild ? plans.filter(plan => !isProtectedPlan(plan) && plan.dateKey >= today) : [] };
}
