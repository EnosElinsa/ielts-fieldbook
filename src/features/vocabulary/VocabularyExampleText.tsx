import type { ReactNode } from 'react';
import { vocabularyWordPattern } from '../../domain/vocabulary/content';
import '../../styles/vocabulary-example.css';

function regularNounPlural(word: string, pos?: string): string | undefined {
  if (pos !== 'noun' || !/^[a-z]+$/i.test(word)) return;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(?:sh|ch|x|z)$/i.test(word)) return `${word}es`;
  // An -s headword may already be plural, as in headquarters.
  if (!/s$/i.test(word)) return `${word}s`;
}

export function VocabularyExampleText({ text, term, form, pos }: { text: string; term?: string; form?: string; pos?: string }) {
  if (!term?.trim()) return text;
  const word = term.trim();
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(vocabularyWordPattern(word, form?.trim(), regularNounPlural(word, pos)))) {
    parts.push(text.slice(cursor, match.index), <mark className="vocabulary-example-target" key={match.index}>{match[0]}</mark>);
    cursor = match.index + match[0].length;
  }
  if (!parts.length) return text;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
