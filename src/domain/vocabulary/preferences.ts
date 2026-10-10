import type { VocabularyMode } from './types';

export type VocabularyPracticeMode = VocabularyMode | 'audio';
export type VocabularyPreferences = {
  mode: VocabularyPracticeMode; layout: 'list' | 'cards'; feedback: 'end' | 'immediate';
  sessionSize: number; order: 'source' | 'due' | 'random'; accent: 'uk' | 'us';
  autoPlay: boolean; repeatCount: number; repeatGapMs: number; speechRate: number; volume: number;
  autoAdvance: boolean; audioExamples: boolean; audioGapMs: number;
};

export const DEFAULT_VOCABULARY_PREFERENCES: VocabularyPreferences = {
  mode: 'dictation', layout: 'list', feedback: 'end', sessionSize: 20, order: 'source', accent: 'uk',
  autoPlay: true, repeatCount: 1, repeatGapMs: 800, speechRate: 1, volume: 1,
  autoAdvance: true, audioExamples: true, audioGapMs: 1000,
};

export function normalizeVocabularyPreferences(value: unknown): VocabularyPreferences {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = DEFAULT_VOCABULARY_PREFERENCES;
  const choice = <T extends string>(key: keyof VocabularyPreferences, values: readonly T[], fallback: T): T => values.includes(input[key] as T) ? input[key] as T : fallback;
  const boolean = (key: keyof VocabularyPreferences) => typeof input[key] === 'boolean' ? input[key] as boolean : defaults[key] as boolean;
  const number = (key: keyof VocabularyPreferences, min: number, max: number, integer = false) => {
    const raw = input[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return defaults[key] as number;
    return Math.min(max, Math.max(min, integer ? Math.floor(raw) : raw));
  };
  return {
    mode: choice('mode', ['dictation', 'definition', 'cloze', 'distinction', 'production', 'audio'], defaults.mode),
    layout: choice('layout', ['list', 'cards'], defaults.layout),
    feedback: choice('feedback', ['end', 'immediate'], defaults.feedback),
    order: choice('order', ['source', 'due', 'random'], defaults.order),
    accent: choice('accent', ['uk', 'us'], defaults.accent),
    sessionSize: number('sessionSize', 1, 100, true), repeatCount: number('repeatCount', 1, 5, true),
    repeatGapMs: number('repeatGapMs', 0, 5000, true), speechRate: number('speechRate', 0.5, 1.5),
    volume: number('volume', 0, 1), audioGapMs: number('audioGapMs', 0, 5000, true),
    autoPlay: boolean('autoPlay'), autoAdvance: boolean('autoAdvance'), audioExamples: boolean('audioExamples'),
  };
}
