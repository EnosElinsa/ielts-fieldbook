import type { VocabularySense } from "../../domain/vocabulary/types";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";
import { isVocabularyReadingNote } from '../../domain/vocabulary/readiness';

export function VocabularySenseContent({ sense, entryId, learningExample, showMissingExample = false, showLearningNotes = false }: { sense: VocabularySense; entryId?: string; learningExample?: string; showMissingExample?: boolean; showLearningNotes?: boolean }) {
  const content = vocabularySensePresentation(sense);
  const example = content.example || learningExample;
  return (
    <>
      <p className="vocabulary-definition">
        {content.definition || "Definition not available yet"}
      </p>
      {example ? <>
        {entryId && isVocabularyReadingNote(entryId, sense) ? <p className="vocabulary-example-label">Reading note</p> : !content.example ? <p className="vocabulary-example-label">Learning example</p> : null}
        <blockquote>{example}</blockquote>
      </> : showMissingExample ? <p className="vocabulary-muted">No example for this meaning.</p> : null}
      {content.usage ? (
        <div className="vocabulary-detail">
          <h4>Usage note</h4>
          <p>{content.usage}</p>
        </div>
      ) : null}
      {showLearningNotes && sense.collocations?.length ? <div className="vocabulary-detail">
        <h4>Collocations</h4><p>{sense.collocations.join(' · ')}</p>
      </div> : null}
      {showLearningNotes && sense.distinctions?.length ? <div className="vocabulary-detail">
        <h4>Compare meanings</h4>
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
