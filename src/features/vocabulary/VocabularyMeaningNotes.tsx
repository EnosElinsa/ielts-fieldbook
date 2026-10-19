import type { VocabularySense } from '../../domain/vocabulary/types';
import { dictionaryDisplayText, vocabularySensePresentation } from '../../domain/vocabulary/dictionaryPresentation';
import { isVocabularyMeaningGroup, isVocabularyUsageReference } from '../../domain/vocabulary/readiness';
import '../../styles/vocabulary-learning-notes.css';

export function VocabularyMeaningNotes({ sense, entryId, example, showDistinctions = false }: {
  sense: VocabularySense; entryId?: string; example?: string; showDistinctions?: boolean;
}) {
  const content = vocabularySensePresentation(sense);
  const seen = new Set([content.definition, example || content.example, content.usage].filter(Boolean).map(value => value!.toLowerCase()));
  const distinctions = showDistinctions ? (sense.distinctions || []).map(dictionaryDisplayText).filter(note => {
    const key = note.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }) : [];
  if (!content.usage && !distinctions.length && !content.relations.length) return null;
  const reference = entryId && (isVocabularyMeaningGroup(entryId, sense) || isVocabularyUsageReference(entryId, sense));
  return <details className="vocabulary-learning-notes" key={JSON.stringify([entryId, sense.id, sense.definition, sense.pos])}>
    <summary>Usage and meaning notes</summary>
    {content.usage ? <div className="vocabulary-detail"><h4>Usage note</h4><p>{content.usage}</p></div> : null}
    {distinctions.length ? <div className="vocabulary-detail"><h4>{reference ? 'How to choose a meaning' : 'Compare meanings'}</h4>
      {distinctions.map(note => <p key={note}>{note}</p>)}
    </div> : null}
    {content.relations.map(relation => <div className="vocabulary-detail" key={relation.label}>
      <h4>{relation.label}</h4><p>{relation.values.join(' · ')}</p>
    </div>)}
  </details>;
}
