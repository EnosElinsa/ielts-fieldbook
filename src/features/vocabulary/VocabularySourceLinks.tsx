import { Link } from 'react-router-dom';
import type { ReviewQueueFilter, VocabularySource } from '../../domain/vocabulary';
import { examVocabularySourceUrl, matchesVocabularySource, vocabularySourceKey } from '../../domain/vocabulary/sources';
import '../../styles/part-vocabulary.css';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { VocabularyLink } from './VocabularyRouteLink';

export function VocabularyWordbookSources({ sources, context = {}, onNavigate }: { sources: VocabularySource[]; context?: { bookId?: string; unitId?: string }; onNavigate?: () => void }) {
  const candidates = context.bookId && context.unitId ? [context] : sources.filter(source => source.bookId && source.unitId);
  const groups = [...new Map(candidates.map(source => [`${source.bookId}:${source.unitId}`, source])).values()];
  if (!groups.length) return null;
  return <div className="practice-word-sources" aria-label="Wordbook sources">{groups.map(source => {
    const book = VOCABULARY_CATALOG.books.find(row => row.id === source.bookId);
    const unit = VOCABULARY_CATALOG.units.find(row => row.bookId === source.bookId && row.id === source.unitId);
    const chapter = unit?.parentId ? VOCABULARY_CATALOG.units.find(row => row.bookId === source.bookId && row.id === unit.parentId) : undefined;
    const label = [book?.title || 'Wordbook', chapter?.title, unit?.title || 'Group'].filter(Boolean).join(' · ');
    return <VocabularyLink key={`${source.bookId}:${source.unitId}`} title={label} onClick={onNavigate} to={`/vocabulary/wordbooks/${encodeURIComponent(source.bookId!)}/groups/${encodeURIComponent(source.unitId!)}/words`}>{label}</VocabularyLink>;
  })}</div>;
}

export function VocabularySourceLinks({ sources, senseId, filter = {} }: { sources: VocabularySource[]; senseId?: string; filter?: ReviewQueueFilter }) {
  const visible = sources.filter(source => source.exam && matchesVocabularySource(source, filter, senseId) && examVocabularySourceUrl(source));
  if (!visible.length) return null;
  return <div className="vocabulary-source-links">{visible.map((source, index) => <span key={vocabularySourceKey(source)}>
    <Link to={examVocabularySourceUrl(source)!}>Original source{visible.length > 1 ? ` ${index + 1}` : ''}</Link>
    {source.type === 'listening' && source.exam?.sentenceId && <> · <Link to={`/listening/intensive/${encodeURIComponent(source.exam.sectionId)}?sentence=${encodeURIComponent(source.exam.sentenceId)}`}>Play source sentence</Link></>}
  </span>)}</div>;
}
