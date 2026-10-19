import type { VocabularySense } from "../../domain/vocabulary/types";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";
import { isVocabularyMeaningGroup, isVocabularyReadingNote, isVocabularyUsageReference } from '../../domain/vocabulary/readiness';
import { VocabularyMeaningNotes } from './VocabularyMeaningNotes';

export function VocabularySenseContent({ sense, entryId, learningExample, showMissingExample = false, showLearningNotes = false }: { sense: VocabularySense; entryId?: string; learningExample?: { example: string; sense: VocabularySense }; showMissingExample?: boolean; showLearningNotes?: boolean }) {
  const content = vocabularySensePresentation(sense);
  const meaningGroup = Boolean(entryId && isVocabularyMeaningGroup(entryId, sense));
  const usageReference = Boolean(entryId && isVocabularyUsageReference(entryId, sense));
  const readingNote = Boolean(entryId && isVocabularyReadingNote(entryId, sense));
  const matchingExample = learningExample && learningExample.sense.id === sense.id &&
    learningExample.sense.definition === sense.definition && learningExample.sense.pos === sense.pos ? learningExample : undefined;
  const example = content.example || matchingExample?.example;
  const fallbackReadingNote = Boolean(!content.example && entryId && matchingExample && isVocabularyReadingNote(entryId, matchingExample.sense));
  return (
    <>
      <p className="vocabulary-definition">
        {content.definition || "Definition not available yet"}
      </p>
      {example ? <>
        {readingNote || fallbackReadingNote ? <p className="vocabulary-example-label">Reading note</p> : !content.example ? <p className="vocabulary-example-label">Learning example</p> : null}
        <blockquote>{example}</blockquote>
      </> : showMissingExample ? <p className="vocabulary-muted">A learning example has not been added for this meaning yet.</p> : null}
      {showLearningNotes && sense.collocations?.length ? <div className="vocabulary-detail">
        <h4>{meaningGroup ? 'Examples of grouped uses' : usageReference ? 'Related phrases' : readingNote ? 'Reading cues' : 'Collocations'}</h4><p>{sense.collocations.join(' · ')}</p>
      </div> : null}
      <VocabularyMeaningNotes entryId={entryId} sense={sense} example={example} showDistinctions={showLearningNotes} />
    </>
  );
}
