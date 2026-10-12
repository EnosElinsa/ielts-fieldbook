import type {
  VocabularyDimension,
  VocabularyEvidence,
  VocabularyReview,
  VocabularyStore,
} from "./types";

export type VocabularyLearningEvent = {
  id: string;
  senseId?: string;
  mode: string;
  result: string;
  response?: string;
  occurredAt: string | null;
  verification?: string;
  dimensions: VocabularyDimension[];
  bookId?: string;
  unitId?: string;
  sourceLabel?: string;
  imported?: boolean;
};

export function vocabularyLearningTimeline(
  store: Partial<
    Pick<VocabularyStore, "vocabularyReviews" | "vocabularyEvidence">
  >,
  entryId: string,
): VocabularyLearningEvent[] {
  const records = (store.vocabularyEvidence || []).filter(
    (event) => event.entryId === entryId,
  );
  const consumed = new Set<VocabularyEvidence>();
  const reviews = (store.vocabularyReviews || []).filter(
    (review) => review.entryId === entryId,
  );
  const events: VocabularyLearningEvent[] = reviews.map(
    (review: VocabularyReview) => {
      const linked = records.filter(
        (event) =>
          event.id === `${review.id}:${event.dimension}` &&
          (!event.senseId || event.senseId === review.senseId),
      );
      linked.forEach((event) => consumed.add(event));
      return {
        ...review,
        dimensions: [...new Set(linked.map((event) => event.dimension))],
        verification: review.verification || linked[0]?.verification,
      };
    },
  );
  records.forEach((event, index) => {
    if (!consumed.has(event))
      events.push({
        ...event,
        id: event.id || `legacy-evidence:${index}`,
        dimensions: [event.dimension],
        occurredAt: event.occurredAt || null,
      });
  });
  const stamp = (at: string | null) =>
    at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : -Infinity;
  return events.sort((a, b) => stamp(b.occurredAt) - stamp(a.occurredAt));
}
