import { concealWord } from '../../domain/vocabulary/content';
import type { ReviewCard } from "../../domain/vocabulary";
export { VOCABULARY_PRACTICE_MODES as MODES } from '../../domain/vocabulary/preferences';
import { VOCABULARY_PRACTICE_MODES as MODES } from '../../domain/vocabulary/preferences';
export const titleCase = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
export const modeLabel = (mode: string) =>
  MODES.find((item) => item.value === mode)?.label || titleCase(mode);
export function conceal(text: string, term: string) {
  return concealWord(text, term);
}
export function senseFor(card: ReviewCard) {
  return (
    card.entry.senses.find((sense) => sense.id === card.senseId) ||
    card.entry.senses[0]
  );
}
export function resultName(result: string) {
  return result === "success"
    ? "Correct"
    : result === "pending"
      ? "Pending"
      : result === "partial"
        ? "Partial"
        : "Incorrect";
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

