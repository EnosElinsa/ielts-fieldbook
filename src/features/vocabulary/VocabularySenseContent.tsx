import type { VocabularySense } from "../../domain/vocabulary/types";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";

export function VocabularySenseContent({ sense, learningExample, showMissingExample = false }: { sense: VocabularySense; learningExample?: string; showMissingExample?: boolean }) {
  const content = vocabularySensePresentation(sense);
  const example = content.example || learningExample;
  return (
    <>
      <p className="vocabulary-definition">
        {content.definition || "Definition not available yet"}
      </p>
      {example ? <>
        {!content.example ? <p className="vocabulary-example-label">Learning example</p> : null}
        <blockquote>{example}</blockquote>
      </> : showMissingExample ? <p className="vocabulary-muted">No example for this meaning.</p> : null}
      {content.usage ? (
        <div className="vocabulary-detail">
          <h4>Usage note</h4>
          <p>{content.usage}</p>
        </div>
      ) : null}
      {content.relations.map((relation) => (
        <div className="vocabulary-detail" key={relation.label}>
          <h4>{relation.label}</h4>
          <p>{relation.values.join(" · ")}</p>
        </div>
      ))}
    </>
  );
}
