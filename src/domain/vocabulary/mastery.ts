import type { VocabularyDimension, VocabularyEvidence, VocabularyState, VocabularyStatus, VocabularyStore } from './types';

const dimensions: VocabularyDimension[] = ['meaning', 'listening', 'spelling', 'usage'];
const statuses: VocabularyStatus[] = ['new', 'unfamiliar', 'unstable', 'active', 'familiar', 'mastered'];
const dayMs = 86400000;
export type VocabularyMastery = {
  automatic: VocabularyStatus; effective: VocabularyStatus; manual: boolean;
  dimensions: Record<VocabularyDimension, { spacedSuccesses: number; nextReviewAt?: string }>;
  productionSuccesses: number; missing: string[];
};

/** Read old backups without changing their labels, scheduling or evidence. */
export function vocabularyStatusSource(state?: VocabularyState): 'automatic' | 'manual' {
  if (state?.statusSource === 'automatic' || state?.statusSource === 'manual') return state.statusSource;
  return state?.manualStatus && state.manualStatus !== 'new' ? 'manual' : 'automatic';
}

function eligible(event: VocabularyEvidence) {
  return event.result === 'success' && Number.isFinite(Date.parse(event.occurredAt))
    && (event.mode === 'production' ? event.verification === 'assessed'
      : event.verification === 'objective' || event.verification === 'source-record' || event.verification === 'assessed');
}

/** The last counted success, rather than a same-day repetition, starts the next spacing window. */
export function getVocabularySpacedProgress(events: VocabularyEvidence[]) {
  const seen = new Set<string>();
  const times = events.filter(event => {
    if (!eligible(event)) return false;
    // Only a recorded identity proves two rows are the same event. Undated
    // summaries and answer/date coincidences cannot manufacture an identity.
    if (event.id && seen.has(event.id)) return false;
    if (event.id) seen.add(event.id);
    return true;
  }).map(event => Date.parse(event.occurredAt)).sort((a, b) => a - b);
  let count = 0; let last = -Infinity;
  for (const time of times) if (time - last >= dayMs) { count += 1; last = time; }
  return {count, ...(count ? {nextSuccessAt: new Date(last + dayMs).toISOString()} : {})};
}

const spacedCount = (events: VocabularyEvidence[]) => getVocabularySpacedProgress(events).count;

function senseMastery(store: Partial<VocabularyStore>, entryId: string, senseId: string, primarySenseId?: string): VocabularyMastery {
  const state = store.vocabularyStates?.find(item => item.entryId === entryId && item.senseId === senseId);
  // Older sense-less evidence belonged to the entry's original primary sense.
  const events = (store.vocabularyEvidence || []).filter(event => event.entryId === entryId && (event.senseId === senseId || (!event.senseId && senseId === primarySenseId)));
  const result = Object.fromEntries(dimensions.map(dimension => [dimension, {
    spacedSuccesses: spacedCount(events.filter(event => event.dimension === dimension)),
    ...(state?.dimensions?.[dimension]?.nextReviewAt ? { nextReviewAt: state.dimensions[dimension].nextReviewAt } : {}),
  }])) as VocabularyMastery['dimensions'];
  const productionSuccesses = spacedCount(events.filter(event => event.mode === 'production' && event.dimension === 'usage'));
  const counts = dimensions.map(dimension => result[dimension].spacedSuccesses);
  let automatic: VocabularyStatus = 'new';
  if (state?.wrong?.active) automatic = 'unstable';
  else if (counts.every(count => count >= 5) && productionSuccesses >= 2) automatic = 'mastered';
  else if (counts.every(count => count >= 3)) automatic = 'familiar';
  else if (result.usage.spacedSuccesses >= 2) automatic = 'active';
  else if (counts.some(count => count > 0)) automatic = 'unstable';
  else if (dimensions.some(dimension => (state?.dimensions?.[dimension]?.failures || 0) > 0)
    || events.some(event => event.result === 'failure' && event.verification !== 'pending' && event.verification !== 'self-reported')) automatic = 'unfamiliar';
  const manual = vocabularyStatusSource(state) === 'manual';
  return { automatic, effective: manual ? state!.manualStatus : automatic, manual, dimensions: result, productionSuccesses, missing: missingRequirements(automatic, result, productionSuccesses, Boolean(state?.wrong?.active)) };
}

function missingRequirements(status: VocabularyStatus, counts: VocabularyMastery['dimensions'], production: number, wrong: boolean) {
  const target = status === 'familiar' || status === 'mastered' ? 5 : 3;
  const label = target === 5 ? 'Mastered' : 'Familiar';
  const missing = dimensions.filter(dimension => counts[dimension].spacedSuccesses < target).map(dimension => `${dimension[0].toUpperCase()}${dimension.slice(1)}: ${target - counts[dimension].spacedSuccesses} more spaced successes for ${label}`);
  if (target === 5 && production < 2) missing.push(`Usage: ${2 - production} more assessed production successes for Mastered`);
  if (wrong) missing.unshift('Recover active wrong-word reviews before advancing.');
  return missing;
}

/** Account-local, per-sense mastery from dated, verified retrieval evidence. */
export function getVocabularyMastery(store: Partial<VocabularyStore>, entryId: string, senseId?: string): VocabularyMastery {
  const entry = store.vocabulary?.find(item => item.id === entryId);
  const primarySenseId = entry?.senses[0]?.id;
  if (senseId) return senseMastery(store, entryId, senseId, primarySenseId);
  const states = (store.vocabularyStates || []).filter(state => state.entryId === entryId);
  const learned = new Set<string>();
  states.filter(state => state.reviewCount > 0 || state.wrong?.active || vocabularyStatusSource(state) === 'manual'
    || dimensions.some(dimension => Object.values(state.dimensions?.[dimension] || {}).some(value => typeof value === 'number' && value > 0))).forEach(state => learned.add(state.senseId));
  (store.vocabularyEvidence || []).filter(event => event.entryId === entryId).forEach(event => { if (event.senseId || primarySenseId) learned.add(event.senseId || primarySenseId!); });
  (store.vocabularyReviews || []).filter(event => event.entryId === entryId).forEach(event => learned.add(event.senseId));
  const ids = learned.size ? [...learned] : [primarySenseId || states[0]?.senseId || ''];
  const results = ids.map(id => senseMastery(store, entryId, id, primarySenseId));
  if (results.length === 1) return results[0];
  const lowest = (values: VocabularyStatus[]) => values.reduce((a, b) => statuses.indexOf(a) <= statuses.indexOf(b) ? a : b);
  const wrong = states.some(state => state.wrong?.active);
  const automatic = wrong ? 'unstable' : lowest(results.map(result => result.automatic));
  const manual = results.some(result => result.manual);
  const effective = manual ? lowest(results.map(result => result.effective)) : automatic;
  const counts = Object.fromEntries(dimensions.map(dimension => {
    const nextReviewAt = results.map(result => result.dimensions[dimension].nextReviewAt).filter((value): value is string => Boolean(value)).sort()[0];
    return [dimension, { spacedSuccesses: Math.min(...results.map(result => result.dimensions[dimension].spacedSuccesses)), ...(nextReviewAt ? { nextReviewAt } : {}) }];
  })) as VocabularyMastery['dimensions'];
  const productionSuccesses = Math.min(...results.map(result => result.productionSuccesses));
  return { automatic, effective, manual, dimensions: counts, productionSuccesses,
    missing: missingRequirements(automatic, counts, productionSuccesses, wrong) };
}
