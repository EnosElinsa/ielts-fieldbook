import type { VocabularySense } from "../../domain/vocabulary/types";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";

export function VocabularySenseContent({ sense }: { sense: VocabularySense }) {
  const content = vocabularySensePresentation(sense);
  return (
    <>
      <p className="vocabulary-definition">
        {content.definition || "Definition not available yet"}
      </p>
      {content.example ? (
        <blockquote>{content.example}</blockquote>
      ) : (
        <p className="vocabulary-muted">Example not available yet</p>
      )}
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
