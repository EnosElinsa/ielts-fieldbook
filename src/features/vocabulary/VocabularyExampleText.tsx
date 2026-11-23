import type { ReactNode } from 'react';
import { vocabularyWordPattern } from '../../domain/vocabulary/content';
import '../../styles/vocabulary-example.css';

export function VocabularyExampleText({ text, term, form }: { text: string; term?: string; form?: string }) {
  if (!term?.trim()) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(vocabularyWordPattern(term.trim(), form?.trim()))) {
    parts.push(text.slice(cursor, match.index), <mark className="vocabulary-example-target" key={match.index}>{match[0]}</mark>);
    cursor = match.index + match[0].length;
  }
  if (!parts.length) return text;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
