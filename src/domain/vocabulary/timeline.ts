import type {
  VocabularyDimension,
  VocabularyEvidence,
  VocabularyReview,
  VocabularyStore,
} from "./types";

export type VocabularyLearningEvent = {
  id: string;
  entryId: string;
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
  entryId?: string,
): VocabularyLearningEvent[] {
  const records = (store.vocabularyEvidence || []).filter(
    (event) => entryId === undefined || event.entryId === entryId,
  );
  const recordsById = new Map<string, VocabularyEvidence[]>();
  records.forEach(event => {
    if (event.id) recordsById.set(event.id, [...(recordsById.get(event.id) || []), event]);
  });
  const dimensions: VocabularyDimension[] = ['meaning', 'listening', 'spelling', 'usage'];
  const consumed = new Set<VocabularyEvidence>();
  const reviews = (store.vocabularyReviews || []).filter(
    (review) => entryId === undefined || review.entryId === entryId,
  );
  const events: VocabularyLearningEvent[] = reviews.map(
    (review: VocabularyReview) => {
      const linked = dimensions.flatMap(dimension => recordsById.get(`${review.id}:${dimension}`) || []).filter(
        (event) =>
          event.id === `${review.id}:${event.dimension}` &&
          event.entryId === review.entryId &&
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
