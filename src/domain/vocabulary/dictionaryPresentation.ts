import type { VocabularySense } from "./types";

/** Display-only cleanup: source material and learner notes are never rewritten. */
export function dictionaryDisplayText(value: string | undefined): string {
  return (value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(
      /\{\{(?:lb|label|context)\|en\|([^}]+)\}\}/gi,
      (_, labels: string) => labels.replace(/\|/g, ", "),
    )
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function vocabularySensePresentation(sense: VocabularySense): {
  definition: string;
  example: string;
  usage: string;
  register: string;
  relations: { label: string; values: string[] }[];
} {
  const relations: { label: string; values: string[] }[] = [];
  const referenceOnly = /^(?:for quotations using this term,?\s+)?(?:see(?: also)?\s+)?(?:Citations|Thesaurus|Wikisaurus|Appendix|Category)\s*:/i;
  const extract = (value: string | undefined) => {
    const cleaned = dictionaryDisplayText(value);
    if (referenceOnly.test(cleaned)) return "";
    const relation = cleaned.match(
      /^(Meronyms?|Holonyms?|Hypernyms?|Hyponyms?|Near[- ]synonyms?|Synonyms?|Antonyms?|Coordinate terms?|Related terms?|Derived terms?)\s*:\s*(.+)$/i,
    );
    if (!relation) return cleaned;
    const values = relation[2]
      .split(/[,;·]/)
      .map((part) => part.trim())
      .filter((part) => part && !referenceOnly.test(part));
    if (values.length) {
      relations.push({
        label: relation[1].replace(/^./, (c) => c.toUpperCase()),
        values,
      });
    }
    return "";
  };
  const example = extract(sense.example);
  const usage = extract(sense.usage);
  return {
    definition: dictionaryDisplayText(sense.definition),
    example,
    usage:
      /^(usually|often|sometimes|chiefly|especially|typically)[.,;:]?$/i.test(
        usage,
      )
        ? ""
        : usage,
    register: dictionaryDisplayText(sense.register),
    relations,
  };
}
