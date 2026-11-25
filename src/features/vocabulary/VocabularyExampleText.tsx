import type { ReactNode } from 'react';
import { vocabularyInflectedPattern } from '../../domain/vocabulary/content';
import '../../styles/vocabulary-example.css';

export function VocabularyExampleText({ text, term, form, pos }: { text: string; term?: string; form?: string; pos?: string }) {
  if (!term?.trim()) return text;
  const word = term.trim();
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(vocabularyInflectedPattern(word, pos || undefined, form?.trim()))) {
    parts.push(text.slice(cursor, match.index), <mark className="vocabulary-example-target" key={match.index}>{match[0]}</mark>);
    cursor = match.index + match[0].length;
  }
  if (!parts.length) return text;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
