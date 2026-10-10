import { describe, expect, test } from 'vitest';
import { DEFAULT_VOCABULARY_PREFERENCES, normalizeVocabularyPreferences } from '../../src/domain/vocabulary/preferences';

describe('vocabulary preferences', () => {
  test('restores useful defaults from missing or malformed settings', () => {
    expect(normalizeVocabularyPreferences(null)).toEqual(DEFAULT_VOCABULARY_PREFERENCES);
    expect(normalizeVocabularyPreferences({ mode: 'unknown', layout: 'unknown', feedback: false, autoPlay: 'false', order: 'invalid' })).toMatchObject({ mode: 'dictation', layout: 'list', feedback: 'end', autoPlay: true, order: 'source' });
  });

  test('bounds saved numeric preferences without accepting numeric strings or nonfinite values', () => {
    expect(normalizeVocabularyPreferences({ sessionSize: 500, repeatCount: 0, repeatGapMs: -2, audioGapMs: 8000, speechRate: 2, volume: -1 })).toMatchObject({ sessionSize: 100, repeatCount: 1, repeatGapMs: 0, audioGapMs: 5000, speechRate: 1.5, volume: 0 });
    expect(normalizeVocabularyPreferences({ sessionSize: '10', repeatCount: NaN, volume: Infinity })).toMatchObject({ sessionSize: 20, repeatCount: 1, volume: 1 });
  });

  test('preserves valid choices and returns independent normalized objects', () => {
    const result = normalizeVocabularyPreferences({ mode: 'cloze', layout: 'cards', feedback: 'immediate', order: 'due', accent: 'us', autoPlay: false, autoAdvance: false, audioExamples: false, sessionSize: 3.9 });
    expect(result).toMatchObject({ mode: 'cloze', layout: 'cards', feedback: 'immediate', order: 'due', accent: 'us', autoPlay: false, autoAdvance: false, audioExamples: false, sessionSize: 3 });
    result.volume = 0;
    expect(normalizeVocabularyPreferences(null).volume).toBe(1);
    expect(normalizeVocabularyPreferences({ mode: 'audio' }).mode).toBe('audio');
  });
});
