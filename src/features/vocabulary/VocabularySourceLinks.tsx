import { Link } from 'react-router-dom';
import type { ReviewQueueFilter, VocabularySource } from '../../domain/vocabulary';
import { examVocabularySourceUrl, matchesVocabularySource, vocabularySourceKey } from '../../domain/vocabulary/sources';
import '../../styles/part-vocabulary.css';

export function VocabularySourceLinks({ sources, senseId, filter = {} }: { sources: VocabularySource[]; senseId?: string; filter?: ReviewQueueFilter }) {
  const visible = sources.filter(source => source.exam && matchesVocabularySource(source, filter, senseId) && examVocabularySourceUrl(source));
  if (!visible.length) return null;
  return <div className="vocabulary-source-links">{visible.map((source, index) => <span key={vocabularySourceKey(source)}>
    <Link to={examVocabularySourceUrl(source)!}>Original source{visible.length > 1 ? ` ${index + 1}` : ''}</Link>
    {source.type === 'listening' && source.exam?.sentenceId && <> · <Link to={`/listening/intensive/${encodeURIComponent(source.exam.sectionId)}?sentence=${encodeURIComponent(source.exam.sentenceId)}`}>Play source sentence</Link></>}
  </span>)}</div>;
}
