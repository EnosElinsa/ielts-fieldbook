export const PLANNING_SKILLS = ['writing', 'speaking', 'reading', 'listening'] as const;
export type PlanningSkill = typeof PLANNING_SKILLS[number];
export type PlanningPreferences = {
  vocabularyMode: 'ratio' | 'fixed'; vocabularyPercent: number; vocabularyMinutes: number;
  blockMinutes: number; multipleTasks: boolean; preferFullTasks: boolean;
  newWordsPerDay: number; carryoverPercent: number;
  wordbookMode: 'ordered' | 'round-robin'; wordbookOrder: string[]; pausedWordbooks: string[];
  weights: Record<PlanningSkill, number>;
  week: Record<string, { minutes?: number; focus?: PlanningSkill | 'balanced' }>;
};
export const DEFAULT_PLANNING: PlanningPreferences = {
  vocabularyMode: 'ratio', vocabularyPercent: 20, vocabularyMinutes: 10,
  blockMinutes: 30, multipleTasks: true, preferFullTasks: false,
  newWordsPerDay: 10, carryoverPercent: 30, wordbookMode: 'ordered', wordbookOrder: [], pausedWordbooks: [],
  weights: { writing: 1, speaking: 1, reading: 1, listening: 1 }, week: {},
};
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  value != null && value !== '' && Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
export function normalizePlanning(value: any, legacyMinutes?: number): PlanningPreferences {
  const raw = value && typeof value === 'object' ? value : {};
  const legacy = !value && legacyMinutes !== undefined;
  const ids = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((id): id is string => typeof id === 'string' && id.trim() === id && id.length > 0 && id.length <= 500))] : [];
  const weights = Object.fromEntries(PLANNING_SKILLS.map(skill => [skill, bounded(raw.weights?.[skill], 1, 0, 10)])) as PlanningPreferences['weights'];
  const week: PlanningPreferences['week'] = {};
  for (let day=1;day<=7;day++) {
    const row=raw.week?.[day]; if (!row || typeof row !== 'object') continue;
    week[day] = {
      ...(row.minutes != null && row.minutes !== '' ? {minutes: bounded(row.minutes, 30, 0, 180)} : {}),
      focus: PLANNING_SKILLS.includes(row.focus) ? row.focus : 'balanced',
    };
  }
  return { vocabularyMode: legacy || raw.vocabularyMode === 'fixed' ? 'fixed' : 'ratio',
    newWordsPerDay: bounded(raw.newWordsPerDay,10,0,100), carryoverPercent: bounded(raw.carryoverPercent,30,0,100),
    wordbookMode: raw.wordbookMode === 'round-robin' ? 'round-robin' : 'ordered', wordbookOrder: ids(raw.wordbookOrder), pausedWordbooks: ids(raw.pausedWordbooks),
    vocabularyPercent: bounded(raw.vocabularyPercent,20,0,100),
    vocabularyMinutes: legacy ? Math.min(10,Math.floor((legacyMinutes || 30)/3)) : bounded(raw.vocabularyMinutes,10,0,180),
    blockMinutes: bounded(raw.blockMinutes,30,10,90), multipleTasks: raw.multipleTasks !== false,
    preferFullTasks: raw.preferFullTasks === true, weights, week };
}
export function dayBudget(settings: any, key?: string) {
  const planning=normalizePlanning(settings.planning,settings.dailyMinutes || 30);
  const weekday=key ? new Date(`${key}T00:00:00`).getDay() || 7 : null;
  const enabled=weekday == null || (settings.days || []).includes(weekday);
  const override=weekday == null ? undefined : planning.week[weekday];
  const daily=enabled ? bounded(override?.minutes, bounded(settings.dailyMinutes,30,1,180),0,180) : 0;
  const vocabulary=Math.min(daily,planning.vocabularyMode === 'fixed' ? planning.vocabularyMinutes : Math.round(daily*planning.vocabularyPercent/100));
  return {daily,vocabulary,skill:daily-vocabulary,focus:override?.focus || 'balanced',planning};
}
