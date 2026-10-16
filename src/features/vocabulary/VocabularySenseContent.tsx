import type { VocabularySense } from "../../domain/vocabulary/types";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";
import { isVocabularyMeaningGroup, isVocabularyReadingNote, isVocabularyUsageReference } from '../../domain/vocabulary/readiness';

export function VocabularySenseContent({ sense, entryId, learningExample, showMissingExample = false, showLearningNotes = false }: { sense: VocabularySense; entryId?: string; learningExample?: { example: string; sense: VocabularySense }; showMissingExample?: boolean; showLearningNotes?: boolean }) {
  const content = vocabularySensePresentation(sense);
  const meaningGroup = Boolean(entryId && isVocabularyMeaningGroup(entryId, sense));
  const usageReference = Boolean(entryId && isVocabularyUsageReference(entryId, sense));
  const readingNote = Boolean(entryId && isVocabularyReadingNote(entryId, sense));
  const example = content.example || learningExample?.example;
  const fallbackReadingNote = Boolean(!content.example && entryId && learningExample && isVocabularyReadingNote(entryId, learningExample.sense));
  return (
    <>
      <p className="vocabulary-definition">
        {content.definition || "Definition not available yet"}
      </p>
      {example ? <>
        {readingNote || fallbackReadingNote ? <p className="vocabulary-example-label">Reading note</p> : !content.example ? <p className="vocabulary-example-label">Learning example</p> : null}
        <blockquote>{example}</blockquote>
      </> : showMissingExample ? <p className="vocabulary-muted">No example for this meaning.</p> : null}
      {content.usage ? (
        <div className="vocabulary-detail">
          <h4>Usage note</h4>
          <p>{content.usage}</p>
        </div>
      ) : null}
      {showLearningNotes && sense.collocations?.length ? <div className="vocabulary-detail">
        <h4>{meaningGroup ? 'Examples of grouped uses' : usageReference ? 'Related phrases' : readingNote ? 'Reading cues' : 'Collocations'}</h4><p>{sense.collocations.join(' · ')}</p>
      </div> : null}
      {showLearningNotes && sense.distinctions?.length ? <div className="vocabulary-detail">
        <h4>{meaningGroup || usageReference ? 'How to choose a meaning' : 'Compare meanings'}</h4>
        {sense.distinctions.map(note => <p key={note}>{note}</p>)}
      </div> : null}
      {content.relations.map((relation) => (
        <div className="vocabulary-detail" key={relation.label}>
          <h4>{relation.label}</h4>
          <p>{relation.values.join(" · ")}</p>
        </div>
      ))}
    </>
  );
}
