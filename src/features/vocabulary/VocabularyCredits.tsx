import type { VocabularySense } from "../../domain/vocabulary/types";
import type { MediaCredit } from "../../domain/vocabulary/media";
import { sanitizeVocabularyMediaUrl } from "../../domain/vocabulary/media";
import { VOCABULARY_CONTEXT_VERSION } from "../../domain/vocabulary/context";
export type VocabularyCredit = MediaCredit & {
  source: string;
};
const licenses: Record<string, string> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC-BY-SA-3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
};
export function senseCredits(senses: VocabularySense[]): VocabularyCredit[] {
  return senses.flatMap((sense) => [
    ...(sense.source || sense.license || sense.attribution
      ? [
          {
            source: sense.source || "Dictionary content",
            author: sense.attribution || sense.source || "Author not supplied",
            license: sense.license || "License not supplied",
            licenseUrl: licenses[sense.license || ""] || "",
            sourceUrl: sanitizeVocabularyMediaUrl(sense.sourceUrl || "") || "",
            changes: "",
          },
        ]
      : []),
    ...(sense.editorial
      ? [
          {
            source: sense.editorial.source,
            author: sense.editorial.attribution,
            license: sense.editorial.license,
            licenseUrl: licenses[sense.editorial.license] || "",
            sourceUrl: "",
            changes: `Definition, example and learning notes edited in supplement ${VOCABULARY_CONTEXT_VERSION}.`,
          },
        ]
      : []),
  ]);
}
export function VocabularyCredits({
  credits,
}: {
  credits: VocabularyCredit[];
}) {
  const unique = [
    ...new Map(
      credits.map((credit) => [
        JSON.stringify([
          credit.sourceUrl,
          credit.author,
          credit.license,
          credit.changes,
        ]),
        credit,
      ]),
    ).values(),
  ];
  return unique.length ? (
    <details
      className="vocabulary-secondary vocabulary-credits"
      id="vocabulary-sources"
    >
      <summary>Sources &amp; licenses</summary>
      <ul>
        {unique.map((credit, index) => (
          <li key={index}>
            <strong>{credit.source}</strong>
            <p>{credit.author}</p>
            <p>
              {credit.licenseUrl ? (
                <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                  {credit.license}
                </a>
              ) : (
                credit.license
              )}
              {credit.sourceUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </>
              ) : null}
            </p>
            {credit.changes ? <small>{credit.changes}</small> : null}
          </li>
        ))}
      </ul>
    </details>
  ) : null;
}
