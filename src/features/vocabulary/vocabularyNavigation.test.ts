import { expect, test } from 'vitest';
import { entryUrl, practiceUrl, vocabularyResultUrl } from './vocabularyNavigation';

test('repeated result details and practice keep a bounded URL and the original filtered return', () => {
  const source = '/vocabulary/words?search=water&tag=classroom&page=2#vocabulary-word-river';
  let detail = entryUrl('river', { senseId: 'water', bookId: 'book', unitId: 'unit' }, source);
  for (let at = 0; at < 40; at++) {
    const practice = new URL(practiceUrl('river', 'water', { bookId: 'book', unitId: 'unit' }, detail, 'definition'), 'https://fieldbook.test');
    practice.searchParams.set('resultFilter', 'flagged');
    const result = new URL(vocabularyResultUrl(`attempt-${at}`, practice.searchParams), 'https://fieldbook.test');
    expect(result.pathname).toBe(`/vocabulary/history/attempt-${at}`);
    expect(result.searchParams.get('sessionId')).toBe(`attempt-${at}`);
    expect(result.searchParams.get('returnTo')).toBe(source);
    expect(result.searchParams.get('senseId')).toBe('water');
    expect(result.searchParams.get('bookId')).toBe('book');
    expect(result.searchParams.get('unitId')).toBe('unit');
    expect(result.searchParams.get('resultFilter')).toBe('flagged');
    detail = entryUrl('river', { senseId: 'water' }, result.pathname + result.search);
    expect(detail.length).toBeLessThan(800);
  }
});

test('a directly opened detail remains a usable return and unsafe origins are discarded', () => {
  const detail = '/vocabulary/entry/river?senseId=water';
  const result = new URL(vocabularyResultUrl('saved', new URLSearchParams({ returnTo: detail })), 'https://fieldbook.test');
  expect(result.searchParams.get('returnTo')).toBe(detail);
  const unsafe = new URL(vocabularyResultUrl('saved', new URLSearchParams({ returnTo: 'https://external.test' })), 'https://fieldbook.test');
  expect(unsafe.searchParams.has('returnTo')).toBe(false);
});

test('learning-card position and its own wordbook return remain the source of a result link', () => {
  const source = '/vocabulary/wordbooks/book/groups/unit/learn?word=4&returnTo=%2Fvocabulary%2Fwordbooks%3Fsearch%3Dnature';
  const detail = entryUrl('river', { senseId: 'water' }, source);
  const result = new URL(vocabularyResultUrl('saved', new URLSearchParams({ returnTo: detail })), 'https://fieldbook.test');
  expect(result.searchParams.get('returnTo')).toBe(source);
});
